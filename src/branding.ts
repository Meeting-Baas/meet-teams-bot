import { spawn } from 'child_process'
import { join, resolve } from 'path'

import { SoundContext, VideoContext } from './media_context'

export type BrandingHandle = {
    wait: Promise<void>
    kill: () => void
}

// Get the absolute path to the project root
const PROJECT_ROOT = resolve(__dirname, '..', '..')

export function generateBranding(
    botname: string,
    custom_branding_path?: string,
): BrandingHandle {
    try {
        const command = (() => {
            if (custom_branding_path == null) {
                const scriptPath = join(PROJECT_ROOT, 'generate_branding.sh')
                console.log('Using branding script:', scriptPath)
                return spawn(scriptPath, [botname], {
                    env: { ...process.env },
                    cwd: PROJECT_ROOT,
                })
            } else {
                const scriptPath = join(PROJECT_ROOT, 'generate_custom_branding.sh')
                console.log('Using custom branding script:', scriptPath)
                return spawn(
                    scriptPath,
                    [custom_branding_path],
                    { 
                        env: { ...process.env },
                        cwd: PROJECT_ROOT,
                    },
                )
            }
        })()

        // Log script output for debugging
        command.stdout?.on('data', (data) => {
            console.log('Branding script output:', data.toString())
        })
        command.stderr?.on('data', (data) => {
            console.log('Branding script error:', data.toString())
        })

        return {
            wait: new Promise<void>((res, rej) => {
                command.on('close', (code) => {
                    if (code === 0) {
                        console.log('Branding script completed successfully')
                        res()
                    } else {
                        console.error('Branding script failed with code:', code)
                        rej(new Error(`Branding script failed with code ${code}`))
                    }
                })
                command.on('error', (err) => {
                    console.error('Branding script error:', err)
                    rej(err)
                })
            }),
            kill: () => {
                command.kill()
            },
        }
    } catch (error) {
        console.error('Failed to start branding script:', error)
        throw error
    }
}

export function playBranding() {
    try {
        new VideoContext(0)
        VideoContext.instance.default()
    } catch (e) {
        console.error('fail to play video branding ', e)
    }
}
