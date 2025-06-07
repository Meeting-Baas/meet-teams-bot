import { Events } from '../../events'
import { JoinError, JoinErrorCode } from '../../types'
import { MeetingStateType, StateExecuteResult } from '../types'
import { BaseState } from './base-state'

export class ErrorState extends BaseState {
    async execute(): StateExecuteResult {
        try {
            // Log l'erreur
            await this.logError()

            // Notification des événements d'erreur
            await this.notifyError()

            // Mise à jour des métriques
            this.updateMetrics()

            // Passage au nettoyage
            return this.transition(MeetingStateType.Cleanup)
        } catch (error) {
            console.error('Error in ErrorState:', error)
            // Même en cas d'erreur dans la gestion d'erreur, on passe au nettoyage
            return this.transition(MeetingStateType.Cleanup)
        }
    }

    private async logError(): Promise<void> {
        const error = this.context.error

        if (!error) {
            console.error('Unknown error occurred')
            return
        }

        // Création d'un objet d'erreur détaillé
        const errorDetails = {
            message: error.message,
            stack: error.stack,
            type: error.constructor.name,
            isJoinError: error instanceof JoinError,
            code: error instanceof JoinError ? error.message : undefined,
            details: error instanceof JoinError ? error.details : undefined,
            state: this.stateType,
            meetingUrl: this.context.params?.meeting_url,
            botName: this.context.params?.bot_name,
            sessionId: this.context.params?.session_id,
            timestamp: Date.now(),
        }

        // Log de l'erreur avec tous les détails
        console.error('Meeting error occurred:', errorDetails)
    }

    private async notifyError(): Promise<void> {
        const notifyPromise = async (): Promise<void> => {
            const error = this.context.error

            if (!error) {
                console.warn('No error found in context')
                return
            }

            // Log complet pour le débogage
            console.log('Error in notifyError:', {
                isJoinError: error instanceof JoinError,
                name: error.name,
                message: error.message,
                code: error instanceof JoinError ? error.message : 'not a JoinError',
                stack: error.stack?.substring(0, 200) // Limite la taille du stack
            })

            try {
                if (error instanceof JoinError) {
                    // Vérification supplémentaire du code d'erreur
                    const errorCode = error.message
                    console.log('JoinError code:', errorCode)
                    
                    switch (errorCode) {
                        case JoinErrorCode.BotNotAccepted:
                            await Events.botRejected()
                            break
                        case JoinErrorCode.BotRemoved:
                            await Events.botRemoved()
                            break
                        case JoinErrorCode.TimeoutWaitingToStart:
                            await Events.waitingRoomTimeout()
                            break
                        case JoinErrorCode.InvalidMeetingUrl:
                            await Events.invalidMeetingUrl()
                            break
                        case JoinErrorCode.ApiRequest:
                            console.log('Notifying API request stop')
                            await Events.apiRequestStop()
                            break
                        default:
                            console.log(`Unhandled JoinError code: ${errorCode}`)
                            await Events.meetingError(error)
                    }
                } else {
                    await Events.meetingError(error)
                }
            } catch (eventError) {
                console.error('Failed to send event notification:', eventError)
            }
        }

        // Augmenter le timeout pour la notification d'erreur
        const timeoutPromise = new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('Notify error timeout')), 15000), // 15 secondes au lieu de 5
        )

        try {
            await Promise.race([notifyPromise(), timeoutPromise])
        } catch (error) {
            console.error('Error notification timed out:', error)
            // Continue even if notification fails
        }
    }

    private updateMetrics(): void {
        const error = this.context.error

        const metrics = {
            errorType:
                error instanceof JoinError ? 'JoinError' : 'UnknownError',
            errorCode: error instanceof JoinError ? error.message : 'Internal',
            timestamp: Date.now(),
            meetingDuration: this.context.startTime
                ? Date.now() - this.context.startTime
                : 0,
            state: this.stateType,
            // Autres métriques pertinentes du contexte
            attendeesCount: this.context.attendeesCount,
            firstUserJoined: this.context.firstUserJoined,
            sessionId: this.context.params?.session_id,
        }

        // Log des métriques
        console.info('Error metrics:', metrics)
    }
}
