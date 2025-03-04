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
 * Read reference stations from JSON file
 */
export async function readReferenceStations() {
    try {
        const filePath = defaultConfig.paths.referenceStationsPath
        const data = await fs.readFile(filePath, 'utf-8')
        return JSON.parse(data)
    } catch (error) {
        logger.error('Failed to read reference stations from file', error)
        throw error
    }
}

/**
 * Write reference stations to JSON file
 */
export async function writeReferenceStations(stations: any[]) {
    try {
        const filePath = defaultConfig.paths.referenceStationsPath
        await fs.writeFile(filePath, JSON.stringify(stations, null, 2), 'utf-8')
        logger.success(
            `Saved ${stations.length} reference stations to ${filePath}`,
        )
    } catch (error) {
        logger.error('Failed to write reference stations to file', error)
        throw error
    }
}

/**
 * Read filtered stations from JSON file
 */
export async function readFilteredStations() {
    try {
        const filePath = defaultConfig.paths.filteredStationsPath
        const data = await fs.readFile(filePath, 'utf-8')
        return JSON.parse(data)
    } catch (error) {
        logger.error('Failed to read filtered stations from file', error)
        throw error
    }
}

/**
 * Write filtered stations to JSON file
 */
export async function writeFilteredStations(stations: any[]) {
    try {
        const filePath = defaultConfig.paths.filteredStationsPath
        await fs.writeFile(filePath, JSON.stringify(stations, null, 2), 'utf-8')
        logger.success(
            `Saved ${stations.length} filtered stations to ${filePath}`,
        )
    } catch (error) {
        logger.error('Failed to write filtered stations to file', error)
        throw error
    }
}

// For backward compatibility
export const readStationsFromFile = readFilteredStations
export const writeStationsToFile = writeFilteredStations

export default {
    createSupabaseClient,
    readReferenceStations,
    writeReferenceStations,
    readFilteredStations,
    writeFilteredStations,
    // For backward compatibility
    readStationsFromFile,
    writeStationsToFile,
}
