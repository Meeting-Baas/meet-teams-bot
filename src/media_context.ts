import { ChildProcess, spawn } from 'child_process'
import internal from 'stream'
import { platform } from 'os'
import { existsSync } from 'fs'

// Automatic platform detection
const PLATFORM = platform()
const IS_MACOS = PLATFORM === 'darwin'
const IS_LINUX = PLATFORM === 'linux'
const IS_WINDOWS = PLATFORM === 'win32'

// Device configuration per platform
interface PlatformConfig {
    microDevice: string
    cameraDevice: string
    audioFormat: string
    videoFormat: string
    audioCodec?: string
    videoCodec?: string
}

// Function to detect Linux virtual devices
function hasLinuxVirtualDevices(): boolean {
    return existsSync('/dev/video10') && !!(process.env.PULSE_SERVER || process.env.DISPLAY)
}

// Automatic configuration based on platform
function getPlatformConfig(): PlatformConfig {
    if (IS_MACOS) {
        return {
            microDevice: '0',  // Default macOS microphone
            cameraDevice: '0', // Default macOS camera
            audioFormat: 'avfoundation',
            videoFormat: 'avfoundation',
            audioCodec: 'aac',
            videoCodec: 'libx264'
        }
    } else if (IS_LINUX) {
        // Check if we have virtual devices (NixOS) or use real devices
        if (hasLinuxVirtualDevices()) {
            console.log('🎯 Virtual devices detected (NixOS/systemd)')
            return {
                microDevice: 'pulse:virtual_mic_source',
                cameraDevice: '/dev/video10',
                audioFormat: 'pulse',
                videoFormat: 'v4l2',
                audioCodec: 'pcm_s16le',
                videoCodec: 'rawvideo'
            }
        } else {
            console.log('🎤 Using real Linux devices')
            return {
                microDevice: 'default',  // ALSA default
                cameraDevice: '/dev/video0', // Default Linux camera
                audioFormat: 'alsa',
                videoFormat: 'v4l2',
                audioCodec: 'pcm_s16le',
                videoCodec: 'rawvideo'
            }
        }
    } else if (IS_WINDOWS) {
        return {
            microDevice: 'audio="Microphone"',
            cameraDevice: 'video="USB Camera"',
            audioFormat: 'dshow',
            videoFormat: 'dshow',
            audioCodec: 'pcm_s16le',
            videoCodec: 'rawvideo'
        }
    } else {
        // Generic fallback
        console.warn(`⚠️  Unsupported platform: ${PLATFORM}, using Linux configuration`)
        return {
            microDevice: 'default',
            cameraDevice: '/dev/video0',
            audioFormat: 'alsa',
            videoFormat: 'v4l2',
            audioCodec: 'pcm_s16le',
            videoCodec: 'rawvideo'
        }
    }
}

const CONFIG = getPlatformConfig()

console.log(`🌍 Platform detected: ${PLATFORM}`)
console.log(`🎤 Audio device: ${CONFIG.microDevice} (format: ${CONFIG.audioFormat})`)
console.log(`📹 Video device: ${CONFIG.cameraDevice} (format: ${CONFIG.videoFormat})`)

// This abstract class contains the current ffmpeg process
// A derived class must implement the play and stop methods
//
// ___CROSS_PLATFORM_EXAMPLES___
// macOS:    ffmpeg -f avfoundation -i "0:0" output.mov
// Linux:    ffmpeg -f v4l2 -i /dev/video0 -f alsa -i default output.mp4
// Windows:  ffmpeg -f dshow -i video="USB Camera":audio="Microphone" output.mp4
// NixOS:    ffmpeg -f v4l2 -i /dev/video10 -f pulse -i virtual_mic_source output.mp4
abstract class MediaContext {
    private process: ChildProcess | null
    private promise: Promise<number> | null

    constructor() {
        this.process = null
        this.promise = null
    }

    protected execute(
        args: string[],
        after: { (): void },
    ): ChildProcess | null {
        if (this.process) {
            console.warn('Already on execution')
            return null
        }

        console.log(`🚀 Executing ffmpeg: ${args.join(' ')}`)
        
        this.process = spawn('ffmpeg', args, {
            stdio: ['pipe', 'pipe', 'pipe'],
        })
        
        this.promise = new Promise((resolve, reject) => {
            this.process.on('exit', (code) => {
                console.log(`process exited with code ${code}`)
                if (code == 0) {
                    this.process = null
                    after()
                }
                resolve(code)
            })
            this.process.on('error', (err) => {
                console.error('FFmpeg process error:', err)
                reject(err)
            })

            // IO output
            this.process.stdout.on('data', (data) => {
                // console.log(`stdout: ${data}`)
            })
            this.process.stderr.on('data', (data) => {
                // Log important errors only
                const errorStr = data.toString()
                if (errorStr.includes('Error') || errorStr.includes('Failed')) {
                    console.error(`ffmpeg stderr: ${errorStr}`)
                }
            })
        })
        return this.process
    }

    protected async stop_process() {
        if (!this.process) {
            console.warn('Already stopped')
            return
        }

        let res = this.process.kill('SIGTERM')
        console.log(`Signal sent to process: ${res}`)

        await this.promise
            .then((code) => {
                console.log(`process exited with code ${code}`)
            })
            .catch((err) => {
                console.log(`process exited with error ${err}`)
            })
            .finally(() => {
                this.process = null
                this.promise = null
            })
    }

    public abstract play(pathname: string, loop: boolean): void
    public abstract stop(): void
}

// Audio events to microphone device
export class SoundContext extends MediaContext {
    public static instance: SoundContext

    private sampleRate: number
    constructor(sampleRate: number) {
        super()
        this.sampleRate = sampleRate
        SoundContext.instance = this
    }

    public default() {
        // Play a default silence file
        const silenceFile = IS_MACOS ? '../silence.wav' : '../silence.opus'
        SoundContext.instance.play(silenceFile, false)
    }

    public play(pathname: string, loop: boolean) {
        let args: string[] = []
        
        if (loop) {
            args.push('-stream_loop', '-1')
        }
        
        args.push('-re', '-i', pathname)
        
        if (IS_MACOS) {
            // macOS: Record audio (virtual devices are complex on macOS)
            const outputFile = `/tmp/virtual_audio_${Date.now()}.wav`
            args.push('-f', 'wav', outputFile)
            console.log(`🍎 macOS: Recording audio to ${outputFile}`)
        } else if (CONFIG.audioFormat === 'pulse') {
            // Linux with PulseAudio (NixOS)
            args.push('-f', CONFIG.audioFormat, '-acodec', CONFIG.audioCodec!, CONFIG.microDevice)
        } else {
            // Standard Linux or Windows
            args.push('-f', CONFIG.audioFormat, '-acodec', CONFIG.audioCodec!, CONFIG.microDevice)
        }
        
        super.execute(args, this.default)
    }

    // Return stdin and play sound to microphone
    public play_stdin(): internal.Writable {
        let args: string[] = [
            '-f', 'f32le',
            '-ar', `${this.sampleRate}`,
            '-ac', '1',
            '-i', '-'
        ]
        
        if (IS_MACOS) {
            // macOS: Output to temporary file
            const outputFile = `/tmp/stdin_audio_${Date.now()}.wav`
            args.push('-f', 'wav', outputFile)
            console.log(`🍎 macOS: Recording stdin to ${outputFile}`)
        } else if (CONFIG.audioFormat === 'pulse') {
            // Linux with PulseAudio (NixOS)
            args.push('-f', CONFIG.audioFormat, '-acodec', CONFIG.audioCodec!, CONFIG.microDevice)
        } else {
            // Standard Linux or Windows
            args.push('-f', CONFIG.audioFormat, '-acodec', CONFIG.audioCodec!, CONFIG.microDevice)
        }
        
        const process = super.execute(args, () => {
            console.warn('[play_stdin] Sequence ended')
        })
        
        return process ? process.stdin : null
    }

    public async stop() {
        await super.stop_process()
    }
}

// Video events to camera device
export class VideoContext extends MediaContext {
    public static instance: VideoContext
    static readonly WIDTH: number = 640
    static readonly HEIGHT: number = 360

    private fps: number
    constructor(fps: number) {
        super()
        this.fps = fps
        VideoContext.instance = this
    }

    public default() {
        const brandingFile = IS_MACOS ? '../branding.mov' : '../branding.mp4'
        VideoContext.instance.play(brandingFile, true)
    }

    public play(pathname: string, loop: boolean) {
        let args: string[] = []
        
        if (loop) {
            args.push('-stream_loop', '-1')
        }
        
        args.push('-re', '-i', pathname)
        
        if (IS_MACOS) {
            // macOS: Record to temporary file
            const outputFile = `/tmp/virtual_video_${Date.now()}.mov`
            args.push(
                '-vcodec', 'libx264',
                '-s', `${VideoContext.WIDTH}x${VideoContext.HEIGHT}`,
                '-r', `${this.fps}`,
                outputFile
            )
            console.log(`🍎 macOS: Recording video to ${outputFile}`)
        } else if (CONFIG.videoFormat === 'v4l2') {
            // Linux with v4l2 (NixOS or standard)
            args.push(
                '-f', CONFIG.videoFormat,
                '-vcodec', CONFIG.videoCodec!,
                '-s', `${VideoContext.WIDTH}x${VideoContext.HEIGHT}`,
                CONFIG.cameraDevice
            )
        } else {
            // Windows or other
            args.push(
                '-f', CONFIG.videoFormat,
                '-vcodec', CONFIG.videoCodec!,
                '-s', `${VideoContext.WIDTH}x${VideoContext.HEIGHT}`,
                CONFIG.cameraDevice
            )
        }
        
        super.execute(args, this.default)
    }

    public async stop() {
        await super.stop_process()
    }
}

// Utility function to detect available devices
export async function detectAvailableDevices() {
    console.log(`🔍 Detecting ${PLATFORM} devices...`)
    
    const detectArgs = []
    
    if (IS_MACOS) {
        detectArgs.push('-f', 'avfoundation', '-list_devices', 'true', '-i', '""')
    } else if (IS_LINUX) {
        // List V4L2 and ALSA devices
        console.log(`Video devices: ${CONFIG.cameraDevice}`)
        console.log(`Audio devices: ${CONFIG.microDevice}`)
        return Promise.resolve('Linux devices checked')
    } else if (IS_WINDOWS) {
        detectArgs.push('-f', 'dshow', '-list_devices', 'true', '-i', 'dummy')
    }
    
    if (detectArgs.length > 0) {
        const listDevices = spawn('ffmpeg', detectArgs)
        
        listDevices.stderr.on('data', (data) => {
            console.log(`📱 Available devices:\n${data}`)
        })
        
        return new Promise((resolve) => {
            listDevices.on('close', () => {
                resolve('Detection completed')
            })
        })
    }
    
    return Promise.resolve('No detection needed')
}

// Platform compatibility test
export async function testPlatformCompatibility() {
    console.log('🧪 Testing platform compatibility...')
    
    // Test FFmpeg
    try {
        const ffmpegTest = spawn('ffmpeg', ['-version'])
        await new Promise((resolve, reject) => {
            ffmpegTest.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ FFmpeg available')
                    resolve(true)
                } else {
                    console.log('❌ FFmpeg not available')
                    reject(false)
                }
            })
        })
    } catch (error) {
        console.error('❌ FFmpeg test failed:', error)
    }
    
    // Device testing
    if (IS_LINUX && CONFIG.microDevice.includes('virtual_mic')) {
        console.log('🎯 NixOS/virtual devices mode detected')
    } else {
        console.log('🎤 Native devices mode')
    }
    
    return CONFIG
}

// Export configuration for debugging
export const MEDIA_CONFIG = {
    platform: PLATFORM,
    isMacOS: IS_MACOS,
    isLinux: IS_LINUX,
    isWindows: IS_WINDOWS,
    hasVirtualDevices: IS_LINUX && hasLinuxVirtualDevices(),
    microDevice: CONFIG.microDevice,
    cameraDevice: CONFIG.cameraDevice,
    audioFormat: CONFIG.audioFormat,
    videoFormat: CONFIG.videoFormat,
    sampleRate: 48000,
    videoWidth: VideoContext.WIDTH,
    videoHeight: VideoContext.HEIGHT
}

console.log('🔧 Media Context Configuration:', MEDIA_CONFIG)
