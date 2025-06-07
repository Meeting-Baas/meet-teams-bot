export const MEETING_CONSTANTS = {
    // Durations
    CHUNKS_PER_TRANSCRIPTION: 18,
    CHUNK_DURATION: 10_000, // 10 seconds for each chunk
    // TRANSCRIBE_DURATION: 10_000 * MEETING_CONSTANTS.CHUNKS_PER_TRANSCRIPTION, // 3 minutes for each transcription

    // Timeouts
    SETUP_TIMEOUT: 30_000, // 30 seconds
    RECORDING_TIMEOUT: 3600 * 4 * 1000, // 4 hours
    INITIAL_WAIT_TIME: 1000 * 60 * 7, // 7 minutes
    SILENCE_TIMEOUT: 1000 * 60 * 10, // 10 minutes - timeout for silence/inactivity detection (speakers + attendees)
    CLEANUP_TIMEOUT: 1000 * 60 * 60, // 1 hour
    RESUMING_TIMEOUT: 1000 * 60 * 60, // 1 hour

    // Recording State intervals
    CHECK_INTERVAL: 250, // 250ms - frequency of main loop checks
    STATUS_LOG_INTERVAL: 2 * 60 * 1000, // 2 minutes - frequency of status logging

    // Audio detection
    SOUND_LEVEL_ACTIVITY_THRESHOLD: 5, // 0-100 - sound level threshold for considering activity (wihout VAD for now)

    // Modal Detection Configuration
    BREAKOUT_ROOM_AUTO_JOIN: false, // Whether to automatically join breakout rooms (false = decline/cancel)
    BREAKOUT_ROOM_BEHAVIOR: 'decline' as 'decline' | 'join' | 'ignore', // How to handle breakout room invitations
    RECORDING_CONSENT_BEHAVIOR: 'accept' as 'accept' | 'decline' | 'ignore', // How to handle recording consent modals

    // Other constants
    FIND_END_MEETING_SLEEP: 250,
    MAX_RETRIES: 3,
} as const
