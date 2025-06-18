import { BrowserContext, chromium, Page } from '@playwright/test'

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

export async function openBrowser(
    lowResolution: boolean,
    slowMo: boolean = false,
): Promise<{ browser: BrowserContext; backgroundPage: Page }> {
    if (lowResolution) {
        RESOLUTION = P480
    }

    const width = RESOLUTION.width
    const height = RESOLUTION.height

    try {
        console.log('Launching persistent context with exact extension args...')

        const context = await chromium.launchPersistentContext('', {
            headless: false,
            viewport: { width, height },
            args: [
                '--no-sandbox',
                '--disable-rtc-smoothness-algorithm',
                '--disable-webrtc-hw-decoding',
                '--disable-webrtc-hw-encoding',
                '--disable-blink-features=AutomationControlled',
                '--disable-setuid-sandbox',
                '--autoplay-policy=no-user-gesture-required',
                '--disable-background-timer-throttling',
                '--enable-features=SharedArrayBuffer',
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

        console.log('Creating main page for meeting interaction...')
        
        // Create a main page for meeting interaction
        const mainPage = await context.newPage()
        
        console.log('Browser launched successfully')
        
        return { browser: context, backgroundPage: mainPage }
        
    } catch (error) {
        console.error('Failed to open browser:', error)
        throw error
    }
}
