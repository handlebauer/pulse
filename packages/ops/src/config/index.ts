/**
 * Configuration for the ops package
 */
import path from 'path'
import { fileURLToPath } from 'url'

// Get the directory name of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../../../../')

export interface OpsConfig {
    // Database configuration
    database: {
        url: string
        serviceRoleKey: string
    }

    // Transcription configuration
    transcription: {
        provider: 'openai' | 'google'
        google: {
            apiKey: string
            model: string
        }
        openai: {
            apiKey: string
            model: string
        }
    }

    // Topic extraction configuration
    topicExtraction: {
        provider: 'openai' | 'google'
        openai: {
            apiKey: string
            model: string
        }
        google: {
            apiKey: string
            model: string
        }
    }

    // Paths configuration
    paths: {
        referenceStationsPath: string
        filteredStationsPath: string
        preservedStationsPath: string
        projectRoot: string
    }

    // Scheduling configuration
    scheduling: {
        validateStreamsInterval: number // in minutes
        topicsInterval: number // in minutes
        realtimeTopics: boolean
    }

    // Stream orchestrator configuration
    streamOrchestrator: {
        baseSegmentDir: string
        defaultSegmentLength: number
        defaultKeepSegments: number
    }
}

// Default configuration
export const defaultConfig: OpsConfig = {
    database: {
        url: process.env.SUPABASE_URL || '',
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },

    transcription: {
        provider: (process.env.TRANSCRIPTION_PROVIDER || 'openai') as
            | 'openai'
            | 'google',
        google: {
            apiKey: process.env.TRANSCRIPTION_GOOGLE_API_KEY || '',
            model:
                process.env.TRANSCRIPTION_GOOGLE_LLM_MODEL ||
                'gemini-2.0-flash',
        },
        openai: {
            apiKey: process.env.TRANSCRIPTION_OPENAI_API_KEY || '',
            model: process.env.TRANSCRIPTION_OPENAI_MODEL || 'whisper-1',
        },
    },

    topicExtraction: {
        provider: (process.env.TOPIC_EXTRACTION_PROVIDER || 'openai') as
            | 'openai'
            | 'google',
        openai: {
            apiKey: process.env.TOPIC_EXTRACTION_OPENAI_API_KEY || '',
            model: process.env.TOPIC_EXTRACTION_OPENAI_MODEL || 'gpt-4o-mini',
        },
        google: {
            apiKey: process.env.TOPIC_EXTRACTION_GOOGLE_API_KEY || '',
            model:
                process.env.TOPIC_EXTRACTION_GOOGLE_MODEL || 'gemini-2.0-flash',
        },
    },

    paths: {
        referenceStationsPath: path.join(
            projectRoot,
            'packages/web/scripts/db/reference-stations.json',
        ),
        filteredStationsPath: path.join(
            projectRoot,
            'packages/web/scripts/db/stations.json',
        ),
        preservedStationsPath: path.join(
            projectRoot,
            'packages/web/scripts/db/preserved-stations.jsonc',
        ),
        projectRoot,
    },

    scheduling: {
        validateStreamsInterval: parseInt(
            process.env.VALIDATE_STREAMS_INTERVAL || '5',
            10,
        ),
        // The interval at which topic processing runs (in minutes)
        // For best results, this should be similar to how often new segments are
        // transcribed to keep topics as real-time as the transcriptions
        topicsInterval: parseInt(process.env.TOPICS_INTERVAL || '1', 10), // Default to 1 minute for near real-time updates
        realtimeTopics:
            process.env.ENABLE_REALTIME_TOPIC_PROCESSING !== 'false', // Default to true
    },

    streamOrchestrator: {
        baseSegmentDir: path.join(projectRoot, '__data/segments'),
        defaultSegmentLength: 30, // 30 seconds
        defaultKeepSegments: 10, // keep 10 most recent segments
    },
}

export default defaultConfig
