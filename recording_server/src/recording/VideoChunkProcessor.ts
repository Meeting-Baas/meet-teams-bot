import { queue, QueueObject } from 'async'
import { EventEmitter } from 'events'
import { TranscoderConfig } from './Transcoder'

interface ChunkMetadata {
    index: number
    timestamp: number
    duration: number
    isFinal: boolean
}

type ChunkTask = () => Promise<void>

export class VideoChunkProcessor extends EventEmitter {
    private chunkQueue: QueueObject<ChunkTask>
    private chunkIndex: number = 0
    private isPaused: boolean = false
    private pausedChunks: Array<{ chunk: Buffer; metadata: ChunkMetadata }> = []

    constructor(private config: TranscoderConfig) {
        super()
        this.setupQueue()
    }

    public updateConfig(config: TranscoderConfig) {
        this.config = config
    }

    private setupQueue() {
        this.chunkQueue = queue<ChunkTask>(async (task, callback) => {
            try {
                await task()
                callback()
            } catch (error) {
                callback(error as Error)
            }
        }, 1) // Traiter un chunk à la fois

        this.chunkQueue.drain(() => {
            this.emit('queueDrained')
        })
    }

    private async processChunkInternal(
        chunk: Buffer,
        metadata: ChunkMetadata,
    ): Promise<void> {
        try {
            console.log(
                `Processing chunk #${metadata.index}, size: ${chunk.length} bytes`,
            )

            // Émettre l'événement avec le chunk pour FFmpeg
            this.emit('chunkReady', {
                chunk,
                metadata,
                timestamp: metadata.timestamp,
            })

            // Émettre l'événement de chunk traité
            this.emit('chunkProcessed', {
                metadata,
                timestamp: metadata.timestamp,
            })
        } catch (error) {
            console.error('Error processing chunk:', error)
            this.emit('error', error)
            throw error
        }
    }

    public async processChunk(
        chunk: Buffer,
        isFinal: boolean = false,
    ): Promise<void> {
        const metadata: ChunkMetadata = {
            index: this.chunkIndex++,
            timestamp: this.chunkIndex * this.config.chunkDuration, // Calcul basé sur la position du chunk
            duration: this.config.chunkDuration,
            isFinal,
        }

        if (this.isPaused) {
            this.pausedChunks.push({ chunk, metadata })
            return
        }

        return new Promise((resolve, reject) => {
            this.chunkQueue.push(async () => {
                try {
                    await this.processChunkInternal(chunk, metadata)
                    resolve()
                } catch (error) {
                    reject(error)
                }
            })
        })
    }

    public async pause(): Promise<void> {
        this.isPaused = true
        await new Promise<void>((resolve) => this.chunkQueue.drain(resolve))
    }

    public async resume(): Promise<void> {
        this.isPaused = false
        // Traiter les chunks mis en pause
        const chunksToProcess = [...this.pausedChunks]
        this.pausedChunks = []

        for (const { chunk, metadata } of chunksToProcess) {
            await this.processChunk(chunk, metadata.isFinal)
        }
    }

    public async finalize(): Promise<void> {
        try {
            if (this.pausedChunks.length > 0) {
                await this.resume()
            }

            // Attendre que tous les chunks soient traités
            await new Promise<void>((resolve) => this.chunkQueue.drain(resolve))

            // Émettre l'événement de fin
            this.emit('processingComplete', {
                totalChunks: this.chunkIndex,
            })

            // Nettoyer les listeners
            this.removeAllListeners('chunkReady')
            this.removeAllListeners('chunkProcessed')
            this.removeAllListeners('error')
            this.removeAllListeners('queueDrained')
        } catch (error) {
            console.error('Error during finalization:', error)
            throw error
        }
    }
}
