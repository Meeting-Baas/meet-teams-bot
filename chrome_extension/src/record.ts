import { SoundStreamer } from './soundStreamer'

// Removed MediaRecorder-related variables and session management
// Only keeping audio streaming functionality

export async function initMediaRecorder(
    streaming_output: string | undefined,
    streaming_audio_frequency?: number,
): Promise<void> {
    const fps = 30

    return new Promise((resolve, reject) => {
        chrome.tabCapture.capture(
            {
                video: true,
                audio: true,
                videoConstraints: {
                    mandatory: {
                        chromeMediaSource: 'tab',
                        maxFrameRate: fps,
                        minWidth: 1280,
                        minHeight: 720,
                        maxWidth: 1280,
                        maxHeight: 720,
                    },
                },
            },
            function (stream) {
                if (stream == null) {
                    reject()
                    return
                }

                // Only initialize audio streaming, no video recording
                new SoundStreamer()
                SoundStreamer.instance.start(stream, streaming_audio_frequency)

                resolve()
            },
        )
    })
}

export async function startRecording(chunkDuration: number): Promise<number> {
    // Return a timestamp without actually starting video recording
    const start_recording_timestamp = Date.now()
    console.log('Video recording disabled - only audio streaming active')
    return start_recording_timestamp
}

export async function stop(): Promise<void> {
    console.log('Stopping audio streaming (video recording was disabled)')
    // Only stop audio streaming, no video recording to stop
    return Promise.resolve()
}
