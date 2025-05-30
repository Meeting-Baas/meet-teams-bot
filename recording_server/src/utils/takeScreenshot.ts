import { Page } from '@playwright/test'
import { promises as fs } from 'fs'
import * as path from 'path'
import sharp from 'sharp'
import { PathManager } from '../utils/PathManager'
import { s3cp } from './S3Uploader'

export async function takeScreenshot(page: Page, name: string) {
    try {
        const pathManager = PathManager.getInstance()
        const timestamp = Date.now()

        // Disable CSS animations before capturing
        await page.addStyleTag({
            content: `
                *, *::before, *::after {
                    animation: none !important;
                    transition: none !important;
                }
            `,
        })

        // Chemin temporaire pour le screenshot non compressé
        const tempScreenshotPath = path.join(
            pathManager.getBasePath(),
            `temp_${timestamp}_${name.replaceAll('/', '')}.png`,
        )

        // Chemin final pour le screenshot compressé
        const finalScreenshotPath = path.join(
            pathManager.getBasePath(),
            `${timestamp}_${name.replaceAll('/', '')}.png`,
        )

        // Prendre la capture d'écran avec Playwright
        await page.screenshot({
            path: tempScreenshotPath,
            timeout: 5000,
            animations: 'disabled',
            scale: 'css',
            fullPage: true,
        })

        // Compresser l'image avec sharp
        await sharp(tempScreenshotPath)
            .png({
                quality: 80,
                compressionLevel: 8,
            })
            .toFile(finalScreenshotPath)

        // Supprimer le fichier temporaire
        await fs.unlink(tempScreenshotPath).catch(() => {})

        if (process.env.SERVERLESS !== 'true') {
            // Obtenir les chemins S3 depuis PathManager
            const { bucketName, s3Path } = pathManager.getS3Paths()
            const s3FilePath = `${s3Path}/${timestamp}_${name.replaceAll('/', '')}.png`

            // Upload vers S3
            await s3cp(finalScreenshotPath, s3FilePath).catch((e) => {
                console.error(`Failed to upload screenshot to s3: ${e}`)
            })
        }
    } catch (e) {
        console.error(`Failed to take screenshot: ${e}`)
    }
}
