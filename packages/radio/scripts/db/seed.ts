#!/usr/bin/env bun
/**
 * Database Seed Script
 *
 * This script populates the database with radio station data. It will:
 * 1. Check if classified stations exist in cache
 * 2. If they do, seed them directly to the database
 * 3. If not, fetch new stations, classify them, and then seed
 *
 * Note: Only talk and news stations will be seeded to the database.
 */

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import ora from 'ora'
import { resolveFromRoot } from '@/utils/general'
import { fetchStationsData, saveStationsData } from '../radio/fetch-stations'
import { classifyStations } from '../radio/classify-stations'
import type { RadioStation } from '@/lib/radio/types'
import { createClient } from '@supabase/supabase-js'

// Create Supabase admin client
const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// File paths for cached data
const CLASSIFIED_STATIONS_FILE = resolveFromRoot(
    'assets/radio-stations-classified.json',
)

/**
 * Filter stations to only include talk and news stations
 */
function filterTalkAndNewsStations(stations: RadioStation[]): RadioStation[] {
    const filtered = stations.filter(
        (station) => station.category === 'talk' || station.category === 'news',
    )
    console.log(
        `\nFiltered ${stations.length} stations down to ${filtered.length} talk/news stations`,
        `\n- Talk stations: ${filtered.filter((s) => s.category === 'talk').length}`,
        `\n- News stations: ${filtered.filter((s) => s.category === 'news').length}`,
    )
    return filtered
}

/**
 * Load classified stations from cache if they exist
 */
async function loadClassifiedStations(): Promise<RadioStation[] | null> {
    if (!existsSync(CLASSIFIED_STATIONS_FILE)) {
        return null
    }

    const spinner = ora('Loading classified stations from cache...').start()
    try {
        const data = await fs.readFile(CLASSIFIED_STATIONS_FILE, 'utf-8')
        const stations = JSON.parse(data) as RadioStation[]
        spinner.succeed(
            `Loaded ${stations.length} classified stations from cache`,
        )
        return stations
    } catch (error) {
        spinner.fail('Error loading classified stations')
        console.error(error)
        return null
    }
}

/**
 * Insert stations into the database
 */
async function seedDatabase(stations: RadioStation[]) {
    const spinner = ora(
        `Seeding database with ${stations.length} stations...`,
    ).start()

    // Process in batches to avoid overwhelming the database
    const BATCH_SIZE = 50
    const batches = Math.ceil(stations.length / BATCH_SIZE)
    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < batches; i++) {
        const start = i * BATCH_SIZE
        const end = Math.min(start + BATCH_SIZE, stations.length)
        const batch = stations.slice(start, end)

        spinner.text = `Processing batch ${i + 1}/${batches} (${batch.length} stations)...`

        const { error } = await supabase.from('stations').upsert(
            batch.map((station) => ({
                // Basic information
                stationId: station.stationId,
                stationName: station.stationName,
                streamUrl: station.streamUrl,
                websiteUrl: station.websiteUrl,
                logoUrl: station.logoUrl,

                // Content metadata
                tags: station.tags,
                category: station.category,
                subcategory: station.subcategory,
                isLive: station.isLive ?? false,

                // Geographic information
                country: station.country,
                countryCode: station.countryCode,
                state: station.state,
                latitude: station.latitude,
                longitude: station.longitude,
                hasGeolocation: station.hasGeolocation,

                // Language information
                language: station.language,
                languageCodes: station.languageCodes,

                // Technical specifications
                codec: station.codec,
                bitrate: station.bitrate,
                isHls: station.isHls,
                hasSslError: station.hasSslError,
                hasExtendedInfo: station.hasExtendedInfo,

                // Popularity and engagement
                votes: station.votes,
                clickCount: station.clickCount,
                clickTrend: station.clickTrend,

                // Status information
                isOnline: station.isOnline ?? true,
            })),
            { onConflict: 'stationId' },
        )

        if (error) {
            errorCount += batch.length
            spinner.warn(`Error in batch ${i + 1}:`)
            console.error('Full error:', error)
            console.error('Error details:', {
                code: error.code,
                message: error.message,
                details: error.details,
                hint: error.hint,
            })
            // Log the first item of the batch to help debug
            console.error(
                'Sample data being inserted:',
                JSON.stringify(batch[0], null, 2),
            )
        } else {
            successCount += batch.length
        }

        // Add a small delay between batches
        if (i < batches - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100))
        }
    }

    if (errorCount > 0) {
        spinner.warn(
            `Database seeding completed with errors: ${successCount} succeeded, ${errorCount} failed`,
        )
    } else {
        spinner.succeed(
            `Successfully seeded ${successCount} stations to database`,
        )
    }
}

/**
 * Main function
 */
async function main() {
    const mainSpinner = ora('Starting database seed...').start()

    try {
        // Try to load pre-classified stations
        const classifiedStations = await loadClassifiedStations()

        // If we have classified stations, filter and seed them directly
        if (classifiedStations) {
            mainSpinner.text = 'Filtering talk and news stations...'
            const filteredStations =
                filterTalkAndNewsStations(classifiedStations)
            await seedDatabase(filteredStations)
            mainSpinner.succeed('Database seeding complete!')
            return
        }

        // Otherwise, fetch new stations and classify them
        mainSpinner.text =
            'No classified stations found, fetching new stations...'
        const stations = await fetchStationsData()
        mainSpinner.succeed(`Fetched ${stations.length} stations`)

        mainSpinner.start('Saving raw stations data...')
        await saveStationsData(stations)
        mainSpinner.succeed('Saved raw stations data')

        mainSpinner.start('Classifying stations...')
        const classifiedNewStations = await classifyStations(stations)
        mainSpinner.succeed(
            `Classified ${classifiedNewStations.length} stations`,
        )

        // Filter and seed only talk/news stations
        mainSpinner.start('Filtering talk and news stations...')
        const filteredStations = filterTalkAndNewsStations(
            classifiedNewStations,
        )
        await seedDatabase(filteredStations)
        mainSpinner.succeed('Database seeding complete!')
    } catch (error) {
        mainSpinner.fail('Error in seed script')
        console.error(error)
        process.exit(1)
    }
}

// Run the script
main()
