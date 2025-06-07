import { exec } from 'child_process'
import * as fs from 'fs'
import { promisify } from 'util'
import { logger } from './Logger'
import { PathManager } from './PathManager'
import { s3cp } from './S3Uploader'

const execAsync = promisify(exec)

interface ProcessStats {
    name: string
    pid: number
    cpu: number
    memory: number
    gpu?: number
}

interface SystemStats {
    timestamp: string
    system: {
        cpuUsage: number
        memoryUsed: number
        memoryTotal: number
        memoryPercent: number
        gpuUsage?: number
        gpuMemoryUsed?: number
        gpuMemoryTotal?: number
    }
    processes: {
        ffmpeg: ProcessStats[]
        chrome: { count: number; cpu: number; memory: number }
        zoom: ProcessStats[]
    }
}

class SystemMonitor {
    private monitorInterval: NodeJS.Timeout | null = null
    private logPath: string
    private botUuid: string
    private secret: string

    constructor(botUuid: string, secret: string) {
        this.botUuid = botUuid
        this.secret = secret
        const pathManager = PathManager.getInstance(botUuid, secret)
        this.logPath = pathManager.getMachineLogPath()
    }

    async getSystemCpuUsage(): Promise<number> {
        try {
            const { stdout } = await execAsync(
                "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1",
            )
            return parseFloat(stdout.trim()) || 0
        } catch {
            return 0
        }
    }

    async getSystemMemory(): Promise<{
        used: number
        total: number
        percent: number
    }> {
        try {
            const { stdout } = await execAsync("free -m | grep '^Mem:'")
            const parts = stdout.trim().split(/\s+/)
            const total = parseInt(parts[1])
            const used = parseInt(parts[2])
            return {
                used,
                total,
                percent: Math.round((used / total) * 100),
            }
        } catch {
            return { used: 0, total: 8192, percent: 0 }
        }
    }

    async getGpuUsage(): Promise<{
        usage?: number
        memoryUsed?: number
        memoryTotal?: number
    }> {
        try {
            const { stdout } = await execAsync(
                'nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits',
            )
            const parts = stdout.trim().split(',')
            return {
                usage: parseInt(parts[0].trim()),
                memoryUsed: parseInt(parts[1].trim()),
                memoryTotal: parseInt(parts[2].trim()),
            }
        } catch {
            try {
                const { stdout } = await execAsync(
                    "timeout 1 intel_gpu_top -s 100 -o - | tail -1 | awk '{print $4}'",
                )
                const usage = parseFloat(stdout.trim())
                return { usage: isNaN(usage) ? undefined : usage }
            } catch {
                return {}
            }
        }
    }

    async getProcessesByName(processName: string): Promise<ProcessStats[]> {
        try {
            const { stdout } = await execAsync(
                `ps aux | grep -i ${processName} | grep -v grep`,
            )
            if (!stdout.trim()) return []
            const lines = stdout.trim().split('\n')
            const processes: ProcessStats[] = []
            for (const line of lines) {
                const parts = line.split(/\s+/)
                if (parts.length >= 11) {
                    processes.push({
                        name: processName,
                        pid: parseInt(parts[1]),
                        cpu: parseFloat(parts[2]),
                        memory: parseFloat(parts[3]),
                    })
                }
            }
            return processes
        } catch {
            return []
        }
    }

    async collectStats(): Promise<SystemStats> {
        const [
            systemCpu,
            systemMemory,
            gpuStats,
            ffmpegProcesses,
            chromeProcesses,
            zoomProcesses,
        ] = await Promise.all([
            this.getSystemCpuUsage(),
            this.getSystemMemory(),
            this.getGpuUsage(),
            this.getProcessesByName('ffmpeg'),
            this.getProcessesByName('chrome'),
            this.getProcessesByName('client'),
        ])

        // Merge chrome processes into a single summary
        const chromeSummary = {
            count: chromeProcesses.length,
            cpu: chromeProcesses.reduce((sum, p) => sum + (p.cpu || 0), 0),
            memory: chromeProcesses.reduce(
                (sum, p) => sum + (p.memory || 0),
                0,
            ),
        }


        return {
            timestamp: new Date().toISOString(),
            system: {
                cpuUsage: systemCpu,
                memoryUsed: systemMemory.used,
                memoryTotal: systemMemory.total,
                memoryPercent: systemMemory.percent,
                ...(gpuStats.usage !== undefined && {
                    gpuUsage: gpuStats.usage,
                }),
                ...(gpuStats.memoryUsed !== undefined && {
                    gpuMemoryUsed: gpuStats.memoryUsed,
                }),
                ...(gpuStats.memoryTotal !== undefined && {
                    gpuMemoryTotal: gpuStats.memoryTotal,
                }),
            },
            processes: {
                ffmpeg: ffmpegProcesses,
                chrome: chromeSummary,
                zoom: zoomProcesses,
            },
        }
    }

    async logStatsToFile(): Promise<void> {
        try {
            const stats = await this.collectStats()
            await fs.promises.appendFile(
                this.logPath,
                JSON.stringify(stats) + '\n',
            )
        } catch (error: any) {
            logger.error('Error collecting stats: ' + error.message)
        }
    }

    startLogging(intervalMs: number = 1000): void {
        if (this.monitorInterval) {
            logger.info('System monitor already running')
            return
        }
        // Ensure the log file exists with a header or initial line
        if (!fs.existsSync(this.logPath)) {
            try {
                fs.writeFileSync(this.logPath, '# System Monitor Log\n')
            } catch (err) {
                logger.error('Failed to create machine.log: ' + err)
            }
        }
        logger.info(
            `Starting system monitor (interval: ${intervalMs}ms, logging to: ${this.logPath})`,
        )
        this.logStatsToFile() // Initial run
        this.monitorInterval = setInterval(() => {
            this.logStatsToFile()
        }, intervalMs)
    }

    stop(): void {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval)
            this.monitorInterval = null
            logger.info('System monitor stopped')
        }
    }

    async uploadLogToS3(): Promise<void> {
        try {
            const pathManager = PathManager.getInstance(
                this.botUuid,
                this.secret,
            )
            const s3Path = `${this.secret}-${this.botUuid}/machine.log`
            await s3cp(this.logPath, s3Path)
            logger.info(`Uploaded machine log to S3: ${s3Path}`)
        } catch (err: any) {
            logger.error('Failed to upload machine log to S3: ' + err.message)
        }
    }
}

// Exported API
export function startSystemMonitor(
    botUuid: string,
    secret: string,
    intervalMs = 1000,
): SystemMonitor {
    const monitor = new SystemMonitor(botUuid, secret)
    monitor.startLogging(intervalMs)
    return monitor
}

export async function uploadSystemLog(
    botUuid: string,
    secret: string,
): Promise<void> {
    const monitor = new SystemMonitor(botUuid, secret)
    await monitor.uploadLogToS3()
}
