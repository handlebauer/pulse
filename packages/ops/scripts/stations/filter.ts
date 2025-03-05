#!/usr/bin/env bun
/**
 * Filter Stations Script
 *
 * This script filters the complete stations dataset to create specialized subsets
 * while preserving the original complete dataset for reference.
 *
 * It also respects "preserved" stations that should never be filtered out.
 */
import ora from 'ora'
import {
    readReferenceStations,
    writeFilteredStations,
    readPreservedStations,
} from '@/lib/db'
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
 * and any preserved stations that should never be filtered out
 */
function filterTalkAndNewsStations(
    stations: RadioStation[],
    preservedStationIds: string[],
): RadioStation[] {
    // First, filter by category
    const filteredByCategory = stations.filter(
        (station) => station.category === 'talk' || station.category === 'news',
    )

    // Find preserved stations that weren't included in the category filter
    const preservedStations = stations.filter(
        (station) =>
            preservedStationIds.includes(station.stationId) &&
            !filteredByCategory.some((s) => s.stationId === station.stationId),
    )

    // Combine filtered stations with preserved stations
    const combined = [...filteredByCategory, ...preservedStations]

    logger.info(
        `Filtered ${stations.length} stations down to ${combined.length} stations`,
        `\n- Talk stations: ${combined.filter((s) => s.category === 'talk').length}`,
        `\n- News stations: ${combined.filter((s) => s.category === 'news').length}`,
        `\n- Preserved stations (that might otherwise be filtered): ${preservedStations.length}`,
    )

    return combined
}

/**
 * Main function
 * @param preservedStationsPath Optional custom path to the preserved stations file
 */
async function main(preservedStationsPath?: string) {
    logger.info('Starting station filtering process')

    try {
        // Read the complete stations dataset
        const spinner = ora('Reading reference stations from file...').start()
        const stations = await readReferenceStations()
        spinner.succeed(`Read ${stations.length} reference stations from file`)

        // Read preserved stations
        const preservedSpinner = ora(
            'Reading preserved station IDs from file...',
        ).start()
        const preservedStationIds = await readPreservedStations(
            preservedStationsPath,
        )
        preservedSpinner.succeed(
            `Read ${preservedStationIds.length} preserved station IDs${preservedStationsPath ? ` from ${preservedStationsPath}` : ''}`,
        )

        // Filter stations
        const filteredStations = filterTalkAndNewsStations(
            stations,
            preservedStationIds,
        )

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
    // Check for preserved stations path from command line
    let preservedStationsPath: string | undefined
    const args = process.argv.slice(2)
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--preserved-stations' && i + 1 < args.length) {
            preservedStationsPath = args[i + 1]
            break
        }
    }

    main(preservedStationsPath).catch((error) => {
        logger.error('Unhandled error in main function:', error)
        process.exit(1)
    })
}

export default main
