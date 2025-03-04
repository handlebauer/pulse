#!/usr/bin/env bun
/**
 * Filter Stations Script
 *
 * This script filters the complete stations dataset to create specialized subsets
 * while preserving the original complete dataset for reference.
 */
import ora from 'ora'
import path from 'path'
import fs from 'fs'
import { readStationsFromFile } from '@/lib/db'
import createLogger from '@/lib/logger'

const logger = createLogger('FilterStations')

// Define the RadioStation type
interface RadioStation {
    stationId: string
    stationName: string
    streamUrl: string
    category?: string
    subcategory?: string
    [key: string]: any // Allow for additional properties
}

// Path to the filtered stations output file
const WEB_SCRIPTS_DIR = path.join(process.cwd(), '..', 'web', 'scripts', 'db')
const FILTERED_STATIONS_FILE = path.join(
    WEB_SCRIPTS_DIR,
    'filtered-stations.json',
)

/**
 * Filter stations to only include talk and news stations
 */
function filterTalkAndNewsStations(stations: RadioStation[]): RadioStation[] {
    const filtered = stations.filter(
        (station) => station.category === 'talk' || station.category === 'news',
    )
    logger.info(
        `Filtered ${stations.length} stations down to ${filtered.length} talk/news stations`,
        `\n- Talk stations: ${filtered.filter((s) => s.category === 'talk').length}`,
        `\n- News stations: ${filtered.filter((s) => s.category === 'news').length}`,
    )
    return filtered
}

/**
 * Save the filtered stations to a JSON file
 */
async function saveFilteredStations(stations: RadioStation[]): Promise<void> {
    const spinner = ora('Saving filtered stations...').start()
    try {
        // Ensure the directory exists
        fs.mkdirSync(path.dirname(FILTERED_STATIONS_FILE), { recursive: true })

        // Write the filtered stations to file
        fs.writeFileSync(
            FILTERED_STATIONS_FILE,
            JSON.stringify(stations, null, 4),
            'utf-8',
        )
        spinner.succeed(
            `Saved ${stations.length} filtered stations to ${FILTERED_STATIONS_FILE}`,
        )
    } catch (error) {
        spinner.fail('Error saving filtered stations')
        logger.error('Error saving filtered stations:', error)
        throw error
    }
}

/**
 * Main function
 */
async function main() {
    logger.info('Starting station filtering process')

    try {
        // Read the complete stations dataset
        const spinner = ora('Reading stations from file...').start()
        const stations = await readStationsFromFile()
        spinner.succeed(`Read ${stations.length} stations from file`)

        // Filter stations
        const filteredStations = filterTalkAndNewsStations(stations)

        // Save filtered stations
        await saveFilteredStations(filteredStations)

        logger.success('Station filtering completed successfully')
    } catch (error) {
        logger.error('Error during station filtering:', error)
        process.exit(1)
    }
}

// Run the main function if this file is executed directly
if (import.meta.path === Bun.main) {
    main().catch((error) => {
        logger.error('Unhandled error in main function:', error)
        process.exit(1)
    })
}

export default main
