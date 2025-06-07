import { BrowserContext, Page } from '@playwright/test'

import {
    JoinError,
    JoinErrorCode,
    MeetingParams,
    MeetingProviderInterface,
} from '../types'

import { parseMeetingUrlFromJoinInfos } from '../urlParser/teamsUrlParser'
import { sleep } from '../utils'
import { takeScreenshot } from '../utils/takeScreenshot'

export class TeamsProvider implements MeetingProviderInterface {
    constructor() {}
    async parseMeetingUrl(meeting_url: string) {
        return parseMeetingUrlFromJoinInfos(meeting_url)
    }
    getMeetingLink(
        meeting_id: string,
        _password: string,
        _role: number,
        _bot_name: string,
    ) {
        return meeting_id
    }

    async openMeetingPage(
        browserContext: BrowserContext,
        link: string,
        streaming_input: string | undefined,
    ): Promise<Page> {
        const url = new URL(link)
        const page = await browserContext.newPage()
        let attempts = 0
        const maxAttempts = 10

        page.setDefaultTimeout(30000)
        page.setDefaultNavigationTimeout(30000)

        // Set permissions based on streaming_input
        if (streaming_input) {
            await browserContext.grantPermissions(['microphone', 'camera'], {
                origin: url.origin,
            })
        } else {
            await browserContext.grantPermissions(['camera'], {
                origin: url.origin,
            })
        }

        try {
            console.log('loading page')
            await page.goto(link, {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            })
            console.log('page loaded')
            await Promise.race([
                page
                    .getByRole('button', { name: 'Join now' })
                    .waitFor({ timeout: 30000 }),
                page
                    .getByRole('button', {
                        name: 'Continue without audio or video',
                    })
                    .waitFor({ timeout: 30000 }),
            ]).catch(() => {
                console.log('Initial button wait timed out, continuing anyway')
            })
            const currentUrl = await page.url()
            const isLightInterface: boolean =
                currentUrl.includes('light-meetings')

            if (isLightInterface === true) {
                await page.close()
                console.log(
                    'light interface  🥕🥕🥕🥕🥕🥕 , closing page and retrying attempt : ',
                    attempts,
                )
                await sleep(1000)
                attempts++
                if (attempts < maxAttempts) {
                    return await this.openMeetingPage(
                        browserContext,
                        link,
                        streaming_input,
                    )
                } else {
                    throw new Error('Failed to load meeting page')
                }
            }

            console.log('page loaded 2')

            return page
        } catch (error) {
            console.error('Error in openMeetingPage:', error)
            throw error
        }
    }

    async joinMeeting(
        page: Page,
        cancelCheck: () => boolean,
        meetingParams: MeetingParams,
    ): Promise<void> {
        console.log('joining meeting', cancelCheck)

        try {
            await ensurePageLoaded(page)
        } catch (error) {
            console.error('Page load failed:', error)
            throw new Error('Page failed to load - retrying')
        }

        try {
            await this.clickJoinButton(page, meetingParams)
        } catch (e) {
            console.error('Failed to click join button:', e)
            throw e
        }

        await takeScreenshot(page, 'afterjoinnow')

        // Attendre d'être dans le meeting
        console.log('Waiting to confirm meeting join...');
        let inMeeting = false;

        while (!inMeeting) {
            // Vérifier si on a été refusé
            const botNotAccepted = await isBotNotAccepted(page)
            if (botNotAccepted) {
                throw new JoinError(JoinErrorCode.BotNotAccepted)
            }

            // Vérifier si on doit annuler
            if (cancelCheck()) {
                throw new JoinError(JoinErrorCode.ApiRequest)
            }

            // Vérifier si on est dans le meeting (plusieurs indicateurs)
            inMeeting = await isInTeamsMeeting(page);
            
            if (!inMeeting) {
                await sleep(1000)
            }
        }

        console.log('Successfully confirmed we are in the meeting');

        // Une fois dans le meeting, configurer la vue
        try {
            if (await clickWithInnerText(page, 'button', 'View', 10, false)) {
                if (meetingParams.recording_mode !== 'gallery_view') {
                    await clickWithInnerText(page, 'button', 'View', 10)
                    await clickWithInnerText(page, 'div', 'Speaker', 20)
                }
            }
        } catch (e) {
            console.error('Error handling "View" or "Speaker" mode:', e)
        }
    }

    async findEndMeeting(
        _meetingParams: MeetingParams,
        page: Page,
    ): Promise<boolean> {
        return await isRemovedFromTheMeeting(page)
    }

    async closeMeeting(page: Page): Promise<void> {
        console.log('Attempting to leave the meeting')
        try {
            // Try multiple approaches to find and click the leave button

            // Approach 1: Try to find by aria-label
            // const leaveButton = page.locator('button[aria-label="Leave (⌘+Shift+H)"], button[aria-label*="Leave"]')
            // if (await leaveButton.count() > 0) {
            //     await leaveButton.click()
            //     console.log('Clicked leave button by aria-label')
            //     return
            // }

            // // Approach 2: Try to find by data-tid attribute
            // const hangupButton = page.locator('button[data-tid="hangup-main-btn"]')
            // if (await hangupButton.count() > 0) {
            //     await hangupButton.click()
            //     console.log('Clicked leave button by data-tid')
            //     return
            // }

            // Approach 3: Try to find by text content
            if (await clickWithInnerText(page, 'button', 'Leave', 5, true)) {
                console.log('Clicked leave button by text content')
                return
            }

            // Approach 4: Try to find by role and name
            const leaveByRole = page.getByRole('button', { name: 'Leave' })
            if ((await leaveByRole.count()) > 0) {
                await leaveByRole.click()
                console.log('Clicked leave button by role and name')
                return
            }

            console.log('Could not find leave button, closing page instead')
        } catch (error) {
            console.error('Error while trying to leave meeting:', error)
        }
    }

    async clickJoinButton(
        page: Page,
        meetingParams: MeetingParams
    ): Promise<void> {
        await ensurePageLoaded(page);

        // Try to find and click "Continue on this browser" for up to 30 seconds
        const maxAttempts = 30;
        const attemptInterval = 1000;
        for (let i = 0; i < maxAttempts; i++) {
            const continueOnBrowserExists = await clickWithInnerText(
                page,
                'button',
                'Continue on this browser',
                1,
                true,
            );
            if (continueOnBrowserExists) {
                console.log('Clicked "Continue on this browser" button');
                break;
            }
            // Check if we've already moved past this screen by looking for other buttons
            const joinNowExists = await clickWithInnerText(
                page,
                'button',
                'Join now',
                1,
                false,
            );
            const continueWithoutAudioExists = await clickWithInnerText(
                page,
                'button',
                'Continue without audio or video',
                1,
                false,
            );
            if (joinNowExists) {
                console.log('Already at Join now screen, skipping "Continue on this browser"');
                break;
            }
            if (continueWithoutAudioExists) {
                console.log('Found "Continue without audio or video" button');
                await clickWithInnerText(
                    page,
                    'button',
                    'Continue without audio or video',
                    5,
                    true,
                );
                console.log('Clicked "Continue without audio or video" button');
                break;
            }
            if (i < maxAttempts - 1) {
                await sleep(attemptInterval);
            }
        }

        // Check interface type
        const currentUrl = await page.url();
        const isLightInterface = currentUrl.includes('light');
        const isLiveInterface = currentUrl.includes('live');
        console.log(
            'interface : ',
            isLightInterface
                ? 'light 🥕🥕'
                : isLiveInterface
                ? 'live 💃🏼'
                : 'old 👴🏻',
        );

        // Try to click "Join now" (first attempt, non-fatal)
        try {
            await clickWithInnerText(page, 'button', 'Join now', 100, false);
        } catch (e) {
            console.warn('Failed to find "Join now" button (first attempt):', e);
        }

        // Special handling for light interface
        if (isLightInterface) {
            try {
                await handlePermissionDialog(page);
                await activateCamera(page);

                // Control microphone based on streaming_input
                const streaming_input = meetingParams.streaming_input;
                if (streaming_input) {
                    await activateMicrophone(page);
                } else {
                    await deactivateMicrophone(page);
                }
            } catch (e) {
                console.warn(
                    'Failed to handle camera/microphone and permissions, continuing anyway:',
                    e,
                );
                await sleep(2000);
            }
        }

        // Type bot name and click join now
        try {
            await typeBotName(page, meetingParams.bot_name, 20);
            await clickWithInnerText(page, 'button', 'Join now', 20);
        } catch (e) {
            console.error(
                'Error during bot name typing or second "Join now" click:',
                e,
            );
            throw new Error('RetryableError');
        }

        await takeScreenshot(page, 'afterjoinnow');
    }
}

const INPUT_BOT = 'input[placeholder="Type your name"]'

export async function clickWithInnerText(
    page: Page,
    htmlType: string,
    innerText: string,
    iterations: number,
    click: boolean = true,
    cancelCheck?: () => boolean,
): Promise<boolean> {
    let i = 0
    let continueButton = false

    if (!(await ensurePageLoaded(page))) {
        console.error('Page is not fully loaded at the start.')
        return false
    }

    while (
        !continueButton &&
        (iterations == null || i < iterations) &&
        !cancelCheck?.()
    ) {
        try {
            if (i % 5 === 0) {
                const isPageLoaded = await ensurePageLoaded(page)
                if (!isPageLoaded) {
                    console.error('Page seems frozen or not responding.')
                    return false
                }
            }

            continueButton = await page.evaluate(
                ({ innerText, htmlType, i, click }) => {
                    let elements: Element[] = []
                    const iframes = document.querySelectorAll('iframe')

                    if (i % 2 === 0 && iframes.length > 0) {
                        const firstIframe = iframes[0]
                        try {
                            const docInIframe =
                                firstIframe.contentDocument ||
                                firstIframe.contentWindow?.document
                            if (docInIframe) {
                                elements = Array.from(
                                    docInIframe.querySelectorAll(htmlType),
                                )
                            }
                        } catch (e) {
                            console.warn('Iframe access error:', e)
                        }
                    }

                    if (elements.length === 0) {
                        elements = Array.from(
                            document.querySelectorAll(htmlType),
                        )
                    }

                    for (const elem of elements) {
                        if (elem.textContent?.trim() === innerText) {
                            if (click) {
                                ;(elem as HTMLElement).click()
                            }
                            return true
                        }
                    }
                    return false
                },
                { innerText, htmlType, i, click },
            )
        } catch (e) {
            if (i === iterations - 1) {
                console.error(`Error in clickWithInnerText (last attempt):`, e)
            }
            continueButton = false
        }

        if (!continueButton) {
            await page.waitForTimeout(100 + i * 100)
        }

        console.log(
            `${innerText} ${click ? 'clicked' : 'found'} : ${JSON.stringify(continueButton)}`,
        )
        i++
    }
    return continueButton
}

async function typeBotName(
    page: Page,
    botName: string,
    maxAttempts: number,
): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await page.waitForSelector(INPUT_BOT, { timeout: 1000 })
            const input = page.locator(INPUT_BOT)

            if ((await input.count()) > 0) {
                await input.focus()
                await input.fill(botName)

                // Verify the input value
                const currentValue = await input.inputValue()
                if (currentValue === botName) {
                    return
                }

                // If fill didn't work, try typing
                await input.clear()
                await page.keyboard.type(botName, { delay: 100 })

                if ((await input.inputValue()) === botName) {
                    return
                }
            }

            await page.waitForTimeout(500)
        } catch (e) {
            console.error(`Error typing bot name (attempt ${i + 1}):`, e)
        }
    }
    throw new Error('Failed to type bot name')
}

async function checkPageForText(page: Page, text: string): Promise<boolean> {
    try {
        const content = await page.content()
        return content.includes(text)
    } catch (error) {
        console.error('Error checking page for text:', error)
        return false
    }
}

async function isRemovedFromTheMeeting(page: Page): Promise<boolean> {
    try {
        if (!(await ensurePageLoaded(page))) {
            return true
        }

        const raiseButton = page.locator(
            'button#raisehands-button:has-text("Raise")',
        )
        const buttonExists = (await raiseButton.count()) > 0

        console.log('raiseButton', JSON.stringify(raiseButton))
        console.log('buttonExists', JSON.stringify(buttonExists))
        if (!buttonExists) {
            console.log('no raise button found, Bot removed from the meeting')
            return true
        }
        return false
    } catch (error) {
        console.error('Error while checking meeting status:', error)
        return false
    }
}

async function isBotNotAccepted(page: Page): Promise<boolean> {
    const deniedTexts = [
        'Sorry, but you were denied access to the meeting.',
        'Someone in the meeting should let you in soon',
        'Waiting to be admitted',
    ]

    for (const text of deniedTexts) {
        const found = await checkPageForText(page, text)
        if (found) {
            return true
        }
    }
    return false
}

async function handlePermissionDialog(page: Page): Promise<void> {
    console.log('handling permission dialog')
    try {
        const okButton = page.locator('button:has-text("OK")')
        if ((await okButton.count()) > 0) {
            await okButton.click()
            console.log('Permission dialog handled successfully')
        } else {
            console.log('No permission dialog found')
        }
    } catch (error) {
        console.error('Failed to handle permission dialog:', error)
    }
}

async function activateCamera(page: Page): Promise<void> {
    console.log('activating camera')
    try {
        // Essayer d'abord l'interface normale de Teams
        const cameraOffText = page.locator('text="Your camera is turned off"')
        if ((await cameraOffText.count()) > 0) {
            const cameraButton = page.locator('button[title="Turn camera on"]')
            if ((await cameraButton.count()) > 0) {
                await cameraButton.click()
                console.log(
                    'Camera button clicked successfully (normal interface)',
                )
                await sleep(500)
                return
            } else {
                console.log(
                    'Camera button not found in normal interface, trying light interface',
                )
            }
        }

        // Essayer l'interface light de Teams
        const lightCameraButton = page.locator(
            '[data-tid="toggle-video"][aria-checked="false"], [aria-label="Camera"][aria-checked="false"]',
        )
        if ((await lightCameraButton.count()) > 0) {
            await lightCameraButton.click()
            console.log('Camera button clicked successfully (light interface)')
            await sleep(500)
            return
        } else {
            console.log(
                'Camera is already on or button not found in both interfaces',
            )
        }
    } catch (error) {
        console.error('Failed to activate camera:', error)
    }
}

async function activateMicrophone(page: Page): Promise<void> {
    console.log('activating microphone')
    try {
        const micOffText = page.locator('text="Your microphone is muted"')
        if ((await micOffText.count()) > 0) {
            const micButton = page.locator('button[title="Unmute"]')
            if ((await micButton.count()) > 0) {
                await micButton.click()
                console.log('Microphone unmuted successfully')
                await sleep(500)
            } else {
                console.log('Failed to find unmute button')
            }
        } else {
            console.log('Microphone is already on or text not found')
        }
    } catch (error) {
        console.error('Failed to activate microphone:', error)
    }
}

async function deactivateMicrophone(page: Page): Promise<void> {
    console.log('deactivating microphone')
    try {
        const micOnText = page.locator('text="Your microphone is on"')
        if ((await micOnText.count()) > 0) {
            const micButton = page.locator('button[title="Mute"]')
            if ((await micButton.count()) > 0) {
                await micButton.click()
                console.log('Microphone muted successfully')
                await sleep(500)
            } else {
                console.log('Failed to find mute button')
            }
        } else {
            console.log('Microphone is already muted or text not found')
        }
    } catch (error) {
        console.error('Failed to deactivate microphone:', error)
    }
}

async function ensurePageLoaded(page: Page, timeout = 20000): Promise<boolean> {
    try {
        await page.waitForFunction(() => document.readyState === 'complete', {
            timeout: timeout,
        })
        return true
    } catch (error) {
        console.error('Failed to ensure page is loaded:', error)
        throw new Error('RetryableError: Page load timeout')
    }
}

// Nouvelle fonction pour vérifier si on est dans le meeting Teams
async function isInTeamsMeeting(page: Page): Promise<boolean> {
    try {
        const indicators = [
            // Le bouton React est un bon indicateur qu'on est dans le meeting
            await clickWithInnerText(page, 'button', 'React', 1, false),
            
            // Le bouton Raise hand aussi
            await page.locator('button#raisehands-button:has-text("Raise")').isVisible(),
            
            // La présence du chat
            await page.locator('button[aria-label*="chat"], button[title*="chat"]').isVisible(),
            
            // L'absence des textes de waiting room
            !(await isBotNotAccepted(page)),
            
            // L'absence du bouton Join now (qui n'existe que dans la waiting room)
            !(await clickWithInnerText(page, 'button', 'Join now', 1, false))
        ];

        const confirmedIndicators = indicators.filter(Boolean).length;
        console.log(`Teams meeting presence indicators: ${confirmedIndicators}/5`);
        
        return confirmedIndicators >= 3;
    } catch (error) {
        console.error('Error checking if in Teams meeting:', error);
        return false;
    }
}
