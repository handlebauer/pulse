#!/usr/bin/env bun
/**
 * Stream Orchestrator Service
 *
 * This service manages the streaming of radio stations.
 * It can be run as a standalone service or imported and used programmatically.
 */
import { createOrchestrator } from '@pulse/radio'
import { createSupabaseClient } from '@/lib/db'
import { defaultConfig } from '@/config'
import createLogger from '@/lib/logger'

const logger = createLogger('StreamOrchestrator')

// Create the orchestrator instance
const orchestrator = createOrchestrator({
    baseSegmentDir: defaultConfig.streamOrchestrator.baseSegmentDir,
    defaultSegmentLength: defaultConfig.streamOrchestrator.defaultSegmentLength,
    defaultKeepSegments: defaultConfig.streamOrchestrator.defaultKeepSegments,
    database: {
        url: defaultConfig.database.url,
        serviceRoleKey: defaultConfig.database.serviceRoleKey,
    },
    transcription: {
        googleApiKey: defaultConfig.transcription.googleApiKey,
        model: defaultConfig.transcription.model,
    },
})

/**
 * Start streaming a station
 */
export async function startStation(stationId: string, streamUrl: string) {
    try {
        logger.info(`Starting stream for station ${stationId}`)
        const stream = await orchestrator.startStation(stationId, streamUrl)
        logger.success(`Started stream for station ${stationId}`)
        return stream
    } catch (error) {
        logger.error(`Failed to start stream for station ${stationId}`, error)
        throw error
    }
}

/**
 * Stop streaming a station
 */
export async function stopStation(stationId: string) {
    try {
        logger.info(`Stopping stream for station ${stationId}`)
        const result = await orchestrator.stopStation(stationId)
        if (result) {
            logger.success(`Stopped stream for station ${stationId}`)
        } else {
            logger.warn(`Station ${stationId} was not streaming`)
        }
        return result
    } catch (error) {
        logger.error(`Failed to stop stream for station ${stationId}`, error)
        throw error
    }
}

/**
 * Start streaming multiple stations
 */
export async function startMultipleStations(
    stations: Array<{ id: string; streamUrl: string }>,
) {
    try {
        logger.info(`Starting streams for ${stations.length} stations`)
        const stationIds = stations.map((station) => station.id)
        const result = await orchestrator.startMultipleStations(
            stationIds,
            stations.map((station) => ({
                id: station.id,
                streamUrl: station.streamUrl,
            })),
        )
        logger.success(`Started streams for ${result.size} stations`)
        return result
    } catch (error) {
        logger.error(`Failed to start multiple streams`, error)
        throw error
    }
}

/**
 * Stop all streams
 */
export async function stopAllStations() {
    try {
        logger.info('Stopping all streams')
        await orchestrator.stopAll()
        logger.success('Stopped all streams')
    } catch (error) {
        logger.error('Failed to stop all streams', error)
        throw error
    }
}

/**
 * Get active streams
 */
export function getActiveStreams() {
    return orchestrator.getActiveStreams()
}

/**
 * Main function to run the orchestrator service
 */
async function main() {
    logger.info('Starting Stream Orchestrator Service')

    // Get online stations from the database
    const supabase = createSupabaseClient()
    const { data: stations, error } = await supabase
        .from('stations')
        .select('id, stationId, streamUrl, stationName')
        .eq('isOnline', true)
        .limit(5) // Start with a limited number for testing

    if (error) {
        logger.error('Failed to fetch stations from database', error)
        process.exit(1)
    }

    if (!stations || stations.length === 0) {
        logger.warn('No online stations found in the database')
        process.exit(0)
    }

    logger.info(`Found ${stations.length} online stations`)

    // Start streaming the stations
    try {
        await startMultipleStations(
            stations.map((station) => ({
                id: station.stationId,
                streamUrl: station.streamUrl,
            })),
        )

        // Handle process termination
        process.on('SIGINT', async () => {
            logger.info('Received SIGINT, shutting down...')
            await stopAllStations()
            process.exit(0)
        })

        process.on('SIGTERM', async () => {
            logger.info('Received SIGTERM, shutting down...')
            await stopAllStations()
            process.exit(0)
        })

        logger.info('Stream Orchestrator Service is running')
        logger.info('Press Ctrl+C to stop')
    } catch (error) {
        logger.error('Failed to start streams', error)
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

export default {
    orchestrator,
    startStation,
    stopStation,
    startMultipleStations,
    stopAllStations,
    getActiveStreams,
}
