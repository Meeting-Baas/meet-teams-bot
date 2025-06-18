import { Page } from '@playwright/test'
import { clickWithInnerText } from '../teams'

export async function closeMeeting(page: Page): Promise<void> {
    console.log('Attempting to leave the meeting')
    try {
        // Approach 1: Try to find by text content
        if (await clickWithInnerText(page, 'button', 'Leave', 5, true)) {
            console.log('Clicked leave button by text content')
            return
        }

        // Approach 2: Try to find by role and name
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
