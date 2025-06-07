import {
    MeetingStateType,
    ParticipantState,
    RecordingEndReason,
    StateTransition,
} from './types'

import { ModalDetectionService } from '../services/ModalDetectionService'
import { getStateInstance } from './states'
import { MeetingContext } from './types'

export class MeetingStateMachine {
    private currentState: MeetingStateType
    public context: MeetingContext
    private error: Error | null = null
    private forceStop: boolean = false
    private wasInRecordingState: boolean = false
    private normalTermination: boolean = false

    constructor(initialContext: Partial<MeetingContext>) {
        this.currentState = MeetingStateType.Initialization
        this.context = {
            ...initialContext,
            error: null,
        } as MeetingContext

        // Setup global dialog observer functions
        this.setupGlobalDialogObserver();
    }

    private setupGlobalDialogObserver(): void {
        // Fonction pour gérer l'observateur de dialogues globalement
        this.context.startGlobalDialogObserver = () => {
            // Ne démarrer l'observateur que pour Google Meet
            if (this.context.params.meetingProvider !== 'Meet') {
                console.info(`Global dialog observer not started: provider is not Google Meet (${this.context.params.meetingProvider})`);
                return;
            }

            if (!this.context.playwrightPage) {
                console.warn('Cannot start global dialog observer: page not available');
                return;
            }

            // Nettoyer tout observateur existant
            if (this.context.dialogObserverInterval) {
                clearInterval(this.context.dialogObserverInterval);
            }

            // Créer un nouvel observateur avec un intervalle de vérification
            console.info(`Starting global dialog observer in state machine`);
            
            // Fonction pour vérifier et redémarrer l'observateur si nécessaire
            const checkAndRestartObserver = () => {
                if (!this.context.dialogObserverInterval) {
                    console.warn('Global dialog observer was stopped, restarting...');
                    this.context.startGlobalDialogObserver?.();
                    return;
                }
            };

            // Heartbeat pour vérifier l'état de l'observateur toutes les 2 secondes
            const heartbeatInterval = setInterval(checkAndRestartObserver, 2000);

            // Stocker l'intervalle de heartbeat pour pouvoir le nettoyer plus tard
            this.context.dialogObserverHeartbeat = heartbeatInterval;

            this.context.dialogObserverInterval = setInterval(async () => {
                try {
                    if (this.context.playwrightPage?.isClosed()) {
                        this.context.stopGlobalDialogObserver?.();
                        return;
                    }

                    // Use the shared modal detection service
                    const modalService = ModalDetectionService.getInstance()
                    const result = await modalService.checkAndDismissModals(this.context.playwrightPage)
                    
                    if (result.found) {
                        console.info(`[GlobalDialogObserver] Modal detection result: ${result.modalType} - ${result.dismissed ? 'dismissed' : 'found but not dismissed'}`)
                    }
                } catch (error) {
                    console.error(`[GlobalDialogObserver] Error checking for dialogs: ${error}`);
                    // En cas d'erreur, on redémarre l'observateur
                    this.context.stopGlobalDialogObserver?.();
                    this.context.startGlobalDialogObserver?.();
                }
            }, 2000); // Vérifier toutes les 2 secondes
        };

        // Fonction pour arrêter l'observateur
        this.context.stopGlobalDialogObserver = () => {
            if (this.context.dialogObserverInterval) {
                clearInterval(this.context.dialogObserverInterval);
                this.context.dialogObserverInterval = undefined;
                console.info(`Stopped global dialog observer`);
            }
            if (this.context.dialogObserverHeartbeat) {
                clearInterval(this.context.dialogObserverHeartbeat);
                this.context.dialogObserverHeartbeat = undefined;
                console.info(`Stopped global dialog observer heartbeat`);
            }
        };
    }

    public async start(): Promise<void> {
        try {
            // Démarrer l'observateur global dès le début
            this.context.startGlobalDialogObserver?.();
            
            while (
                this.currentState !== MeetingStateType.Cleanup &&
                this.currentState !== MeetingStateType.Terminated &&
                !this.forceStop
            ) {
                console.info(`Current state: ${this.currentState}`)

                if (this.currentState === MeetingStateType.Recording) {
                    this.wasInRecordingState = true;
                }

                if (this.forceStop) {
                    this.context.endReason =
                        this.context.endReason || RecordingEndReason.ApiRequest
                    await this.transitionToCleanup()
                    break
                }

                const state = getStateInstance(this.currentState, this.context)
                const transition: StateTransition = await state.execute()

                this.currentState = transition.nextState
                this.context = transition.context
            }
            
            // Arrêter l'observateur global à la fin
            this.context.stopGlobalDialogObserver?.();
            
            if (this.wasInRecordingState && this.context.endReason) {
                const normalReasons = [
                    RecordingEndReason.ApiRequest,
                    RecordingEndReason.BotRemoved,
                    RecordingEndReason.ManualStop,
                    RecordingEndReason.NoAttendees,
                    RecordingEndReason.NoSpeaker,
                    RecordingEndReason.RecordingTimeout
                ];
                this.normalTermination = normalReasons.includes(this.context.endReason);
            }
        } catch (error) {
            // Arrêter l'observateur global en cas d'erreur
            this.context.stopGlobalDialogObserver?.();
            
            this.error = error as Error
            await this.handleError(error as Error)
        }
    }

    public async requestStop(reason: RecordingEndReason): Promise<void> {
        console.info(`Stop requested with reason: ${reason}`)
        this.forceStop = true
        this.context.endReason = reason
    }

    public getCurrentState(): MeetingStateType {
        return this.currentState
    }

    public getError(): Error | null {
        return this.error
    }

    public getStartTime(): number {
        return this.context.startTime!
    }

    private async handleError(error: Error): Promise<void> {
        try {
            console.error('Error in state machine:', error)
            this.error = error
            this.context.error = error

            // Passer à l'état d'erreur
            const errorState = getStateInstance(
                MeetingStateType.Error,
                this.context,
            )
            await errorState.execute()
        } catch (secondaryError) {
            console.error('Error handling error:', secondaryError)
        } finally {
            // Dans tous les cas, on termine par le nettoyage
            await this.transitionToCleanup()
        }
    }

    public async pauseRecording(): Promise<void> {
        if (this.currentState !== MeetingStateType.Recording) {
            throw new Error('Cannot pause: meeting is not in recording state')
        }

        console.info('Pause requested')
        this.context.isPaused = true
        this.currentState = MeetingStateType.Paused
    }

    public async resumeRecording(): Promise<void> {
        if (this.currentState !== MeetingStateType.Paused) {
            throw new Error('Cannot resume: meeting is not paused')
        }

        console.info('Resume requested')
        this.context.isPaused = false
        this.currentState = MeetingStateType.Resuming
    }

    public isPaused(): boolean {
        return this.currentState === MeetingStateType.Paused
    }

    public getPauseDuration(): number {
        return this.context.totalPauseDuration || 0
    }

    public updateParticipantState(state: ParticipantState): void {
        if (this.currentState === MeetingStateType.Recording) {
            this.context.attendeesCount = state.attendeesCount
            if (state.firstUserJoined) {
                this.context.firstUserJoined = true
            }
            this.context.lastSpeakerTime = state.lastSpeakerTime
            this.context.noSpeakerDetectedTime = state.noSpeakerDetectedTime

            console.info('Updated participant state:', {
                attendeesCount: state.attendeesCount,
                firstUserJoined: this.context.firstUserJoined,
                lastSpeakerTime: state.lastSpeakerTime,
                noSpeakerDetectedTime: state.noSpeakerDetectedTime,
                state: this.currentState,
            })
        }
    }

    private async transitionToCleanup(): Promise<void> {
        this.currentState = MeetingStateType.Cleanup
        const cleanupState = getStateInstance(
            MeetingStateType.Cleanup,
            this.context,
        )
        await cleanupState.execute()
    }

    public getContext(): MeetingContext {
        return this.context
    }

    public wasRecordingSuccessful(): boolean {
        return this.wasInRecordingState && this.normalTermination && !this.error;
    }
    
    public getWasInRecordingState(): boolean {
        return this.wasInRecordingState;
    }
    
    public getNormalTermination(): boolean {
        return this.normalTermination;
    }
}
