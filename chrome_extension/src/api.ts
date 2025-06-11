import axios from 'axios'

export type MeetingProvider = 'Zoom' | 'Meet' | 'Teams'

// Removed UPLOAD_CHUNK and UPLOAD_CHUNK_FINAL since video recording is disabled
type MessageType = 'SPEAKERS' | 'LOG'

// Yes, any is funny :cow:
type MessagePayload = any

export const sleep = (milliseconds: number) => {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export type RecordingMode = 'speaker_view' | 'gallery_view' | 'audio_only'

export class ApiService {
    private static RecordingServerLocation: string | null = null

    private constructor() {}

    public static async init(url: string): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.set({ RecordingServerLocation: url }, () => {
                ApiService.RecordingServerLocation = url
                // console.log('ApiService initialized with URL:', url)
                resolve()
            })
        })
    }

    public static async getRecordingServerLocation(): Promise<string | null> {
        if (ApiService.RecordingServerLocation) {
            return ApiService.RecordingServerLocation
        }

        return new Promise((resolve) => {
            chrome.storage.local.get(['RecordingServerLocation'], (result) => {
                ApiService.RecordingServerLocation =
                    result.RecordingServerLocation || null
                resolve(ApiService.RecordingServerLocation)
            })
        })
    }

    public static async sendMessageToRecordingServer(
        messageType: MessageType,
        payload: MessagePayload,
    ): Promise<void> {
        const url = await ApiService.getRecordingServerLocation()
        if (!url) {
            throw new Error('ApiService not initialized. Call init() first.')
        }

        // console.log(
        //     'Sending message to recording server with PATH:',
        //     messageType,
        //     payload,
        //     url,
        // )

        switch (messageType) {
            case 'SPEAKERS':
                await axios
                    .post(`${url}add_speaker`, payload)
                    .catch((error) => {
                        console.error('Failed to send SPEAKER message:', error)
                    })
                break
            case 'LOG':
                await axios
                    .post(`${url}broadcast_message`, payload)
                    .catch((error) => {
                        console.error('Failed to send LOG message:', error)
                    })
                break
            default:
                console.error('Unexpected message type !')
        }
    }
}
