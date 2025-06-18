import { Events } from '../../events'
import { RECORDING } from '../../main'
import { SCREEN_RECORDER } from '../../recording/ScreenRecorder'
import { SpeakerManager } from '../../speaker-manager'
import { SpeakersObserver } from '../../meeting/speakersObserver'
import { HtmlCleaner } from '../../meeting/htmlCleaner'
import { MEETING_CONSTANTS } from '../constants'
import { MeetingStateType, StateExecuteResult } from '../types'
import { BaseState } from './base-state'

export class InCallState extends BaseState {
    async execute(): StateExecuteResult {
        try {
            // Start dialog observer upon entering the state
            this.startDialogObserver()

            // Start with global timeout for setup
            await Promise.race([this.setupRecording(), this.createTimeout()])
            return this.transition(MeetingStateType.Recording)
        } catch (error) {
            // Stop observer on error
            this.stopDialogObserver()

            console.error('Setup recording failed:', error)
            return this.handleError(error as Error)
        }
    }

    private createTimeout(): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(
                    new Error(
                        'Setup timeout: Recording sequence took too long',
                    ),
                )
            }, MEETING_CONSTANTS.SETUP_TIMEOUT)
        })
    }

    private async setupRecording(): Promise<void> {
        try {
            console.info('Starting recording setup sequence')

            // Notifier qu'on est en appel mais pas encore en enregistrement
            Events.inCallNotRecording()

            // Initialize services
            await this.initializeServices()

            // Clean HTML and start observation
            await this.setupBrowserComponents()

            console.info('Recording setup completed successfully')
        } catch (error) {
            console.error('Failed during recording setup:', error)
            throw error
        }
    }

    private async initializeServices(): Promise<void> {
        console.info('Initializing services')

        if (!this.context.pathManager) {
            throw new Error('PathManager not initialized')
        }

        // Configure SCREEN_RECORDER if RECORDING is enabled
        if (RECORDING) {
            console.info('Configuring SCREEN_RECORDER...')
            
            // Configure SCREEN_RECORDER with PathManager and recording params
            SCREEN_RECORDER.configure(
                this.context.pathManager,
                this.context.params.recording_mode,
                this.context.params,
            )

            console.info('SCREEN_RECORDER configured successfully')
        } else {
            console.info('RECORDING disabled - skipping screen recorder initialization')
        }

        console.info('Services initialized successfully')
    }

    private async setupBrowserComponents(): Promise<void> {
        if (!this.context.playwrightPage) {
            throw new Error('Playwright page not initialized')
        }

        try {
            console.log('Setting up browser components with integrated HTML cleanup...')

            // Start HTML cleanup first to clean the interface
            await this.startHtmlCleaning()

            // If RECORDING=false, start speakers observation immediately
            if (!RECORDING) {
                await this.startSpeakersObservation()
                console.log('RECORDING disabled - skipping video recording setup')
                this.context.startTime = Date.now()
                Events.inCallRecording({ start_time: this.context.startTime })
                return
            }

        } catch (error) {
            console.error('Error in setupBrowserComponents:', error)
            console.error('Context state:', {
                hasPlaywrightPage: !!this.context.playwrightPage,
                recordingMode: this.context.params.recording_mode,
                meetingProvider: this.context.params.meetingProvider,
                botName: this.context.params.bot_name,
            })
            throw new Error(`Browser component setup failed: ${error as Error}`)
        }

        // RECORDING=true mode: Start screen recording
        let startTime: number
        let recordingStartedSuccessfully = false
        
        console.log('🎯 === STARTING SCREEN RECORDING ===')
        
        // 🍎 MAC TESTING: Skip screen recording for Mac local testing
        if (process.env.DISABLE_RECORDING === 'true' || process.platform === 'darwin') {
            console.log('🍎 Screen recording disabled for Mac testing - focusing on speakers detection only')
            startTime = Date.now()
            recordingStartedSuccessfully = true
        } else {
            try {
                // Configure the meeting page for sync (if available)
                if (this.context.playwrightPage) {
                    SCREEN_RECORDER.setPage(this.context.playwrightPage)
                    console.log('📄 Meeting page configured for SCREEN_RECORDER')
                } else {
                    console.warn('⚠️ No playwright page available')
                }

                // Start screen recording
                console.log('🚀 Starting screen recording...')
                await SCREEN_RECORDER.startRecording()

                startTime = Date.now()
                recordingStartedSuccessfully = true
                console.log('✅ Screen recording started successfully')
            } catch (error) {
                console.error('❌ Error starting screen recording:', error)
                startTime = Date.now()
                recordingStartedSuccessfully = false
            }
        }

        // Set start time in context
        this.context.startTime = startTime || Date.now()
        console.log(`Recording started at timestamp: ${this.context.startTime}`)

        // Start speakers observation in all cases
        // Speakers observation is independent of video recording
        try {
            await this.startSpeakersObservation()
        } catch (error) {
            console.error('Failed to start speakers observation:', error)
            // Continue even if speakers observation fails
        }

        if (recordingStartedSuccessfully) {
            console.log('✅ Screen recording and speakers observation setup complete')
        } else {
            console.warn('⚠️ Screen recording failed but speakers observation is running')
        }

        // Notify that recording has started
        Events.inCallRecording({ start_time: this.context.startTime })
    }

    private async startSpeakersObservation(): Promise<void> {
        console.log(`Starting speakers observation for ${this.context.params.meetingProvider}`)
        
        // Start SpeakerManager
        SpeakerManager.start()

        if (!this.context.playwrightPage) {
            console.error('Playwright page not available for speakers observation')
            return
        }

        // Create and start integrated speakers observer
        const speakersObserver = new SpeakersObserver(this.context.params.meetingProvider)
        
        // Callback to handle speakers changes
        const onSpeakersChange = async (speakers: any[]) => {
            try {
                await SpeakerManager.getInstance().handleSpeakerUpdate(speakers)
            } catch (error) {
                console.error('Error handling speaker update:', error)
            }
        }

        try {
            await speakersObserver.startObserving(
                this.context.playwrightPage,
                this.context.params.recording_mode,
                this.context.params.bot_name,
                onSpeakersChange
            )
            
            // Store the observer in context for cleanup later
            this.context.speakersObserver = speakersObserver
            
            console.log('Integrated speakers observer started successfully')
        } catch (error) {
            console.error('Failed to start integrated speakers observer:', error)
            throw error
        }
    }

    private async startHtmlCleaning(): Promise<void> {
        if (!this.context.playwrightPage) {
            console.error('Playwright page not available for HTML cleanup')
            return
        }

        console.log(`Starting HTML cleanup for ${this.context.params.meetingProvider}`)

        try {
            // EXACT SAME LOGIC AS EXTENSION: Use centralized HtmlCleaner
            const htmlCleaner = new HtmlCleaner(
                this.context.playwrightPage,
                this.context.params.meetingProvider,
                this.context.params.recording_mode
            )

            await htmlCleaner.start()

            // Store for cleanup later
            this.context.htmlCleaner = htmlCleaner

            console.log('HTML cleanup started successfully')
        } catch (error) {
            console.error('Failed to start HTML cleanup:', error)
            // Continue even if HTML cleanup fails - it's not critical
        }
    }


}
