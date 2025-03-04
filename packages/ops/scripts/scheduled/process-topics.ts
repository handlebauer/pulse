#!/usr/bin/env bun
/**
 * Scheduled Topic Processing
 *
 * This script runs on a schedule to process radio transcriptions,
 * extract topics, and update connections. It can be configured to
 * match the same interval as stream segment transcriptions to ensure
 * topics are updated as frequently as new transcriptions appear.
 */
import { CronJob } from 'cron'
import createLogger from '@/lib/logger'
import { defaultConfig } from '@/config'
import { processTopics } from '../topics/process-topics'
import { parseArgs } from 'node:util'

const logger = createLogger('ScheduledTopicProcessing')

// Track if processing is currently running to avoid overlaps
let isProcessing = false

/**
 * Runs a single processing cycle for topics
 *
 * This processes recent radio transcriptions (since the last run),
 * extracts topics, and updates connections. Ideally, this should run
 * at the same frequency as new segments are transcribed to maintain
 * real-time topic updates that match transcription updates.
 */
async function runProcessingCycle(): Promise<void> {
    // Skip if already processing
    if (isProcessing) {
        logger.warn('Processing cycle already in progress, skipping')
        return
    }

    isProcessing = true
    let processedCount = 0

    try {
        logger.info('Starting topic processing cycle')

        // Process transcriptions from the last minute to ensure we catch all new ones
        // but don't reprocess too many
        processedCount = await processTopics({
            minutesBack: 1, // Short window to focus on newest transcriptions
            limit: 200,
            skipTrends: false,
            skipConnections: false,
        })

        logger.info(`Successfully processed ${processedCount} transcriptions`)
    } catch (error) {
        logger.error('Error during topic processing cycle', error)
    } finally {
        isProcessing = false
    }
}

/**
 * Starts the scheduled processing service
 *
 * By default, this uses the topicsInterval from config, but this should
 * be synchronized with the segment transcription interval for best results.
 * If segments are created and transcribed every 30 seconds, topic processing
 * should ideally happen at a similar frequency.
 */
function startScheduledProcessing(): void {
    // Get interval from config (in minutes)
    const intervalMinutes = defaultConfig.scheduling.topicsInterval

    // Convert to a cron pattern that runs at that interval
    // For sub-minute processing, you may want to use seconds-based cron patterns
    // like "*/30 * * * * *" for every 30 seconds
    const cronPattern = `*/${intervalMinutes} * * * *`

    logger.info(`Starting scheduled topic processing service (${cronPattern})`)

    // Create cron job
    const job = new CronJob(cronPattern, runProcessingCycle, null, true)

    // Handle signals for graceful shutdown
    const handleShutdown = () => {
        logger.info('Stopping scheduled topic processing service')
        job.stop()
        process.exit(0)
    }

    process.on('SIGINT', handleShutdown)
    process.on('SIGTERM', handleShutdown)

    // Log startup
    logger.info('Scheduled topic processing service started')
}

/**
 * Main function - parses arguments and either runs once or starts scheduled service
 */
async function main(): Promise<void> {
    // Parse command line arguments
    const { values } = parseArgs({
        options: {
            once: {
                type: 'boolean',
                short: 'o',
                default: false,
            },
        },
    })

    if (values.once) {
        logger.info('Running a single topic processing cycle')
        await runProcessingCycle()
        logger.info('Processing cycle complete')
    } else {
        startScheduledProcessing()
    }
}

// Run the main function if this file is executed directly
if (import.meta.path === Bun.main) {
    main().catch((error) => {
        logger.error('Error in main function', error)
        process.exit(1)
    })
}

export { runProcessingCycle, startScheduledProcessing }
