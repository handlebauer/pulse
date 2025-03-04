#!/usr/bin/env bun
/**
 * Filter Stations Script
 *
 * This script filters the complete stations dataset to create specialized subsets
 * while preserving the original complete dataset for reference.
 */
import ora from 'ora'
import { readReferenceStations, writeFilteredStations } from '@/lib/db'
import createLogger from '@/lib/logger'
import { defaultConfig } from '@/config'

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
 * Main function
 */
async function main() {
    logger.info('Starting station filtering process')

    try {
        // Read the complete stations dataset
        const spinner = ora('Reading reference stations from file...').start()
        const stations = await readReferenceStations()
        spinner.succeed(`Read ${stations.length} reference stations from file`)

        // Filter stations
        const filteredStations = filterTalkAndNewsStations(stations)

        // Save filtered stations
        const saveSpinner = ora('Saving filtered stations...').start()
        await writeFilteredStations(filteredStations)
        saveSpinner.succeed(
            `Saved ${filteredStations.length} filtered stations to ${defaultConfig.paths.filteredStationsPath}`,
        )

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
