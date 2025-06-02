import { Channel, connect } from 'amqplib'
import {
    LOCK_INSTANCE_AT_STARTUP,
    POD_IP,
    setProtection,
    setSessionInRedis,
} from './instance'

import { Events } from './events'

import { MeetingHandle } from './meeting'
import { MeetingParams, MeetingProvider } from './types'

import { server } from './server'

import { Api } from './api/methods'
import { setupForceTermination } from './main'
import { GrafanaService } from './utils/GrafanaService'
import { redirectLogsToBot } from './utils/Logger'
import { startSystemMonitor } from './utils/system-monitor'

const NODE_NAME = process.env.NODE_NAME

export type StartRecordingResult = {
    params: MeetingParams
    error: any | null
}

export class Consumer {
    static readonly QUEUE_NAME = LOCK_INSTANCE_AT_STARTUP
        ? NODE_NAME
        : 'worker_bot_queue'
    static readonly PREFETCH_COUNT = 1

    private constructor(private channel: Channel) {
        this.channel.on('error', (err) => {
            console.error('Channel error:', err)
            this.reconnect()
        })

        this.channel.on('close', () => {
            console.log('Channel closed, attempting to reconnect...')
            this.reconnect()
        })
    }

    private async reconnect() {
        try {
            const connection = await connect(process.env.AMQP_ADDRESS)
            this.channel = await connection.createChannel()
            this.channel.prefetch(Consumer.PREFETCH_COUNT)
            console.log('Successfully reconnected to RabbitMQ')
        } catch (error) {
            console.error('Failed to reconnect:', error)
            setTimeout(() => this.reconnect(), 5000)
        }
    }

    static async init(): Promise<Consumer> {
        const connection = await connect(process.env.AMQP_ADDRESS)
        console.log('connected to rabbitmq: ', process.env.AMQP_ADDRESS)

        const channel = await connection.createChannel()
        console.log('declaring queue: ', Consumer.QUEUE_NAME)

        channel.prefetch(Consumer.PREFETCH_COUNT)
        return new Consumer(channel)
    }

    async deleteQueue() {
        if (LOCK_INSTANCE_AT_STARTUP && Consumer.QUEUE_NAME === NODE_NAME) {
            try {
                await this.channel.deleteQueue(Consumer.QUEUE_NAME)
            } catch (e) {
                console.error('fail to delete queue', e)
            }
        }
    }

    async consume(
        handler: (data: MeetingParams) => Promise<void>,
    ): Promise<StartRecordingResult> {
        return new Promise((resolve, reject) => {
            let isProcessing = false;
            this.channel
                .consume(Consumer.QUEUE_NAME, async (message) => {
                    if (isProcessing) {
                        console.log('Already processing a message, skipping...');
                        return;
                    }
                    
                    isProcessing = true;
                    console.log(`consume message : ${message}`)
                    if (message !== null) {
                        try {
                            this.channel.ack(message)

                            console.log('canceling channel')
                            await this.channel.cancel(
                                message.fields.consumerTag,
                            )

                            const meetingParams = JSON.parse(
                                message.content.toString(),
                            ) as MeetingParams

                            new Api(meetingParams)

                            let error = null
                            try {
                                console.log('awaiting handler...')
                                await handler(meetingParams)
                            } catch (e) {
                                console.error(
                                    'error while awaiting handler:',
                                    e,
                                )
                                error = e
                            }

                            resolve({ params: meetingParams, error: error })
                        } catch (e) {
                            console.error('Error processing message:', e)
                            resolve({
                                params: null,
                                error: new Error(
                                    `Failed to process message: ${(e as Error).message}`,
                                ),
                            })
                        }
                    } else {
                        console.log('Consumer cancelled by server')
                        resolve({
                            params: null,
                            error: new Error('Consumer cancelled by server'),
                        })
                    }
                })
                .then((consumer) => {
                    console.log('consumer started: ', consumer.consumerTag)
                })
                .catch((e) => {
                    console.error('Failed to start consumer:', e)
                    resolve({
                        params: null,
                        error: new Error(
                            `Failed to start consumer: ${e.message}`,
                        ),
                    })
                })
        })
    }

    // throw error if start recording fails.
    static async handleStartRecord(data: MeetingParams) {
        console.log('handleStartRecord')
        
        const grafanaService = GrafanaService.getInstance()
        
        // Mettre à jour la configuration de Grafana Agent
        grafanaService.setBotUuid(data.bot_uuid)
        await grafanaService.updateGrafanaAgentWithBotUuid()
        
        // Redirect logs to bot-specific file
        console.log('About to redirect logs to bot:', data.bot_uuid);
        await redirectLogsToBot(data.bot_uuid);
        console.log('Logs redirected successfully');

        // Start system monitor for this bot
        startSystemMonitor(data.bot_uuid, data.secret);
        console.log('System monitor started for bot:', data.bot_uuid);

        // Set up force termination timer once we've received a message
        setupForceTermination({
            secret: data.secret,
            bot_uuid: data.bot_uuid
        })

        console.log('####### DATA #######', data)
        // Prevent instance for being scaled down
        let protectionSet = false
        let retryCount = 0
        const maxRetries = 5

        while (!protectionSet && retryCount < maxRetries) {
            try {
                await setProtection(true)
                protectionSet = true
                console.log('Instance protection successfully set')
            } catch (e) {
                console.error(
                    `Attempt ${retryCount + 1}/${maxRetries}: Failed to set protection`,
                    e,
                )

                if (
                    e instanceof Error &&
                    e.message.includes('not in InService')
                ) {
                    console.warn(
                        'Instance not fully ready (not InService). Waiting before retry...',
                    )
                    // Wait for 5 seconds before retrying
                    await new Promise((resolve) => setTimeout(resolve, 5000))
                    retryCount++
                } else {
                    // For other errors, just log and continue
                    console.error(
                        'Unable to set protection due to unexpected error:',
                        e,
                    )
                    break
                }
            }
        }

        if (!protectionSet) {
            console.warn(
                'Could not set instance protection after multiple attempts. Proceeding anyway, but instance might be terminated unexpectedly.',
            )
        }

        let meetingSession = {
            bot_ip: POD_IP,
            user_id: data.user_id,
            meeting_url: data.meeting_url,
        }
        console.log('before set session in redis')
        try {
            await setSessionInRedis(data.session_id, meetingSession)
        } catch (e) {
            console.error('fail to set session in redis: ', e)
        }
        console.log('after set session in redis')

        data.meetingProvider = detectMeetingProvider(data.meeting_url)
        if (data.meetingProvider === 'Zoom') {
            // Nothing special to do here for Zoom
            return
        } else {
            await server().catch((e) => {
                console.error(`Fail to start server: ${e}`)
                throw e
            })
            // if (data.streaming_input || data.streaming_output) {
            //     new Streaming(
            //         data.streaming_input,
            //         data.streaming_output,
            //         data.streaming_audio_frequency,
            //         data.bot_uuid,
            //     )
            // }
            console.log('Server started succesfully')

            MeetingHandle.init(data)

            Events.init(data)
            Events.joiningCall()

            await MeetingHandle.instance.startRecordMeeting()
        }
    }
}

function detectMeetingProvider(url: string): MeetingProvider {
    if (url.includes('https://teams')) {
        return 'Teams'
    } else if (url.includes('https://meet')) {
        return 'Meet'
    } else {
        return 'Zoom'
    }
}
