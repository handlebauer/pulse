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
     * The AI provider to use for transcription: "openai" or "google"
     */
    provider: 'openai' | 'google'

    /**
     * Whether to enable transcription
     */
    enabled?: boolean

    /**
     * Google AI configuration
     */
    google: {
        /**
         * Google API key for transcription services
         */
        apiKey: string

        /**
         * Google model to use for transcription
         * Default: gemini-2.0-flash
         */
        model: string
    }

    /**
     * OpenAI configuration
     */
    openai: {
        /**
         * OpenAI API key
         */
        apiKey: string

        /**
         * OpenAI model to use for transcription
         * Default: whisper-1
         */
        model: string
    }
}

/**
 * Topic extraction configuration with support for multiple AI providers
 */
export interface TopicExtractionConfig {
    /**
     * The AI provider to use for topic extraction: "openai" or "google"
     */
    provider: 'openai' | 'google'

    /**
     * OpenAI configuration
     */
    openai: {
        /**
         * OpenAI API key
         */
        apiKey: string

        /**
         * OpenAI model to use for topic extraction
         * Default: gpt-4o-mini
         */
        model: string
    }

    /**
     * Google AI configuration
     */
    google: {
        /**
         * Google API key for topic extraction
         */
        apiKey: string

        /**
         * Google AI model to use for topic extraction
         * Default: gemini-2.0-flash
         */
        model: string
    }
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
     * Topic extraction configuration
     */
    topicExtraction?: TopicExtractionConfig

    /**
     * Stream orchestrator configuration
     */
    orchestrator: OrchestratorConfig
}
