import { StreamManager, createStream } from './stream-manager'
import type { StreamConfig, StreamManagerDependencies } from './stream-manager'
import type { DatabaseConfig, TranscriptionConfig } from '../config/types'
import { createSupabaseClient } from '@/lib/db/client'
import { createTranscriptionService } from '@/lib/transcribe/gemini'
import path from 'path'

/**
 * Configuration for the stream orchestrator
 */
export interface OrchestratorConfig {
    /**
     * Base directory for storing segments
     */
    baseSegmentDir: string

    /**
     * Default segment length in seconds
     */
    defaultSegmentLength?: number

    /**
     * Default number of segments to keep per station
     */
    defaultKeepSegments?: number

    /**
     * Database configuration
     */
    database?: DatabaseConfig

    /**
     * Transcription configuration
     */
    transcription?: TranscriptionConfig
}

/**
 * Internal config type with required fields
 */
interface InternalOrchestratorConfig {
    baseSegmentDir: string
    defaultSegmentLength: number
    defaultKeepSegments: number
    database?: DatabaseConfig
    transcription?: TranscriptionConfig
}

/**
 * Manages multiple radio station streams
 */
export class StreamOrchestrator {
    private activeStreams: Map<string, StreamManager> = new Map()
    private config: InternalOrchestratorConfig
    private dependencies: StreamManagerDependencies

    constructor(config: OrchestratorConfig) {
        this.config = {
            baseSegmentDir: config.baseSegmentDir,
            defaultSegmentLength: config.defaultSegmentLength || 15,
            defaultKeepSegments: config.defaultKeepSegments || 5,
            database: config.database,
            transcription: config.transcription,
        }

        // Initialize dependencies
        this.dependencies = {}

        // If database config is provided, create a Supabase client
        if (config.database) {
            this.dependencies.dbClient = createSupabaseClient(config.database)
        }

        // Initialize transcription service if configured
        if (config.transcription) {
            const { model, googleApiKey, enabled } = config.transcription
            // Enable transcription if both model and API key are present, unless explicitly disabled
            const shouldEnableTranscription =
                model && googleApiKey && enabled !== false

            if (shouldEnableTranscription) {
                const transcriptionService = createTranscriptionService(
                    config.transcription,
                )
                this.dependencies.transcriptionService = transcriptionService
            }
        }
    }

    /**
     * Start streaming for a specific station
     */
    async startStation(
        stationId: string,
        streamUrl: string,
        customConfig?: Partial<StreamConfig>,
    ): Promise<StreamManager> {
        // Check if we're already streaming this station
        if (this.activeStreams.has(stationId)) {
            console.log(
                `[Orchestrator] Station ${stationId} is already streaming`,
            )
            return this.activeStreams.get(stationId)!
        }

        // Create a station-specific directory for segments
        const stationDir = path.join(this.config.baseSegmentDir, stationId)
        const segmentPath = path.join(stationDir, 'segment-%03d.mp3')

        // Create the stream configuration
        const streamConfig: StreamConfig = {
            segmentPath,
            segmentLength:
                customConfig?.segmentLength || this.config.defaultSegmentLength,
            keepSegments:
                customConfig?.keepSegments || this.config.defaultKeepSegments,
            stationId,
        }

        console.log(`[Orchestrator] Starting stream for station ${stationId}`)

        // Create and start the stream
        const streamManager = await createStream(
            streamUrl,
            streamConfig,
            this.dependencies,
        )

        // Store the active stream
        this.activeStreams.set(stationId, streamManager)

        return streamManager
    }

    /**
     * Stop streaming for a specific station
     */
    async stopStation(stationId: string): Promise<boolean> {
        const streamManager = this.activeStreams.get(stationId)

        if (!streamManager) {
            console.log(
                `[Orchestrator] Station ${stationId} is not currently streaming`,
            )
            return false
        }

        console.log(`[Orchestrator] Stopping stream for station ${stationId}`)

        // Stop the stream
        await streamManager.stop()

        // Remove from active streams
        this.activeStreams.delete(stationId)

        return true
    }

    /**
     * Stop all active streams
     */
    async stopAll(): Promise<void> {
        console.log(
            `[Orchestrator] Stopping all ${this.activeStreams.size} active streams`,
        )

        const stopPromises = Array.from(this.activeStreams.entries()).map(
            async ([stationId, streamManager]) => {
                try {
                    await streamManager.stop()
                    console.log(
                        `[Orchestrator] Successfully stopped stream for station ${stationId}`,
                    )
                } catch (error) {
                    console.error(
                        `[Orchestrator] Error stopping stream for station ${stationId}:`,
                        error,
                    )
                }
            },
        )

        await Promise.all(stopPromises)
        this.activeStreams.clear()
    }

    /**
     * Get all currently active streams
     */
    getActiveStreams(): Map<string, StreamManager> {
        return new Map(this.activeStreams)
    }

    /**
     * Get the number of active streams
     */
    getActiveStreamCount(): number {
        return this.activeStreams.size
    }

    /**
     * Start streaming for multiple stations
     */
    async startMultipleStations(
        stationIds: string[],
        stationData?: Array<{ id: string; streamUrl: string }>,
    ): Promise<Map<string, StreamManager>> {
        const result = new Map<string, StreamManager>()

        // If station data is provided, use it
        if (stationData && stationData.length > 0) {
            console.log(
                `[Orchestrator] Starting streams for ${stationData.length} provided stations`,
            )

            for (const station of stationData) {
                try {
                    const streamManager = await this.startStation(
                        station.id,
                        station.streamUrl,
                    )
                    result.set(station.id, streamManager)
                } catch (error) {
                    console.error(
                        `[Orchestrator] Failed to start stream for station ${station.id}:`,
                        error,
                    )
                }
            }

            return result
        }

        // Otherwise, try to fetch station data from the database if we have a database client
        if (!this.dependencies.dbClient) {
            throw new Error(
                'No database client available and no station data provided',
            )
        }

        const { data: stations, error } = await this.dependencies.dbClient
            .from('stations')
            .select('id, stationId, stationName, streamUrl')
            .in('stationId', stationIds)
            .eq('isOnline', true)

        if (error) {
            throw new Error(`Failed to fetch station data: ${error.message}`)
        }

        if (!stations || stations.length === 0) {
            console.log('[Orchestrator] No valid stations found to start')
            return result
        }

        console.log(
            `[Orchestrator] Starting streams for ${stations.length} stations`,
        )

        // Start streams for each station
        for (const station of stations) {
            try {
                const streamManager = await this.startStation(
                    station.id,
                    station.streamUrl,
                )
                result.set(station.id, streamManager)
            } catch (error) {
                console.error(
                    `[Orchestrator] Failed to start stream for station ${station.id}:`,
                    error,
                )
            }
        }

        return result
    }
}

/**
 * Create and initialize a stream orchestrator with the given configuration
 */
export function createOrchestrator(
    config: OrchestratorConfig,
): StreamOrchestrator {
    return new StreamOrchestrator(config)
}
