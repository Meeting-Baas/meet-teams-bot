import { Events } from '../../events'
import { Streaming } from '../../streaming'
import { MEETING_CONSTANTS } from '../constants'

import {
    MeetingStateType,
    RecordingEndReason,
    StateExecuteResult,
} from '../types'
import { BaseState } from './base-state'

import { TRANSCODER } from '../../recording/Transcoder'
import { PathManager } from '../../utils/PathManager'

// Sound level threshold for considering activity (0-100)
const SOUND_LEVEL_ACTIVITY_THRESHOLD = 5;

export class RecordingState extends BaseState {
    private isProcessing: boolean = true
    private pathManager: PathManager
    private readonly CHECK_INTERVAL = 250
    private noAttendeesWithSilenceStartTime: number = 0

    async execute(): StateExecuteResult {
        try {
            console.info('Starting recording state')

            // Start the dialog observer when entering this state
            this.startDialogObserver()

            // Initialize PathManager
            this.pathManager = PathManager.getInstance(
                this.context.params.bot_uuid,
            )
            await this.pathManager.initializePaths()

            // Initialize recording
            await this.initializeRecording()

            // Set a global timeout for the recording state
            const startTime = Date.now()

            // Main loop
            while (this.isProcessing) {
                // Check global timeout
                if (
                    Date.now() - startTime >
                    MEETING_CONSTANTS.RECORDING_TIMEOUT
                ) {
                    console.warn(
                        'Global recording state timeout reached, forcing end',
                    )
                    await this.handleMeetingEnd(
                        RecordingEndReason.RecordingTimeout,
                    )
                    break
                }

                // Check if we should stop
                const { shouldEnd, reason } = await this.checkEndConditions()

                if (shouldEnd) {
                    console.info(`Meeting end condition met: ${reason}`)
                    await this.handleMeetingEnd(reason)
                    break
                }

                // If pause requested, transition to Paused state
                if (this.context.isPaused) {
                    return this.transition(MeetingStateType.Paused)
                }

                await this.sleep(this.CHECK_INTERVAL)
            }

            // Stop the observer before transitioning to Cleanup state
            this.stopDialogObserver()
            return this.transition(MeetingStateType.Cleanup)
        } catch (error) {
            // Stop the observer in case of error
            this.stopDialogObserver()

            console.error('Error in recording state:', error)
            return this.handleError(error as Error)
        }
    }

    private async initializeRecording(): Promise<void> {
        console.info('Initializing recording...')

        // Start streaming if available
        if (this.context.streamingService) {
            console.info('Starting streaming service from recording state')
            this.context.streamingService.start()

            // Check that the instance is properly created
            if (!Streaming.instance) {
                console.warn('Streaming service not properly initialized, trying fallback initialization')
                // If the instance is not available after starting, we might have a problem
                Streaming.instance = this.context.streamingService;
            }
        } else {
            console.warn('No streaming service available in context')
        }

        // Log the context state
        console.info('Context state:', {
            hasPathManager: !!this.context.pathManager,
            hasStreamingService: !!this.context.streamingService,
            isStreamingInstanceAvailable: !!Streaming.instance,
            isTranscoderConfigured: TRANSCODER.getStatus().isConfigured,
        })

        // Configure listeners
        await this.setupEventListeners()
        console.info('Recording initialized successfully')
    }

    private async setupEventListeners(): Promise<void> {
        console.info('Setting up event listeners...')

        TRANSCODER.on('chunkProcessed', async (chunkInfo) => {
            try {
                console.info('Received chunk for transcription:', {
                    startTime: chunkInfo.startTime,
                    endTime: chunkInfo.endTime,
                    hasAudioUrl: !!chunkInfo.audioUrl,
                })


            } catch (error) {
                console.error('Error during transcription:', error)
            }
        })

        TRANSCODER.on('error', async (error) => {
            console.error('Recording error:', error)
            this.context.error = error
            this.isProcessing = false
        })

        console.info('Event listeners setup complete')
    }

    private async checkEndConditions(): Promise<{
        shouldEnd: boolean
        reason?: RecordingEndReason
    }> {
        const checkPromise = async () => {
            const now = Date.now()

            try {
                // Check if stop was requested via state machine
                if (this.context.endReason) {
                    console.info(`[checkEndConditions] End reason already set: ${this.context.endReason}`)
                    return { shouldEnd: true, reason: this.context.endReason }
                }

                // Check if bot was removed
                if (await this.checkBotRemoved()) {
                    console.info('[checkEndConditions] Bot removal detected')
                    return {
                        shouldEnd: true,
                        reason: RecordingEndReason.BotRemoved,
                    }
                }

                // Check for blocking modals (and try to dismiss them)
                // Note: This is handled by the Global Dialog Observer in machine.ts (every 2 seconds)
                // await this.checkForBlockingModals()

                // Check participants
                const attendeesResult = await this.checkNoAttendees(now)
                if (attendeesResult) {
                    console.info('[checkEndConditions] No attendees condition met')
                    return {
                        shouldEnd: true,
                        reason: RecordingEndReason.NoAttendees,
                    }
                }

                // Check audio activity
                const noSpeakerResult = await this.checkNoSpeaker(now)
                if (noSpeakerResult) {
                    console.info('[checkEndConditions] No speaker condition met')
                    return {
                        shouldEnd: true,
                        reason: RecordingEndReason.NoSpeaker,
                    }
                }

                // Log current status periodically (every 2 minutes instead of 30 seconds)
                const timeSinceStart = now - (this.context.startTime || 0)
                if (timeSinceStart % 120000 < this.CHECK_INTERVAL) {
                    const attendeesCount = this.context.attendeesCount || 0
                    const currentSoundLevel = Streaming.instance ? Streaming.instance.getCurrentSoundLevel() : 0
                    const noSpeakerTime = this.context.noSpeakerDetectedTime || 0
                    const silenceDuration = noSpeakerTime > 0 ? Math.floor((now - noSpeakerTime) / 1000) : 0
                    
                    console.info(`[checkEndConditions] Status check - Attendees: ${attendeesCount}, Sound Level: ${currentSoundLevel.toFixed(2)}, Silence Duration: ${silenceDuration}s, Recording Time: ${Math.floor(timeSinceStart / 1000)}s`)
                }

                return { shouldEnd: false }
            } catch (error) {
                console.error('Error checking end conditions:', error)
                return {
                    shouldEnd: true,
                    reason: RecordingEndReason.BotRemoved,
                }
            }
        }

        const timeoutPromise = new Promise<{
            shouldEnd: boolean
            reason?: RecordingEndReason
        }>((_, reject) =>
            setTimeout(
                () => reject(new Error('Check end conditions timeout')),
                5000,
            ),
        )

        try {
            return await Promise.race([checkPromise(), timeoutPromise])
        } catch (error) {
            console.error('Error or timeout in checkEndConditions:', error)
            return { shouldEnd: true, reason: RecordingEndReason.BotRemoved }
        }
    }

    private async handleMeetingEnd(reason: RecordingEndReason): Promise<void> {
        console.info(`Handling meeting end with reason: ${reason}`)
        
        // Log final state before ending
        const attendeesCount = this.context.attendeesCount || 0
        const currentSoundLevel = Streaming.instance ? Streaming.instance.getCurrentSoundLevel() : 0
        const noSpeakerTime = this.context.noSpeakerDetectedTime || 0
        const silenceDuration = noSpeakerTime > 0 ? Math.floor((Date.now() - noSpeakerTime) / 1000) : 0
        const recordingDuration = this.context.startTime ? Math.floor((Date.now() - this.context.startTime) / 1000) : 0
        
        console.info(`[handleMeetingEnd] Final state - Reason: ${reason}, Attendees: ${attendeesCount}, Sound Level: ${currentSoundLevel.toFixed(2)}, Silence Duration: ${silenceDuration}s, Total Recording: ${recordingDuration}s`)
        
        this.context.endReason = reason

        try {
            // Stop the dialog observer
            this.stopDialogObserver()

            // Try to close the meeting but don't let an error here affect the rest
            try {
                // If the reason is bot_removed, we know the meeting is already effectively closed
                if (reason === RecordingEndReason.BotRemoved) {
                    console.info('Bot was removed from meeting, skipping active closure step')
                } else {
                    await this.context.provider.closeMeeting(this.context.playwrightPage)
                }
            } catch (closeError) {
                console.error('Error closing meeting, but continuing process:', closeError)
            }

            // These critical steps must execute regardless of previous steps
            console.info('Triggering call ended event')
            await Events.callEnded()

            console.info('Stopping video recording')
            await this.stopVideoRecording().catch(err => {
                console.error('Error stopping video recording, continuing:', err)
            })

            console.info('Stopping audio streaming')
            await this.stopAudioStreaming().catch(err => {
                console.error('Error stopping audio streaming, continuing:', err)
            })

            console.info('Stopping transcoder')
            try {
                await TRANSCODER.stop()
            } catch (error) {
                console.error('Error stopping transcoder, continuing cleanup:', error)
            }

            console.info('Setting isProcessing to false to end recording loop')
            await this.sleep(2000)
        } catch (error) {
            console.error('Error during meeting end handling:', error)
        } finally {
            // Always ensure this flag is set to stop the processing loop
            this.isProcessing = false
            console.info('Meeting end handling completed')
        }
    }

    private async stopVideoRecording(): Promise<void> {
        if (!this.context.backgroundPage) {
            console.error(
                'Background page not available for stopping video recording',
            )
            return
        }

        try {
            // Check if the function exists first
            const functionExists = await this.context.backgroundPage.evaluate(() => {
                const w = window as any;
                return {
                    stopMediaRecorderExists: typeof w.stopMediaRecorder === 'function',
                    recordExists: typeof w.record !== 'undefined',
                    recordStopExists: w.record && typeof w.record.stop === 'function'
                };
            });

            console.log('Stop functions status:', functionExists);

            if (functionExists.stopMediaRecorderExists) {
                // 1. Stop media recording with detailed diagnostics
                await this.context.backgroundPage.evaluate(() => {
                    const w = window as any;
                    try {
                        console.log('Calling stopMediaRecorder...');
                        const result = w.stopMediaRecorder();
                        console.log('stopMediaRecorder called successfully, result:', result);
                        return result;
                    } catch (error) {
                        console.error('Error in stopMediaRecorder:', error);
                        // Try to display more details about the error
                        console.error('Error details:',
                            JSON.stringify(error, Object.getOwnPropertyNames(error)));
                        throw error;
                    }
                });
            } else {
                console.warn('stopMediaRecorder function not found in window object');

                // Direct workaround attempt with MediaRecorder if available
                try {
                    await this.context.backgroundPage.evaluate(() => {
                        const w = window as any;
                        if (w.MEDIA_RECORDER && w.MEDIA_RECORDER.state !== 'inactive') {
                            console.log('Attempting direct stop of MEDIA_RECORDER');
                            w.MEDIA_RECORDER.stop();
                            return true;
                        }
                        return false;
                    });
                } catch (directStopError) {
                    console.error('Failed direct stop attempt:', directStopError);
                }
            }
        } catch (error) {
            console.error('Failed to stop video recording:', error);
            throw error;
        }
    }

    private async stopAudioStreaming(): Promise<void> {
        if (!this.context.backgroundPage) {
            console.error('Background page not available for stopping audio')
            return
        }

        try {
            await this.context.backgroundPage.evaluate(() => {
                const w = window as any
                return w.stopAudioStreaming()
            })
            console.info('Audio streaming stopped successfully')
        } catch (error) {
            console.error('Failed to stop audio streaming:', error)
            throw error
        }
    }

    private async checkBotRemoved(): Promise<boolean> {
        if (!this.context.playwrightPage) {
            console.error('Playwright page not available')
            return true
        }

        try {
            return await this.context.provider.findEndMeeting(
                this.context.params,
                this.context.playwrightPage,
            )
        } catch (error) {
            console.error('Error checking if bot was removed:', error)
            return false
        }
    }

    /**
     * Checks if the meeting should end due to lack of participants
     * @param now Current timestamp
     * @returns true if the meeting should end due to lack of participants
     */
    private checkNoAttendees(now: number): boolean {
        const attendeesCount = this.context.attendeesCount || 0
        const startTime = this.context.startTime || 0
        const firstUserJoined = this.context.firstUserJoined || false

        // Get sound level ONCE at the beginning to avoid race conditions
        let currentSoundLevel = 0
        let hasAudioActivity = false
        
        if (Streaming.instance) {
            currentSoundLevel = Streaming.instance.getCurrentSoundLevel()
            hasAudioActivity = currentSoundLevel > SOUND_LEVEL_ACTIVITY_THRESHOLD
        }

        // CRITICAL OVERRIDE: If we have sound activity, someone is clearly there regardless of attendee detection
        if (hasAudioActivity) {
            if (this.noAttendeesWithSilenceStartTime > 0) {
                console.info(`[checkNoAttendees] SOUND ACTIVITY OVERRIDE - Level: ${currentSoundLevel.toFixed(2)} > ${SOUND_LEVEL_ACTIVITY_THRESHOLD}, resetting silence timer despite attendeesCount=${attendeesCount}`)
            }
            this.noAttendeesWithSilenceStartTime = 0
            return false // Never end if we have sound activity
        }

        // If participants are present, no need to end and reset silence timer
        if (attendeesCount > 0) {
            if (this.noAttendeesWithSilenceStartTime > 0) {
                console.info(`[checkNoAttendees] Attendees present (${attendeesCount}), resetting silence timer`)
            }
            this.noAttendeesWithSilenceStartTime = 0
            return false
        }

        // True if we've exceeded the initial 7 minutes without any participants
        const noAttendeesTimeout =
            startTime + MEETING_CONSTANTS.INITIAL_WAIT_TIME < now

        // True if at least one user joined and then left
        const noAttendeesAfterJoin = firstUserJoined

        // Check if we should consider ending due to no attendees
        const shouldConsiderEnding = noAttendeesTimeout || noAttendeesAfterJoin

        // If we should consider ending, check for silence confirmation
        if (shouldConsiderEnding) {
            // If this is the first time we're detecting no attendees, start the silence timer
            if (this.noAttendeesWithSilenceStartTime === 0) {
                this.noAttendeesWithSilenceStartTime = now
                console.info(`[checkNoAttendees] Starting silence confirmation timer - Reason: ${noAttendeesTimeout ? 'initial_wait_timeout' : 'user_left'}, SoundLevel: ${currentSoundLevel.toFixed(2)}`)
                return false
            }

            // Check if we've had silence for long enough
            const silenceDuration = now - this.noAttendeesWithSilenceStartTime
            const hasEnoughSilence = silenceDuration >= MEETING_CONSTANTS.SILENCE_TIMEOUT

            // If we're tracking silence but haven't reached the threshold, log the progress (every 30 seconds instead of 5)
            if (!hasEnoughSilence && silenceDuration % 30000 < this.CHECK_INTERVAL) {
                console.info(`[checkNoAttendees] Waiting for silence confirmation: ${Math.floor(silenceDuration/1000)}s / ${MEETING_CONSTANTS.SILENCE_TIMEOUT/1000}s, SoundLevel: ${currentSoundLevel.toFixed(2)}`)
            }

            if (hasEnoughSilence) {
                console.info(`[checkNoAttendees] Silence confirmation complete - Duration: ${Math.floor(silenceDuration/1000)}s, Threshold: ${MEETING_CONSTANTS.SILENCE_TIMEOUT/1000}s, Attendees: ${attendeesCount}, FinalSoundLevel: ${currentSoundLevel.toFixed(2)}`)
            }

            return hasEnoughSilence
        }

        // Reset silence timer if we're not considering ending
        if (this.noAttendeesWithSilenceStartTime > 0) {
            console.info(`[checkNoAttendees] Conditions no longer met for ending, resetting silence timer`)
        }
        this.noAttendeesWithSilenceStartTime = 0
        return false
    }

    /**
     * Checks if the meeting should end due to absence of sound
     * @param now Current timestamp
     * @returns true if the meeting should end due to absence of sound
     */
    private checkNoSpeaker(now: number): boolean {
        const noSpeakerDetectedTime = this.context.noSpeakerDetectedTime || 0

        // If no silence period has been detected, no need to end
        if (noSpeakerDetectedTime <= 0) {
            return false
        }

        // Check current sound level if streaming is available
        let soundLevelStatus = 'unknown'
        let currentSoundLevel = 0
        
        if (Streaming.instance) {
            currentSoundLevel = Streaming.instance.getCurrentSoundLevel()
            soundLevelStatus = currentSoundLevel > SOUND_LEVEL_ACTIVITY_THRESHOLD ? 'active' : 'silent'

            // If sound is detected above threshold, reset the silence counter
            if (currentSoundLevel > SOUND_LEVEL_ACTIVITY_THRESHOLD) {
                const silenceDuration = now - noSpeakerDetectedTime
                console.info(`[checkNoSpeaker] Sound activity detected - Level: ${currentSoundLevel.toFixed(2)} > ${SOUND_LEVEL_ACTIVITY_THRESHOLD}, resetting silence timer (was silent for ${Math.floor(silenceDuration/1000)}s)`)
                this.context.noSpeakerDetectedTime = 0
                return false
            }
        } else {
            console.warn('[checkNoSpeaker] Streaming instance not available, cannot check sound levels - proceeding with timeout check only')
        }

        // Check if the silence period has exceeded the timeout
        const silenceDuration = Math.floor((now - noSpeakerDetectedTime)/1000)
        const timeoutThreshold = Math.floor(MEETING_CONSTANTS.SILENCE_TIMEOUT / 1000)
        const shouldEnd = noSpeakerDetectedTime + MEETING_CONSTANTS.SILENCE_TIMEOUT < now

        if (shouldEnd) {
            console.info(`[checkNoSpeaker] Silence timeout reached - Duration: ${silenceDuration}s >= ${timeoutThreshold}s, Final Sound Level: ${currentSoundLevel.toFixed(2)}, Status: ${soundLevelStatus}, ending meeting`)
        } else {
            // Log progress towards timeout every 60 seconds instead of 30
            if (silenceDuration % 60 === 0 && silenceDuration > 0) {
                console.info(`[checkNoSpeaker] Silence progress - ${silenceDuration}s / ${timeoutThreshold}s until timeout, Current Sound Level: ${currentSoundLevel.toFixed(2)}`)
            }
        }

        return shouldEnd
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }
}
