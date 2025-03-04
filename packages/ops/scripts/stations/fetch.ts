#!/usr/bin/env bun
/**
 * Fetch Stations Script
 *
 * This script fetches radio stations from the Radio Browser API
 * and saves them to a JSON file.
 */
import ora from 'ora'
import { writeStationsToFile } from '@/lib/db'
import createLogger from '@/lib/logger'
import { defaultConfig } from '@/config'

// Import the fetchStationsData function from the radio package
import { fetchStationsData } from '@pulse/radio'

const logger = createLogger('FetchStations')

/**
 * Main function to fetch stations
 */
async function main() {
    logger.info('Starting station fetch process')

    const spinner = ora('Fetching stations from Radio Browser API...').start()

    try {
        // Fetch stations from the Radio Browser API
        const stations = await fetchStationsData()

        spinner.succeed(
            `Fetched ${stations.length} stations from Radio Browser API`,
        )

        // Save stations to JSON file
        await writeStationsToFile(stations)

        logger.success(`Fetch process completed successfully`)
        logger.info(
            `Saved ${stations.length} stations to ${defaultConfig.paths.stationsJsonPath}`,
        )
    } catch (error) {
        spinner.fail('Failed to fetch stations')
        logger.error('Error fetching stations', error)
        process.exit(1)
    }
}

// Run the main function if this file is executed directly
if (import.meta.url === Bun.main) {
    main().catch((error) => {
        logger.error('Unhandled error in main function', error)
        process.exit(1)
    })
}

export default main
