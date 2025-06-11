import { BrowserContext, chromium, Page } from '@playwright/test'
import { join } from 'path'

// const EXTENSION_NAME = 'spoke'
const EXTENSION_ID = 'eahilodcoaonodbfiijhpmfnddkfhmbl'
// Dynamic user data directory based on bot instance
const USER_DATA_DIR = process.env.BOT_BROWSER_PROFILE || '/tmp/test-user-data-dir'

type Resolution = {
    width: number
    height: number
}

const P480: Resolution = {
    width: 854,
    height: 480,
}

const P720: Resolution = {
    width: 1280,
    height: 720,
}

var RESOLUTION: Resolution = P720

/**
 * Opens a Chromium browser instance with Chrome extension support and performance optimizations
 * 
 * Performance optimizations applied:
 * - Memory management: Increased heap size and enabled memory pressure relief
 * - Process limitations: Limited renderer processes to prevent resource exhaustion  
 * - Background network reduction: Disabled unnecessary background operations
 * - Feature optimization: Disabled unused Chrome features to reduce overhead
 * - Cache management: Enabled aggressive cache discarding for memory efficiency
 * 
 * @param lowResolution Whether to use lower resolution (480p vs 720p) for better performance
 * @param slowMo Whether to enable slow motion mode for debugging (adds 100ms delay)
 * @returns Promise resolving to browser context and background page for extension interaction
 */
async function verifyExtensionInitialization(backgroundPage: Page): Promise<boolean> {
    try {
        // Add a small delay to allow for extension initialization
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Simple check if required functions exist
        const functionsExist = await backgroundPage.evaluate(() => {
            const w = window as any
            return {
                startRecording: typeof w.startRecording === 'function',
                start_speakers_observer: typeof w.start_speakers_observer === 'function',
                remove_shitty_html: typeof w.remove_shitty_html === 'function'
            }
        })

        console.log('Extension functions check:', functionsExist)
        return functionsExist.startRecording && functionsExist.start_speakers_observer
    } catch (error) {
        console.error('Failed to verify extension initialization:', error)
        return false
    }
}

async function cleanupBrowserSession(userDataDir: string): Promise<void> {
    try {
        // Kill any existing Chrome processes using this profile
        const fs = require('fs')
        const path = require('path')
        
        // Read the lock file if it exists
        const lockFile = path.join(userDataDir, 'SingletonLock')
        if (fs.existsSync(lockFile)) {
            try {
                const lockContent = fs.readFileSync(lockFile, 'utf8')
                const pid = parseInt(lockContent.trim())
                if (pid && pid > 0) {
                    try {
                        process.kill(pid, 0) // Check if process exists
                        process.kill(pid, 'SIGTERM') // Try graceful shutdown
                        // Wait a bit for process to terminate
                        await new Promise(resolve => setTimeout(resolve, 1000))
                    } catch (e) {
                        // Process doesn't exist or already dead
                    }
                }
            } catch (e) {
                // Lock file read failed, continue with cleanup
            }
        }

        // Remove Chrome lock files
        const lockFiles = [
            'SingletonLock',
            'SingletonSocket',
            'SingletonSocket.lock',
            'SingletonCookie',
            'SingletonCookie-journal'
        ]
        
        for (const file of lockFiles) {
            try {
                fs.unlinkSync(path.join(userDataDir, file))
            } catch (e) {
                // Ignore errors if files don't exist
            }
        }

        // Clean up crash dumps
        const crashDir = path.join(userDataDir, 'Crashpad')
        if (fs.existsSync(crashDir)) {
            try {
                fs.rmSync(crashDir, { recursive: true, force: true })
            } catch (e) {
                // Ignore cleanup errors
            }
        }

        console.log('Browser session cleanup completed for:', userDataDir)
    } catch (error) {
        console.warn('Browser session cleanup failed:', error)
    }
}

export async function openBrowser(
    lowResolution: boolean,
    slowMo: boolean = false,
): Promise<{ browser: BrowserContext; backgroundPage: Page }> {
    if (lowResolution) {
        RESOLUTION = P480
    }

    const pathToExtension = join(
        __dirname,
        '..',
        '..',
        'chrome_extension',
        'dist',
    )
    console.log('Path to Extension : ', pathToExtension)

    const width = RESOLUTION.width
    const height = RESOLUTION.height

    // Get unique browser profile and audio device from environment
    const botInstanceId = process.env.BOT_INSTANCE_ID || 'default'
    const audioDevice = process.env.BOT_AUDIO_DEVICE || 'default'
    const userDataDir = process.env.BOT_BROWSER_PROFILE || USER_DATA_DIR
    
    console.log(`🤖 Browser config for bot instance: ${botInstanceId}`)
    console.log(`🔊 Using audio device: ${audioDevice}`)
    console.log(`🌐 Using profile directory: ${userDataDir}`)

    try {
        console.log('Launching persistent context...')

        // Check that extension path exists
        const fs = require('fs')
        if (!fs.existsSync(pathToExtension)) {
            console.error(`Extension path does not exist: ${pathToExtension}`)
            throw new Error('Extension path not found')
        }

        // Create unique user data directory
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true })
        }

        // Clean up any existing browser session
        await cleanupBrowserSession(userDataDir)

        const context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            viewport: { width, height },
            args: [
                // Security configurations
                '--no-sandbox',
                '--disable-setuid-sandbox',
                
                // Chrome extension configuration
                `--disable-extensions-except=${pathToExtension}`,
                `--load-extension=${pathToExtension}`,
                `--allowlisted-extension-id=${EXTENSION_ID}`,
                
                // Audio device isolation (if not default)
                ...(audioDevice !== 'default' ? [
                    `--force-device-scale-factor=1`,
                    `--audio-buffer-size=2048`,
                    `--disable-features=AudioServiceOutOfProcess`,
                ] : []),
                
                // WebRTC optimizations
                '--disable-rtc-smoothness-algorithm',
                '--disable-webrtc-hw-decoding',
                '--disable-webrtc-hw-encoding',
                '--autoplay-policy=no-user-gesture-required',
                
                // Performance optimizations
                '--disable-blink-features=AutomationControlled',
                '--disable-background-timer-throttling',
                '--enable-features=SharedArrayBuffer',
                '--memory-pressure-off',
                '--max_old_space_size=4096',
                '--disable-background-networking',
                '--disable-features=TranslateUI',
                '--disable-features=AutofillServerCommunication',
                '--disable-component-extensions-with-background-pages',
                '--disable-default-apps',
                '--renderer-process-limit=4',
                '--disable-ipc-flooding-protection',
                '--aggressive-cache-discard',
                '--disable-features=MediaRouter',
                
                // Certificate and security optimizations
                '--ignore-certificate-errors',
                '--allow-insecure-localhost',
            ],
            slowMo: slowMo ? 100 : undefined,
            permissions: ['microphone', 'camera'],
            ignoreHTTPSErrors: true,
            acceptDownloads: true,
            bypassCSP: true,
            timeout: 120000, // 2 minutes
        })

        console.log('Waiting for background page...')
        let backgroundPage = null
        let retryCount = 0
        const maxRetries = 3
        
        while (retryCount < maxRetries) {
            // Check if a background page already exists
            const existingBackgroundPages = context.backgroundPages()
            if (existingBackgroundPages.length > 0) {
                backgroundPage = existingBackgroundPages[0]
                console.log('Found existing background page')
            } else {
                // Wait with explicit timeout
                console.log('No background page found, waiting for event...')
                try {
                    backgroundPage = await Promise.race([
                        context.waitForEvent('backgroundpage'),
                        new Promise((_, reject) =>
                            setTimeout(
                                () => reject(new Error('Background page timeout')),
                                60000,
                            ),
                        ),
                    ])
                } catch (timeoutError) {
                    console.error('Timeout waiting for background page:', timeoutError)
                    retryCount++
                    if (retryCount < maxRetries) {
                        console.log(`Retrying background page initialization (${retryCount}/${maxRetries})...`)
                        await new Promise(resolve => setTimeout(resolve, 2000))
                        continue
                    }
                    throw timeoutError
                }
            }

            // Verify extension initialization
            const initialized = await verifyExtensionInitialization(backgroundPage)
            if (initialized) {
                console.log('Background page found and verified')
                return { browser: context, backgroundPage }
            }

            retryCount++
            if (retryCount < maxRetries) {
                console.log(`Extension verification failed, retrying (${retryCount}/${maxRetries})...`)
                await new Promise(resolve => setTimeout(resolve, 2000))
                continue
            }
        }

        throw new Error('Could not verify extension initialization after multiple retries')
    } catch (error) {
        console.error('Failed to open browser:', {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            error: error
        })
        throw error
    }
}
