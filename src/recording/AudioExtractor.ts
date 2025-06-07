import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import * as fs from 'fs/promises'
import * as path from 'path'
import { PathManager } from '../utils/PathManager'
import { S3Uploader } from '../utils/S3Uploader'

export interface AudioExtractionOptions {
    sampleRate?: number // Par défaut 16000
    channels?: number // Par défaut 1 (mono)
    format?: string // Par défaut 'wav'
    maxRetries?: number // Par défaut 3
    retryDelay?: number // Par défaut 2000ms
    segmentDuration?: number // Par défaut 3 minutes
}

export class AudioExtractor extends EventEmitter {
    private readonly DEFAULT_OPTIONS: AudioExtractionOptions = {
        sampleRate: 16000,
        channels: 1,
        format: 'wav',
        maxRetries: 3,
        retryDelay: 2000,
    }

    private readonly pathManager: PathManager
    private readonly options: AudioExtractionOptions
    private readonly s3Uploader: S3Uploader

    constructor(options: AudioExtractionOptions = {}) {
        super()
        this.options = { ...this.DEFAULT_OPTIONS, ...options }
        this.pathManager = PathManager.getInstance()
        this.s3Uploader = S3Uploader.getInstance()
    }

    public async extract(
        startTime: number,
        endTime: number,
        bucketName: string,
        s3Path: string,
    ): Promise<string> {
        console.log('Starting audio extraction:', {
            startTime,
            endTime,
            s3Path,
        })

        const audioFileName = `audio_${startTime}_${endTime}.${this.options.format}`
        const outputPath = path.join(
            this.pathManager.getAudioTmpPath(),
            audioFileName,
        )
        const webmPath = this.pathManager.getWebmPath()

        try {
            // Vérifier si le fichier webm existe
            const webmExists = await this.checkWebmFile(webmPath)
            console.log('Paths for extraction:', {
                webmPath,
                outputPath,
                exists: webmExists,
            })

            if (!webmExists) {
                throw new Error(
                    `WebM file does not exist or is empty: ${webmPath}`,
                )
            }

            // Extraire l'audio
            await this.extractAudioSegment(
                webmPath,
                startTime,
                endTime,
                outputPath,
            )

            // Vérifier le fichier
            await this.validateAudioFile(outputPath)

            // Upload vers S3 avec le bon chemin
            const s3Url = await this.s3Uploader.uploadFile(
                outputPath,
                bucketName,
                `${s3Path}/${path.basename(outputPath)}`,
                true,
            )

            this.emit('extractionComplete', {
                startTime,
                endTime,
                outputPath,
                s3Url,
            })

            return s3Url
        } catch (error) {
            console.error('Audio extraction failed:', {
                error,
                webmPath,
                outputPath,
            })
            this.emit('error', error)
            throw error
        } finally {
            // Nettoyage
            try {
                //TODO: Uncomment this when we want to delete the audio file for prod
                // await fs.unlink(outputPath);
            } catch (e) {
                console.error('Error cleaning up temp file:', e)
            }
        }
    }

    private async checkWebmFile(webmPath: string): Promise<boolean> {
        try {
            const stats = await fs.stat(webmPath)
            return stats.isFile() && stats.size > 0
        } catch (error) {
            return false
        }
    }

    private async extractAudioSegment(
        webmPath: string,
        startTime: number,
        endTime: number,
        outputPath: string,
    ): Promise<void> {
        // Convertir en secondes et arrondir
        const duration = Math.floor((endTime - startTime) / 1000)
        const startSeconds = Math.floor(startTime / 1000)

        const ffmpegArgs = [
            '-y',
            '-ss',
            startSeconds.toString(),
            '-i',
            webmPath,
            '-t',
            duration.toString(),
            '-map',
            '0:a',
            '-acodec',
            'pcm_s16le',
            '-ac',
            this.options.channels!.toString(),
            '-ar',
            this.options.sampleRate!.toString(),
            '-f',
            'wav', // Forcer le format WAV
            outputPath,
        ]

        console.log('FFmpeg extraction command:', {
            command: ffmpegArgs.join(' '),
            startTime: startSeconds,
            duration,
        })

        return new Promise((resolve, reject) => {
            const process = spawn('ffmpeg', ffmpegArgs)
            let errorOutput = ''

            process.stderr.on('data', (data) => {
                const message = data.toString()
                errorOutput += message
                this.emit('progress', message)
            })

            process.on('close', (code) => {
                if (code === 0) {
                    resolve()
                } else {
                    reject(
                        new Error(
                            `FFmpeg failed with code ${code}: ${errorOutput}`,
                        ),
                    )
                }
            })

            process.on('error', (error) => {
                reject(new Error(`FFmpeg process error: ${error.message}`))
            })
        })
    }

    private async validateAudioFile(filePath: string): Promise<void> {
        try {
            const stats = await fs.stat(filePath)
            if (stats.size <= 44) {
                throw new Error('Generated audio file is invalid (too small)')
            }
            console.log('Audio file validated:', {
                path: filePath,
                size: stats.size,
            })
        } catch (error) {
            throw new Error(
                `Audio file validation failed: ${(error as Error).message}`,
            )
        }
    }

    public async retryOperation<T>(
        operation: () => Promise<T>,
        retries: number = this.options.maxRetries!,
    ): Promise<T> {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await operation()
            } catch (error) {
                if (attempt === retries) throw error
                await new Promise((resolve) =>
                    setTimeout(resolve, this.options.retryDelay!),
                )
                this.emit('retrying', { attempt, error })
            }
        }
        throw new Error('Retry operation failed')
    }
}
