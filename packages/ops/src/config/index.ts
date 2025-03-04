/**
 * Configuration for the ops package
 */
import path from 'path'
import { fileURLToPath } from 'url'

// Get the directory name of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../../../')

export interface OpsConfig {
    // Database configuration
    database: {
        url: string
        serviceRoleKey: string
    }

    // Paths configuration
    paths: {
        stationsJsonPath: string
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

    paths: {
        stationsJsonPath: path.join(
            projectRoot,
            'packages/web/scripts/db/stations.json',
        ),
        projectRoot,
    },

    scheduling: {
        validateStreamsInterval: 5, // validate streams every 5 minutes
    },

    streamOrchestrator: {
        baseSegmentDir: path.join(projectRoot, 'data/segments'),
        defaultSegmentLength: 30, // 30 seconds
        defaultKeepSegments: 10, // keep 10 most recent segments
    },
}

export default defaultConfig
