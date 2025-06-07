import * as asyncLib from 'async'
import { ApiService } from './api'
import { SoundStreamer } from './soundStreamer'

const STREAM: MediaStream | null = null
let RECORDED_CHUNKS: BlobEvent[] = []
let MEDIA_RECORDER: MediaRecorder // MediaRecorder instance to capture footage
let CONTEXT: AudioContext | null = null // No streaming_output audio mode
let THIS_STREAM: MediaStreamAudioSourceNode | null = null // No streaming_output audio mode

let SESSION: SpokeSession | null = null

type SpokeSession = {
    upload_queue: asyncLib.AsyncQueue<() => Promise<void>>
}

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

                new SoundStreamer()
                SoundStreamer.instance.start(stream, streaming_audio_frequency)

                try {
                    MEDIA_RECORDER = new MediaRecorder(stream, {
                        mimeType: 'video/webm; codecs=h264,pcm',
                    })
                } catch (e) {
                    console.error('error creating media recorder', e)
                    reject(e)
                    return
                }

                try {
                    MEDIA_RECORDER.ondataavailable = handleDataAvailable()
                } catch (e) {
                    console.error('error starting media recorder', e)
                    reject()
                }
                resolve()
            },
        )
    })
}

export async function startRecording(chunkDuration: number): Promise<number> {
    const events = new Promise<number>((resolve, reject) => {
        MEDIA_RECORDER.onerror = function (e) {
            console.error('[startRecording] media recorder error', e)
            reject('Error on MEDIA_RECORDER')
        }
        MEDIA_RECORDER.onstart = function (_e) {
            const start_recording_timestamp = Date.now()
            const newSession = {
                upload_queue: newSerialQueue(),
                cut_times: [start_recording_timestamp],
                start_timestamp: start_recording_timestamp,
                transcripts: [],
                words: [],
            }
            SESSION = newSession
            resolve(start_recording_timestamp)
        }
    })
    MEDIA_RECORDER.start(chunkDuration)

    return await events
}

export async function stop(): Promise<void> {
    console.log('media recorder stop')
    const on_stop = new Promise<void>((resolve, reject) => {
        MEDIA_RECORDER.onstop = async function (_) {
            await handleChunk(true).catch((e) => {
                console.error('[handleChunk] Unexpected error:', e)
                reject()
            })
            await waitUntilComplete().catch((e) => {
                console.error('[waitUntilComplete] Unexpected error:', e)
                reject()
            })
            console.log('[MEDIA_RECORDER.onstop] Promise succesful')
            resolve()
        }
    })
    console.log('unset all stream')
    await unsetAllStream().catch((e) => {
        console.error('[unsetAllStream] Unexpected error:', e)
        throw e
    })
    MEDIA_RECORDER.stop()

    return await on_stop
}

function newSerialQueue() {
    return asyncLib.queue(async function (
        task: () => Promise<void>,
        done: any,
    ) {
        await task()
        done()
    },
    1)
}

async function waitUntilComplete(kill = false) {
    const spokeSession = SESSION!

    console.log('[waitUntilComplete]'.concat('after patch moment pending'))

    if (kill) {
        console.log('[waitUntilComplete] killing')
        spokeSession.upload_queue.kill()
    } else {
        console.log(
            '[waitUntilComplete] upload queue',
            spokeSession.upload_queue.idle(),
        )
        spokeSession.upload_queue.push(async () => {
            return
        })
        console.log('[waitUntilComplete] before transcribe queue drain')
        await spokeSession.upload_queue.drain()
        console.log('[waitUntilComplete] after transcribe queue drain')
    }
}

async function unsetAllStream(): Promise<void> {
    STREAM?.getTracks().forEach((track) => track.stop())
    await CONTEXT?.close()
}

function handleDataAvailable() {
    return (e: BlobEvent) => {
        RECORDED_CHUNKS.push(e)
        handleChunk(false)
    }
}

async function handleChunk(isFinal: boolean) {
    const spokeSession = SESSION! // ! is the equivalent of unwrap() - throw exception
    const recordedChunks = RECORDED_CHUNKS
    RECORDED_CHUNKS = []

    const recordedDataChunk = recordedChunks.map((c) => c.data)
    const blob = new Blob(recordedDataChunk, {
        type: 'video/webm; codecs=pcm',
    })
    const file = new File([blob], 'record.webm', {
        type: 'video/webm',
    })
    spokeSession.upload_queue.push(async () => {
        await sendDataChunks(spokeSession, file, isFinal)
    })
}

async function sendDataChunks(
    spokeSession: SpokeSession,
    file: File,
    isFinal: boolean,
) {
    try {
        try {
            if (!isFinal) {
                await ApiService.sendMessageToRecordingServer(
                    'UPLOAD_CHUNK',
                    file,
                )
            } else {
                await ApiService.sendMessageToRecordingServer(
                    'UPLOAD_CHUNK_FINAL',
                    file,
                )
            }
        } catch (e) {
            // TODO: handler upload chunk error
            console.log('Error in upload chunk killing')
            spokeSession.upload_queue.kill()
            return
        }
    } catch (e) {
        if ((e as any).response && (e as any).response.data) {
            console.log((e as any).response.data)
        } else {
            console.log(e as any)
        }
    }
}
