import { ChildProcess, spawn } from 'child_process'
import { EventEmitter } from 'events'
import * as fs from 'fs'
import { MEETING_CONSTANTS } from '../state-machine/constants'
import { RecordingMode } from '../types'
import { PathManager } from '../utils/PathManager'
import { S3Uploader } from '../utils/S3Uploader'
import { VideoChunkProcessor } from './VideoChunkProcessor'


export interface TranscoderConfig {
    chunkDuration: number
    transcribeDuration: number
    outputPath: string
    bucketName: string
    s3Path: string
    audioBucketName: string
    recordingMode: RecordingMode
    audioOutputPath?: string
    tempVideoPath?: string
    enableTranscriptionChunking?: boolean
    transcriptionChunkDuration?: number
    transcriptionAudioBucket?: string
}

export class Transcoder extends EventEmitter {
    private static readonly FFMPEG_CLOSE_TIMEOUT: number = 60_000
    private static readonly FASTSTART_TIMEOUT: number = 30_000

    // Configuration
    private config: TranscoderConfig

    // Composants essentiels
    private pathManager: PathManager | null = null
    private videoProcessor: VideoChunkProcessor
    private s3Uploader: S3Uploader
    
    private processedChunks: number = 0

    // Streams de sortie
    private ffmpegProcess: ChildProcess | null = null

    // États
    private isRecording: boolean = false
    private isPaused: boolean = false
    private isStopped: boolean = false
    private isConfigured: boolean = false
    private isAudioOnly: boolean = false

    // Nouveau processus pour l'extraction audio en parallèle
    private audioFfmpegProcess: ChildProcess | null = null

    // Track if files have been uploaded
    private filesUploaded = false;

    constructor(initialConfig: Partial<TranscoderConfig>) {
        super()
        this.setMaxListeners(20)

        // Determine which audio bucket to use based on environment
        const env = process.env.ENVIRON || 'local'
        let transcriptionAudioBucket: string
        
        if (env === 'prod') {
            transcriptionAudioBucket = 'meeting-baas-audio'
        } else if (env === 'preprod') {
            transcriptionAudioBucket = 'preprod-meeting-baas-audio'
        } else {
            // Default to local bucket for development/test environments
            transcriptionAudioBucket = process.env.AWS_S3_TEMPORARY_AUDIO_BUCKET || 'local-meeting-baas-audio'
        }
        
        console.log(`Using transcription audio bucket for environment ${env}: ${transcriptionAudioBucket}`)

        this.config = {
            chunkDuration: MEETING_CONSTANTS.CHUNK_DURATION,
            transcribeDuration:
                MEETING_CONSTANTS.CHUNKS_PER_TRANSCRIPTION *
                MEETING_CONSTANTS.CHUNK_DURATION,
            outputPath: '',
            bucketName:
                initialConfig.bucketName ||
                process.env.AWS_S3_VIDEO_BUCKET ||
                '',
            audioBucketName: process.env.AWS_S3_TEMPORARY_AUDIO_BUCKET || '',
            s3Path: '',
            recordingMode: initialConfig.recordingMode || 'speaker_view',
            enableTranscriptionChunking: initialConfig.enableTranscriptionChunking || false,
            transcriptionChunkDuration: initialConfig.transcriptionChunkDuration || 3600, // 1 hour in seconds
            transcriptionAudioBucket: initialConfig.transcriptionAudioBucket || process.env.TRANSCRIPTION_AUDIO_BUCKET || transcriptionAudioBucket,
        }

        // Vérifier si on est en mode audio-only
        this.isAudioOnly = this.config.recordingMode === 'audio_only'

        this.s3Uploader = S3Uploader.getInstance()

        this.initializeComponents()
        this.setupEventListeners()
    }

    private initializeComponents(): void {
        this.videoProcessor = new VideoChunkProcessor(this.config)
    }

    public configure(
        pathManager: PathManager,
        recordingMode?: RecordingMode,
        meetingParams?: any
    ): void {
        if (!pathManager) {
            throw new Error('PathManager is required for configuration')
        }

        this.pathManager = pathManager

        // Mettre à jour le mode d'enregistrement si fourni
        if (recordingMode) {
            this.config.recordingMode = recordingMode
            this.isAudioOnly = recordingMode === 'audio_only'
        }

        // Update transcription chunking settings if meeting params are provided
        if (meetingParams) {
            // Check both formats of speech-to-text configuration
            const hasTranscription = 
                (meetingParams.speech_to_text_provider && meetingParams.speech_to_text_provider !== 'None') ||
                (meetingParams.speech_to_text && meetingParams.speech_to_text.provider && meetingParams.speech_to_text.provider !== 'None');
            
            this.config.enableTranscriptionChunking = hasTranscription;
            
            console.log('Transcription chunking setting:', {
                speech_to_text_provider: meetingParams.speech_to_text_provider,
                speech_to_text: meetingParams.speech_to_text,
                hasTranscription: hasTranscription,
                enableTranscriptionChunking: this.config.enableTranscriptionChunking
            });
        }

        // Ajuster l'extension du fichier de sortie selon le mode
        if (this.isAudioOnly) {
            // Utiliser WAV au lieu de MP3 pour l'audio
            this.config.outputPath = pathManager.getOutputPath() + '.wav'
        } else {
            // Mode vidéo normal
            this.config.outputPath = pathManager.getOutputPath() + '.mp4'
            // Ajouter un chemin pour le fichier audio WAV
            this.config.audioOutputPath = pathManager.getOutputPath() + '.wav'
        }

        const { bucketName, s3Path } = pathManager.getS3Paths()
        this.config.bucketName = bucketName
        this.config.s3Path = s3Path

        this.videoProcessor.updateConfig(this.config)
        this.isConfigured = true

        console.log('Transcoder configured:', {
            outputPath: this.config.outputPath,
            audioOutputPath: this.config.audioOutputPath,
            webmPath: this.pathManager.getWebmPath(),
            s3Path: this.config.s3Path,
            recordingMode: this.config.recordingMode,
            isAudioOnly: this.isAudioOnly,
            enableTranscriptionChunking: this.config.enableTranscriptionChunking,
        })
    }

    private validateStartConditions(): void {
        if (
            !this.isConfigured ||
            !this.pathManager
        ) {
            throw new Error(
                'Transcoder must be configured with PathManager before starting'
            )
        }

        if (this.isRecording) {
            throw new Error('Transcoder is already running')
        }

        // Valider l'extension du fichier en fonction du mode
        if (this.isAudioOnly) {
            if (!this.config.outputPath.endsWith('.wav')) {
                throw new Error(
                    'Output path must have .wav extension in audio-only mode',
                )
            }
        } else {
            if (!this.config.outputPath.endsWith('.mp4')) {
                throw new Error(
                    'Output path must have .mp4 extension in video mode',
                )
            }
            if (!this.config.audioOutputPath?.endsWith('.wav')) {
                throw new Error(
                    'Audio output path must have .wav extension',
                )
            }
        }
    }

    public async start(): Promise<void> {
        this.validateStartConditions()
        try {
            await this.pathManager!.ensureDirectories()
            
            if (this.isAudioOnly) {
                // En mode audio, on écrit directement en WAV
                await this.startFFmpeg()
            } else {
                // En mode vidéo, on écrit dans un fichier MP4 temporaire
                const tempVideoPath = this.config.outputPath + '.temp'
                this.config.tempVideoPath = tempVideoPath
                
                // Arguments FFmpeg pour écrire directement en MP4 et WAV simultanément
                const ffmpegArgs = [
                    '-i', 'pipe:0',
                    // Sortie MP4
                    '-map', '0',
                    '-c:v', 'copy',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-f', 'mp4',
                    '-movflags', '+frag_keyframe+empty_moov+separate_moof+omit_tfhd_offset+default_base_moof',
                    tempVideoPath,
                    // Sortie WAV simultanée
                    '-map', '0:a',
                    '-c:a', 'pcm_s16le',
                    '-ac', '1',
                    '-ar', '16000',
                    '-f', 'wav',
                    this.config.audioOutputPath
                ]

                this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
                    stdio: ['pipe', 'inherit', 'inherit'],
                })

                this.setupFFmpegListeners()
            }

            this.isRecording = true
            this.emit('started', {
                outputPath: this.config.outputPath,
                isAudioOnly: this.isAudioOnly,
            })
        } catch (error) {
            this.emit('error', { type: 'startError', error })
            throw error
        }
    }

    // Gestion des chunks - identique pour audio et vidéo
    public async uploadChunk(
        chunk: Buffer,
        isFinal: boolean = false,
    ): Promise<void> {
        if (!this.isReadyForChunks()) return

        try {
            // On n'écrit plus dans le WebM, seulement dans FFmpeg
            await this.writeToFFmpeg(chunk)

            await this.videoProcessor.processChunk(chunk, isFinal)
            if (isFinal) await this.stop()
            this.processedChunks++
        } catch (error) {
            console.error('Error processing chunk:', error)
            this.emit('error', { type: 'chunkError', error })
            throw error
        }
    }

    public async stop(): Promise<void> {
        if (this.isStopped) return

        try {
            // Finaliser le traitement des chunks
            await this.videoProcessor.finalize()

            // Fermer les flux
            await this.stopAllStreams()

            if (!this.isAudioOnly) {
                // Optimiser la vidéo en copiant le fichier temporaire vers le fichier final
                await this.finalizeVideo()
            }

            // First, create and upload audio chunks for transcription before we delete any files
            if (this.pathManager && this.config.enableTranscriptionChunking) {
                console.log('Starting audio chunking process for transcription');
                await this.createAndUploadTranscriptionChunks();
            }

            // Then upload the full recording and delete the files
            await this.uploadToS3()
            
            this.isRecording = false
            this.isStopped = true
            this.emit('stopped')
        } catch (error) {
            console.error('Error stopping transcoder:', error)
            throw error
        }
    }

    // Gestion des événements - identique pour audio et vidéo
    private setupEventListeners(): void {
        this.videoProcessor.on('error', (error) => {
            this.emit('error', { type: 'processorError', error })
        })
    }

    // Helpers d'état - identique pour audio et vidéo
    private isReadyForChunks(): boolean {
        if (this.isStopped || !this.isRecording) {
            console.log('Cannot process chunk: transcoder not ready')
            return false
        }
        return true
    }

    private async stopAllStreams(): Promise<void> {
        const closePromises = []

        if (this.ffmpegProcess) {
            closePromises.push(this.stopFFmpeg())
        }
        
        if (this.audioFfmpegProcess) {
            closePromises.push(this.stopAudioFFmpeg())
        }

        await Promise.all(closePromises)
    }

    public async pause(): Promise<void> {
        if (!this.canPause()) return

        await this.videoProcessor.pause()
        this.isPaused = true
        this.emit('paused')
    }

    public async resume(): Promise<void> {
        if (!this.canResume()) return

        await this.videoProcessor.resume()
        this.isPaused = false
        this.emit('resumed')
    }

    private canPause(): boolean {
        return this.isRecording && !this.isPaused
    }

    private canResume(): boolean {
        return this.isRecording && this.isPaused
    }

    private async startFFmpeg(): Promise<void> {
        let ffmpegArgs: string[] = []

        if (this.isAudioOnly) {
            // Configuration pour l'extraction audio WAV
            ffmpegArgs = [
                '-i',
                'pipe:0', // Entrée depuis stdin
                '-vn', // Pas de vidéo
                '-acodec',
                'pcm_s16le', // Codec WAV
                '-ac',
                '1', // Mono
                '-ar',
                '16000', // 16kHz
                '-f',
                'wav', // Format WAV
                '-y', // Écraser le fichier existant
                this.config.outputPath,
            ]
        } else {
            // Configuration MP4 standard (inchangée)
            ffmpegArgs = [
                '-i',
                'pipe:0',
                '-c:v',
                'copy',
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                '-strict',
                'experimental',
                '-f',
                'mp4',
                '-movflags',
                '+frag_keyframe+empty_moov+faststart',
                '-y',
                this.config.outputPath,
            ]
            
            // Démarrer un second processus FFmpeg pour l'extraction audio
            this.startAudioExtraction();
        }

        this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
            stdio: ['pipe', 'inherit', 'inherit'],
        })

        this.setupFFmpegListeners()

        console.log('Started FFmpeg process:', {
            isAudioOnly: this.isAudioOnly,
            outputPath: this.config.outputPath,
        })
    }

    private setupFFmpegListeners(): void {
        if (!this.ffmpegProcess) return

        this.ffmpegProcess.on('error', (error) => {
            console.error('FFmpeg process error:', error)
            this.emit('error', { type: 'ffmpegError', error })
        })

        this.ffmpegProcess.on('close', (code) => {
            if (code !== 0) {
                this.emit('error', {
                    type: 'ffmpegClose',
                    error: new Error(`FFmpeg exited with code ${code}`),
                })
            }
        })
    }

    private async writeToFFmpeg(chunk: Buffer): Promise<void> {
        if (!this.ffmpegProcess?.stdin) {
            throw new Error('FFmpeg stdin not available')
        }

        return new Promise<void>((resolve, reject) => {
            const stdin = this.ffmpegProcess!.stdin!

            const onDrain = () => {
                cleanup()
                resolve()
            }

            const onError = (error: Error) => {
                cleanup()
                reject(error)
            }

            const cleanup = () => {
                stdin.removeListener('drain', onDrain)
                stdin.removeListener('error', onError)
            }

            stdin.once('drain', onDrain)
            stdin.once('error', onError)

            const canContinue = stdin.write(chunk)
            if (canContinue) {
                cleanup()
                resolve()
            }
        })
    }

    private async stopFFmpeg(): Promise<void> {
        if (!this.ffmpegProcess) return

        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (this.ffmpegProcess) {
                    this.ffmpegProcess.kill('SIGTERM')
                    reject(new Error('FFmpeg stop timeout'))
                }
            }, Transcoder.FFMPEG_CLOSE_TIMEOUT)

            this.ffmpegProcess.on('close', () => {
                clearTimeout(timeout)
                this.ffmpegProcess = null
                resolve()
            })

            if (this.ffmpegProcess.stdin) {
                this.ffmpegProcess.stdin.end()
            }
        })
    }

    private async finalizeVideo(): Promise<void> {
        if (!this.config.tempVideoPath) return

        return new Promise<void>((resolve, reject) => {
            const fastStartProcess = spawn('ffmpeg', [
                '-i', this.config.tempVideoPath,
                '-c', 'copy',
                '-movflags', '+faststart',
                this.config.outputPath
            ])

            const timeout = setTimeout(() => {
                fastStartProcess.kill('SIGTERM')
                reject(new Error('Faststart optimization timeout'))
            }, Transcoder.FASTSTART_TIMEOUT)

            fastStartProcess.on('close', async (code) => {
                clearTimeout(timeout)
                if (code === 0) {
                    try {
                        // Supprimer le fichier temporaire
                        await fs.promises.unlink(this.config.tempVideoPath)
                        resolve()
                    } catch (error) {
                        reject(error)
                    }
                } else {
                    // En cas d'erreur lors de l'optimisation, on garde le fichier temporaire comme backup
                    try {
                        await fs.promises.rename(this.config.tempVideoPath, this.config.outputPath)
                        resolve()
                    } catch (error) {
                        reject(error)
                    }
                }
            })
        })
    }

    public async uploadToS3(): Promise<void> {
        console.log(`Currently using transcription audio bucket: ${this.config.transcriptionAudioBucket}`);
        if (!this.pathManager) {
            throw new Error('PathManager not available for S3 upload')
        }

        // Skip upload if files have already been uploaded
        if (this.filesUploaded) {
            console.log('Files already uploaded to S3, skipping duplicate upload')
            return
        }

        try {
            // Upload video file if not in audio-only mode
            if (!this.isAudioOnly) {
                // Vérifier que le fichier existe
                if (!fs.existsSync(this.config.outputPath)) {
                    throw new Error(
                        `Video file does not exist for upload: ${this.config.outputPath}`,
                    )
                }

                // Uploader le fichier vidéo
                console.log('Uploading video to S3:', {
                    localPath: this.config.outputPath,
                    bucketName: this.config.bucketName,
                    s3Key: `${this.pathManager.getIdentifier()}.mp4`,
                })

                await this.s3Uploader.uploadFile(
                    this.config.outputPath,
                    this.config.bucketName,
                    `${this.pathManager.getIdentifier()}.mp4`,
                )
                
                console.log(`Video uploaded successfully, deleting local file: ${this.config.outputPath}`);
                try {
                    fs.unlinkSync(this.config.outputPath);
                    console.log('Local video file deleted successfully');
                } catch (deleteError) {
                    console.error('Failed to delete local video file:', deleteError);
                }
            }

            // Upload audio file (WAV format)
            if (this.isAudioOnly) {
                // En mode audio-only, le fichier principal est déjà au format WAV
                if (!fs.existsSync(this.config.outputPath)) {
                    throw new Error(
                        `Audio file does not exist for upload: ${this.config.outputPath}`,
                    )
                }

                console.log('Uploading audio to S3:', {
                    localPath: this.config.outputPath,
                    bucketName: this.config.bucketName,
                    s3Key: `${this.pathManager.getIdentifier()}.wav`,
                })

                await this.s3Uploader.uploadFile(
                    this.config.outputPath,
                    this.config.bucketName,
                    `${this.pathManager.getIdentifier()}.wav`,
                )
                
                console.log(`Audio uploaded successfully, deleting local file: ${this.config.outputPath}`);
                try {
                    fs.unlinkSync(this.config.outputPath);
                    console.log('Local audio file deleted successfully');
                } catch (deleteError) {
                    console.error('Failed to delete local audio file:', deleteError);
                }
            } else if (this.config.audioOutputPath && fs.existsSync(this.config.audioOutputPath)) {
                // En mode vidéo, uploader aussi le fichier audio séparé
                console.log('Uploading audio to S3:', {
                    localPath: this.config.audioOutputPath,
                    bucketName: this.config.bucketName,
                    s3Key: `${this.pathManager.getIdentifier()}.wav`,
                })

                await this.s3Uploader.uploadFile(
                    this.config.audioOutputPath,
                    this.config.bucketName,
                    `${this.pathManager.getIdentifier()}.wav`,
                )
                
                console.log(`Audio uploaded successfully, deleting local file: ${this.config.audioOutputPath}`);
                try {
                    fs.unlinkSync(this.config.audioOutputPath);
                    console.log('Local audio file deleted successfully');
                } catch (deleteError) {
                    console.error('Failed to delete local audio file:', deleteError);
                }
            }

            // Mark files as uploaded to prevent duplicate uploads
            this.filesUploaded = true;
            console.log('S3 upload completed')
        } catch (error) {
            console.error('Error during S3 upload:', error)
            throw error
        }
    }

    // Nouveau processus pour l'extraction audio en parallèle
    private async startAudioExtraction(): Promise<void> {
        if (this.isAudioOnly || !this.config.audioOutputPath) return;
        
        const webmPath = this.pathManager!.getWebmPath();
        
        const audioArgs = [
            '-i',
            webmPath,
            '-vn',
            '-acodec',
            'pcm_s16le',
            '-ac',
            '1',
            '-ar',
            '16000',
            '-f',
            'wav',
            '-y',
            this.config.audioOutputPath,
        ];
        
        this.audioFfmpegProcess = spawn('ffmpeg', audioArgs, {
            stdio: ['ignore', 'inherit', 'inherit'],
        });
        
        this.audioFfmpegProcess.on('error', (error) => {
            console.error('Audio extraction FFmpeg process error:', error);
            this.emit('error', { type: 'audioFfmpegError', error });
        });
        
        this.audioFfmpegProcess.on('close', (code) => {
            if (code !== 0 && !this.isStopped) { // On ignore l'erreur si on a arrêté volontairement
                this.emit('error', {
                    type: 'audioFfmpegClose',
                    error: new Error(`Audio extraction FFmpeg exited with code ${code}`),
                });
            } else {
                console.log('Audio extraction completed successfully');
            }
        });
        
        console.log('Started audio extraction process:', {
            outputPath: this.config.audioOutputPath,
        });
    }

    private async stopAudioFFmpeg(): Promise<void> {
        if (!this.audioFfmpegProcess) return;

        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (this.audioFfmpegProcess) {
                    this.audioFfmpegProcess.kill('SIGTERM');
                    reject(new Error('Audio FFmpeg stop timeout'));
                }
            }, Transcoder.FFMPEG_CLOSE_TIMEOUT);

            this.audioFfmpegProcess.on('close', () => {
                clearTimeout(timeout);
                this.audioFfmpegProcess = null;
                resolve();
            });

            this.audioFfmpegProcess.kill('SIGINT');
        });
    }

    public getStatus(): {
        isRecording: boolean
        isPaused: boolean
        isStopped: boolean
        chunksProcessed: number
        isConfigured: boolean
        isAudioOnly: boolean
    } {
        return {
            isRecording: this.isRecording,
            isPaused: this.isPaused,
            isStopped: this.isStopped,
            chunksProcessed: this.processedChunks,
            isConfigured: this.isConfigured,
            isAudioOnly: this.isAudioOnly,
        }
    }

    private async createAndUploadTranscriptionChunks(): Promise<void> {
        // Check if transcription chunking is enabled
        if (!this.config.enableTranscriptionChunking) {
            console.log('Transcription chunking is disabled, skipping audio chunk creation');
            return;
        }

        // Use the audio file that was created during recording
        const audioFilePath = this.isAudioOnly ? this.config.outputPath : this.config.audioOutputPath!;
        
        // Get the appropriate bucket based on environment
        const env = process.env.ENVIRON || 'local';
        const bucketName = this.config.transcriptionAudioBucket || 
            (env === 'prod' ? 'meeting-baas-audio' : 
             env === 'preprod' ? 'preprod-meeting-baas-audio' : 
             process.env.AWS_S3_TEMPORARY_AUDIO_BUCKET || 'local-meeting-baas-audio');
        
        console.log('Starting audio chunking process for transcription');
        console.log(`Looking for audio file at: ${audioFilePath}`);
        console.log(`Will upload chunks to bucket: ${bucketName} (environment: ${env})`);
        
        if (!fs.existsSync(audioFilePath)) {
            console.error('Audio file not found for chunking:', audioFilePath);
            return;
        }

        console.log('Found audio file for chunking:', audioFilePath);

        try {
            // Get the total duration of the audio file using ffprobe
            const duration = await this.getAudioDuration(audioFilePath);
            if (duration <= 0) {
                console.error('Could not determine audio duration or file is empty');
                return;
            }

            console.log(`Audio file duration: ${duration} seconds`);

            // Calculate how many chunks we need
            const chunkDurationSecs = this.config.transcriptionChunkDuration;
            // Math.ceil ensures we create at least 1 chunk even for recordings shorter than 1 hour
            const numChunks = Math.ceil(duration / chunkDurationSecs);
            
            console.log(`Splitting into ${numChunks} chunks of ${chunkDurationSecs} seconds (or less for the final chunk)`);

            const botUuid = this.pathManager!.getBotUuid();

            // Create a temporary directory for chunks
            const tempDir = await fs.promises.mkdtemp(
                `${this.pathManager!.getTempPath()}/audio_chunks_`
            );

            // Always upload at least one chunk, even for short recordings
            console.log(`Will upload ${numChunks} audio chunk(s) for transcription to bucket: ${bucketName}`);
            
            // For each chunk
            for (let i = 0; i < numChunks; i++) {
                const startTime = i * chunkDurationSecs;
                const endTime = Math.min((i + 1) * chunkDurationSecs, duration);
                const chunkDuration = endTime - startTime;
                
                // Generate the output filename: bot_uuid-[chunk_number].wav
                const chunkFilename = `${botUuid}-${i}.wav`;
                const chunkPath = `${tempDir}/${chunkFilename}`;
                
                console.log(`Processing chunk ${i}/${numChunks}: ${startTime}s to ${endTime}s (duration: ${chunkDuration}s)`);
                
                try {
                    // Extract the chunk using ffmpeg
                    console.log(`Extracting audio chunk to: ${chunkPath}`);
                    await this.extractAudioChunk(audioFilePath, startTime, chunkDuration, chunkPath);
                    
                    // Verify the chunk file exists and has data
                    try {
                        const stats = await fs.promises.stat(chunkPath);
                        console.log(`Audio chunk created successfully: ${chunkPath} (${stats.size} bytes)`);
                        
                        // Upload the chunk to S3
                        const s3Key = `${botUuid}/${chunkFilename}`;
                        
                        console.log(`Uploading chunk to S3: bucket=${bucketName}, key=${s3Key}`);
                        
                        const url = await this.s3Uploader.uploadFile(
                            chunkPath,
                            bucketName,
                            s3Key,
                            true
                        );
                        
                        console.log(`Successfully uploaded chunk ${i+1} to: ${url}`);
                    } catch (statErr) {
                        console.error(`Error verifying chunk file: ${chunkPath}`, statErr);
                    }
                } catch (chunkErr) {
                    console.error(`Error processing chunk ${i+1}:`, chunkErr);
                }
            }

            // Clean up temporary files
            try {
                console.log(`Cleaning up temporary directory: ${tempDir}`);
                for (const file of await fs.promises.readdir(tempDir)) {
                    await fs.promises.unlink(`${tempDir}/${file}`);
                }
                await fs.promises.rmdir(tempDir);
                console.log('Temporary chunk files cleaned up successfully');
            } catch (error) {
                console.error('Error cleaning up temporary chunk files:', error);
            }
            
            console.log('Audio chunking for transcription completed successfully');
        } catch (error) {
            console.error('Error in audio chunking process:', error);
            // Don't throw so it doesn't interrupt the rest of the stopping process
        }
    }

    public getFilesUploaded(): boolean {
        return this.filesUploaded;
    }

    private async getAudioDuration(filePath: string): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            const ffprobe = spawn('ffprobe', [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                filePath
            ]);
            
            let output = '';
            ffprobe.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            ffprobe.on('close', (code) => {
                if (code !== 0) {
                    console.error(`ffprobe process exited with code ${code}`);
                    reject(new Error(`ffprobe process exited with code ${code}`));
                    return;
                }
                
                const duration = parseFloat(output.trim());
                if (isNaN(duration)) {
                    reject(new Error('Failed to parse duration'));
                    return;
                }
                
                resolve(duration);
            });
            
            ffprobe.on('error', (err) => {
                reject(err);
            });
        });
    }

    private async extractAudioChunk(
        inputPath: string,
        startTime: number,
        duration: number,
        outputPath: string
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const ffmpegArgs = [
                '-y',                    // Overwrite output file
                '-i', inputPath,         // Input file
                '-ss', startTime.toString(),  // Start time
                '-t', duration.toString(),    // Duration
                '-vn',                   // No video
                '-acodec', 'pcm_s16le',  // Audio codec
                '-ar', '16000',          // Sample rate
                '-ac', '1',              // Mono audio
                outputPath               // Output file
            ];
            
            const ffmpeg = spawn('ffmpeg', ffmpegArgs);
            
            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg process exited with code ${code}`));
                }
            });
            
            ffmpeg.on('error', (err) => {
                reject(err);
            });
        });
    }
}

// Instance globale unique
export const TRANSCODER = new Transcoder({
    chunkDuration: MEETING_CONSTANTS.CHUNK_DURATION,
    transcribeDuration:
        MEETING_CONSTANTS.CHUNKS_PER_TRANSCRIPTION *
        MEETING_CONSTANTS.CHUNK_DURATION,
    bucketName: process.env.AWS_S3_VIDEO_BUCKET || '',
    audioBucketName: process.env.AWS_S3_TEMPORARY_AUDIO_BUCKET || '',
    enableTranscriptionChunking: process.env.ENABLE_TRANSCRIPTION_CHUNKING === 'true',
    transcriptionAudioBucket: process.env.TRANSCRIPTION_AUDIO_BUCKET,
})