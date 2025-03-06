#!/usr/bin/env bun
/**
 * Fetch Stations Script
 *
 * This script fetches radio stations from the Radio Browser API
 * and saves them to a JSON file as the reference dataset.
 * It also ensures that preserved stations are included regardless of filtering criteria.
 *
 * Workflow:
 * 1. Reads preserved station IDs (optional)
 * 2. Fetches stations from Radio Browser API
 * 3. Saves the fetched stations to reference-stations.json
 * 4. Next step: Run classify.ts to classify stations and save to stations.json
 */
import ora from 'ora'
import { writeReferenceStations, readPreservedStations } from '@/lib/db'
import createLogger from '@/lib/logger'
import { defaultConfig } from '@/config'

// Import the fetchStationsData function from the radio package
import { fetchStationsData } from '@pulse/radio'

const logger = createLogger('FetchStations')

/**
 * Main function to fetch stations
 * @param preservedStationsPath Optional custom path to the preserved stations file
 */
async function main(preservedStationsPath?: string) {
    logger.info('Starting station fetch process')

    try {
        // Read the preserved station IDs first
        const preservedSpinner = ora('Reading preserved station IDs...').start()
        const preservedStationIds = await readPreservedStations(
            preservedStationsPath,
        )

        if (preservedStationIds.length > 0) {
            preservedSpinner.succeed(
                `Found ${preservedStationIds.length} preserved station IDs${preservedStationsPath ? ` from ${preservedStationsPath}` : ''}`,
            )
        } else {
            preservedSpinner.info('No preserved station IDs found')
        }

        // Fetch stations from the Radio Browser API
        const fetchSpinner = ora(
            'Fetching stations from Radio Browser API...',
        ).start()
        const stations = await fetchStationsData(preservedStationIds)
        fetchSpinner.succeed(
            `Fetched ${stations.length} stations from Radio Browser API${preservedStationIds.length ? ` (including ${preservedStationIds.length} preserved stations)` : ''}`,
        )

        // Save stations to reference JSON file
        const saveSpinner = ora('Saving stations to reference file...').start()
        await writeReferenceStations(stations)
        saveSpinner.succeed(
            `Saved ${stations.length} stations to ${defaultConfig.paths.referenceStationsPath}`,
        )

        logger.success(`Fetch process completed successfully`)
    } catch (error) {
        logger.error('Error fetching stations', error)
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
        logger.error('Unhandled error in main function', error)
        process.exit(1)
    })
}

export default main
