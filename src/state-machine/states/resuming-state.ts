import { Events } from '../../events'

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
        // VIDEO RECORDING DISABLED - No MediaRecorder to resume
        console.log('Video recording disabled - audio streaming was never paused')
        return Promise.resolve()
    }
}
