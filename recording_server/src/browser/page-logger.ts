import { Page } from '@playwright/test'

// Liste des URL à ignorer pour les erreurs
const IGNORED_URLS = [
    'api.flightproxy.teams.microsoft.com',
    'broker.skype.com',
    'meet.google.com/$rpc/google.rtc.meetings.v1.MeetingDeviceService/UpdateMeetingDevice',
]

// Liste des erreurs à ignorer
const IGNORED_ERRORS = [
    'net::ERR_ABORTED',
    'Unhandled error/rejection {"isTrusted":true}',
]

const formatValue = (value: any): string => {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value, null, 2)
        } catch (e) {
            return String(value)
        }
    }
    return String(value)
}

const shouldIgnoreError = (url: string, errorText?: string): boolean => {
    if (IGNORED_URLS.some((ignoredUrl) => url.includes(ignoredUrl))) {
        return true
    }
    if (
        errorText &&
        IGNORED_ERRORS.some((ignoredError) => errorText.includes(ignoredError))
    ) {
        return true
    }
    return false
}

export function listenPage(page: Page) {
    page.on('console', async (message) => {
        try {
            const text = message.text()
            const location = message.location()

            // Ignorer les messages si l'URL est dans la liste IGNORED_URLS
            if (shouldIgnoreError(location.url)) {
                return
            }

            // Ignorer certains messages d'erreur connus
            if (IGNORED_ERRORS.some((err) => text.includes(err))) {
                return
            }

            const args = await Promise.all(
                message.args().map(async (arg) => {
                    try {
                        const value = await arg.jsonValue()
                        return formatValue(value)
                    } catch {
                        return 'Unable to serialize value'
                    }
                }),
            )

            const type = message.type().substr(0, 3).toUpperCase()
            const tags = `${location.url}:${location.lineNumber}`
            const formattedText = args.length === 1 ? args[0] : args.join(' ')

            switch (type) {
                case 'LOG':
                    console.log(`${tags}\n${formattedText}`)
                    break
                case 'WAR':
                    console.log(
                        '\x1b[38;5;214m%s\x1b[0m',
                        `${tags}\n${formattedText}`,
                    )
                    break
                case 'ERR':
                    console.log(
                        '\x1b[31m%s\x1b[0m',
                        `${tags}\n${formattedText}`,
                    )
                    break
                case 'INF':
                    console.log(
                        '\x1b[32m%s\x1b[0m',
                        `${tags}\n${formattedText}`,
                    )
                    break
                default:
                    console.log(
                        `DEFAULT CASE ${type} ! ${tags}\n${formattedText}`,
                    )
            }
        } catch (e) {
            console.log(`Failed to log forward logs: ${e}`)
        }
    })

    // Écouter les erreurs de page
    page.on('pageerror', (error) => {
        if (!shouldIgnoreError(page.url(), error.message)) {
            console.error(`Page Error:`, error)
        }
    })

    // Écouter les requêtes qui échouent
    page.on('requestfailed', (request) => {
        const failure = request.failure()
        const url = request.url()
        if (!shouldIgnoreError(url, failure?.errorText)) {
            console.error(
                `Request Failed: ${url}`,
                failure ? `\nReason: ${failure.errorText}` : '',
            )
        }
    })
}

export function removeListenPage(page: Page) {
    page.removeListener('console', () => {})
}
