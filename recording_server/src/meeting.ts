import { LOCAL_RECORDING_SERVER_LOCATION } from './instance'
import { MeetingParams, MeetingProviderInterface } from './types'

// import { Browser as PuppeteerBrowser, Page as PuppeteerPage } from 'puppeteer'
import { MeetProvider } from './meeting/meet'
import { TeamsProvider } from './meeting/teams'
import { MeetingStateMachine } from './state-machine/machine'
import {
    MeetingStateType,
    ParticipantState,
    RecordingEndReason,
} from './state-machine/types'

export class MeetingHandle {
    static instance: MeetingHandle = null
    public stateMachine: MeetingStateMachine
    private param: MeetingParams
    private provider: MeetingProviderInterface

    static init(meetingParams: MeetingParams) {
        if (MeetingHandle.instance == null) {
            this.instance = new MeetingHandle(meetingParams)
            console.log(
                '*** INIT MeetingHandle.instance',
                meetingParams.meeting_url,
            )
        }
    }

    constructor(meetingParams: MeetingParams) {
        this.param = meetingParams
        this.provider =
            meetingParams.meetingProvider === 'Teams'
                ? new TeamsProvider()
                : new MeetProvider()

        // Configuration initiale
        this.param.local_recording_server_location =
            LOCAL_RECORDING_SERVER_LOCATION
        this.param.recording_mode =
            this.param.recording_mode === 'gallery_view'
                ? 'speaker_view'
                : this.param.recording_mode

        // Initialisation de la machine à états
        this.stateMachine = new MeetingStateMachine({
            params: this.param,
            provider: this.provider,
            meetingHandle: this,
        })
    }

    public getStartTime(): number {
        return this.stateMachine.getStartTime()
    }

    static getUserId(): number | null {
        return MeetingHandle.instance.param.user_id
    }

    static getBotId(): string {
        return MeetingHandle.instance.param.bot_uuid
    }

    public getState(): MeetingStateType {
        return this.stateMachine.getCurrentState()
    }

    public updateParticipantState(state: ParticipantState): void {
        if (this.stateMachine) {
            this.stateMachine.updateParticipantState(state)
        }
    }

    public getError(): Error | null {
        return this.stateMachine.getError()
    }

    public async startRecordMeeting(): Promise<void> {
        try {
            await this.stateMachine.start()
            
            // Vérifier si une erreur s'est produite pendant l'exécution
            if (this.stateMachine.getError() || 
                this.stateMachine.getCurrentState() === MeetingStateType.Error) {
                throw this.stateMachine.getError() || new Error('Recording failed to complete');
            }
        } catch (error) {
            console.error('Error in startRecordMeeting:', error);
            throw error; // Remonter l'erreur au niveau supérieur
        }
    }

    public async stopMeeting(reason: RecordingEndReason): Promise<void> {
        await this.stateMachine.requestStop(reason)
    }

    public getProvider(): MeetingProviderInterface {
        return this.provider
    }

    public getParams(): MeetingParams {
        return this.param
    }

    public wasRecordingSuccessful(): boolean {
        return this.stateMachine.wasRecordingSuccessful();
    }
    
    public getEndReason(): RecordingEndReason | undefined {
        return this.stateMachine.getContext().endReason;
    }
}
