/**
 * Logger utility for the ops package
 */
import figures from 'figures'

// Log levels
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

// Current log level (can be set via environment variable)
const currentLogLevel = (
    process.env.LOG_LEVEL ? parseInt(process.env.LOG_LEVEL, 10) : LogLevel.INFO
) as LogLevel

/**
 * Logger class for consistent logging across the ops package
 */
export class Logger {
    constructor(private context: string) {}

    /**
     * Log a debug message
     */
    debug(message: string, ...args: any[]): void {
        if (currentLogLevel <= LogLevel.DEBUG) {
            console.debug(
                `${figures.pointer} [DEBUG] [${this.context}] ${message}`,
                ...args,
            )
        }
    }

    /**
     * Log an info message
     */
    info(message: string, ...args: any[]): void {
        if (currentLogLevel <= LogLevel.INFO) {
            console.info(
                `${figures.info} [INFO] [${this.context}] ${message}`,
                ...args,
            )
        }
    }

    /**
     * Log a warning message
     */
    warn(message: string, ...args: any[]): void {
        if (currentLogLevel <= LogLevel.WARN) {
            console.warn(
                `${figures.warning} [WARN] [${this.context}] ${message}`,
                ...args,
            )
        }
    }

    /**
     * Log an error message
     */
    error(message: string, ...args: any[]): void {
        if (currentLogLevel <= LogLevel.ERROR) {
            console.error(
                `${figures.cross} [ERROR] [${this.context}] ${message}`,
                ...args,
            )
        }
    }

    /**
     * Log a success message
     */
    success(message: string, ...args: any[]): void {
        if (currentLogLevel <= LogLevel.INFO) {
            console.info(
                `${figures.tick} [SUCCESS] [${this.context}] ${message}`,
                ...args,
            )
        }
    }
}

/**
 * Create a logger for a specific context
 */
export function createLogger(context: string): Logger {
    return new Logger(context)
}

export default createLogger
