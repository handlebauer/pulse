#!/usr/bin/env bun
/**
 * Topic Processing Script
 *
 * This script processes recent radio transcriptions to extract topics,
 * update trending topics, and establish connections between stations.
 *
 * It can be run manually or scheduled to run periodically.
 */
import { TopicExtractor } from '@pulse/radio'
import createLogger from '@/lib/logger'
import { defaultConfig } from '@/config'
import { createSupabaseClient } from '@/lib/db'
import { parseArgs } from 'node:util'
import dedent from 'dedent'

const logger = createLogger('TopicProcessor')

interface ProcessTopicsOptions {
    minutesBack: number
    limit: number
    skipTrends: boolean
    skipConnections: boolean
}

/**
 * Process topics from recent transcriptions
 */
export async function processTopics(
    options: ProcessTopicsOptions,
): Promise<number> {
    const { minutesBack, limit, skipTrends, skipConnections } = options

    logger.info(
        `Processing transcriptions from last ${minutesBack} minutes (limit: ${limit})`,
    )

    // Create database client
    const dbClient = createSupabaseClient()

    // Get configuration
    const dbConfig = defaultConfig.database
    const topicExtractionConfig = defaultConfig.topicExtraction

    // Create topic extractor
    const topicExtractor = new TopicExtractor(dbConfig, topicExtractionConfig)

    try {
        // Process recent transcriptions
        const startTime = Date.now()

        // Fetch recent transcriptions
        const cutoffTime = new Date(
            Date.now() - minutesBack * 60 * 1000,
        ).toISOString()

        logger.info(`Fetching transcriptions since ${cutoffTime}`)

        const { data: transcriptions, error } = await dbClient
            .from('transcriptions')
            .select('*')
            .gt('createdAt', cutoffTime)
            .order('createdAt', { ascending: false })
            .limit(limit)

        if (error) {
            logger.error('Error fetching transcriptions', error)
            return 0
        }

        if (!transcriptions || transcriptions.length === 0) {
            logger.info('No recent transcriptions found')
            return 0
        }

        logger.info(
            `Found ${transcriptions.length} recent transcriptions to process`,
        )

        // Process each transcription
        let totalTopics = 0
        for (const transcription of transcriptions) {
            try {
                // Extract topics from transcription
                const topics =
                    await topicExtractor.extractTopicsFromTranscription(
                        transcription,
                    )

                if (topics.length === 0) {
                    logger.debug(
                        `No topics found in transcription ${transcription.id}`,
                    )
                    continue
                }

                // Log the topics found
                logger.debug(
                    `Found ${topics.length} topics in transcription ${transcription.id}: ${topics.map((t) => t.name).join(', ')}`,
                )

                // Save topics to database
                await topicExtractor.saveTopics(transcription.stationId, topics)

                totalTopics += topics.length
            } catch (error) {
                logger.error(
                    `Error processing transcription ${transcription.id}`,
                    error,
                )
            }
        }

        // Update trends if not skipped
        if (!skipTrends && totalTopics > 0) {
            logger.info('Updating topic trends')
            await topicExtractor.updateTopicTrends()
        }

        // Update connections if not skipped
        if (!skipConnections && totalTopics > 0) {
            logger.info('Updating topic connections')
            await topicExtractor.updateTopicConnections()
        }

        const duration = (Date.now() - startTime) / 1000
        logger.success(
            `Processed ${totalTopics} topics in ${duration.toFixed(2)} seconds`,
        )

        return totalTopics
    } catch (error) {
        logger.error('Error processing topics', error)
        return 0
    }
}

/**
 * Main function
 */
async function main() {
    // Parse command line arguments
    const { values } = parseArgs({
        options: {
            minutes: {
                type: 'string',
                short: 'm',
                default: '15',
            },
            limit: {
                type: 'string',
                short: 'l',
                default: '100',
            },
            'skip-trends': {
                type: 'boolean',
                default: false,
            },
            'skip-connections': {
                type: 'boolean',
                default: false,
            },
            help: {
                type: 'boolean',
                short: 'h',
            },
        },
    })

    // Show help if requested
    if (values.help) {
        console.log(dedent`
            Topic Processing Script

            This script extracts topics from recent radio transcriptions, updates
            trending topics, and establishes connections between stations.

            Options:
            -m, --minutes=MINUTES        Process transcriptions from the last MINUTES minutes (default: 15)
            -l, --limit=LIMIT            Maximum number of transcriptions to process (default: 100)
            --skip-trends                Skip updating trending topics
            --skip-connections           Skip updating topic connections
            -h, --help                   Show this help message and exit`)
        process.exit(0)
    }

    // Parse numeric arguments
    const minutes = parseInt(values.minutes as string, 10)
    const limit = parseInt(values.limit as string, 10)

    if (isNaN(minutes) || isNaN(limit)) {
        logger.error('Error: Minutes and limit must be valid numbers')
        process.exit(1)
    }

    // Process topics
    await processTopics({
        minutesBack: minutes,
        limit: limit,
        skipTrends: values['skip-trends'] as boolean,
        skipConnections: values['skip-connections'] as boolean,
    })
}

// Run the main function if this file is executed directly
if (import.meta.path === Bun.main) {
    main().catch((error) => {
        logger.error('Unhandled error in main function', error)
        process.exit(1)
    })
}

export default {
    processTopics,
}
