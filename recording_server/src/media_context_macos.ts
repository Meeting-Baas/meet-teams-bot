import { ChildProcess, spawn } from 'child_process'
import internal from 'stream'
import { platform } from 'os'

// Configuration macOS-compatible
// Pour macOS, nous utilisons AVFoundation au lieu de v4l2 et alsa
const IS_MACOS = platform() === 'darwin'

// Dispositifs pour macOS (AVFoundation)
const MACOS_DEFAULT_MIC = '0'  // Microphone par défaut (index AVFoundation)
const MACOS_DEFAULT_CAMERA = '0'  // Caméra par défaut (index AVFoundation)

// Dispositifs pour Linux (v4l2/pulse)
const LINUX_MICRO_DEVICE: string = 'pulse:virtual_mic_source'
const LINUX_CAMERA_DEVICE: string = '/dev/video10'

// Sélection automatique selon la plateforme
const MICRO_DEVICE = IS_MACOS ? MACOS_DEFAULT_MIC : LINUX_MICRO_DEVICE
const CAMERA_DEVICE = IS_MACOS ? MACOS_DEFAULT_CAMERA : LINUX_CAMERA_DEVICE

console.log(`Platform detected: ${platform()}`)
console.log(`Using MICRO_DEVICE: ${MICRO_DEVICE}`)
console.log(`Using CAMERA_DEVICE: ${CAMERA_DEVICE}`)

// Cette classe abstraite contient le processus ffmpeg actuel
// Une classe dérivée doit implémenter les méthodes play et stop
//
// ___EXEMPLES_MACOS___
// ffmpeg -f avfoundation -i "0:0" -f avfoundation output.mov
// ffmpeg -f avfoundation -i ":0" audio_only.wav
// ffmpeg -f avfoundation -i "0:" video_only.mov
//
// ___EXEMPLES_LINUX___
// ffmpeg -re -i video.mp4 -f v4l2 -vcodec copy /dev/video10
// ffmpeg -re -i audio.mp3 -f alsa -ac 2 -ar 44100 hw:Loopback,1
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

        console.log(`Executing ffmpeg with args: ${args.join(' ')}`)
        
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
                console.error(`ffmpeg stderr: ${data}`)
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

// Événements audio vers le dispositif microphone
export class SoundContext extends MediaContext {
    public static instance: SoundContext

    private sampleRate: number
    constructor(sampleRate: number) {
        super()
        this.sampleRate = sampleRate
        SoundContext.instance = this
    }

    public default() {
        // Jouer un fichier de silence par défaut
        const silenceFile = IS_MACOS ? '../silence.wav' : '../silence.opus'
        SoundContext.instance.play(silenceFile, false)
    }

    public play(pathname: string, loop: boolean) {
        let args: string[] = []
        
        if (loop) {
            args.push(`-stream_loop`, `-1`)
        }
        
        args.push(`-re`, `-i`, pathname)
        
        if (IS_MACOS) {
            // macOS: Utiliser AVFoundation pour la sortie audio
            // ffmpeg -re -i audio.mp3 -f avfoundation -i ":1" output.wav
            args.push(
                `-f`, `avfoundation`,
                `-i`, `:${MICRO_DEVICE}`
            )
        } else {
            // Linux: Utiliser ALSA/PulseAudio
            args.push(
                `-f`, `alsa`,
                `-acodec`, `pcm_s16le`,
                MICRO_DEVICE
            )
        }
        
        super.execute(args, this.default)
    }

    // Retourner stdin et jouer le son vers le microphone
    public play_stdin(): internal.Writable {
        let args: string[] = []
        
        if (IS_MACOS) {
            // macOS: Utiliser AVFoundation pour l'entrée/sortie audio
            // ffmpeg -f f32le -ar 48000 -ac 1 -i - -f avfoundation ":1"
            args.push(
                `-f`, `f32le`,
                `-ar`, `${this.sampleRate}`,
                `-ac`, `1`,
                `-i`, `-`,
                `-f`, `avfoundation`,
                `:${MICRO_DEVICE}`
            )
        } else {
            // Linux: Utiliser ALSA/PulseAudio
            args.push(
                `-f`, `f32le`,
                `-ar`, `${this.sampleRate}`,
                `-ac`, `1`,
                `-i`, `-`,
                `-f`, `alsa`,
                `-acodec`, `pcm_s16le`,
                MICRO_DEVICE
            )
        }
        
        const process = super.execute(args, () => {
            console.warn(`[play_stdin] Sequence ended`)
        })
        
        return process ? process.stdin : null
    }

    public async stop() {
        await super.stop_process()
    }
}

// Événements vidéo vers le dispositif caméra
//
// macOS: Utilise AVFoundation au lieu de v4l2loopback
// Nécessite des outils comme OBS Virtual Camera pour créer des caméras virtuelles
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
            args.push(`-stream_loop`, `-1`)
        }
        
        args.push(`-re`, `-i`, pathname)
        
        if (IS_MACOS) {
            // macOS: Sortie vers une caméra virtuelle (nécessite OBS Virtual Camera ou similaire)
            // Ou enregistrement vers un fichier
            args.push(
                `-vcodec`, `libx264`,
                `-s`, `${VideoContext.WIDTH}x${VideoContext.HEIGHT}`,
                `-r`, `${this.fps}`,
                `/tmp/virtual_camera_${Date.now()}.mov`
            )
            console.warn('macOS: Enregistrement vers fichier temporaire (caméra virtuelle non supportée nativement)')
        } else {
            // Linux: Utiliser v4l2loopback
            args.push(
                `-f`, `v4l2`,
                `-vcodec`, `rawvideo`,
                `-s`, `${VideoContext.WIDTH}x${VideoContext.HEIGHT}`,
                CAMERA_DEVICE
            )
        }
        
        super.execute(args, this.default)
    }

    public async stop() {
        await super.stop_process()
    }
}

// Fonction utilitaire pour détecter les dispositifs disponibles
export async function detectAvailableDevices() {
    if (IS_MACOS) {
        console.log('Détection des dispositifs macOS...')
        
        // Lister les dispositifs AVFoundation
        const listDevices = spawn('ffmpeg', [
            '-f', 'avfoundation',
            '-list_devices', 'true',
            '-i', '""'
        ])
        
        listDevices.stderr.on('data', (data) => {
            console.log(`Dispositifs disponibles: ${data}`)
        })
        
        return new Promise((resolve) => {
            listDevices.on('close', () => {
                resolve('Detection completed')
            })
        })
    } else {
        console.log('Détection des dispositifs Linux...')
        console.log(`Video device: ${CAMERA_DEVICE}`)
        console.log(`Audio device: ${MICRO_DEVICE}`)
        return Promise.resolve('Linux devices configured')
    }
}

// Export de la configuration pour debugging
export const CONFIG = {
    platform: platform(),
    isMacOS: IS_MACOS,
    microDevice: MICRO_DEVICE,
    cameraDevice: CAMERA_DEVICE,
    sampleRate: 48000,
    videoWidth: VideoContext.WIDTH,
    videoHeight: VideoContext.HEIGHT
}

console.log('Media Context Configuration:', CONFIG) 