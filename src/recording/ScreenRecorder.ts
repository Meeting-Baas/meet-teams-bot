import { ChildProcess, spawn } from 'child_process'
import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import { Streaming } from '../streaming'

import { RecordingMode } from '../types'
import { PathManager } from '../utils/PathManager'
import { S3Uploader } from '../utils/S3Uploader'
import { SyncCalibrator } from './SyncCalibrator'

export interface ScreenRecordingConfig {
    display: string
    audioDevice?: string
    outputFormat: 'webm' | 'mp4'
    videoCodec: 'libx264' | 'libvpx-vp9' | 'libvpx'
    audioCodec: 'aac' | 'opus' | 'libmp3lame'
    width: number
    height: number
    framerate: number
    audioBitrate: string
    videoBitrate: string
    recordingMode?: RecordingMode
    enableTranscriptionChunking?: boolean
    transcriptionChunkDuration?: number
    transcriptionAudioBucket?: string
    bucketName?: string
    s3Path?: string
}

export class ScreenRecorder extends EventEmitter {
    private ffmpegProcess: ChildProcess | null = null
    private chunkWatcher: fs.FSWatcher | null = null
    private streamingProcess: ChildProcess | null = null
    private outputPath: string = ''
    private audioOutputPath: string = ''
    private config: ScreenRecordingConfig
    private s3Uploader: S3Uploader | null = null
    private isConfigured: boolean = false
    private isRecording: boolean = false
    private filesUploaded: boolean = false
    private syncCalibrator: SyncCalibrator
    private pathManager: PathManager | null = null
    private page: any = null

    constructor(config: Partial<ScreenRecordingConfig> = {}) {
        super()
        
        // Native bucket logic (no legacy complexity)
        const env = process.env.ENVIRON || 'local'
        const transcriptionAudioBucket = this.determineBucket(env)

        console.log(`Native ScreenRecorder: Using audio bucket for ${env}: ${transcriptionAudioBucket}`)
        
        // Clean configuration (no legacy defaults)
        this.config = {
            display: process.env.DISPLAY || ':99',
            audioDevice: 'pulse',
            outputFormat: 'mp4',
            videoCodec: 'libx264',
            audioCodec: 'aac',
            width: 1280,
            height: 720,
            framerate: 30,
            audioBitrate: '128k',
            videoBitrate: '1000k',
            recordingMode: 'speaker_view',
            enableTranscriptionChunking: false,
            transcriptionChunkDuration: 3600,
            transcriptionAudioBucket: transcriptionAudioBucket,
            bucketName: process.env.AWS_S3_VIDEO_BUCKET || '',
            s3Path: '',
            ...config
        }
        
        this.syncCalibrator = new SyncCalibrator()
        
        if (process.env.SERVERLESS !== 'true') {
            this.s3Uploader = S3Uploader.getInstance()
        }
        
        console.log('Native ScreenRecorder initialized:', {
            recordingMode: this.config.recordingMode,
            enableTranscriptionChunking: this.config.enableTranscriptionChunking,
        })
    }

    private determineBucket(env: string): string {
        switch (env) {
            case 'prod': return 'meeting-baas-audio'
            case 'preprod': return 'preprod-meeting-baas-audio'
            default: return process.env.AWS_S3_TEMPORARY_AUDIO_BUCKET || 'local-meeting-baas-audio'
        }
    }

    public configure(
        pathManager: PathManager,
        recordingMode?: RecordingMode,
        meetingParams?: any,
    ): void {
        if (!pathManager) {
            throw new Error('PathManager is required for configuration')
        }

        this.pathManager = pathManager

        if (recordingMode) {
            this.config.recordingMode = recordingMode
        }

        // Simple transcription detection
        if (meetingParams) {
            const hasTranscription = this.detectTranscription(meetingParams)
            this.config.enableTranscriptionChunking = hasTranscription
        }

        // Native path generation (no legacy patterns)
        this.generateOutputPaths(pathManager)

        // Simple S3 configuration
        const { bucketName, s3Path } = pathManager.getS3Paths()
        this.config.bucketName = bucketName
        this.config.s3Path = s3Path

        this.isConfigured = true

        console.log('Native ScreenRecorder configured:', {
            outputPath: this.outputPath,
            audioOutputPath: this.audioOutputPath,
            recordingMode: this.config.recordingMode,
        })
    }

    private detectTranscription(meetingParams: any): boolean {
        return (meetingParams.speech_to_text_provider && 
                meetingParams.speech_to_text_provider !== 'None') ||
               (meetingParams.speech_to_text?.provider && 
                meetingParams.speech_to_text.provider !== 'None')
    }

    private generateOutputPaths(pathManager: PathManager): void {
        const isAudioOnly = this.config.recordingMode === 'audio_only'
        
        if (isAudioOnly) {
            this.outputPath = pathManager.getOutputPath() + '.wav'
            this.audioOutputPath = this.outputPath
        } else {
            this.outputPath = pathManager.getOutputPath() + '.mp4'
            this.audioOutputPath = pathManager.getOutputPath() + '.wav'
        }
    }

    public setPage(page: any): void {
        this.page = page
    }

    public async startRecording(): Promise<void> {
        this.validateConfiguration()
        
        if (this.isRecording) {
            throw new Error('Recording is already in progress')
        }

        console.log('🎬 Starting native recording...')

        try {
            await this.ensureOutputDirectory()
            const syncOffset = await this.calculateSyncOffset()
            const ffmpegArgs = this.buildNativeFFmpegArgs(syncOffset)

            this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
                stdio: ['pipe', 'pipe', 'pipe']
            })

            this.isRecording = true
            this.setupProcessMonitoring()
            this.startNativeAudioStreaming()

            console.log('Native recording started successfully')
            this.emit('started', {
                outputPath: this.outputPath,
                isAudioOnly: this.config.recordingMode === 'audio_only',
            })

        } catch (error) {
            console.error('Failed to start native recording:', error)
            this.isRecording = false
            this.emit('error', { type: 'startError', error })
            throw error
        }
    }

    private validateConfiguration(): void {
        if (!this.isConfigured) {
            throw new Error('ScreenRecorder must be configured before starting')
        }
    }

    private async ensureOutputDirectory(): Promise<void> {
        const outputDir = path.dirname(this.outputPath)
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true })
        }
    }

    private async calculateSyncOffset(): Promise<number> {
        // Native sync calculation (simplified)
        const systemLoad = await this.getSystemLoad()
        const roughEstimate = this.estimateOffsetFromLoad(systemLoad)
        
        if (this.page) {
            try {
                const preciseOffset = await this.syncCalibrator.quickCalibrateOnceOptimized(this.page)
                if (Math.abs(preciseOffset) > 0.001) {
                    return -preciseOffset + 0.020
                }
            } catch (error) {
                console.warn('Precise calibration failed, using system estimate')
            }
        }
        
        return roughEstimate
    }

    private buildNativeFFmpegArgs(syncOffset: number): string[] {
        const args: string[] = []
        const isAudioOnly = this.config.recordingMode === 'audio_only'

        console.log('🛠️ Building FFmpeg args for native synchronization...')
        console.log(`🎯 Applying audio offset: ${syncOffset.toFixed(3)}s`)

        if (isAudioOnly) {
            args.push(
                '-f', 'pulse',
                '-thread_queue_size', '512',
                '-probesize', '50M',
                '-analyzeduration', '10000000',
                '-i', 'virtual_speaker.monitor',
                '-itsoffset', syncOffset.toString(),
                '-acodec', 'pcm_s16le',
                '-ac', '1', '-ar', '16000',
                '-f', 'wav', '-y',
                this.outputPath
            )
        } else {
            args.push(
                // Video input with Docker sync fixes
                '-f', 'x11grab',
                '-video_size', '1280x880',
                '-framerate', '30',
                '-probesize', '50M',
                '-analyzeduration', '10000000',
                '-thread_queue_size', '512',
                '-rtbufsize', '100M',
                '-fflags', '+genpts',
                '-use_wallclock_as_timestamps', '1',
                '-i', this.config.display
            )

            // Audio input with calibrated offset + sync
            args.push(
                '-f', 'pulse',
                '-thread_queue_size', '512',
                '-probesize', '50M',
                '-analyzeduration', '10000000',
                '-fflags', '+genpts',
                '-use_wallclock_as_timestamps', '1',
                '-itsoffset', syncOffset.toString(),
                '-i', 'virtual_speaker.monitor'
            )

            // **FIXED: Restore simultaneous MP4 + WAV multi-output (like working version)**
            args.push(
                // === OUTPUT 1: MP4 (video + audio) ===
                '-map', '0:v:0', '-map', '1:a:0',
                '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
                '-vf', 'crop=1280:720:0:160',
                '-c:a', 'aac', '-b:a', '160k',
                '-avoid_negative_ts', 'make_zero',
                '-max_muxing_queue_size', '1024',
                '-async', '1',
                '-f', 'mp4', '-movflags', '+faststart',
                this.outputPath,
                
                // === OUTPUT 2: WAV (simultaneous audio for transcription) ===
                '-map', '1:a:0', '-vn',
                '-acodec', 'pcm_s16le', '-ac', '1', '-ar', '16000',
                '-async', '1',
                '-avoid_negative_ts', 'make_zero',
                '-f', 'wav',
                this.audioOutputPath
            )

            // === OUTPUT 3: Real-time chunks (if enabled) ===
            if (this.config.enableTranscriptionChunking) {
                // Use audio_tmp directory and UUID-based naming like production
                const chunksDir = this.pathManager ? this.pathManager.getAudioTmpPath() : path.join(path.dirname(this.outputPath), 'audio_tmp')
                if (!fs.existsSync(chunksDir)) {
                    fs.mkdirSync(chunksDir, { recursive: true })
                }
                
                // Use botUuid for chunk naming format: ${botUuid}-%d.wav
                const botUuid = this.pathManager ? this.pathManager.getBotUuid() : 'unknown'
                const chunkPattern = path.join(chunksDir, `${botUuid}-%d.wav`)
                
                args.push(
                    '-map', '1:a:0', '-vn',
                    '-acodec', 'pcm_s16le', '-ac', '1', '-ar', '16000',
                    '-f', 'segment',
                    '-segment_time', (this.config.transcriptionChunkDuration || 3600).toString(),
                    '-segment_format', 'wav',
                    chunkPattern
                )
                
                this.startChunkMonitoring(chunksDir)
                console.log(`🎯 Real-time chunks: ${this.config.transcriptionChunkDuration}s chunks enabled`)
                console.log(`🎯 Chunk naming format: ${botUuid}-[index].wav`)
            }

            console.log(`✅ FFmpeg itsoffset parameter: ${syncOffset.toFixed(3)}s`)
            console.log(`🎯 Simultaneous generation: MP4 + WAV during recording`)
        }

        return args
    }

    private setupProcessMonitoring(): void {
        if (!this.ffmpegProcess) return

        this.ffmpegProcess.on('error', (error) => {
            console.error('FFmpeg error:', error)
            this.emit('error', error)
        })

        this.ffmpegProcess.on('exit', (code) => {
            console.log(`FFmpeg exited with code ${code}`)
            
            if (code === 0) {
                this.handleSuccessfulRecording()
            }
            
            this.isRecording = false
            this.emit('stopped')
        })

        this.ffmpegProcess.stderr?.on('data', (data) => {
            const output = data.toString()
            if (output.includes('error')) {
                console.error('FFmpeg stderr:', output.trim())
            }
        })
    }

    private async handleSuccessfulRecording(): Promise<void> {
        console.log('Native recording completed')
        
        // Auto-upload if not serverless
        if (process.env.SERVERLESS !== 'true') {
            setTimeout(() => this.uploadToS3().catch(console.error), 200)
        }
        
        this.cleanupChunkMonitoring()
    }

    private startNativeAudioStreaming(): void {
        if (!Streaming.instance) return

        try {
            const STREAMING_SAMPLE_RATE = 24_000

            this.streamingProcess = spawn('ffmpeg', [
                '-f', 'pulse',
                '-thread_queue_size', '256',
                '-i', 'virtual_speaker.monitor',
                '-acodec', 'pcm_f32le',
                '-ac', '1',
                '-ar', STREAMING_SAMPLE_RATE.toString(),
                '-f', 'f32le',
                'pipe:1'
            ], { stdio: ['pipe', 'pipe', 'pipe'] })

            this.streamingProcess.stdout?.on('data', (data: Buffer) => {
                if (Streaming.instance) {
                    const float32Array = new Float32Array(
                        data.buffer, data.byteOffset, data.length / 4
                    )
                    Streaming.instance.processAudioChunk(float32Array)
                }
            })

            this.ffmpegProcess?.once('exit', () => {
                if (this.streamingProcess && !this.streamingProcess.killed) {
                    this.streamingProcess.kill('SIGINT')
                }
            })

        } catch (error) {
            console.error('Failed to start native audio streaming:', error)
        }
    }

    private startChunkMonitoring(chunksDir: string): void {
        this.chunkWatcher = fs.watch(chunksDir, async (eventType, filename) => {
            if (eventType === 'rename' && filename?.endsWith('.wav')) {
                const chunkPath = path.join(chunksDir, filename)
                setTimeout(() => this.uploadChunk(chunkPath, filename), 2000)
            }
        })
    }

    private async uploadChunk(chunkPath: string, filename: string): Promise<void> {
        if (!this.s3Uploader || !fs.existsSync(chunkPath)) return

        try {
            // Upload directly with the filename (UUID-index.wav format) without chunks/ prefix
            // This matches production format where chunks are uploaded as: 009abdef-dd02-4a30-bac3-c514ebc69173-0.wav
            await this.s3Uploader.uploadFile(
                chunkPath, 
                this.config.transcriptionAudioBucket!, 
                filename, 
                true
            )
            console.log(`✅ Chunk uploaded: ${filename}`)
        } catch (error) {
            console.error(`Failed to upload chunk ${filename}:`, error)
        }
    }

    private cleanupChunkMonitoring(): void {
        if (this.chunkWatcher) {
            this.chunkWatcher.close()
            this.chunkWatcher = null
        }
    }

    /**
     * External API: uploadToS3() - Maintain compatibility
     */
    public async uploadToS3(): Promise<void> {
        if (this.filesUploaded || !this.s3Uploader || !fs.existsSync(this.outputPath)) {
            return
        }

        try {
            const isAudioOnly = this.config.recordingMode === 'audio_only'
            const fileExtension = isAudioOnly ? '.wav' : '.mp4'
            const s3Key = `${this.config.s3Path}${fileExtension}`

            await this.s3Uploader.uploadFile(
                this.outputPath,
                this.config.bucketName!,
                s3Key,
            )

            fs.unlinkSync(this.outputPath)
            this.filesUploaded = true
            
            console.log(`Native S3 upload completed`)
        } catch (error) {
            console.error('Native S3 upload error:', error)
            throw error
        }
    }

    /**
     * External API: stopRecording() - Maintain compatibility
     */
    public async stopRecording(): Promise<void> {
        if (!this.isRecording || !this.ffmpegProcess) {
            return
        }

        return new Promise((resolve) => {
            this.ffmpegProcess!.once('exit', () => {
                this.isRecording = false
                this.ffmpegProcess = null
                resolve()
            })

            this.ffmpegProcess!.kill('SIGINT')

            setTimeout(() => {
                if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
                    this.ffmpegProcess.kill('SIGKILL')
                }
            }, 5000)
        })
    }

    // External API methods (maintain compatibility)
    public isCurrentlyRecording(): boolean {
        return this.isRecording
    }

    public getConfig(): ScreenRecordingConfig {
        return { ...this.config }
    }

    public updateConfig(newConfig: Partial<ScreenRecordingConfig>): void {
        if (this.isRecording) {
            throw new Error('Cannot update config while recording')
        }
        this.config = { ...this.config, ...newConfig }
    }

    public getStatus(): {
        isRecording: boolean
        isConfigured: boolean
        filesUploaded: boolean
    } {
        return {
            isRecording: this.isRecording,
            isConfigured: this.isConfigured,
            filesUploaded: this.filesUploaded,
        }
    }

    public getFilesUploaded(): boolean {
        return this.filesUploaded
    }

    // Helper methods
    private async getSystemLoad(): Promise<number> {
        try {
            const { exec } = require('child_process')
            const { promisify } = require('util')
            const execAsync = promisify(exec)
            
            const { stdout } = await execAsync('uptime')
            const loadMatch = stdout.match(/load average: ([\d.]+)/)
            return loadMatch ? parseFloat(loadMatch[1]) : 0
        } catch {
            return 0
        }
    }

    private estimateOffsetFromLoad(load: number): number {
        if (load < 1.5) return -0.065
        else if (load < 2.5) return 0.000
        else return -0.050
    }
}

// External API: Global instance (maintain compatibility)
export const SCREEN_RECORDER = new ScreenRecorder({
    recordingMode: 'speaker_view',
    enableTranscriptionChunking: process.env.ENABLE_TRANSCRIPTION_CHUNKING === 'true',
    transcriptionAudioBucket: process.env.TRANSCRIPTION_AUDIO_BUCKET,
}) 