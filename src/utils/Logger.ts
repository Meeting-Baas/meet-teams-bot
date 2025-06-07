import fs, { promises as fsPromises } from 'fs'
import os from 'os'
import path from 'path'
import winston from 'winston'
import { PathManager } from './PathManager'
import { s3cp } from './S3Uploader'

// Reference to current bot log file
let currentBotLogFile: string | null = null
let format = winston.format.combine(
    winston.format.colorize({
        all: true,
        colors: {
            info: 'cyan',
            warn: 'yellow',
            error: 'red',
            debug: 'blue',
        }
    }),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] ${level} : ${message}`
    })
)

function formatTable(data: any): string {
    if (!Array.isArray(data) && typeof data !== 'object') {
        return String(data)
    }

    const array = Array.isArray(data) ? data : [data]
    if (array.length === 0) return ''

    const headers = new Set<string>()
    array.forEach((item) =>
        Object.keys(item).forEach((key) => headers.add(key)),
    )
    const cols = Array.from(headers)

    const lines = [
        cols,
        cols.map(() => '-'.repeat(15)),
        ...array.map((item) =>
            cols.map((col) => String(item[col] ?? '').substring(0, 15)),
        ),
    ]

    const colWidths = cols.map((_, i) =>
        Math.max(...lines.map((line) => line[i].length)),
    )

    return (
        '\n' +
        lines
            .map(
                (line) =>
                    '│ ' +
                    line.map((val, i) => val.padEnd(colWidths[i])).join(' │ ') +
                    ' │',
            )
            .join('\n')
    )
}

function formatArgs(msg: string, args: any[]) {
    return (
        msg +
        ' ' +
        args
            .map((arg) => {
                if (arg === null) return 'null'
                if (arg === undefined) return 'undefined'
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg, null, 2)
                    } catch (e) {
                        return String(arg)
                    }
                }
                return String(arg)
            })
            .join(' ')
    )
}

// Global winston logger
export let logger = winston.createLogger({
    level: 'debug',
    format: format,
    transports: [
        new winston.transports.Console({
            format: format
        }),
        new winston.transports.File({ filename: './data/initial.log', format: format })
    ]
})

export function setupConsoleLogger() {
    console.log('Setting up console logger');
    console.log = (msg: string, ...args: any[]) =>
        logger.info(formatArgs(msg, args))
    console.info = (msg: string, ...args: any[]) =>
        logger.info(formatArgs(msg, args))
    console.warn = (msg: string, ...args: any[]) =>
        logger.warn(formatArgs(msg, args))
    console.error = (msg: string, ...args: any[]) =>
        logger.error(formatArgs(msg, args))
    console.debug = (msg: string, ...args: any[]) =>
        logger.debug(formatArgs(msg, args))
    console.table = (data: any) => logger.info(formatTable(data))
    console.log('Console logger setup complete');
}

export async function redirectLogsToBot(botUuid: string) {
    console.log('Starting redirectLogsToBot for bot:', botUuid);
    const pathManager = PathManager.getInstance(botUuid)
    const logPath = pathManager.getLogPath()
    console.log('New log path will be:', logPath);
    
    try {
        // Create parent directory if needed
        await fsPromises.mkdir(path.dirname(logPath), { recursive: true })
        
        // Copy initial logs to new file
        const homeDir = os.homedir()
        const logsPath = path.join(homeDir, 'logs.txt')
        const initialLogsPath = './data/initial.log'
        
        // 1. Copy logs.txt to the new log file
        if (fs.existsSync(logsPath)) {
            await fsPromises.copyFile(logsPath, logPath)
        } else {
            await fsPromises.writeFile(logPath, '')
        }
        
        // 2. Append initial.log content to the new file
        if (fs.existsSync(initialLogsPath)) {
            const initialContent = await fsPromises.readFile(initialLogsPath, 'utf8')
            await fsPromises.appendFile(logPath, initialContent)
            await fsPromises.unlink(initialLogsPath)
        }
        
        // Create and configure transports
        const consoleTransport = new winston.transports.Console({ format });
        const fileTransport = new winston.transports.File({ 
            filename: logPath, 
            format
        });

        // Replace existing transports
        logger.clear();
        logger.add(consoleTransport);
        logger.add(fileTransport);
        
        currentBotLogFile = logPath
        console.log('Logger redirection complete');
    } catch (err) {
        console.error('Failed to setup logs:', err)
        // Fall back to console-only logging
        logger.configure({
            level: 'debug',
            format: format,
            transports: [new winston.transports.Console({ format })]
        });
    }
}

export async function uploadLogsToS3(options: {
    bot_uuid?: string;
    secret?: string;
    type: 'normal' | 'crash' | 'force-termination';
    error?: Error;
}): Promise<void> {
    try {
        let logPath: string;
        let soundLogPath: string;
        let s3LogPath: string;
        let s3SoundLogPath: string;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        switch (options.type) {
            case 'normal':
            case 'force-termination':
                if (!options.bot_uuid || !options.secret) {
                    throw new Error('bot_uuid and secret are required for normal log upload');
                }
                const pathManager = PathManager.getInstance(options.bot_uuid, options.secret);
                logPath = currentBotLogFile || pathManager.getLogPath();
                soundLogPath = pathManager.getSoundLogPath();
                const machineLogPath = pathManager.getMachineLogPath();
                console.log('Looking for log files at:', { logPath, soundLogPath, machineLogPath });
                s3LogPath = `${options.secret}-${options.bot_uuid}/logs.log`;
                s3SoundLogPath = `${options.secret}-${options.bot_uuid}/sound.log`;
                // Upload machine.log if it exists
                if (fs.existsSync(machineLogPath)) {
                    const s3MachineLogPath = `${options.secret}-${options.bot_uuid}/machine.log`;
                    logger.info(`Uploading machine log to S3...`);
                    await s3cp(machineLogPath, s3MachineLogPath);
                    logger.info(`machine.log uploaded to S3`);
                }
                break;
            case 'crash':
                const crashPathManager = PathManager.getInstance();
                logPath = currentBotLogFile || crashPathManager.getLogPath();
                soundLogPath = crashPathManager.getSoundLogPath();
                console.log('Looking for crash log files at:', { logPath, soundLogPath });
                s3LogPath = `crash-logs/${timestamp}-${options.error?.name || 'unknown'}.log`;
                s3SoundLogPath = `crash-logs/${timestamp}-${options.error?.name || 'unknown'}-sound.log`;
                break;
        }
        
        // Upload main log file
        if (fs.existsSync(logPath)) {
            logger.info(`Uploading ${options.type} logs to S3...`);
            await s3cp(logPath, s3LogPath);
            logger.info(`${options.type} logs uploaded to S3`);
        } else {
            console.error('No log file found at path:', logPath);
        }
        
        // Upload sound log file
        if (fs.existsSync(soundLogPath)) {
            logger.info(`Uploading ${options.type} sound logs to S3...`);
            await s3cp(soundLogPath, s3SoundLogPath);
            logger.info(`${options.type} sound logs uploaded to S3`);
        } else {
            console.log('No sound log file found at path:', soundLogPath);
        }
    } catch (error) {
        logger.error(`Failed to upload ${options.type} logs to S3:`, error);
        throw error;
    }
}

export function setupExitHandler() {
    process.on('uncaughtException', async (error) => {
        logger.error('Uncaught Exception: ' + error);
        try {
            await uploadLogsToS3({ type: 'crash', error });
        } catch (uploadError) {
            logger.error('Failed to upload crash logs to S3: ' + uploadError);
        }
    });

    process.on('unhandledRejection', async (reason, promise) => {
        logger.error('Unhandled Rejection at: ' + promise + ' reason: ' + reason);
        try {
            await uploadLogsToS3({
                type: 'crash',
                error: reason instanceof Error ? reason : new Error(String(reason))
            });
        } catch (uploadError) {
            logger.error('Failed to upload crash logs to S3: ' + uploadError);
        }
    });
}
