#!/usr/bin/env bun

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import ora from 'ora'
import figures from 'figures'
import meow from 'meow'
import { createClient } from '@supabase/supabase-js'
import { Tables } from '@/lib/db/types'
import { seedTopicData } from './seedTopics'
import { seedTranscriptionData } from './seedTranscripts'

type RadioStation = Tables<'stations'>

// Create Supabase admin client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// CLI configuration
const cli = meow(
    `
    Usage
      $ bun run seed.ts [options]

    Options
      --minimal, -m  Minimal mode: Only seed stations (closer to production)
      --full, -f     Full mode: Seed stations and all test data (for UI testing)
      --help         Show this help

    If no mode is specified, you will be prompted to choose
`,
    {
        importMeta: import.meta,
        flags: {
            minimal: {
                type: 'boolean',
                shortFlag: 'm',
            },
            full: {
                type: 'boolean',
                shortFlag: 'f',
            },
        },
    },
)

// File path for stations data
const STATIONS_FILE = 'scripts/db/stations.json'

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
 * Seeds minimal data (stations only)
 */
async function seedMinimal() {
    console.log('\nStarting minimal database seeding (stations only)...\n')

    try {
        // Load stations from file
        const stations = await loadStations()

        // Seed stations
        await seedDatabase(stations)

        console.log(
            `\n${figures.tick} Minimal database seeding completed successfully!\n`,
        )
    } catch (error) {
        console.error('\nFatal error during minimal seeding:', error)
        process.exit(1)
    }
}

/**
 * Seeds full dataset (stations + topics and other test data)
 */
async function seedFull() {
    console.log('\nStarting full database seeding (stations + test data)...\n')

    try {
        // Load stations from file
        const stations = await loadStations()

        // Seed stations
        await seedDatabase(stations)

        // Seed topic-related data
        await seedTopicData()

        // Seed transcription data
        await seedTranscriptionData()

        console.log(
            `\n${figures.tick} Full database seeding completed successfully!\n`,
        )
    } catch (error) {
        console.error('\nFatal error during full seeding:', error)
        process.exit(1)
    }
}

/**
 * Prompt user to select seeding mode if no flags provided
 */
async function promptMode(): Promise<'minimal' | 'full'> {
    console.log('\nSelect seeding mode:')
    console.log('  1. Minimal (stations only, closer to production)')
    console.log('  2. Full (stations + test data, for UI testing)\n')

    process.stdout.write('Enter your choice (1 or 2): ')

    // Simple stdin reader
    const result = await new Promise<string>((resolve) => {
        const stdin = process.stdin
        stdin.resume()
        stdin.setEncoding('utf-8')
        stdin.once('data', (data) => {
            resolve(data.toString().trim())
            stdin.pause()
        })
    })

    if (result === '1') return 'minimal'
    if (result === '2') return 'full'

    console.log('\nInvalid choice. Defaulting to full mode.')
    return 'full'
}

/**
 * Main function
 */
async function main() {
    // Determine mode based on flags or prompt
    let mode: 'minimal' | 'full'

    if (cli.flags.minimal) {
        mode = 'minimal'
    } else if (cli.flags.full) {
        mode = 'full'
    } else {
        mode = await promptMode()
    }

    // Run appropriate seeding function
    if (mode === 'minimal') {
        await seedMinimal()
    } else {
        await seedFull()
    }
}

// Run the script
main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
})
