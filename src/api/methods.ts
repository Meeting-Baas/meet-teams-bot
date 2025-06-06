import axios from 'axios'
import * as rax from 'retry-axios'

import { ApiTypes } from './types'

import { MeetingParams } from '../types'

export class Api {
    public static instance: Api | null = null // Singleton class

    public bot_uuid: string

    constructor(params: MeetingParams) {
        if (Api.instance instanceof Api) {
            console.error(
                'Class is singleton, constructor cannot be called multiple times.',
            )
            return Api.instance
        }
        
        // Configure API base URL and credentials
        axios.defaults.baseURL = process.env.API_SERVER_BASEURL
        axios.defaults.withCredentials = true

        // Configure authentication token from environment (only in non-serverless mode)
        const isServerless = process.env.SERVERLESS === 'true'
        if (!isServerless && params.user_token) {
            axios.defaults.headers.common['Authorization'] = params.user_token
        }

        axios.defaults.raxConfig = {
            instance: axios,
            retry: 2, // Number of retry attempts
            backoffType: 'exponential',
            noResponseRetries: 2, // Number of retries for no responses
            retryDelay: 1000, // Delay between each retry in milliseconds
            httpMethodsToRetry: [
                'GET',
                'HEAD',
                'OPTIONS',
                'DELETE',
                'PUT',
                'POST',
            ],
            statusCodesToRetry: [
                [100, 199],
                [400, 499],
                [500, 599],
            ],
            onRetryAttempt: this.onRetryAttempt,
        }
        rax.attach()
        this.bot_uuid = params.bot_uuid
        Api.instance = this
    }

    private onRetryAttempt(err: any) {
        const cfg = rax.getConfig(err)
        const response =
            err.response && err.response.data ? err.response.data : err
        const request = err.request

        console.log(
            'Attempt of a new trial #',
            cfg && cfg.currentRetryAttempt,
            {
                url: request.url,
                method: request.method,
                params: request.params,
                headers: request.headers,
                data: request.data,
                response: response,
            },
        )
    }

    // Finalize bot structure into BDD and send webhook
    public async endMeetingTrampoline() {
        const resp = await axios({
            method: 'POST',
            url: '/bots/end_meeting_trampoline',
            params: {
                bot_uuid: this.bot_uuid,
            },
            data: {
                diarization_v2: false,
            },
        })
        return resp.data
    }

    // Post transcript to server
    public async postTranscript(
        transcript: ApiTypes.PostableTranscript,
        bot_uuid: string,
    ): Promise<ApiTypes.QueryableTranscript> {
        return (
            await axios({
                method: 'POST',
                url: `/bots/transcripts/${bot_uuid}/diarization`,
                data: transcript,
            })
        ).data
    }

    // Patch existing transcript
    public async patchTranscript(
        transcript: ApiTypes.ChangeableTranscript,
        bot_uuid: string,
    ): Promise<ApiTypes.QueryableTranscript> {
        return (
            await axios({
                method: 'PATCH',
                url: `/bots/transcripts/${bot_uuid}/diarization`,
                data: transcript,
            })
        ).data
    }
}
