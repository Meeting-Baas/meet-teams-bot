import * as fs from 'fs/promises'
import * as path from 'path'

const EFS_MOUNT_POINT = process.env.EFS_MOUNT_POINT || '/mnt/efs'

export class PathManager {
    private static instance: PathManager
    private environment: string
    private botUuid: string | null
    private secret: string | null

    private constructor() {
        this.environment = process.env.ENVIRON || 'dev'
        this.botUuid = null
        this.secret = null
        console.log('ENVIRON:', this.environment)
    }

    public static getInstance(botUuid?: string, secret?: string): PathManager {
        if (!PathManager.instance) {
            PathManager.instance = new PathManager()
        }
        if (botUuid) {
            PathManager.instance.setBotUuid(botUuid)
        }
        if (secret) {
            PathManager.instance.setSecret(secret)
        }
        return PathManager.instance
    }

    public setBotUuid(botUuid: string): void {
        this.botUuid = botUuid
    }

    public setSecret(secret: string): void {
        this.secret = secret
    }

    private ensureBotUuid(): void {
        if (!this.botUuid) {
            throw new Error(
                'botUuid must be set before using PathManager methods',
            )
        }
    }

    private ensureSecret(): void {
        if (!this.secret) {
            throw new Error(
                'secret must be set before using PathManager methods',
            )
        }
    }

    public async initializePaths(): Promise<void> {
        const basePath = this.getBasePath()
        await fs.mkdir(basePath, { recursive: true }).catch((e) => {
            console.error('Unable to create base directory:', e)
            throw e
        })
    }

    public getBotUuid(): string {
        return this.botUuid
    }

    public getIdentifier(): string {
        this.ensureBotUuid()
        this.ensureSecret()
        return `${this.secret}-${this.botUuid}`
    }

    public getBasePath(): string {
        const identifier = this.botUuid
        switch (this.environment) {
            case 'prod':
                return path.join(EFS_MOUNT_POINT, 'prod', identifier)
            case 'preprod':
                return path.join(EFS_MOUNT_POINT, 'preprod', identifier)
            default:
                return path.join('./data', identifier)
        }
    }

    public getWebmPath(): string {
        const basePath = path.join(this.getBasePath(), 'temp')
        const filePath = path.join(basePath, 'output.webm')

        console.log('Generated WebM path:', {
            basePath,
            filePath,
        })

        return filePath
    }

    public getOutputPath(): string {
        return path.join(this.getBasePath(), 'output')
    }

    public getAudioTmpPath(): string {
        return path.join(this.getBasePath(), 'audio_tmp')
    }

    public getLogPath(): string {
        return path.join(this.getBasePath(), 'logs.log')
    }

    public getSpeakerLogPath(): string {
        return path.join(this.getBasePath(), 'SeparationSpeakerLog.txt')
    }

    public getSoundLogPath(): string {
        return path.join(this.getBasePath(), 'sound_levels.log')
    }

    public getTempPath(): string {
        return path.join(this.getBasePath(), 'temp')
    }

    public getMachineLogPath(): string {
        return path.join(this.getBasePath(), 'machine.log')
    }

    public async ensureDirectories(): Promise<void> {
        const paths = [
            this.getBasePath(),
            path.dirname(this.getOutputPath()),
            this.getTempPath(),
            this.getAudioTmpPath(),
        ]

        for (const p of paths) {
            await fs.mkdir(p, { recursive: true })
            console.log(`Created directory: ${p}`)
        }
    }

    public async moveFile(sourcePath: string, destPath: string): Promise<void> {
        try {
            // Vérifier que le fichier source existe
            await fs.access(sourcePath)

            // Créer le dossier de destination si nécessaire
            await fs.mkdir(path.dirname(destPath), { recursive: true })

            // Si le fichier de destination existe déjà, le supprimer
            try {
                await fs.unlink(destPath)
            } catch (e) {
                // Ignore si le fichier n'existe pas
            }

            // Déplacer le fichier
            await fs.rename(sourcePath, destPath)

            console.log(
                `File moved successfully from ${sourcePath} to ${destPath}`,
            )
        } catch (error) {
            console.error('Error moving file:', error)
            throw new Error(`Failed to move file: ${(error as Error).message}`)
        }
    }

    public getS3Paths(): { bucketName: string; s3Path: string } {
        this.ensureBotUuid()
        this.ensureSecret()
        const identifier = this.getIdentifier()
        return {
            bucketName: process.env.AWS_S3_VIDEO_BUCKET || '',
            s3Path: `${identifier}`,
        }
    }
}
