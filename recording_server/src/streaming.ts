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

    // État du streaming
    private isInitialized: boolean = false
    private isPaused: boolean = false
    private pausedChunks: RawData[] = []

    // Sound level monitoring
    private currentSoundLevel: number = 0
    private lastSoundLogTime_ms: number = 0
    private readonly SOUND_LOG_INTERVAL_MS: number = 500 // Log maximum every 500ms (2 times per second)

    // Statistiques pour le débogage
    private audioPacketsReceived: number = 0

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
     * Démarre le service de streaming
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

                if (this.isPaused) {
                    // If paused, store chunks for later processing
                    this.pausedChunks.push(message)
                    return
                }

                if (message instanceof Buffer) {
                    const uint8Array = new Uint8Array(message)
                    const f32Array = new Float32Array(uint8Array.buffer)

                    // Always analyze sound levels and log them
                    this.analyzeSoundLevel(f32Array).catch(console.error)

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
     * Met en pause le service de streaming
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
     * Reprend le service de streaming après une pause
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
     * Arrête complètement le service de streaming
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
     * Analyze sound level from audio data and log it
     */
    private async analyzeSoundLevel(audioData: Float32Array): Promise<void> {
        // Calculate RMS (Root Mean Square) of the audio buffer to get sound level
        let sum = 0
        let max = 0

        // First check if the buffer contains non-null data
        for (let i = 0; i < audioData.length; i++) {
            const absValue = Math.abs(audioData[i])
            max = Math.max(max, absValue)
            sum += audioData[i] * audioData[i]
        }

        const rms = Math.sqrt(sum / audioData.length)

        // Méthode standard pour le calcul de niveau sonore
        // Utiliser une échelle logarithmique standard pour les niveaux sonores
        let normalizedLevel = 0

        if (rms > 0) {
            // Calcul standard des dB audio avec une valeur minimale plus élevée
            // Ce qui rendra le système moins sensible aux sons très faibles
            const db = 20 * Math.log10(Math.max(0.0001, rms))

            // Normalisation standard sur l'échelle 0-100
            // Un son à -60dB sera proche de 0, un son à 0dB sera 100
            normalizedLevel = Math.max(0, Math.min(100, db + 60))
        }

        // Always update the current sound level for real-time detection
        this.currentSoundLevel = normalizedLevel

        // Only log to file if enough time has passed (throttling to max 2 times per second)
        const now = Date.now()
        if (now - this.lastSoundLogTime_ms >= this.SOUND_LOG_INTERVAL_MS) {
            const timestamp = new Date(now).toISOString()
            const logEntry = `${timestamp},${normalizedLevel.toFixed(2)}\n`

            try {
                // Obtenir le chemin du fichier
                const soundLogPath = PathManager.getInstance(this.botId).getSoundLogPath()
                // Write directly to file
                await fs.promises.appendFile(soundLogPath, logEntry)
                this.lastSoundLogTime_ms = now
            } catch (error) {
                console.error(`Error writing to sound log: ${error}`)
            }
        }
    }

    /**
     * Traite les chunks audio mis en pause
     */
    private processPausedChunks(): void {
        if (this.pausedChunks.length === 0) {
            return
        }

        // Traiter les chunks stockés pendant la pause
        for (const message of this.pausedChunks) {
            // Réutiliser la logique de traitement des messages
            if (
                this.output_ws &&
                message instanceof Buffer
            ) {
                const uint8Array = new Uint8Array(message)
                const f32Array = new Float32Array(uint8Array.buffer)

                // Also analyze paused chunks to keep sound level log consistent
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
                // In local-only mode, just analyze the audio
                const uint8Array = new Uint8Array(message)
                const f32Array = new Float32Array(uint8Array.buffer)
                this.analyzeSoundLevel(f32Array).catch(console.error)
            }
        }

        // Vider le tableau des chunks en pause
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
