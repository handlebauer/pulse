#!/usr/bin/env bun
/**
 * Classify Stations Script
 *
 * This script classifies radio stations using AI
 * and saves the results to a JSON file.
 */
import ora from 'ora'
import { readStationsFromFile, writeStationsToFile } from '@/lib/db'
import createLogger from '@/lib/logger'

// Import the classification functions from the radio package
import { classifyStations } from '@pulse/radio'

const logger = createLogger('ClassifyStations')

/**
 * Main function to classify stations
 */
async function main() {
    logger.info('Starting station classification process')

    // Read stations from JSON file
    const spinner = ora('Reading stations from file...').start()
    let stations

    try {
        stations = await readStationsFromFile()
        spinner.succeed(`Read ${stations.length} stations from file`)
    } catch (error) {
        spinner.fail('Failed to read stations from file')
        logger.error('Error reading stations', error)
        process.exit(1)
    }

    // Classify stations
    const classifySpinner = ora('Classifying stations...').start()

    try {
        // Classify stations using AI
        const classifiedStations = await classifyStations(stations)

        classifySpinner.succeed(
            `Classified ${classifiedStations.length} stations`,
        )

        // Save classified stations to JSON file
        await writeStationsToFile(classifiedStations)

        logger.success(`Classification process completed successfully`)
    } catch (error) {
        classifySpinner.fail('Failed to classify stations')
        logger.error('Error classifying stations', error)
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
