import { RecordingMode, sleep } from '../api'

export async function removeInitialShityHtml(mode: RecordingMode) {
    // console.log('[Teams] Starting removeInitialShityHtml', { mode })
    await sleep(1000)
    const documentRoot = getDocumentRoot()
    try {
        const meetingControls = documentRoot.querySelectorAll(
            `div[data-tid="app-layout-area--header"]`,
        )

        if (meetingControls[0] instanceof HTMLElement) {
            meetingControls[0].style.opacity = '0'
            // console.log('[Teams] Meeting controls hidden')
        }
    } catch (e) {
        // console.error('[Teams] Failed to remove buttons header', e)
    }

    try {
        const style = documentRoot.createElement('style')
        documentRoot.head.appendChild(style)
        const sheet = style.sheet

        sheet?.insertRule(
            `
        [data-tid="voice-level-stream-outline"]::before {
          border: 0px solid rgb(127, 133, 245);
        }
      `,
            sheet.cssRules.length,
        )
        // console.log('[Teams] Voice level stream outline style added')
    } catch (e) {
        // console.error('[Teams] Error in insert before style', e)
    }
    // Add for new interface
    try {
        const mainArea = documentRoot.querySelector(
            'div[data-tid="app-layout-area--main"]',
        )

        if (mainArea instanceof HTMLElement) {
            mainArea.style.height = '100vh'
            mainArea.style.width = '100vw'
        }
    } catch (e) {
        // console.error('[Teams] Failed to modify main area', e)
    }
}

export function removeShityHtml(mode: RecordingMode) {
    // console.log('[Teams] Starting removeShityHtml', { mode })
    const documentRoot = getDocumentRoot()
    try {
        const menus = documentRoot.querySelectorAll('[role="menu"]')
        const menu = menus[0] || menus
        if (menu instanceof HTMLElement) {
            menu.style.position = 'fixed'
            menu.style.top = '0'
            menu.style.left = '0'
            menu.style.width = '100vw'
            menu.style.height = '100vh'
            menu.style.zIndex = '9999'
            menu.style.backgroundColor = 'black'
            console.log('[Teams] Menu element hidden')
        }
    } catch (e) {
        // console.error('[Teams] Error in remove shitty html', e)
    }

    try {
        let hiddenDivs = 0
        documentRoot.querySelectorAll('div').forEach((div) => {
            if (div.clientHeight === 137 && div.clientWidth === 245) {
                div.style.opacity = '0'
                hiddenDivs++
            }
        })
        // console.log('Teams] Hidden', hiddenDivs, 'additional elements')
    } catch (e) {
        // console.error('[Teams] Error in remove additional elements', e)
    }

    try {
        const mainArea = documentRoot.querySelector(
            'div[data-tid="app-layout-area--main"]',
        )

        if (mainArea instanceof HTMLElement) {
            mainArea.style.height = '100vh'
            mainArea.style.width = '100vw'
        }
    } catch (e) {
        // console.error('[Teams] Failed to modify main area', e)
    }
}

function getDocumentRoot(): Document {
    for (let iframe of document.querySelectorAll('iframe')) {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document
            if (doc) {
                // console.log('[Teams] Document root found in iframe')
                return doc
            }
        } catch (e) {
            // console.warn('[Teams] Error accessing iframe content', e)
        }
    }
    // console.log('[Teams] Using main document as root')
    return document
}
