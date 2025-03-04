#!/usr/bin/env bun
/**
 * Classify Stations Script
 *
 * This script classifies radio stations using AI
 * and saves the results to a JSON file.
 */
import ora from 'ora'
import dedent from 'dedent'
import { readStationsFromFile, writeStationsToFile } from '@/lib/db'
import createLogger from '@/lib/logger'

const logger = createLogger('ClassifyStations')

// Define the RadioStation type
interface RadioStation {
    stationId: string
    stationName: string
    streamUrl: string
    tags: string[]
    country?: string
    language?: string
    category?: string
    subcategory?: string
    [key: string]: any // Allow for additional properties
}

// Define the classification result type
interface ClassificationResult {
    stationId: string
    category: string
    subcategory: string
}

// Check if we should use a sample of stations
const IS_SAMPLE = process.env.SAMPLE === 'true'

/**
 * Generate a prompt for classifying a batch of stations
 */
function generateBatchPrompt(stations: RadioStation[]): string {
    const prompt = dedent`
        You are an expert in radio station classification. Your task is to categorize radio stations based on their content by analyzing their names, tags, and other metadata.

        Classify each radio station into one of these main categories:
        - music: Primarily plays music of any genre
        - talk: Primarily features talk shows, interviews, call-ins, etc.
        - news: Primarily focused on news reporting
        - sports: Primarily covers sports events and sports talk
        - mixed: A significant mix of multiple categories above
        - unknown: Not enough information to determine

        For each station, you should determine:
        1. The primary category (one of: music, talk, news, sports, mixed, or unknown)
        2. A subcategory or genre (try to use only one word unless you're repeating the primary category)

        Use the station name and tags as primary signals for classification. Here are some guidelines:
        - Stations with genres like rock, pop, jazz, etc. in their tags are likely music stations
        - Stations with news, talk, discussion, interview in their tags are likely talk/news stations
        - Stations with multiple diverse categories may be mixed format stations
        - If the station has very few or generic tags, use the name to make your best guess
        - Use your vast knowledge of radio stations to make the best guess in cases where the tags are not clear
        - If you truly cannot determine the type, use "unknown" category

        NOTE: never use a primary category for a subcategory.
        
        Here are the stations to classify:

        ${stations
            .map(
                (station, i) => `
        Station ${i + 1}:
        UUID: ${station.stationId}
        Name: ${station.stationName}
        Tags: ${station.tags.join(', ')}
        Country: ${station.country || 'Unknown'}
        Language: ${station.language || 'Unknown'}
                `,
            )
            .join('\n')}

        Return ONLY a JSON array with your classifications, in this exact format:
        [
          {
            "stationId": "station-uuid-1",
            "category": "music",
            "subcategory": "rock",
          },
          {
            "stationId": "station-uuid-2",
            "category": "talk",
            "subcategory": "politics",
          }
        ]

        The JSON must be valid and parseable, with no explanation before or after it:

        \`\`\`json
    `

    return prompt
}

/**
 * Classify a batch of stations using the LLM
 */
async function classifyStationsBatch(
    stations: RadioStation[],
): Promise<ClassificationResult[]> {
    const prompt = generateBatchPrompt(stations)

    try {
        logger.info(`Classifying batch of ${stations.length} stations...`)

        // Check if Google API key is set
        if (!process.env.CLASSIFY_GOOGLE_API_KEY) {
            throw new Error(
                'CLASSIFY_GOOGLE_API_KEY environment variable is not set',
            )
        }

        // Create a fetch request to Google's Gemini API
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${process.env.CLASSIFY_GOOGLE_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: prompt,
                                },
                            ],
                        },
                    ],
                }),
            },
        )

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`)
        }

        const data = await response.json()
        const text = data.candidates[0].content.parts[0].text

        // Extract JSON from the response
        const jsonMatch = text.match(/\[\s*\{.*\}\s*\]/s)
        if (!jsonMatch) {
            logger.error('Could not extract JSON from LLM response')
            logger.debug('Response:', text)
            return []
        }

        const classifications = JSON.parse(
            jsonMatch[0],
        ) as ClassificationResult[]
        logger.info(
            `Successfully classified ${classifications.length} stations`,
        )
        return classifications
    } catch (error) {
        logger.error('Error classifying stations:', error)
        return []
    }
}

/**
 * Merge classification data back into the original station data
 */
function mergeClassificationData(
    stations: RadioStation[],
    classifications: ClassificationResult[],
): RadioStation[] {
    // Create a map for faster lookups
    const classificationMap = new Map<string, ClassificationResult>()
    classifications.forEach((classification) => {
        classificationMap.set(classification.stationId, classification)
    })

    // Update stations with classification data
    return stations.map((station) => {
        const classification = classificationMap.get(station.stationId)
        if (classification) {
            return {
                ...station,
                category: classification.category,
                subcategory: classification.subcategory,
            }
        }
        return station
    })
}

/**
 * Classify all stations using the LLM
 */
export async function classifyStations(
    stations: RadioStation[],
): Promise<RadioStation[]> {
    try {
        logger.info(`Processing ${stations.length} stations for classification`)
        let allStations = [...stations]

        // For testing, limit to a smaller sample
        if (IS_SAMPLE) {
            allStations = [...allStations]
                .sort(() => Math.random() - 0.5)
                .slice(0, 20)
            logger.info(
                `Using sample mode: reduced to ${allStations.length} stations`,
            )
        }

        // Process stations in batches
        const BATCH_SIZE = 20
        const totalBatches = Math.ceil(allStations.length / BATCH_SIZE)
        let processedCount = 0

        logger.info(
            `Processing ${allStations.length} stations in ${totalBatches} batches of ${BATCH_SIZE}...`,
        )

        for (let i = 0; i < totalBatches; i++) {
            logger.info(`Processing batch ${i + 1} of ${totalBatches}...`)

            const start = i * BATCH_SIZE
            const end = Math.min(start + BATCH_SIZE, allStations.length)
            const batch = allStations.slice(start, end)

            const classifications = await classifyStationsBatch(batch)
            if (classifications.length > 0) {
                // Update our running list with the newly classified stations
                const updatedBatch = mergeClassificationData(
                    batch,
                    classifications,
                )
                allStations.splice(start, updatedBatch.length, ...updatedBatch)
                processedCount += classifications.length

                // Save progress after each batch
                await writeStationsToFile(allStations)
                logger.info(
                    `Progress: ${processedCount}/${allStations.length} stations classified (${Math.round((processedCount / allStations.length) * 100)}%)`,
                )
            } else {
                logger.warn(
                    `Batch ${i + 1} failed to classify. Continuing with next batch...`,
                )
            }

            // Add a small delay between batches
            if (i < totalBatches - 1) {
                logger.info('Waiting before processing next batch...')
                await new Promise((resolve) => setTimeout(resolve, 2000))
            }
        }

        // Log classification statistics
        logger.info('\nFinal classification statistics:')
        const stats: Record<string, number> = {}
        allStations.forEach((station) => {
            if (station.category) {
                stats[station.category] = (stats[station.category] || 0) + 1
            } else {
                stats['unclassified'] = (stats['unclassified'] || 0) + 1
            }
        })

        Object.entries(stats).forEach(([category, count]) => {
            logger.info(
                `- ${category}: ${count} stations (${Math.round((count / allStations.length) * 100)}%)`,
            )
        })

        return allStations
    } catch (error) {
        logger.error('Error in classification:', error)
        return stations
    }
}

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
if (import.meta.path === Bun.main) {
    main().catch((error) => {
        logger.error('Unhandled error in main function', error)
        process.exit(1)
    })
}

export default main
