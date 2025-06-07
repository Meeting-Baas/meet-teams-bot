import { BrowserContext, chromium, Page } from '@playwright/test'
import { join } from 'path'

// const EXTENSION_NAME = 'spoke'
const GOOGLE_CHROME_EXECUTABLE_PATH = 
    process.env.GOOGLE_CHROME_EXECUTABLE_PATH || 
    (process.platform === 'darwin' 
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" 
        : '/usr/bin/google-chrome')
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
        
        // Vérifier que le chemin d'extension existe
        const fs = require('fs');
        if (!fs.existsSync(pathToExtension)) {
            console.error(`Extension path does not exist: ${pathToExtension}`);
            throw new Error('Extension path not found');
        }
        
        const context = await chromium.launchPersistentContext('', {
            headless: false,
            executablePath: GOOGLE_CHROME_EXECUTABLE_PATH,
            viewport: { width, height },
            args: [
                '--no-sandbox',
                '--disable-rtc-smoothness-algorithm',
                '--disable-webrtc-hw-decoding',
                '--disable-webrtc-hw-encoding',
                '--disable-blink-features=AutomationControlled',
                '--disable-setuid-sandbox',
                `--disable-extensions-except=${pathToExtension}`,
                `--load-extension=${pathToExtension}`,
                '--autoplay-policy=no-user-gesture-required',
                '--disable-background-timer-throttling',
                '--enable-features=SharedArrayBuffer',
                `--allowlisted-extension-id=${EXTENSION_ID}`,
                // `--whitelisted-extension-id=${EXTENSION_ID}`,
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
        let backgroundPage = null;
        
        // Vérifier si une page d'arrière-plan existe déjà
        const existingBackgroundPages = context.backgroundPages();
        if (existingBackgroundPages.length > 0) {
            backgroundPage = existingBackgroundPages[0];
            console.log('Found existing background page');
        } else {
            // Attendre avec un timeout explicite
            console.log('No background page found, waiting for event...');
            try {
                backgroundPage = await Promise.race([
                    context.waitForEvent('backgroundpage'),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Background page timeout')), 60000)
                    )
                ]);
            } catch (timeoutError) {
                console.error('Timeout waiting for background page:', timeoutError);
                // Essayer de forcer le chargement de l'extension
                await context.newPage().then(page => page.close());
                // Réessayer de trouver la page d'arrière-plan
                const retryBackgroundPages = context.backgroundPages();
                if (retryBackgroundPages.length > 0) {
                    backgroundPage = retryBackgroundPages[0];
                    console.log('Found background page after retry');
                }
            }
        }

        if (!backgroundPage) {
            throw new Error('Could not find extension background page');
        }

        console.log('Background page found');
        return { browser: context, backgroundPage };
    } catch (error) {
        console.error('Failed to open browser:', error);
        throw error;
    }
}
