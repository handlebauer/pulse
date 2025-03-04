#!/usr/bin/env bun
/**
 * Radio Station Data Fetcher
 *
 * This script fetches radio station data from the radio-browser.info API and saves
 * it as a JSON file that can be used for LLM-based classification of station types
 * (e.g., talk, news, music).
 *
 * Usage:
 *   bun run packages/core/scripts/fetch-radio-stations.ts
 *
 * Output:
 *   A JSON file containing station data with relevant fields for classification.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { RadioBrowserAPI } from '@/lib/radio/client'
import type { RadioStation } from '@/lib/radio/types'
import { resolveFromRoot } from '@/utils/general'

// File paths
const DATA_DIR = resolveFromRoot('assets')
const OUTPUT_FILE = path.join(DATA_DIR, 'radio-stations.json')

// Constants
const DEFAULT_COUNTRIES = ['US', 'GB', 'CA', 'AU']
const MAX_STATIONS_PER_COUNTRY = Number.POSITIVE_INFINITY // No limit
const DEFAULT_MIN_VOTES = 3000

const ENGLISH_IDENTIFIERS = new Set([
    'english',
    'eng',
    'en',
    'american english',
    'american-english',
    'americanenglish',
    'american',
    'en-us',
    'en_us',
    'eng-us',
    'eng_us',
])

/**
 * Check if a station broadcasts in English
 */
export function isEnglishStation(station: RadioStation): boolean {
    // Check main language
    const mainLanguage = station.language.toLowerCase()
    if (ENGLISH_IDENTIFIERS.has(mainLanguage)) {
        return true
    }

    // Check language codes array
    if (
        station.languageCodes.some((code) =>
            ENGLISH_IDENTIFIERS.has(code.toLowerCase()),
        )
    ) {
        return true
    }

    // Some stations have comma-separated languages in the main language field
    const languages = mainLanguage.split(',').map((lang) => lang.trim())
    if (languages.some((lang) => ENGLISH_IDENTIFIERS.has(lang))) {
        return true
    }

    // Check tags for English indicators
    const englishTags = station.tags.some(
        (tag) =>
            tag.toLowerCase().includes('english') ||
            tag.toLowerCase().includes('eng') ||
            tag.toLowerCase() === 'en',
    )
    if (englishTags) {
        return true
    }

    // For stations in English-speaking countries, if no language is specified,
    // it's likely an English station
    if (
        ['US', 'GB', 'CA', 'AU', 'NZ', 'IE'].includes(station.countryCode) &&
        (!station.language || station.language.trim() === '')
    ) {
        return true
    }

    return false
}

/**
 * Fetch stations data from the API
 */
export async function fetchStationsData(): Promise<RadioStation[]> {
    console.log('Initializing RadioBrowserAPI...')
    const api = new RadioBrowserAPI('PulseDataFetcher/1.0')

    // Parameters for fetching
    const minVotes = Number(
        process.env.RADIO_BROWSER_MIN_VOTES ?? DEFAULT_MIN_VOTES,
    )
    const onlineOnly = process.env.RADIO_BROWSER_ONLINE_ONLY !== 'false' // Default to true
    const englishOnly = process.env.RADIO_BROWSER_ENGLISH_ONLY !== 'false' // Default to true
    const countryCodes =
        process.env.RADIO_BROWSER_COUNTRIES?.split(',') ?? DEFAULT_COUNTRIES

    console.log(
        `Fetching stations with minimum ${minVotes} votes ` +
            `(online only: ${onlineOnly}, English only: ${englishOnly})...`,
    )

    // Stats tracking for logging
    interface CountryStats {
        totalFetched: number
        belowMinVotes: number
        offline: number
        nonEnglish: number
        valid: number
    }
    const countryStats: Record<string, CountryStats> = {}

    // We'll collect data in batches by country to ensure diversity
    let allStations: RadioStation[] = []

    for (const countryCode of countryCodes) {
        console.log(`Fetching stations for country: ${countryCode}...`)
        countryStats[countryCode] = {
            totalFetched: 0,
            belowMinVotes: 0,
            offline: 0,
            nonEnglish: 0,
            valid: 0,
        }

        try {
            // First, get all stations regardless of online status to track stats
            const allCountryStations = await api.getStations({
                countrycode: countryCode,
                limit: MAX_STATIONS_PER_COUNTRY,
                order: 'votes',
                reverse: true,
            })

            countryStats[countryCode].totalFetched = allCountryStations.length

            // Count offline stations
            const offlineStations = allCountryStations.filter(
                (station) => !station.isOnline,
            )
            countryStats[countryCode].offline = offlineStations.length

            // Count stations below min votes
            const belowMinVotesStations = allCountryStations.filter(
                (station) => station.votes < minVotes,
            )
            countryStats[countryCode].belowMinVotes =
                belowMinVotesStations.length

            // Count non-English stations
            if (englishOnly) {
                const nonEnglishStations = allCountryStations.filter(
                    (station) => !isEnglishStation(station),
                )
                countryStats[countryCode].nonEnglish = nonEnglishStations.length
            }

            // Now, fetch only online stations for actual use
            const stations = await api.getStations({
                countrycode: countryCode,
                limit: MAX_STATIONS_PER_COUNTRY,
                order: 'votes',
                reverse: true,
                lastcheckok: onlineOnly ? '1' : '', // Filter for stations that are online
            })

            // Apply filters
            let validStations = stations.filter(
                (station) => station.votes >= minVotes,
            )

            if (englishOnly) {
                validStations = validStations.filter(isEnglishStation)
            }

            countryStats[countryCode].valid = validStations.length

            console.log(
                `Found ${validStations.length} valid stations for ${countryCode} ` +
                    `(Excluded: ${stations.length - validStations.length} stations ` +
                    `[${countryStats[countryCode].belowMinVotes} below ${minVotes} votes, ` +
                    `${countryStats[countryCode].offline} offline` +
                    `${englishOnly ? `, ${countryStats[countryCode].nonEnglish} non-English` : ''}` +
                    `])`,
            )

            allStations = [...allStations, ...validStations]
        } catch (error) {
            console.error(`Error fetching stations for ${countryCode}:`, error)
        }
    }

    // Fetch additional stations globally to ensure we have representation beyond our country list
    console.log('Fetching additional stations globally...')
    try {
        const globalStats = {
            totalFetched: 0,
            belowMinVotes: 0,
            offline: 0,
            nonEnglish: 0,
            valid: 0,
        }

        // First fetch for stats
        const allGlobalStations = await api.getStations({
            limit: MAX_STATIONS_PER_COUNTRY,
            order: 'votes',
            reverse: true,
        })

        globalStats.totalFetched = allGlobalStations.length
        globalStats.offline = allGlobalStations.filter(
            (station) => !station.isOnline,
        ).length
        globalStats.belowMinVotes = allGlobalStations.filter(
            (station) => station.votes < minVotes,
        ).length

        if (englishOnly) {
            globalStats.nonEnglish = allGlobalStations.filter(
                (station) => !isEnglishStation(station),
            ).length
        }

        // Now fetch for actual use
        const stations = await api.getStations({
            limit: MAX_STATIONS_PER_COUNTRY,
            order: 'votes',
            reverse: true,
            lastcheckok: onlineOnly ? '1' : '', // Filter for online stations
        })

        // Apply filters
        let validStations = stations.filter(
            (station) => station.votes >= minVotes,
        )

        if (englishOnly) {
            validStations = validStations.filter(isEnglishStation)
        }

        globalStats.valid = validStations.length

        console.log(
            `Found ${validStations.length} additional stations globally ` +
                `(Excluded: ${stations.length - validStations.length} stations ` +
                `[${globalStats.belowMinVotes} below ${minVotes} votes, ` +
                `${globalStats.offline} offline` +
                `${englishOnly ? `, ${globalStats.nonEnglish} non-English` : ''}` +
                `])`,
        )

        allStations = [...allStations, ...validStations]
    } catch (error) {
        console.error('Error fetching additional stations:', error)
    }

    // Remove duplicates based on the station UUID
    const uniqueStations = Array.from(
        allStations
            .reduce((map, station) => {
                if (!map.has(station.stationId)) {
                    map.set(station.stationId, station)
                }
                return map
            }, new Map<string, RadioStation>())
            .values(),
    )

    // Count stations with geographic data
    const stationsWithGeoData = uniqueStations.filter(
        (station) => station.hasGeolocation,
    ).length
    const geoDataPercentage = Math.round(
        (stationsWithGeoData / uniqueStations.length) * 100,
    )

    // Display summary statistics
    console.log('\n--- Station Collection Summary ---')
    console.log(`Total unique stations collected: ${uniqueStations.length}`)

    // Calculate aggregate stats
    let totalFetched = 0
    let totalOffline = 0
    let totalBelowMinVotes = 0
    let totalValid = 0

    Object.entries(countryStats).forEach(([_country, stats]) => {
        totalFetched += stats.totalFetched
        totalOffline += stats.offline
        totalBelowMinVotes += stats.belowMinVotes
        totalValid += stats.valid
    })

    console.log(`Total stations fetched: ${totalFetched}`)
    console.log(
        `Offline stations excluded: ${totalOffline} (${Math.round((totalOffline / totalFetched) * 100)}%)`,
    )
    console.log(
        `Stations below ${minVotes} votes excluded: ${totalBelowMinVotes} (${Math.round((totalBelowMinVotes / totalFetched) * 100)}%)`,
    )
    console.log(`Valid stations before deduplication: ${totalValid}`)
    console.log(
        `Duplicates removed: ${Math.abs(totalValid - uniqueStations.length)}`,
    )
    console.log(
        `Stations with geographic data: ${stationsWithGeoData} (${geoDataPercentage}%)`,
    )
    console.log('----------------------------------\n')

    return uniqueStations
}

/**
 * Save the stations data to a JSON file
 */
export async function saveStationsData(
    stations: RadioStation[],
): Promise<void> {
    try {
        // Create the data directory if it doesn't exist
        await fs.mkdir(DATA_DIR, { recursive: true })

        // Save all stations
        await fs.writeFile(
            OUTPUT_FILE,
            JSON.stringify(stations, null, 2),
            'utf-8',
        )

        console.log(`Saved ${stations.length} stations to ${OUTPUT_FILE}`)
    } catch (error) {
        console.error('Error saving stations data:', error)
    }
}

// Only run the script if it's being executed directly
if (import.meta.url === process.argv[1]) {
    async function main() {
        try {
            console.log('Fetching radio stations data...')
            const stations = await fetchStationsData()
            await saveStationsData(stations)
            console.log('Done!')
        } catch (error) {
            console.error('Error in main:', error)
            process.exit(1)
        }
    }

    main()
}
