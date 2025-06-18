import { Events } from '../../events'
import { SCREEN_RECORDER } from '../../recording/ScreenRecorder'
import { SpeakerManager } from '../../speaker-manager'

import { RECORDING } from '../../main'
import { MeetingStateType, StateExecuteResult } from '../types'
import { BaseState } from './base-state'

export class ResumingState extends BaseState {
    async execute(): StateExecuteResult {
        try {
            // Reprendre l'enregistrement
            await this.resumeRecording()

            // Notifier de la reprise
            Events.recordingResumed()

            // Reset pause variables
            this.context.pauseStartTime = null
            this.context.isPaused = false

            // Restaurer l'état précédent
            if (this.context.lastRecordingState) {
                const {
                    attendeesCount,
                    lastSpeakerTime,
                    noSpeakerDetectedTime,
                } = this.context.lastRecordingState

                // Mettre à jour le contexte avec les valeurs sauvegardées
                this.context.attendeesCount = attendeesCount
                this.context.lastSpeakerTime = lastSpeakerTime
                this.context.noSpeakerDetectedTime = noSpeakerDetectedTime
            }

            // Retourner à l'état Recording
            return this.transition(MeetingStateType.Recording)
        } catch (error) {
            console.error('Error in resuming state:', error)
            return this.handleError(error as Error)
        }
    }

    private async resumeRecording(): Promise<void> {
        const resumePromise = async () => {
            // Note: ScreenRecorder ne supporte pas pause/resume - l'enregistrement a continué
            if (RECORDING) {
                console.log('Note: ScreenRecorder recording continued during pause (no pause/resume support)')
            } else {
                console.log('RECORDING disabled - no recording to resume')
            }

            // Reprendre le streaming
            if (RECORDING && this.context.streamingService) {
                this.context.streamingService.resume()
                console.log('Streaming service resumed successfully')
            } else if (!RECORDING) {
                console.log('RECORDING disabled - skipping streaming service resume')
            }

            // Resume speakers observation if it was paused
            if (this.context.speakersObserver && this.context.playwrightPage) {
                console.log('Resuming speakers observation...')
                
                const onSpeakersChange = async (speakers: any[]) => {
                    try {
                        await SpeakerManager.getInstance().handleSpeakerUpdate(speakers)
                    } catch (error) {
                        console.error('Error handling speaker update:', error)
                    }
                }

                await this.context.speakersObserver.startObserving(
                    this.context.playwrightPage,
                    this.context.params.recording_mode,
                    this.context.params.bot_name,
                    onSpeakersChange
                )
                console.log('Speakers observation resumed')
            }

            console.log('Recording resumed successfully')
        }

        const timeoutPromise = new Promise<void>(
            (_, reject) =>
                setTimeout(
                    () => reject(new Error('Resume recording timeout')),
                    20000,
                ), // 20 secondes
        )

        try {
            await Promise.race([resumePromise(), timeoutPromise])
        } catch (error) {
            console.error('Error or timeout in resumeRecording:', error)
            throw error
        }
    }
}
