#!/usr/bin/env bun

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import ora from 'ora'
import figures from 'figures'
import { createClient } from '@supabase/supabase-js'
import { Tables } from '@/lib/db/types'

type RadioStation = Tables<'stations'>

// Create Supabase admin client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// File path for stations data
const STATIONS_FILE = 'scripts/db/stations.json'

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
 * Load stations from the JSON file
 */
async function loadStations(): Promise<RadioStation[]> {
    if (!existsSync(STATIONS_FILE)) {
        throw new Error(`Stations file not found at: ${STATIONS_FILE}`)
    }

    const spinner = ora('Loading stations from file...').start()
    try {
        const data = await fs.readFile(STATIONS_FILE, 'utf-8')
        const stations = JSON.parse(data) as RadioStation[]
        spinner.succeed(`Loaded ${stations.length} stations from file`)
        return stations
    } catch (error) {
        spinner.fail('Error loading stations')
        throw error
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
    console.log('\nStarting database seeding...\n')

    try {
        // Load stations from file
        const stations = await loadStations()

        // Filter and seed only talk/news stations
        const filteredStations = filterTalkAndNewsStations(stations)
        await seedDatabase(filteredStations)

        console.log(
            `\n${figures.tick} Database seeding completed successfully!\n`,
        )
    } catch (error) {
        console.error('\nFatal error during seeding:', error)
        process.exit(1)
    }
}

// Run the script
main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
})
