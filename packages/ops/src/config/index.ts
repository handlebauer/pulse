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
        googleApiKey: string
        model: string
    }

    // Paths configuration
    paths: {
        referenceStationsPath: string
        filteredStationsPath: string
        projectRoot: string
    }

    // Scheduling configuration
    scheduling: {
        validateStreamsInterval: number // in minutes
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
        googleApiKey: process.env.TRANSCRIPTION_GOOGLE_API_KEY || '',
        model: process.env.TRANSCRIPTION_GOOGLE_LLM_MODEL || 'gemini-2.0-flash',
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
        projectRoot,
    },

    scheduling: {
        validateStreamsInterval: 5, // validate streams every 5 minutes
    },

    streamOrchestrator: {
        baseSegmentDir: path.join(projectRoot, '__data/segments'),
        defaultSegmentLength: 30, // 30 seconds
        defaultKeepSegments: 10, // keep 10 most recent segments
    },
}

export default defaultConfig
