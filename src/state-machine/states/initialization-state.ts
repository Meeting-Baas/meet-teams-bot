import { generateBranding, playBranding } from '../../branding'
import { openBrowser } from '../../browser'
import { MeetingHandle } from '../../meeting'
import { Streaming } from '../../streaming'
import { JoinError, JoinErrorCode } from '../../types'
import { PathManager } from '../../utils/PathManager'
import { MeetingStateType, StateExecuteResult } from '../types'
import { BaseState } from './base-state'

export class InitializationState extends BaseState {
    async execute(): StateExecuteResult {
        try {
            // Validate parameters
            if (!this.context.params.meeting_url) {
                throw new JoinError(JoinErrorCode.InvalidMeetingUrl)
            }

            // Initialize meeting handle if not exists
            if (!this.context.meetingHandle) {
                this.context.meetingHandle = new MeetingHandle(
                    this.context.params,
                )
            }

            // Setup path manager first (important for logs)
            await this.setupPathManager()

            // Setup branding if needed - non-bloquant
            if (this.context.params.bot_branding) {
                this.setupBranding().catch((error) => {
                    console.warn(
                        'Branding setup failed, continuing anyway:',
                        error,
                    )
                })
            }

            // Setup browser - étape critique
            try {
                await this.setupBrowser()
            } catch (error) {
                console.error('Critical error: Browser setup failed:', error)
                // Ajouter des détails à l'erreur pour faciliter le diagnostic
                const enhancedError = new Error(
                    `Browser initialization failed: ${error instanceof Error ? error.message : String(error)}`,
                )
                enhancedError.stack =
                    error instanceof Error ? error.stack : undefined
                throw enhancedError
            }

            this.context.streamingService = new Streaming(
                this.context.params.streaming_input,
                this.context.params.streaming_output,
                this.context.params.streaming_audio_frequency,
                this.context.params.bot_uuid,
            )
            
            // All initialization successful
            return this.transition(MeetingStateType.WaitingRoom)
        } catch (error) {
            return this.handleError(error as Error)
        }
    }

    private async setupBranding(): Promise<void> {
        const { bot_name, custom_branding_bot_path } = this.context.params
        this.context.brandingProcess = generateBranding(
            bot_name,
            custom_branding_bot_path,
        )
        await this.context.brandingProcess.wait
        playBranding()
    }

    private async setupBrowser(): Promise<void> {
        const maxRetries = 3
        let lastError: Error | null = null

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.info(`Browser setup attempt ${attempt}/${maxRetries}`)

                // Définir le type de retour attendu de openBrowser
                type BrowserResult = {
                    browser: any
                    backgroundPage: any
                }

                // Augmenter le timeout pour les environnements plus lents
                const timeoutMs = 60000 // 60 secondes au lieu de 30

                // Créer une promesse qui se rejette après un délai
                const timeoutPromise = new Promise<BrowserResult>(
                    (_, reject) => {
                        const id = setTimeout(() => {
                            clearTimeout(id)
                            reject(
                                new Error(
                                    `Browser setup timeout (${timeoutMs}ms)`,
                                ),
                            )
                        }, timeoutMs)
                    },
                )

                // Exécuter la promesse d'ouverture du navigateur avec un timeout
                const result = await Promise.race<BrowserResult>([
                    openBrowser(false, false),
                    timeoutPromise,
                ])

                // Si on arrive ici, c'est que openBrowser a réussi
                this.context.browserContext = result.browser
                this.context.backgroundPage = result.backgroundPage

                console.info('Browser setup completed successfully')
                return // Sortir de la fonction si réussi
            } catch (error) {
                lastError = error as Error
                console.error(`Browser setup attempt ${attempt} failed:`, error)

                // Si ce n'est pas la dernière tentative, attendre avant de réessayer
                if (attempt < maxRetries) {
                    const waitTime = attempt * 5000 // Attente progressive: 5s, 10s, 15s...
                    console.info(`Waiting ${waitTime}ms before retry...`)
                    await new Promise((resolve) =>
                        setTimeout(resolve, waitTime),
                    )
                }
            }
        }

        // Si on arrive ici, c'est que toutes les tentatives ont échoué
        console.error('All browser setup attempts failed')
        throw (
            lastError ||
            new Error('Browser setup failed after multiple attempts')
        )
    }

    private async setupPathManager(): Promise<void> {
        try {
            if (!this.context.pathManager) {
                this.context.pathManager = PathManager.getInstance(
                    this.context.params.bot_uuid,
                    this.context.params.secret,
                )
                await this.context.pathManager.ensureDirectories()
            }
        } catch (error) {
            console.error('Path manager setup failed:', error)
            // Créer les répertoires de base si possible
            try {
                const fs = require('fs')
                const path = require('path')
                const baseDir = path.join(
                    process.cwd(),
                    'logs',
                    this.context.params.bot_uuid,
                )
                fs.mkdirSync(baseDir, { recursive: true })
                console.info('Created fallback log directory:', baseDir)
            } catch (fsError) {
                console.error(
                    'Failed to create fallback log directory:',
                    fsError,
                )
            }
            throw error
        }
    }
}
