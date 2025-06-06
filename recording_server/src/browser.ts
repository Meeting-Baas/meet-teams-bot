import { BrowserContext, chromium, Page } from '@playwright/test'
import { join } from 'path'

// const EXTENSION_NAME = 'spoke'
const EXTENSION_ID = 'eahilodcoaonodbfiijhpmfnddkfhmbl'
const USER_DATA_DIR = '/tmp/test-user-data-dir'

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
export async function openBrowser(
    // useChromium: boolean,
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

    try {
        console.log('Launching persistent context...')

        // Check that extension path exists
        const fs = require('fs')
        if (!fs.existsSync(pathToExtension)) {
            console.error(`Extension path does not exist: ${pathToExtension}`)
            throw new Error('Extension path not found')
        }

        const context = await chromium.launchPersistentContext('', {
            headless: false,
            viewport: { width, height },
            args: [
                // Security configurations
                '--no-sandbox',
                '--disable-setuid-sandbox',
                
                // Chrome extension configuration (required for recording functionality)
                `--disable-extensions-except=${pathToExtension}`,
                `--load-extension=${pathToExtension}`,
                `--allowlisted-extension-id=${EXTENSION_ID}`,
                
                // WebRTC optimizations (required for meeting audio/video capture)
                '--disable-rtc-smoothness-algorithm',
                '--disable-webrtc-hw-decoding',
                '--disable-webrtc-hw-encoding',
                '--autoplay-policy=no-user-gesture-required',
                
                // Performance and resource management optimizations
                '--disable-blink-features=AutomationControlled',
                '--disable-background-timer-throttling',
                '--enable-features=SharedArrayBuffer',
                '--memory-pressure-off',              // Disable memory pressure handling for consistent performance
                '--max_old_space_size=4096',          // Increase V8 heap size to 4GB for large meetings
                '--disable-background-networking',    // Reduce background network activity
                '--disable-features=TranslateUI',     // Disable translation features to save resources
                '--disable-features=AutofillServerCommunication', // Disable autofill to reduce network usage
                '--disable-component-extensions-with-background-pages', // Reduce background extension overhead
                '--disable-default-apps',             // Disable default Chrome apps
                '--renderer-process-limit=4',         // Limit renderer processes to prevent resource exhaustion
                '--disable-ipc-flooding-protection',  // Improve IPC performance for high-frequency operations
                '--aggressive-cache-discard',         // Enable aggressive cache management for memory efficiency
                '--disable-features=MediaRouter',     // Disable media router for reduced overhead
                
                // Certificate and security optimizations for meeting platforms
                '--ignore-certificate-errors',
                '--allow-insecure-localhost',
                '--disable-blink-features=TrustedDOMTypes',
                '--disable-features=TrustedScriptTypes',
                '--disable-features=TrustedHTML',
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
                console.error(
                    'Timeout waiting for background page:',
                    timeoutError,
                )
                // Essayer de forcer le chargement de l'extension
                await context.newPage().then((page) => page.close())
                // Réessayer de trouver la page d'arrière-plan
                const retryBackgroundPages = context.backgroundPages()
                if (retryBackgroundPages.length > 0) {
                    backgroundPage = retryBackgroundPages[0]
                    console.log('Found background page after retry')
                }
            }
        }

        if (!backgroundPage) {
            throw new Error('Could not find extension background page')
        }

        console.log('Background page found')
        return { browser: context, backgroundPage }
    } catch (error) {
        console.error('Failed to open browser:', error)
        throw error
    }
}
