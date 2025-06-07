import * as fs from 'fs'
import { IncomingMessage } from 'http'
import { Readable } from 'stream'
import { RawData, Server, WebSocket } from 'ws'

import { SoundContext } from './media_context'
import { SpeakerData } from './types'
import { PathManager } from './utils/PathManager'

const EXTENSION_WEBSOCKET_PORT: number = 8081
const DEFAULT_SAMPLE_RATE: number = 24_000

export class Streaming {
    public static instance: Streaming | null = null

    private extension_ws: Server<
        typeof WebSocket,
        typeof IncomingMessage
    > | null = null
    private output_ws: WebSocket | null = null // May be used as dual channel, input and output
    private input_ws: WebSocket | null = null
    private sample_rate: number = DEFAULT_SAMPLE_RATE

    // Paramètres stockés pour démarrage différé
    private inputUrl: string | undefined
    private outputUrl: string | undefined
    private botId: string

    // Streaming state management
    private isInitialized: boolean = false
    private isPaused: boolean = false
    private pausedChunks: RawData[] = []

    // Audio level monitoring with performance optimizations for CPU reduction
    private currentSoundLevel: number = 0
    private lastSoundLogTime_ms: number = 0
    private readonly SOUND_LOG_INTERVAL_MS: number = 5000 // Reduced from 2s to 5s to decrease CPU usage
    private audioBuffer: Float32Array[] = [] // Buffer for batch processing to reduce overhead
    private readonly AUDIO_BUFFER_SIZE: number = 12 // Increased from 6 to 12 to reduce processing frequency

    // Statistics tracking with reduced logging frequency for performance
    private audioPacketsReceived: number = 0
    private lastStatsLogTime: number = 0
    private readonly STATS_LOG_INTERVAL_MS: number = 15000 // Increased from 10s to 15s to reduce logging overhead

    constructor(
        input: string | undefined,
        output: string | undefined,
        sample_rate: number | undefined,
        bot_id: string,
    ) {
        // Initialiser directement au lieu de stocker pour plus tard
        this.inputUrl = input
        this.outputUrl = output
        this.botId = bot_id

        if (sample_rate) {
            this.sample_rate = sample_rate
        }

        this.audioPacketsReceived = 0

        this.start()

        Streaming.instance = this
    }

    /**
     * Initializes and starts the streaming service
     * Creates WebSocket servers for audio streaming and handles connections
     */
    public start(): void {
        if (this.isInitialized) {
            console.warn('Streaming service already started')
            return
        }

        // Always create the extension WebSocket server to receive audio from the extension
        try {
            this.extension_ws = new WebSocket.Server({
                port: EXTENSION_WEBSOCKET_PORT,
            })
        } catch (error) {
            console.error(`Failed to create WebSocket server: ${error}`)
            return
        }

        // Event 'connection' on client extension WebSocket
        this.extension_ws.on('connection', (client: WebSocket) => {
            // In local-only mode, we don't connect to any external WebSockets
            if (this.outputUrl) {
                try {
                    this.output_ws = new WebSocket(this.outputUrl)

                    // Setup output WebSocket event listeners IMMEDIATELY after creation
                    // to avoid race conditions
                    this.output_ws.on('open', () => {
                        if (this.output_ws) {
                            this.output_ws.send(
                                JSON.stringify({
                                    protocol_version: 1,
                                    bot_id: this.botId,
                                    offset: 0.0,
                                }),
                            )
                        }
                    })

                    // Event 'error' on output WebSocket - MOVED HERE to avoid race condition
                    this.output_ws.on('error', (err: Error) => {
                        console.error(`Output WebSocket error : ${err}`)
                    })

                    // Event 'close' on output WebSocket - MOVED HERE to avoid race condition
                    this.output_ws.on('close', () => {
                        console.log(`Output WebSocket closed`)
                    })

                    // Dual channel
                    if (this.inputUrl === this.outputUrl) {
                        this.play_incoming_audio_chunks(this.output_ws)
                    }
                } catch (error) {
                    console.error(
                        `Failed to connect to output WebSocket: ${error}`,
                    )
                }
            }

            // Event 'message' on client extension WebSocket
            client.on('message', (message) => {
                // Incrémenter le compteur de paquets audio reçus
                this.audioPacketsReceived++

                // Log stats periodically (simplified calculation)
                const now = Date.now()
                if (now - this.lastStatsLogTime >= this.STATS_LOG_INTERVAL_MS) {
                    const packetsInInterval = this.audioPacketsReceived
                    console.log(`Audio packets received in last ${this.STATS_LOG_INTERVAL_MS}ms: ${packetsInInterval}`)
                    this.audioPacketsReceived = 0 // Reset counter
                    this.lastStatsLogTime = now
                }

                if (this.isPaused) {
                    // If paused, store chunks for later processing
                    this.pausedChunks.push(message)
                    return
                }

                if (message instanceof Buffer) {
                    const uint8Array = new Uint8Array(message)
                    const f32Array = new Float32Array(uint8Array.buffer)

                    // OPTIMIZED: Buffer audio for batch processing
                    this.audioBuffer.push(f32Array)
                    if (this.audioBuffer.length >= this.AUDIO_BUFFER_SIZE) {
                        this.processBatchedAudio().catch(console.error)
                        this.audioBuffer = [] // Clear buffer
                    }

                    // In local-only mode, we don't forward audio to any output
                    if (
                        this.output_ws &&
                        this.output_ws.readyState === WebSocket.OPEN
                    ) {
                        // Convert f32Array to s16Array
                        const s16Array = new Int16Array(f32Array.length)
                        for (let i = 0; i < f32Array.length; i++) {
                            s16Array[i] = Math.round(
                                Math.max(
                                    -32768,
                                    Math.min(32767, f32Array[i] * 32768),
                                ),
                            )
                        }
                        // Send audio chunk to output webSocket
                        this.output_ws.send(s16Array.buffer)
                    }
                }
            })

            // Event 'close' on client extension WebSocket
            client.on('close', () => {
                console.log(`Client has left`)
                // Safely close output WebSocket if it exists
                if (this.output_ws && this.output_ws.readyState === WebSocket.OPEN) {
                    this.output_ws.close()
                }
            })

            // Event 'error' on client extension WebSocket
            client.on('error', (err: Error) => {
                console.error(`WebSocket error : ${err}`)
            })
            // Event 'close' on output WebSocket
            this.output_ws.on('close', () => {
                console.log(`Output WebSocket closed`)
            })
            // Event 'error' on output WebSocket
            this.output_ws.on('error', (err: Error) => {
                console.error(`Output WebSocket error : ${err}`)
            })
        })

        if (
            this.inputUrl &&
            this.outputUrl !== this.inputUrl
        ) {
            try {
                this.input_ws = new WebSocket(this.inputUrl)
            } catch (error) {
                console.error(`Failed to connect to input WebSocket: ${error}`)
                return
            }


            this.input_ws.on('open', () => {
                console.log(`Input WebSocket opened`)
            })
            // Event 'error' on input WebSocket
            this.input_ws.on('error', (err: Error) => {
                console.error(`Input WebSocket error : ${err}`)
            })
            this.play_incoming_audio_chunks(this.input_ws)
        }

        this.isInitialized = true
        this.isPaused = false
    }

    /**
     * Pauses the streaming service
     * Audio chunks received during pause are buffered for later processing
     */
    public pause(): void {
        if (!this.isInitialized) {
            console.warn('Cannot pause: streaming service not started')
            return
        }

        if (this.isPaused) {
            console.warn('Streaming service already paused')
            return
        }

        this.isPaused = true
    }

    /**
     * Resumes the streaming service after being paused
     * Processes any buffered audio chunks from the pause period
     */
    public resume(): void {
        if (!this.isInitialized) {
            console.warn('Cannot resume: streaming service not started')
            return
        }

        if (!this.isPaused) {
            console.warn('Streaming service not paused')
            return
        }

        this.isPaused = false

        // Process paused chunks
        this.processPausedChunks()
    }

    /**
     * Completely stops the streaming service
     * Closes all WebSocket connections and resets the service state
     */
    public stop(): void {
        if (!this.isInitialized) {
            console.warn('Cannot stop: streaming service not started')
            return
        }

        console.log('Stopping streaming service...')

        // Safely close WebSocket connections with proper error handling
        try {
            if (this.output_ws) {
                if (this.output_ws.readyState === WebSocket.OPEN || 
                    this.output_ws.readyState === WebSocket.CONNECTING) {
                    this.output_ws.close()
                }
                this.output_ws = null
            }
        } catch (error) {
            console.error('Error closing output WebSocket:', error)
            this.output_ws = null
        }

        try {
            if (this.input_ws) {
                if (this.input_ws.readyState === WebSocket.OPEN || 
                    this.input_ws.readyState === WebSocket.CONNECTING) {
                    this.input_ws.close()
                }
                this.input_ws = null
            }
        } catch (error) {
            console.error('Error closing input WebSocket:', error)
            this.input_ws = null
        }

        try {
            if (this.extension_ws) {
                this.extension_ws.close()
                this.extension_ws = null
            }
        } catch (error) {
            console.error('Error closing extension WebSocket server:', error)
            this.extension_ws = null
        }

        // Reset the state
        this.isInitialized = false
        this.isPaused = false
        this.pausedChunks = []

        // Reset the static instance
        Streaming.instance = null
        
        console.log('Streaming service stopped successfully')
    }

    // Send Speaker Data to Output WebSocket
    public send_speaker_state(speakers: SpeakerData[]) {
        if (!this.isInitialized || !this.outputUrl) {
            return
        }

        if (this.isPaused) {
            // We could store speaker states during pause
            return
        }

        if (this.output_ws?.readyState === WebSocket.OPEN) {
            this.output_ws.send(JSON.stringify(speakers))
        }
    }

    /**
     * Process batched audio data to reduce CPU load
     */
    private async processBatchedAudio(): Promise<void> {
        if (this.audioBuffer.length === 0) return

        // Combine all audio buffers into one for analysis
        const totalLength = this.audioBuffer.reduce((sum, buffer) => sum + buffer.length, 0)
        const combinedBuffer = new Float32Array(totalLength)
        
        let offset = 0
        for (const buffer of this.audioBuffer) {
            combinedBuffer.set(buffer, offset)
            offset += buffer.length
        }

        // Analyze the combined buffer
        await this.analyzeSoundLevel(combinedBuffer)
    }

    /**
     * Analyzes audio data to calculate sound level with optimized performance
     * 
     * Performance optimizations applied:
     * - Adaptive sampling rate based on buffer size to reduce processing overhead
     * - Early exit for small buffers to avoid unnecessary calculations
     * - Simplified RMS calculation with linear scaling instead of logarithmic
     * - Throttled file logging to reduce I/O operations
     * 
     * @param audioData Float32Array containing audio sample data
     */
    private async analyzeSoundLevel(audioData: Float32Array): Promise<void> {
        // Apply adaptive sampling to reduce computational load
        // Use higher sampling rate for larger buffers, lower for smaller ones
        const sampleRate = audioData.length > 2000 ? 16 : 8
        const sampledLength = Math.floor(audioData.length / sampleRate)
        
        // Skip analysis for very small buffers to avoid wasted CPU cycles
        if (sampledLength < 10) {
            return
        }
        
        let sum = 0

        // Calculate RMS (Root Mean Square) using optimized sampling
        for (let i = 0; i < sampledLength; i++) {
            const value = audioData[i * sampleRate]
            sum += value * value
        }

        const rms = Math.sqrt(sum / sampledLength)

        // Calculate normalized sound level using simplified linear scaling
        // Avoids expensive logarithmic calculations while maintaining usable range
        let normalizedLevel = 0
        if (rms > 0.005) { // Filter out background noise
            // Linear approximation provides sufficient accuracy for monitoring
            normalizedLevel = Math.min(100, rms * 300)
        }

        // Update current level for real-time monitoring
        this.currentSoundLevel = normalizedLevel

        // Throttled file logging to balance monitoring needs with performance
        const now = Date.now()
        if (now - this.lastSoundLogTime_ms >= this.SOUND_LOG_INTERVAL_MS) {
            const timestamp = new Date(now).toISOString()
            const logEntry = `${timestamp},${normalizedLevel.toFixed(0)}\n`

            try {
                const soundLogPath = PathManager.getInstance(this.botId).getSoundLogPath()
                // Non-blocking file write to prevent audio stream interference
                fs.promises.appendFile(soundLogPath, logEntry).catch(() => {})
                this.lastSoundLogTime_ms = now
            } catch (error) {
                // Silently handle file errors to maintain audio processing stability
            }
        }
    }

    /**
     * Processes audio chunks that were buffered during pause period
     * Ensures continuous audio analysis and maintains sound level monitoring
     */
    private processPausedChunks(): void {
        if (this.pausedChunks.length === 0) {
            return
        }

        // Process all chunks that were stored during pause
        for (const message of this.pausedChunks) {
            // Apply the same processing logic as real-time chunks
            if (
                this.output_ws &&
                message instanceof Buffer
            ) {
                const uint8Array = new Uint8Array(message)
                const f32Array = new Float32Array(uint8Array.buffer)

                // Maintain sound level analysis for paused chunks to ensure consistency
                this.analyzeSoundLevel(f32Array).catch(console.error)

                // Convert f32Array to s16Array
                const s16Array = new Int16Array(f32Array.length)
                for (let i = 0; i < f32Array.length; i++) {
                    s16Array[i] = Math.round(
                        Math.max(-32768, Math.min(32767, f32Array[i] * 32768)),
                    )
                }
                // Send audio chunk to output webSocket
                if (this.output_ws.readyState === WebSocket.OPEN) {
                    this.output_ws.send(s16Array.buffer)
                }
            } else if (message instanceof Buffer) {
                // In local-only mode, maintain audio analysis only
                const uint8Array = new Uint8Array(message)
                const f32Array = new Float32Array(uint8Array.buffer)
                this.analyzeSoundLevel(f32Array).catch(console.error)
            }
        }

        // Clear the buffered chunks after processing
        this.pausedChunks = []
    }

    // Inject audio stream into microphone
    private play_incoming_audio_chunks = (input_ws: WebSocket) => {
        new SoundContext(this.sample_rate)
        let stdin = SoundContext.instance.play_stdin()
        let audio_stream = this.createAudioStreamFromWebSocket(input_ws)
        audio_stream.on('data', (chunk) => {
            // I think that here, in order to prevent the sound from being choppy,
            // it would be necessary to wait a bit (like 4 or 5 chunks) before writing to the stdin.
            stdin.write(chunk) // Write data to stdin
        })
        audio_stream.on('end', () => {
            stdin.end() // Close stdin
        })
    }

    // Create audio stream filled with incoming data from WebSocket
    private createAudioStreamFromWebSocket = (input_ws: WebSocket) => {
        const stream = new Readable({
            read() {},
        })
        let hasLoggedError = false
        let packetsReceived = 0
        let lastStatsTime = Date.now()

        input_ws.on('message', (message: RawData) => {
            // Compter les paquets pour les stats
            packetsReceived++

            // I think that here, in order to prevent the sound from being choppy,
            // it would be necessary to wait a bit (like 4 or 5 chunks) before writing to the stdin.
            if (this.isPaused) {
                return
            }

            if (message instanceof Buffer) {
                const uint8Array = new Uint8Array(message)
                try {
                    const s16Array = new Int16Array(uint8Array.buffer)
                    // Convert s16Array to f32Array
                    const f32Array = new Float32Array(s16Array.length)
                    for (let i = 0; i < s16Array.length; i++) {
                        f32Array[i] = s16Array[i] / 32768
                    }

                    // Also analyze incoming audio and log sound levels
                    this.analyzeSoundLevel(f32Array).catch(console.error)

                    // Push data into the steam
                    const buffer = Buffer.from(f32Array.buffer)
                    stream.push(buffer)
                } catch (error) {
                    if (!hasLoggedError) {
                        console.error(
                            `Error processing audio chunk: Buffer length ${uint8Array.length} is not valid for Int16Array conversion`,
                        )
                        hasLoggedError = true
                    }
                }
            }
        })

        return stream
    }

    /**
     * Get the current sound level
     * @returns Current sound level (0-100)
     */
    public getCurrentSoundLevel(): number {
        return this.currentSoundLevel
    }

}
