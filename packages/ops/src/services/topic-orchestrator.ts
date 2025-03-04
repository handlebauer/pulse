#!/usr/bin/env bun
/**
 * Topic-Enhanced Stream Orchestrator Service
 *
 * This service extends the stream orchestrator with real-time topic processing.
 * It listens for new transcriptions and processes topics as they come in.
 */
import { createOrchestrator } from '@pulse/radio'
import { createSupabaseClient } from '@/lib/db'
import { defaultConfig } from '@/config'
import createLogger from '@/lib/logger'
import { processTranscriptionTopics } from '@/lib/topics/processor'
import type { RealtimeChannel } from '@supabase/supabase-js'

const logger = createLogger('TopicOrchestrator')

/**
 * Creates a topic-enhanced orchestrator service that processes
 * topics in real-time as new transcriptions are created
 */
export async function createTopicOrchestrator() {
    // Create the base orchestrator instance
    const orchestrator = createOrchestrator({
        baseSegmentDir: defaultConfig.streamOrchestrator.baseSegmentDir,
        defaultSegmentLength:
            defaultConfig.streamOrchestrator.defaultSegmentLength,
        defaultKeepSegments:
            defaultConfig.streamOrchestrator.defaultKeepSegments,
        database: {
            url: defaultConfig.database.url,
            serviceRoleKey: defaultConfig.database.serviceRoleKey,
        },
        transcription: {
            googleApiKey: defaultConfig.transcription.googleApiKey,
            model: defaultConfig.transcription.model,
        },
    })

    // Create Supabase client for listening to new transcriptions
    const supabase = createSupabaseClient()
    let subscription: RealtimeChannel | null = null

    // Flag to track if the realtime subscription is active
    let isListening = false

    /**
     * Start listening for new transcriptions and process topics in real-time
     */
    function startTopicProcessing() {
        if (isListening) {
            logger.warn('Already listening for transcriptions')
            return
        }

        logger.info('Starting real-time topic processing')

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
                        // Process topics for this transcription
                        // Only update trends and connections occasionally to avoid overloading the database
                        // Use a simple 1/5 chance for updating trends and connections
                        const shouldUpdateTrends = Math.random() < 0.2
                        const shouldUpdateConnections = Math.random() < 0.2

                        const topicCount = await processTranscriptionTopics(
                            transcriptionId,
                            shouldUpdateTrends,
                            shouldUpdateConnections,
                        )

                        logger.info(
                            `Processed ${topicCount} topics for transcription ${transcriptionId}`,
                        )

                        // Log when trends or connections are updated
                        if (shouldUpdateTrends) {
                            logger.info('Updated trending topics')
                        }

                        if (shouldUpdateConnections) {
                            logger.info('Updated topic connections')
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
 * Main function to run the topic orchestrator service
 */
async function main() {
    logger.info('Starting Topic Orchestrator Service')

    try {
        // Create the enhanced orchestrator
        const topicOrchestrator = await createTopicOrchestrator()

        // Start real-time topic processing
        topicOrchestrator.startTopicProcessing()

        // Get online stations from the database
        const supabase = createSupabaseClient()
        const { data: stations, error } = await supabase
            .from('stations')
            .select('id, streamUrl, stationName')
            .eq('isOnline', true)
            .limit(5) // Start with a limited number for testing

        if (error) {
            logger.error('Failed to fetch stations from database', error)
            process.exit(1)
        }

        if (!stations || stations.length === 0) {
            logger.warn('No online stations found in the database')
        } else {
            // Start streams for each station
            logger.info(`Starting streams for ${stations.length} stations`)

            const stationData = stations.map((station) => ({
                id: station.id,
                streamUrl: station.streamUrl,
            }))

            // Call startMultipleStations with both stationIds and stationData
            const stationIds = stations.map((station) => station.id)
            await topicOrchestrator.startMultipleStations(
                stationIds,
                stationData,
            )
            logger.success(
                `Started ${stations.length} streams with real-time topic processing`,
            )
        }

        // Handle signals for graceful shutdown
        const handleShutdown = () => {
            logger.info('Shutting down Topic Orchestrator Service')
            topicOrchestrator.stopTopicProcessing()
            topicOrchestrator.stopAll()
            logger.info('Topic Orchestrator Service stopped')
            process.exit(0)
        }

        process.on('SIGINT', handleShutdown)
        process.on('SIGTERM', handleShutdown)

        logger.info('Topic Orchestrator Service is running')
        logger.info('Press Ctrl+C to stop')
    } catch (error) {
        logger.error('Failed to start Topic Orchestrator Service', error)
        process.exit(1)
    }
}

// Run the main function if this file is executed directly
if (import.meta.path === Bun.main) {
    main().catch((error) => {
        logger.error('Unhandled error in main function', error)
        process.exit(1)
    })
}

export default { createTopicOrchestrator }
