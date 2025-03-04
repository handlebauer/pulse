#!/usr/bin/env bun
/**
 * Scheduled Validate Streams Script
 *
 * This script is designed to be run on a schedule to validate
 * radio station streams and update their online status.
 * It can be called by cron jobs, monitoring tools, etc.
 */
import { CronJob } from 'cron'
import createLogger from '@/lib/logger'
import { defaultConfig } from '@/config'
import { validateAllStations } from '../stations/validate'

const logger = createLogger('ScheduledValidation')

/**
 * Run a single validation cycle
 */
async function runValidationCycle() {
    logger.info('Starting scheduled validation cycle')

    try {
        await validateAllStations()
        logger.success('Scheduled validation cycle completed')
    } catch (error) {
        logger.error('Error in validation cycle', error)
    }
}

/**
 * Start the scheduled validation service
 */
function startScheduledValidation() {
    const intervalMinutes = defaultConfig.scheduling.validateStreamsInterval

    logger.info(
        `Starting scheduled validation service (every ${intervalMinutes} minutes)`,
    )

    // Run immediately on startup
    runValidationCycle().catch((error) => {
        logger.error('Error in initial validation cycle', error)
    })

    // Create a cron job to run validation on schedule
    // The cron pattern "0 */5 * * * *" means "every 5 minutes"
    const cronPattern = `0 */${intervalMinutes} * * * *`

    const job = new CronJob(
        cronPattern,
        runValidationCycle,
        null, // onComplete
        true, // start
        'UTC', // timezone
    )

    // Handle process termination
    process.on('SIGINT', () => {
        logger.info('Received SIGINT, shutting down...')
        job.stop()
        process.exit(0)
    })

    process.on('SIGTERM', () => {
        logger.info('Received SIGTERM, shutting down...')
        job.stop()
        process.exit(0)
    })

    logger.info(
        `Validation service scheduled with cron pattern: ${cronPattern}`,
    )
    logger.info('Press Ctrl+C to stop')
}

/**
 * Main function
 */
async function main() {
    // If --once flag is provided, run once and exit
    if (process.argv.includes('--once')) {
        logger.info('Running single validation cycle (--once flag detected)')
        await runValidationCycle()
    } else {
        // Otherwise, start the scheduled service
        startScheduledValidation()
    }
}

// Run the main function if this file is executed directly
if (import.meta.url === Bun.main) {
    main().catch((error) => {
        logger.error('Unhandled error in main function', error)
        process.exit(1)
    })
}

export default {
    runValidationCycle,
    startScheduledValidation,
}
