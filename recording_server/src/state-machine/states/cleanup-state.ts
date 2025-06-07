import { delSessionInRedis } from '../../instance'
import { SoundContext, VideoContext } from '../../media_context'
import { TRANSCODER } from '../../recording/Transcoder'
import { MEETING_CONSTANTS } from '../constants'

import { MeetingStateType, StateExecuteResult } from '../types'
import { BaseState } from './base-state'

export class CleanupState extends BaseState {
    async execute(): StateExecuteResult {
        try {
            console.info('Starting cleanup sequence')

            // Utiliser Promise.race pour implémenter le timeout
            const cleanupPromise = this.performCleanup()
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(
                    () => reject(new Error('Cleanup timeout')),
                    MEETING_CONSTANTS.CLEANUP_TIMEOUT,
                )
            })

            try {
                await Promise.race([cleanupPromise, timeoutPromise])
            } catch (error) {
                console.error('Cleanup failed or timed out:', error)
            }
            return this.transition(MeetingStateType.Terminated) // État final
        } catch (error) {
            console.error('Error during cleanup:', error)
            // Même en cas d'erreur, on reste dans l'état Cleanup
            return this.transition(MeetingStateType.Cleanup)
        }
    }

    private async performCleanup(): Promise<void> {
        try {
            // 1. Arrêter le Transcoder et la transcription
            await this.stopTranscoderAndTranscription()

            // 2.Arrêter le streaming
            if (this.context.streamingService) {
                this.context.streamingService.stop()
            }

            // 3. Nettoyage des ressources de l'extension et du navigateur
            await this.cleanupBrowserResources()

            // 4. Upload de la vidéo à S3 avant de nettoyer les fichiers locaux
            await this.uploadVideoToS3()

            // 5. Nettoyage final Redis
            await this.cleanupRedisSession()
        } catch (error) {
            console.error('Cleanup error:', error)
            // On continue même en cas d'erreur
        }
    }

    private async stopTranscoderAndTranscription(): Promise<void> {
        try {
            await Promise.all([
                TRANSCODER.stop(),
                
            ])
        } catch (error) {
            console.error('Error stopping processes:', error)
            throw error
        }
    }
    private async cleanupBrowserResources(): Promise<void> {
        try {
            // 1. Arrêter le branding
            if (this.context.brandingProcess) {
                this.context.brandingProcess.kill()
            }

            // 2. Arrêter les contextes média
            VideoContext.instance?.stop()
            SoundContext.instance?.stop()

            // 3. Fermer les pages et nettoyage du navigateur
            await Promise.all([
                this.context.playwrightPage?.close().catch(() => {}),
                this.context.backgroundPage?.close().catch(() => {}),
                this.context.browserContext?.close().catch(() => {}),
            ])

            // 4. Nettoyage des timeouts
            if (this.context.meetingTimeoutInterval) {
                clearTimeout(this.context.meetingTimeoutInterval)
            }
        } catch (error) {
            console.error('Failed to cleanup browser resources:', error)
        }
    }

    private async uploadVideoToS3(): Promise<void> {
        if (!TRANSCODER) return

        try {
            // Only upload if not already done in the stop() method
            if (!TRANSCODER.getFilesUploaded()) {
                console.log('Uploading video to S3')
                await TRANSCODER.uploadToS3()
            } else {
                console.log('Files already uploaded to S3 in stop() method, skipping')
            }
        } catch (error) {
            console.error('Failed to upload video to S3:', error)
        }
    }

    private async cleanupRedisSession(): Promise<void> {
        if (!this.context.params.session_id) return

        try {
            await delSessionInRedis(this.context.params.session_id)
        } catch (error) {
            console.error('Failed to cleanup Redis session:', error)
        }
    }
}
