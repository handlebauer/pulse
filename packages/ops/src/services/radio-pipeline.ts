#!/usr/bin/env bun
/**
 * Radio Pipeline Service
 *
 * This comprehensive service manages the entire radio processing pipeline:
 * 1. Streaming radio stations and saving audio segments
 * 2. Transcribing audio to text
 * 3. Processing topics from transcriptions in real-time
 */
import { createOrchestrator } from '@pulse/radio'
import { createSupabaseClient } from '@/lib/db'
import { defaultConfig } from '@/config'
import createLogger from '@/lib/logger'
import { processTranscriptionTopics } from '@/lib/topics/processor'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { OpsConfig } from '@/config'

const logger = createLogger('RadioPipeline')

/**
 * Creates a comprehensive radio pipeline service that handles streaming,
 * transcription, and real-time topic processing
 *
 * Topic Processing Configuration:
 * - Set config.scheduling.realtimeTopics to false to completely disable real-time topic processing
 * - Set config.scheduling.trendUpdateMultiplier to control how often trend updates occur:
 *   - Value is a multiplier of the defaultSegmentLength (e.g., 4 means update every 4 segments)
 *   - Set to 0 to disable trend updates in real-time processing
 * - Set config.scheduling.connectionsUpdateMultiplier to control how often connection updates occur:
 *   - Value is a multiplier of the defaultSegmentLength (e.g., 8 means update every 8 segments)
 *   - Set to 0 to disable connection updates in real-time processing
 */
export async function createRadioPipeline(config: OpsConfig = defaultConfig) {
    // Create the base orchestrator instance
    const orchestrator = createOrchestrator({
        baseSegmentDir: config.streamOrchestrator.baseSegmentDir,
        defaultSegmentLength: config.streamOrchestrator.defaultSegmentLength,
        defaultKeepSegments: config.streamOrchestrator.defaultKeepSegments,
        database: {
            url: config.database.url,
            serviceRoleKey: config.database.serviceRoleKey,
        },
        transcription: config.transcription,
    })

    // Create Supabase client for listening to new transcriptions
    const supabase = createSupabaseClient()
    let subscription: RealtimeChannel | null = null

    // Flag to track if the realtime subscription is active
    let isListening = false

    // For tracking trend and connection updates based on segment intervals
    let transcriptionCounter = 0
    let lastTrendUpdateTime = Date.now()
    let lastConnectionUpdateTime = Date.now()

    // Calculate trend update intervals in milliseconds
    const segmentLengthMs =
        config.streamOrchestrator.defaultSegmentLength * 1000
    const trendUpdateIntervalMs =
        segmentLengthMs * config.scheduling.trendUpdateMultiplier
    const connectionsUpdateIntervalMs =
        segmentLengthMs * config.scheduling.connectionsUpdateMultiplier

    /**
     * Start listening for new transcriptions and process topics in real-time
     */
    function startTopicProcessing() {
        if (isListening) {
            logger.warn('Already listening for transcriptions')
            return
        }

        logger.info('Starting real-time topic processing')

        // Reset counters when starting
        transcriptionCounter = 0
        lastTrendUpdateTime = Date.now()
        lastConnectionUpdateTime = Date.now()

        // If trend or connection updates are disabled (multiplier set to 0), log it
        if (config.scheduling.trendUpdateMultiplier <= 0) {
            logger.info('Trend updates are disabled in real-time processing')
        } else {
            logger.info(
                `Trend updates will occur every ${config.scheduling.trendUpdateMultiplier} segments (${trendUpdateIntervalMs / 1000} seconds)`,
            )
        }

        if (config.scheduling.connectionsUpdateMultiplier <= 0) {
            logger.info(
                'Topic connection updates are disabled in real-time processing',
            )
        } else {
            logger.info(
                `Topic connection updates will occur every ${config.scheduling.connectionsUpdateMultiplier} segments (${connectionsUpdateIntervalMs / 1000} seconds)`,
            )
        }

        // Subscribe to the transcriptions table
        subscription = supabase
            .channel('topic-processing')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'transcriptions',
                },
                async (payload) => {
                    const transcriptionId = payload.new.id

                    if (!transcriptionId) {
                        logger.warn('Received transcription without ID')
                        return
                    }

                    logger.info(
                        `New transcription detected: ${transcriptionId}`,
                    )

                    try {
                        // Increment transcription counter
                        transcriptionCounter++
                        const currentTime = Date.now()

                        // Determine if we should update trends based on time interval
                        const shouldUpdateTrends =
                            config.scheduling.trendUpdateMultiplier > 0 &&
                            currentTime - lastTrendUpdateTime >=
                                trendUpdateIntervalMs

                        // Determine if we should update connections based on time interval
                        const shouldUpdateConnections =
                            config.scheduling.connectionsUpdateMultiplier > 0 &&
                            currentTime - lastConnectionUpdateTime >=
                                connectionsUpdateIntervalMs

                        // Process topics for this transcription
                        const topicCount = await processTranscriptionTopics(
                            transcriptionId,
                            shouldUpdateTrends,
                            shouldUpdateConnections,
                            config.database,
                            config.topicExtraction,
                        )

                        logger.info(
                            `Processed ${topicCount} topics for transcription ${transcriptionId}`,
                        )

                        // Update timestamps if trends or connections were updated
                        if (shouldUpdateTrends) {
                            lastTrendUpdateTime = currentTime
                            logger.info(
                                `Updated trending topics (interval: ${config.scheduling.trendUpdateMultiplier} segments)`,
                            )
                        }

                        if (shouldUpdateConnections) {
                            lastConnectionUpdateTime = currentTime
                            logger.info(
                                `Updated topic connections (interval: ${config.scheduling.connectionsUpdateMultiplier} segments)`,
                            )
                        }
                    } catch (error) {
                        logger.error(
                            `Failed to process topics for transcription ${transcriptionId}`,
                            error,
                        )
                    }
                },
            )
            .subscribe()

        isListening = true
        logger.success('Real-time topic processing started')
    }

    /**
     * Stop listening for new transcriptions
     */
    function stopTopicProcessing() {
        if (!isListening || !subscription) {
            logger.warn('Not currently listening for transcriptions')
            return
        }

        logger.info('Stopping real-time topic processing')

        // Unsubscribe from the channel
        subscription.unsubscribe()
        subscription = null
        isListening = false

        logger.success('Real-time topic processing stopped')
    }

    /**
     * Check if topic processing is active
     */
    function isTopicProcessingActive() {
        return isListening
    }

    // Return the enhanced orchestrator with topic processing capabilities
    return {
        // Expose the original orchestrator methods
        startStation: orchestrator.startStation.bind(orchestrator),
        stopStation: orchestrator.stopStation.bind(orchestrator),
        stopAll: orchestrator.stopAll.bind(orchestrator),
        getActiveStreams: orchestrator.getActiveStreams.bind(orchestrator),
        getActiveStreamCount:
            orchestrator.getActiveStreamCount.bind(orchestrator),
        startMultipleStations:
            orchestrator.startMultipleStations.bind(orchestrator),

        // Add our custom topic processing methods
        startTopicProcessing,
        stopTopicProcessing,
        isTopicProcessingActive,
    }
}

/**
 * Main function to run the radio pipeline service
 * @param options Optional parameters to configure the service
 * @param options.stationIds Optional array of station IDs to test with specific stations
 */
async function main(options: { stationIds?: string[] } = {}) {
    logger.info('Starting Radio Pipeline Service')

    try {
        // Create the enhanced orchestrator with the default configuration
        const radioPipeline = await createRadioPipeline(defaultConfig)

        // Start real-time topic processing if enabled in config
        if (defaultConfig.scheduling.realtimeTopics) {
            // Check if at least one of the update functions is enabled
            const trendUpdatesEnabled =
                defaultConfig.scheduling.trendUpdateMultiplier > 0
            const connectionUpdatesEnabled =
                defaultConfig.scheduling.connectionsUpdateMultiplier > 0

            if (trendUpdatesEnabled || connectionUpdatesEnabled) {
                radioPipeline.startTopicProcessing()
                logger.info('Real-time topic processing enabled')

                if (!trendUpdatesEnabled) {
                    logger.info(
                        'Note: Trend updates are disabled but will still process topics',
                    )
                }

                if (!connectionUpdatesEnabled) {
                    logger.info(
                        'Note: Connection updates are disabled but will still process topics',
                    )
                }
            } else {
                logger.info(
                    'Real-time topic processing enabled, but both trend and connection updates are disabled (multipliers set to 0)',
                )
                logger.info(
                    'Topics will be extracted but no trend/connection updates will occur in real-time',
                )
                radioPipeline.startTopicProcessing()
            }
        } else {
            logger.info(
                'Real-time topic processing disabled (using scheduled processing only)',
            )
        }

        // Get online stations from the database
        const supabase = createSupabaseClient()
        let query = supabase
            .from('stations')
            .select('id, streamUrl, stationName')
            .eq('isOnline', true)

        // Filter by station IDs if provided
        if (options.stationIds && options.stationIds.length > 0) {
            logger.info(
                `Testing with specific station IDs: ${options.stationIds.join(', ')}`,
            )
            query = query.in('id', options.stationIds)
        }

        const { data: stations, error } = await query
        // .limit(5) // Start with a limited number for testing

        if (error) {
            logger.error('Failed to fetch stations from database', error)
            process.exit(1)
        }

        if (!stations || stations.length === 0) {
            if (options.stationIds && options.stationIds.length > 0) {
                logger.error(
                    `No online stations found with the specified IDs: ${options.stationIds.join(', ')}`,
                )
            } else {
                logger.warn('No online stations found in the database')
            }
        } else {
            // Start streams for each station
            logger.info(
                `Starting streams for ${stations.length} station${stations.length === 1 ? '' : 's'}`,
            )

            const stationData = stations.map((station) => ({
                id: station.id,
                streamUrl: station.streamUrl,
            }))

            // Call startMultipleStations with both stationIds and stationData
            const stationIds = stations.map((station) => station.id)
            await radioPipeline.startMultipleStations(stationIds, stationData)
            logger.success(
                `Started ${stations.length} stream${stations.length === 1 ? '' : 's'} with real-time topic processing`,
            )
        }

        // Handle signals for graceful shutdown
        const handleShutdown = () => {
            logger.info('Shutting down Radio Pipeline Service')
            radioPipeline.stopTopicProcessing()
            radioPipeline.stopAll()
            logger.info('Radio Pipeline Service stopped')
            process.exit(0)
        }

        process.on('SIGINT', handleShutdown)
        process.on('SIGTERM', handleShutdown)

        logger.info('Radio Pipeline Service is running')
        logger.info('Press Ctrl+C to stop')
    } catch (error) {
        logger.error('Failed to start Radio Pipeline Service', error)
        process.exit(1)
    }
}

// Run the main function if this file is executed directly
if (import.meta.path === Bun.main) {
    // Parse command line arguments
    const args = process.argv.slice(2)
    const options: { stationIds?: string[] } = {}

    // Look for --station or -s parameters, which can be provided multiple times
    for (let i = 0; i < args.length; i++) {
        if (
            (args[i] === '--station' || args[i] === '-s') &&
            i + 1 < args.length
        ) {
            if (!options.stationIds) {
                options.stationIds = []
            }
            options.stationIds.push(args[i + 1])
            i++ // Skip the next argument as it's the value
        }
    }

    main(options).catch((error) => {
        logger.error('Unhandled error in main function', error)
        process.exit(1)
    })
}

export default { createRadioPipeline }
