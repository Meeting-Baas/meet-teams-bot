import { exec } from 'child_process'
import { clientRedis } from './server'
import { Instance, InstanceConfig } from './types'

// Allow dynamic port configuration for multiple bot instances
export const PORT = process.env.BOT_HTTP_PORT ? parseInt(process.env.BOT_HTTP_PORT) : 8080
export const WS_PORT = process.env.BOT_WS_PORT ? parseInt(process.env.BOT_WS_PORT) : 8081
export const LOCK_INSTANCE_AT_STARTUP =
    process.env.LOCK_INSTANCE_AT_STARTUP === 'true'
export const API_SERVER_BASEURL = process.env.API_SERVER_BASEURL
export const POD_IP = `${process.env.POD_IP}:${PORT}`
export const LOCAL_RECORDING_SERVER_LOCATION = `http://localhost:${PORT}/`

export type MeetingBotSession = {
    user_id: number
    bot_ip: string
    meeting_url: string
}

export const REDIS_SESSION_EXPIRATION = 3600 * 5

export async function setSessionInRedis(
    session_id: string,
    session: MeetingBotSession,
): Promise<string> {
    const res = await clientRedis.set(session_id, JSON.stringify(session))
    await clientRedis.expire(session_id, REDIS_SESSION_EXPIRATION)
    return res
}

export async function delSessionInRedis(session_id: string): Promise<number> {
    return await clientRedis.del(session_id)
}

export function setProtection(enabled: boolean): Promise<void> {
    return new Promise((res, _rej) => {
        if (!LOCK_INSTANCE_AT_STARTUP) {
            if (enabled) {
                exec('set_protection.sh on', (_error, _stdout, _stderr) => {
                    console.log(`Set protection`, {
                        enabled: enabled,
                        stdout: _stdout,
                        stderr: _stderr,
                    })
                    res()
                })
            } else {
                exec('set_protection.sh off', (_error, _stdout, _stderr) => {
                    console.log(`Set protection`, {
                        enabled: enabled,
                        stdout: _stdout,
                        stderr: _stderr,
                    })
                    res()
                })
            }
        } else {
            res()
        }
    })
}

export async function terminateInstance() {
    await new Promise<void>((res, _rej) => {
        exec('terminate_instance.sh', (_error, stdout, stderr) => {
            console.log(`terminate instance`, { stdout, stderr })
            res()
        })
    })
    process.exit(0)
}

export async function createInstance(config: InstanceConfig): Promise<Instance> {
    // Get ports from config or use defaults
    const http_port = config.http_port || PORT
    const ws_port = config.ws_port || WS_PORT

    // Create instance with configured ports
    const instance: Instance = {
        name: config.name,
        http_port,
        ws_port,
    }

    // Log port configuration
    console.log(`Instance ${config.name} configured with HTTP port ${http_port} and WebSocket port ${ws_port}`)

    return instance
}
