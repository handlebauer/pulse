/**
 * Radio Library Configuration Types
 *
 * This file defines all the configurable options for the radio library
 */

/**
 * Database configuration
 */
export interface DatabaseConfig {
    /**
     * Supabase URL
     */
    url: string

    /**
     * Supabase service role key for admin operations
     */
    serviceRoleKey: string

    /**
     * Supabase anon key for client operations
     */
    anonKey?: string
}

/**
 * Radio Browser API configuration
 */
export interface RadioBrowserConfig {
    /**
     * Base URL for the Radio Browser API
     */
    apiUrl: string

    /**
     * Minimum number of votes required for a station to be included
     */
    minVotes?: number

    /**
     * Only include stations that are currently online
     */
    onlineOnly?: boolean

    /**
     * Comma-separated list of country codes to fetch stations from
     */
    countries?: string[]

    /**
     * Only include stations that broadcast in English
     */
    englishOnly?: boolean
}

/**
 * AI transcription configuration
 */
export interface TranscriptionConfig {
    /**
     * Google API key for transcription services
     */
    googleApiKey: string

    /**
     * Whether to enable transcription
     */
    enabled?: boolean

    /**
     * Model to use for transcription
     */
    model?: string
}

/**
 * Stream configuration
 */
export interface StreamConfig {
    /**
     * Path pattern for audio segments
     */
    segmentPath: string

    /**
     * Length of each segment in seconds
     */
    segmentLength?: number

    /**
     * Prefix for segment filenames
     */
    segmentPrefix?: string

    /**
     * Number of segments to keep before deleting old ones
     */
    keepSegments?: number

    /**
     * Station ID for the stream
     */
    stationId: string
}

/**
 * Stream orchestrator configuration
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
 * Main library configuration
 */
export interface RadioLibraryConfig {
    /**
     * Database configuration
     */
    database: DatabaseConfig

    /**
     * Radio Browser API configuration
     */
    radioBrowser?: RadioBrowserConfig

    /**
     * Transcription configuration
     */
    transcription?: TranscriptionConfig

    /**
     * Stream orchestrator configuration
     */
    orchestrator: OrchestratorConfig
}
