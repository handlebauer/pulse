#!/usr/bin/env bun

import fs from 'fs'
import path from 'path'
import ora from 'ora'
import figures from 'figures'

// Define the RadioStation type based on the JSON structure
type RadioStation = {
    stationId: string
    stationName: string
    streamUrl: string
    websiteUrl: string
    logoUrl: string
    tags: string[]
    isOnline?: boolean
    updatedAt?: string
}

// Path to the stations.json file
const STATIONS_FILE_PATH = path.join(__dirname, 'db', 'stations.json')

/**
 * Fetch all stations from the JSON file
 */
async function fetchStations(): Promise<RadioStation[]> {
    const spinner = ora('Loading stations from stations.json...').start()
    try {
        // Read the stations.json file
        const stationsData = fs.readFileSync(STATIONS_FILE_PATH, 'utf-8')
        const stations = JSON.parse(stationsData) as RadioStation[]

        spinner.succeed(`Loaded ${stations.length} stations from stations.json`)
        return stations
    } catch (error) {
        spinner.fail('Error loading stations from stations.json')
        throw error
    }
}

/**
 * Check if a URL returns a valid response
 */
async function checkUrl(url: string): Promise<boolean> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            // Some servers require a proper User-Agent
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (compatible; RadioStreamValidator/1.0)',
            },
        })

        // Immediately abort the connection after getting headers
        controller.abort()
        return response.ok
    } catch (error) {
        // AbortError is expected and means we got headers, consider it valid
        if (error instanceof Error && error.name === 'AbortError') {
            return true
        }
        return false
    } finally {
        clearTimeout(timeoutId)
    }
}

/**
 * Parse an M3U8 file and extract stream URLs
 */
async function parseM3u8(url: string): Promise<string[]> {
    try {
        const response = await fetch(url)
        if (!response.ok) return []

        const content = await response.text()
        const lines = content.split('\n')
        const streamUrls: string[] = []

        for (const line of lines) {
            // Skip comments and empty lines
            if (line.startsWith('#') || !line.trim()) continue

            // If the line is a URL (contains http or https), add it
            if (line.includes('http://') || line.includes('https://')) {
                streamUrls.push(line.trim())
            }
            // If it's a relative URL, resolve it against the base URL
            else if (line.trim()) {
                try {
                    const resolvedUrl = new URL(line.trim(), url).toString()
                    streamUrls.push(resolvedUrl)
                } catch {
                    // Skip invalid URLs
                    continue
                }
            }
        }

        return streamUrls
    } catch {
        return []
    }
}

/**
 * Validate a stream URL, handling both direct streams and HLS manifests
 */
async function validateStreamUrl(
    url: string,
    verbose = false,
): Promise<boolean> {
    // First check if the URL itself is accessible
    const isUrlValid = await checkUrl(url)
    if (verbose)
        console.log(`Initial URL check: ${isUrlValid ? 'OK' : 'Failed'}`)
    if (!isUrlValid) return false

    // If it's an HLS stream (ends with .m3u8), try to parse it
    if (url.endsWith('.m3u8')) {
        if (verbose) console.log('Detected HLS stream, parsing manifest...')
        // Get all stream URLs from the manifest
        const streamUrls = await parseM3u8(url)

        if (verbose) {
            console.log(`Found ${streamUrls.length} stream URLs in manifest:`)
            streamUrls.forEach((url, i) => console.log(`${i + 1}. ${url}`))
        }

        // If we found no stream URLs, the manifest might be invalid
        if (streamUrls.length === 0) {
            if (verbose) console.log('No valid stream URLs found in manifest')
            return false
        }

        // Check the first stream URL (usually the lowest quality one)
        // We only check the first one to avoid too many requests
        const isStreamValid = await checkUrl(streamUrls[0])
        if (verbose)
            console.log(`Stream URL check: ${isStreamValid ? 'OK' : 'Failed'}`)
        return isStreamValid
    }

    // For non-HLS streams, the initial URL check is sufficient
    if (verbose) console.log('Non-HLS stream, using initial check result')
    return true
}

/**
 * Update a station's online status in the stations.json file
 */
async function updateStationStatus(
    stations: RadioStation[],
    updatedStation: RadioStation,
    isOnline: boolean,
) {
    // Find the station in the array and update it
    const stationIndex = stations.findIndex(
        (s) => s.stationId === updatedStation.stationId,
    )
    if (stationIndex !== -1) {
        stations[stationIndex].isOnline = isOnline
        stations[stationIndex].updatedAt = new Date().toISOString()
    }
}

/**
 * Save the updated stations back to the JSON file
 */
async function saveStationsToFile(stations: RadioStation[]) {
    const spinner = ora('Saving stations to stations.json...').start()
    try {
        fs.writeFileSync(
            STATIONS_FILE_PATH,
            JSON.stringify(stations, null, 4),
            'utf-8',
        )
        spinner.succeed('Stations saved successfully to stations.json')
    } catch (error) {
        spinner.fail('Error saving stations to stations.json')
        console.error(error)
    }
}

/**
 * Validate a single URL
 */
async function validateSingleUrl(url: string) {
    console.log(`\nValidating stream URL: ${url}\n`)

    const spinner = ora('Checking stream...').start()
    try {
        const isValid = await validateStreamUrl(url, true)
        if (isValid) {
            spinner.succeed('Stream is valid and accessible')
        } else {
            spinner.fail('Stream is not accessible or invalid')
        }
    } catch (error) {
        spinner.fail('Error validating stream')
        console.error(error)
    }
}

/**
 * Validate all stations in stations.json
 */
async function validateAllStations() {
    console.log('\nStarting stream validation...\n')

    try {
        // Fetch all stations
        const stations = await fetchStations()

        // Process stations in batches to avoid overwhelming the network
        const BATCH_SIZE = 10
        const batches = Math.ceil(stations.length / BATCH_SIZE)
        let validCount = 0
        let invalidCount = 0

        for (let i = 0; i < batches; i++) {
            const start = i * BATCH_SIZE
            const end = Math.min(start + BATCH_SIZE, stations.length)
            const batch = stations.slice(start, end)

            const spinner = ora(
                `Processing batch ${i + 1}/${batches} (${batch.length} stations)...`,
            ).start()

            // Process each station in the batch concurrently
            const results = await Promise.all(
                batch.map(async (station) => {
                    const isValid = await validateStreamUrl(station.streamUrl)
                    await updateStationStatus(stations, station, isValid)
                    return isValid
                }),
            )

            // Update counts
            validCount += results.filter(Boolean).length
            invalidCount += results.filter((r) => !r).length

            spinner.succeed(
                `Processed batch ${i + 1}/${batches}: ${
                    results.filter(Boolean).length
                } valid, ${results.filter((r) => !r).length} invalid`,
            )

            // Add a small delay between batches
            if (i < batches - 1) {
                await new Promise((resolve) => setTimeout(resolve, 1000))
            }
        }

        // Save all updated stations back to the file
        await saveStationsToFile(stations)

        console.log(
            `\n${figures.tick} Stream validation completed:`,
            `\n- Valid streams: ${validCount}`,
            `\n- Invalid streams: ${invalidCount}`,
            `\n- Total processed: ${stations.length}`,
        )
    } catch (error) {
        console.error('\nFatal error during validation:', error)
        process.exit(1)
    }
}

// Check if a URL was provided as an argument
const url = process.argv[2]
if (url) {
    validateSingleUrl(url)
} else {
    validateAllStations()
}
