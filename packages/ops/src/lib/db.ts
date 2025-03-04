/**
 * Database utility for the ops package
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs/promises'
import { defaultConfig } from '@/config'
import createLogger from '@/lib/logger'

const logger = createLogger('Database')

/**
 * Create a Supabase client
 */
export function createSupabaseClient() {
    const { url, serviceRoleKey } = defaultConfig.database

    if (!url || !serviceRoleKey) {
        throw new Error('Supabase URL and service role key are required')
    }

    return createClient(url, serviceRoleKey)
}

/**
 * Read stations from JSON file
 */
export async function readStationsFromFile() {
    try {
        const filePath = defaultConfig.paths.stationsJsonPath
        const data = await fs.readFile(filePath, 'utf-8')
        return JSON.parse(data)
    } catch (error) {
        logger.error('Failed to read stations from file', error)
        throw error
    }
}

/**
 * Write stations to JSON file
 */
export async function writeStationsToFile(stations: any[]) {
    try {
        const filePath = defaultConfig.paths.stationsJsonPath
        await fs.writeFile(filePath, JSON.stringify(stations, null, 2), 'utf-8')
        logger.success(`Saved ${stations.length} stations to ${filePath}`)
    } catch (error) {
        logger.error('Failed to write stations to file', error)
        throw error
    }
}

export default {
    createSupabaseClient,
    readStationsFromFile,
    writeStationsToFile,
}
