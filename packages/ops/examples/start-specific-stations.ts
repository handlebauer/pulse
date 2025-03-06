#!/usr/bin/env bun
/**
 * Example: Start Radio Pipeline for Specific Stations
 *
 * This example script demonstrates how to start the radio pipeline for specific stations
 * by their names instead of IDs. It will:
 * 1. Query the database to find the station IDs based on the provided names
 * 2. Start the radio pipeline for only those stations
 *
 * Usage:
 * ```
 * bun run packages/ops/examples/start-specific-stations.ts
 * ```
 */
import { createSupabaseClient } from '../src/lib/db'
import createLogger from '../src/lib/logger'
import { defaultConfig } from '../src/config'
import { createRadioPipeline } from '../src/services/radio-pipeline'

const logger = createLogger('StationExample')

// Define the station names we want to stream
const STATION_NAMES = [
    'CBC Radio 1 Vancouver',
    'CKOM News/Talk 650 (Saskatoon, SK)',
]

async function main() {
    logger.info(
        `Starting radio pipeline for stations: ${STATION_NAMES.join(', ')}`,
    )

    try {
        // Create Supabase client to query stations
        const supabase = createSupabaseClient()

        // Query stations by name
        const { data: stations, error } = await supabase
            .from('stations')
            .select('id, streamUrl, stationName')
            .in('stationName', STATION_NAMES)
            .eq('isOnline', true)

        if (error) {
            logger.error('Failed to fetch stations from database', error)
            process.exit(1)
        }

        if (!stations || stations.length === 0) {
            logger.error(
                `No online stations found with the specified names: ${STATION_NAMES.join(', ')}`,
            )

            // Try to find stations with those names regardless of online status
            // to give more helpful debugging information
            const { data: allStations } = await supabase
                .from('stations')
                .select('id, stationName, isOnline')
                .in('stationName', STATION_NAMES)

            if (allStations && allStations.length > 0) {
                logger.info(
                    'Found stations with matching names but they are not marked as online:',
                )
                allStations.forEach((station) => {
                    logger.info(
                        `- ${station.stationName} (ID: ${station.id}, Online: ${station.isOnline})`,
                    )
                })
                logger.info(
                    'You may need to set these stations to online in the database',
                )
            } else {
                logger.info(
                    'No stations found with these exact names. Check for typos or if stations exist in the database.',
                )
            }

            process.exit(1)
        }

        // Log the stations we found
        logger.info(`Found ${stations.length} stations:`)
        stations.forEach((station) => {
            logger.info(`- ${station.stationName} (ID: ${station.id})`)
        })

        // Extract station IDs and create station data
        const stationIds = stations.map((station) => station.id)
        const stationData = stations.map((station) => ({
            id: station.id,
            streamUrl: station.streamUrl,
        }))

        // Create the radio pipeline
        const radioPipeline = await createRadioPipeline(defaultConfig)

        // Start topic processing if enabled
        if (defaultConfig.scheduling.realtimeTopics) {
            radioPipeline.startTopicProcessing()
            logger.info('Real-time topic processing enabled')
        }

        // Start the streams for our stations
        await radioPipeline.startMultipleStations(stationIds, stationData)
        logger.success(
            `Started ${stations.length} streams with real-time processing`,
        )

        // Handle shutdown signals
        const handleShutdown = () => {
            logger.info('Shutting down radio pipeline')
            radioPipeline.stopTopicProcessing()
            radioPipeline.stopAll()
            process.exit(0)
        }

        process.on('SIGINT', handleShutdown)
        process.on('SIGTERM', handleShutdown)

        logger.info('Pipeline running. Press Ctrl+C to stop.')
    } catch (error) {
        logger.error('Failed to start radio pipeline', error)
        process.exit(1)
    }
}

// Run the main function
main().catch((error) => {
    logger.error('Unhandled error', error)
    process.exit(1)
})
