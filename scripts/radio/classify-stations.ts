#!/usr/bin/env bun
/**
 * Radio Station Classifier
 *
 * This script uses an LLM to classify radio stations based on their metadata.
 * It reads the JSON file created by fetch-radio-stations.ts and updates it with
 * classification information.
 *
 * Usage:
 *   bun run packages/core/scripts/classify-stations.ts
 *
 * Output:
 *   An updated JSON file with station classifications.
 */

import fs from 'node:fs/promises'
import dedent from 'dedent'
import { type RadioStation, RadioStationCategory } from '@/lib/radio/types'
import { googleGenerativeAI } from '@/utils/ai'
import { resolveFromRoot } from '@/utils/general'

interface ClassificationResult {
    stationId: string
    category: RadioStationCategory
    subcategory: string
}

const IS_SAMPLE = process.env.SAMPLE === 'true'

// File paths
const INPUT_FILE = resolveFromRoot('assets/radio-stations.json')
const OUTPUT_FILE = resolveFromRoot('assets/radio-stations-classified.json')

// Initialize the Gemini model
const opts = { model: 'gemini-2.0-flash' }
const model = googleGenerativeAI.getGenerativeModel(opts)

/**
 * Load stations data from JSON file
 */
export async function loadStationsData(): Promise<RadioStation[]> {
    try {
        const data = await fs.readFile(INPUT_FILE, 'utf-8')
        return JSON.parse(data) as RadioStation[]
    } catch (error) {
        console.error('Error loading stations data:', error)
        throw error
    }
}

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
        Country: ${station.country}
        Language: ${station.language}
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
export async function classifyStationsBatch(
    stations: RadioStation[],
): Promise<ClassificationResult[]> {
    const prompt = generateBatchPrompt(stations)

    try {
        console.log(`Classifying batch of ${stations.length} stations...`)
        const result = await model.generateContent(prompt)
        const text = result.response.text()

        // Extract JSON from the response
        const jsonMatch = text.match(/\[\s*\{.*\}\s*\]/s)
        if (!jsonMatch) {
            console.error('Error: Could not extract JSON from LLM response')
            console.error('Response:', text)
            return []
        }

        const classifications = JSON.parse(
            jsonMatch[0],
        ) as ClassificationResult[]
        console.log(
            `Successfully classified ${classifications.length} stations`,
        )
        return classifications
    } catch (error) {
        console.error('Error classifying stations:', error)
        return []
    }
}

/**
 * Merge classification data back into the original station data
 */
export function mergeClassificationData(
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
 * Save the classified stations data to a JSON file
 */
export async function saveClassifiedData(
    stations: RadioStation[],
): Promise<void> {
    try {
        await fs.writeFile(
            OUTPUT_FILE,
            JSON.stringify(stations, null, 2),
            'utf-8',
        )
        console.log(
            `Saved ${stations.length} classified stations to ${OUTPUT_FILE}`,
        )
    } catch (error) {
        console.error('Error saving classified data:', error)
    }
}

/**
 * Classify all stations using the LLM
 */
export async function classifyStations(
    stations: RadioStation[],
): Promise<RadioStation[]> {
    try {
        console.log('Loading radio stations data...')
        let allStations = [...stations]
        console.log(`Loaded ${allStations.length} stations`)

        // For testing, limit to 10 stations
        if (IS_SAMPLE) {
            allStations = [...allStations]
                .sort(() => Math.random() - 0.5)
                .slice(0, 20)
        }

        // Process stations in batches
        const BATCH_SIZE = 20
        const totalBatches = Math.ceil(allStations.length / BATCH_SIZE)
        let processedCount = 0

        console.log(
            `Processing ${allStations.length} stations in ${totalBatches} batches of ${BATCH_SIZE}...`,
        )

        for (let i = 0; i < totalBatches; i++) {
            console.log(`\nProcessing batch ${i + 1} of ${totalBatches}...`)

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
                await saveClassifiedData(allStations)
                console.log(
                    `Progress: ${processedCount}/${allStations.length} stations classified (${Math.round((processedCount / allStations.length) * 100)}%)`,
                )
            } else {
                console.warn(
                    `Batch ${i + 1} failed to classify. Continuing with next batch...`,
                )
            }

            // Add a small delay between batches
            if (i < totalBatches - 1) {
                console.log('Waiting before processing next batch...')
                await new Promise((resolve) => setTimeout(resolve, 2000))
            }
        }

        return allStations
    } catch (error) {
        console.error('Error in classification:', error)
        return stations
    }
}

// Only run the main function if this script is being executed directly
if (import.meta.url === process.argv[1]) {
    async function main() {
        try {
            console.log('Loading radio stations data...')
            const stations = await loadStationsData()
            const classifiedStations = await classifyStations(stations)

            console.log('\nFinal classification statistics:')
            const stats: Record<string, number> = {}
            classifiedStations.forEach((station) => {
                if (station.category) {
                    stats[station.category] = (stats[station.category] || 0) + 1
                } else {
                    stats['unclassified'] = (stats['unclassified'] || 0) + 1
                }
            })

            Object.entries(stats).forEach(([category, count]) => {
                console.log(
                    `- ${category}: ${count} stations (${Math.round((count / classifiedStations.length) * 100)}%)`,
                )
            })

            console.log('\nClassification complete!')
            console.log(`Classified data saved to ${OUTPUT_FILE}`)
        } catch (error) {
            console.error('Error in main:', error)
            process.exit(1)
        }
    }

    main()
}
