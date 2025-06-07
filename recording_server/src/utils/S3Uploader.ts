import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import * as path from 'path'
import * as fs from 'fs'

// Singleton instance
let instance: S3Uploader | null = null

export class S3Uploader extends EventEmitter {
    private environment: string
    private defaultBucketName: string

    private constructor() {
        super()
        this.environment = process.env.ENVIRON || 'local'
        this.defaultBucketName = this.environment === 'preprod' 
            ? 'preprod-meeting-baas-logs' 
            : 'meeting-baas-logs'
    }

    public static getInstance(): S3Uploader {
        if (process.env.SERVERLESS === 'true') {
            console.log('Skipping S3 uploader - serverless mode')
            return null
        }

        if (!instance) {
            instance = new S3Uploader()
        }
        return instance
    }

    private async checkFileExists(filePath: string): Promise<void> {
        try {
            await fs.promises.access(filePath, fs.constants.F_OK)
        } catch (error) {
            throw new Error(`File does not exist: ${filePath}`)
        }
    }

    public async uploadFile(
        filePath: string,
        bucketName: string,
        s3Path: string,
        isAudio: boolean = false,
    ): Promise<string> {
        if (process.env.SERVERLESS === 'true') {
            console.log('Skipping S3 upload - serverless mode')
            return Promise.resolve('')
        }

        try {
            await this.checkFileExists(filePath)
            
            const s3FullPath = `s3://${bucketName}/${s3Path}`
            const s3Args: string[] = []

            if (!isAudio && process.env.S3_ARGS) {
                s3Args.push(...process.env.S3_ARGS.split(' '))
            }

            s3Args.push(
                's3',
                'cp',
                filePath,
                s3FullPath,
                '--acl',
                'public-read',
            )

            return new Promise((resolve, reject) => {
                const awsProcess = spawn('aws', s3Args)
                let output = ''
                let errorOutput = ''

                awsProcess.stdout.on('data', (data) => {
                    output += data.toString()
                    this.emit('progress', data.toString())
                })

                awsProcess.stderr.on('data', (data) => {
                    errorOutput += data.toString()
                    this.emit('error', data.toString())
                })

                awsProcess.on('error', (error) => {
                    this.emit('error', `Failed to start AWS CLI process: ${error.message}`)
                    reject(new Error(`AWS CLI process failed to start: ${error.message}`))
                })

                awsProcess.on('close', (code) => {
                    if (code === 0) {
                        const publicUrl = `https://${bucketName}.s3.amazonaws.com/${s3Path}`
                        resolve(publicUrl)
                    } else {
                        const errorMessage = `S3 upload failed (${code}): ${errorOutput || output}`
                        this.emit('error', errorMessage)
                        reject(new Error(errorMessage))
                    }
                })
            })
        } catch (error: any) {
            this.emit('error', error.message)
            throw error
        }
    }

    public async uploadToDefaultBucket(
        filePath: string,
        s3Path: string,
    ): Promise<string> {
        if (process.env.SERVERLESS === 'true') {
            console.log('Skipping S3 upload - serverless mode')
            return Promise.resolve('')
        }

        try {
            return await this.uploadFile(filePath, this.defaultBucketName, s3Path)
        } catch (error: any) {
            this.emit('error', `Failed to upload to default bucket: ${error.message}`)
            throw error
        }
    }

    public async uploadDirectory(
        localDir: string,
        bucketName: string,
        s3Prefix: string,
    ): Promise<string[]> {
        try {
            await this.checkFileExists(localDir)
            const files = await fs.promises.readdir(localDir)
            const uploadPromises: Promise<string>[] = []

            for (const file of files) {
                const localPath = path.join(localDir, file)
                const stats = await fs.promises.stat(localPath)
                
                if (stats.isFile()) {
                    const s3Path = `${s3Prefix}/${file}`
                    uploadPromises.push(
                        this.uploadFile(localPath, bucketName, s3Path)
                            .catch((error: any) => {
                                this.emit('error', `Failed to upload file ${file}: ${error.message}`)
                                return null
                            })
                    )
                }
            }

            const results = await Promise.all(uploadPromises)
            return results.filter((result): result is string => result !== null)
        } catch (error: any) {
            this.emit('error', `Failed to upload directory: ${error.message}`)
            throw error
        }
    }
}

// Export utility functions that use the singleton instance
export const s3cp = (local: string, s3path: string): Promise<string> => 
    S3Uploader.getInstance().uploadToDefaultBucket(local, s3path)

export const s3cpToBucket = (local: string, bucketName: string, s3path: string): Promise<string> => 
    S3Uploader.getInstance().uploadFile(local, bucketName, s3path)

export const s3cpDirectory = (localDir: string, bucketName: string, s3Prefix: string): Promise<string[]> => 
    S3Uploader.getInstance().uploadDirectory(localDir, bucketName, s3Prefix)
