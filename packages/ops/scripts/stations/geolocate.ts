#!/usr/bin/env bun
/**
 * Geolocate Stations Script
 *
 * This script finds stations without geolocation data and attempts to determine
 * their location using multiple methods:
 * 1. Scrape the station website for location information
 * 2. Use Google Gemini to extract location data from the scraped content
 * 3. Use Mapbox geocoding API to convert the location into precise coordinates
 *
 * The script can be run for all stations without geolocation or for a specific station.
 */
import ora from 'ora'
import * as cheerio from 'cheerio'
import { GoogleGenerativeAI } from '@google/generative-ai'
import createLogger from '@/lib/logger'
import { readFilteredStations, writeFilteredStations } from '@/lib/db'
import { defaultConfig } from '@/config'
import dedent from 'dedent'

const logger = createLogger('GeolocateStations')

// Define the RadioStation type
interface RadioStation {
    stationId: string
    stationName: string
    streamUrl: string
    websiteUrl: string
    category?: string
    subcategory?: string
    latitude: number | null
    longitude: number | null
    hasGeolocation: boolean
    country: string
    countryCode: string
    state: string
    geolocatedBy?: string
    [key: string]: any // Allow for additional properties
}

/**
 * Scrape a website for content that might contain location information
 */
async function scrapeWebsite(url: string): Promise<string> {
    try {
        // Add http:// if missing
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url
        }

        // Set up a timeout for the fetch request
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000) // 10 second timeout

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (compatible; RadioPulseBot/1.0; +https://radiopulse.app)',
                },
                signal: controller.signal,
            })

            if (!response.ok) {
                logger.warn(
                    `Failed to fetch website ${url}: ${response.statusText}`,
                )
                return ''
            }

            const html = await response.text()
            const $ = cheerio.load(html)

            // Extract text from common location-containing elements
            const locationElements = $(
                'footer, .footer, .contact, #contact, .location, .address, .about, #about',
            )

            // Also get meta description and title as they might contain location info
            const metaDescription =
                $('meta[name="description"]').attr('content') || ''
            const title = $('title').text() || ''

            // Combine all text
            let combinedText = title + ' ' + metaDescription + ' '

            locationElements.each((_, element) => {
                combinedText += $(element).text() + ' '
            })

            // If we didn't find much, get the entire body text (limited to first 10000 chars)
            if (combinedText.length < 100) {
                combinedText = $('body').text().substring(0, 10000) || ''
            }

            const finalText = combinedText.replace(/\s+/g, ' ').trim()
            logger.debug(
                `Scraped ${finalText.length} chars of text from ${url}`,
            )

            return finalText
        } finally {
            clearTimeout(timeout)
        }
    } catch (error) {
        logger.warn(`Failed to scrape website ${url}:`, error)
        return ''
    }
}

/**
 * Use Google Gemini to extract location information from text
 */
async function extractLocationWithLLM(
    stationName: string,
    websiteContent: string,
): Promise<string | null> {
    try {
        const genAI = new GoogleGenerativeAI(
            defaultConfig.transcription.google.apiKey,
        )
        const model = genAI.getGenerativeModel({
            model: defaultConfig.transcription.google.model,
            generationConfig: { responseMimeType: 'application/json' },
        })

        const prompt = dedent`
            I need to determine the location (city and state/province/region) of a radio station.
            
            Station Name: ${stationName}
            
            Here is text from their website:
            ${websiteContent.substring(0, 5000)}
            
            Based on BOTH properties (the station name and the website content), what is the most likely city and state/province/region where this station is located?
            If you can determine the location, respond ONLY with the location in the format:
            
            {
                "city": "City",
                "state": "State/Province",
                "country": "Country"
            }
            
            For any of the location properties that you cannot determine with confidence, use "UNKNOWN" for the value.
        `

        logger.debug(
            `Sending ${websiteContent.length} chars to LLM for location extraction`,
        )
        const result = await model.generateContent(prompt)
        const response = result.response.text().trim()

        // Parse the JSON response
        let locationData: { city: string; state: string; country: string }
        try {
            locationData = JSON.parse(response)
        } catch (parseError) {
            logger.error(
                `Failed to parse LLM response as JSON: ${response}`,
                parseError,
            )
            return null
        }

        // Check if any valid location data was found
        if (
            locationData.city === 'UNKNOWN' &&
            locationData.state === 'UNKNOWN' &&
            locationData.country === 'UNKNOWN'
        ) {
            logger.debug(`LLM could not determine location for ${stationName}`)
            return null
        }

        // Format location string with the available data
        const locationParts: string[] = []
        if (locationData.city !== 'UNKNOWN')
            locationParts.push(locationData.city)
        if (locationData.state !== 'UNKNOWN')
            locationParts.push(locationData.state)
        if (locationData.country !== 'UNKNOWN')
            locationParts.push(locationData.country)

        // If we have any valid location parts, return them as a comma-separated string
        if (locationParts.length > 0) {
            const locationString = locationParts.join(', ')
            logger.debug(
                `LLM extracted location for ${stationName}: "${locationString}"`,
            )
            return locationString
        } else {
            logger.debug(`No valid location parts found for ${stationName}`)
            return null
        }
    } catch (error) {
        logger.error('Error using LLM to extract location:', error)
        return null
    }
}

/**
 * Use Mapbox geocoding API to convert a location string to coordinates
 */
async function geocodeLocation(
    locationString: string,
): Promise<{ latitude: number; longitude: number } | null> {
    try {
        const mapboxApiKey = process.env.MAPBOX_API_KEY
        if (!mapboxApiKey) {
            throw new Error('MAPBOX_API_KEY environment variable is not set')
        }

        const encodedLocation = encodeURIComponent(locationString)
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedLocation}.json?access_token=${mapboxApiKey}`

        const response = await fetch(url)

        if (!response.ok) {
            logger.error(`Mapbox API error: ${response.statusText}`)
            return null
        }

        const data = await response.json()

        if (data.features && data.features.length > 0) {
            const feature = data.features[0]
            const [longitude, latitude] = feature.center

            logger.debug(
                `Geocoded "${locationString}" to [${latitude}, ${longitude}] (${feature.place_name})`,
            )
            return { latitude, longitude }
        } else {
            logger.debug(`No geocoding results found for: "${locationString}"`)
            return null
        }
    } catch (error) {
        logger.error('Error geocoding location:', error)
        return null
    }
}

/**
 * Use Google Gemini to extract location information from station metadata
 */
async function extractLocationFromMetadata(
    station: RadioStation,
): Promise<string | null> {
    try {
        const genAI = new GoogleGenerativeAI(
            defaultConfig.transcription.google.apiKey,
        )
        const model = genAI.getGenerativeModel({
            model: defaultConfig.transcription.google.model,
            generationConfig: { responseMimeType: 'application/json' },
        })

        const prompt = dedent`
            I need to determine the location (city and state/province/region) of a radio station based on its metadata.
            
            Station Name: ${station.stationName}
            Website URL: ${station.websiteUrl}
            Country: ${station.country}
            Country Code: ${station.countryCode}
            State: ${station.state}
            
            Based on this metadata, what is the most likely city and state/province/region where this station is located?
            If you can determine the location, respond ONLY with the location in the format:
            
            {
                "city": "City",
                "state": "State/Province",
                "country": "Country"
            }
            
            For any of the location properties that you cannot determine with confidence, use "UNKNOWN" for the value.
            The state/province field must be determined for a successful location extraction.
        `

        logger.debug(
            `Sending station metadata to LLM for location extraction: ${station.stationName}`,
        )
        const result = await model.generateContent(prompt)
        const response = result.response.text().trim()

        // Parse the JSON response
        let locationData: { city: string; state: string; country: string }
        try {
            locationData = JSON.parse(response)
        } catch (parseError) {
            logger.error(
                `Failed to parse LLM response as JSON: ${response}`,
                parseError,
            )
            return null
        }

        // Check if any valid location data was found
        // Required: state must be known
        if (
            locationData.state === 'UNKNOWN' ||
            (locationData.city === 'UNKNOWN' &&
                locationData.country === 'UNKNOWN')
        ) {
            logger.debug(
                `LLM could not determine sufficient location from metadata for ${station.stationName} (state is required)`,
            )
            return null
        }

        // Format location string with the available data
        const locationParts: string[] = []
        if (locationData.city !== 'UNKNOWN')
            locationParts.push(locationData.city)
        if (locationData.state !== 'UNKNOWN')
            locationParts.push(locationData.state)
        if (locationData.country !== 'UNKNOWN')
            locationParts.push(locationData.country)

        // If we have any valid location parts, return them as a comma-separated string
        if (locationParts.length > 0) {
            const locationString = locationParts.join(', ')
            logger.debug(
                `LLM extracted location from metadata for ${station.stationName}: "${locationString}"`,
            )
            return locationString
        } else {
            logger.debug(
                `No valid location parts found from metadata for ${station.stationName}`,
            )
            return null
        }
    } catch (error) {
        logger.error(
            'Error using LLM to extract location from metadata:',
            error,
        )
        return null
    }
}

/**
 * Process a single station to determine its geolocation
 */
async function processStation(station: RadioStation): Promise<RadioStation> {
    // Skip if station already has geolocation
    if (station.hasGeolocation && station.latitude && station.longitude) {
        return station
    }

    logger.info(
        `Processing station: ${station.stationName} (${station.stationId})`,
    )

    // Skip if no website URL
    if (!station.websiteUrl) {
        logger.warn(
            `Station ${station.stationName} has no website URL, skipping`,
        )
        return station
    }

    // New Step 1: Try to extract location from station metadata first
    logger.info(
        `STEP 1: Attempting to extract location from station metadata for ${station.stationName}`,
    )
    let locationString = await extractLocationFromMetadata(station)

    // If metadata extraction was successful, proceed to geocoding
    if (locationString) {
        logger.info(
            `Extracted location from metadata for ${station.stationName}: ${locationString}`,
        )
    } else {
        // If metadata extraction failed, fall back to original method
        logger.info(
            `Could not extract location from metadata, falling back to website scraping`,
        )

        // Original Step 1: Scrape the website
        logger.info(`STEP 1b: Scraping website: ${station.websiteUrl}`)
        const websiteContent = await scrapeWebsite(station.websiteUrl)
        if (!websiteContent) {
            logger.warn(
                `Could not scrape website for station ${station.stationName}`,
            )
            return station
        }

        // Original Step 2: Extract location with LLM from website content
        logger.info(
            `STEP 2: Extracting location with LLM from website content for ${station.stationName}`,
        )
        locationString = await extractLocationWithLLM(
            station.stationName,
            websiteContent,
        )
        if (!locationString) {
            logger.warn(
                `Could not extract location for station ${station.stationName}`,
            )
            return station
        }

        logger.info(
            `Extracted location from website content for ${station.stationName}: ${locationString}`,
        )
    }

    // Step 3: Geocode the location
    logger.info(`STEP 3: Geocoding location: ${locationString}`)
    const coordinates = await geocodeLocation(locationString)
    if (!coordinates) {
        logger.warn(
            `Could not geocode location for station ${station.stationName}: ${locationString}`,
        )
        return station
    }

    // Update the station with the new geolocation data
    const updatedStation = {
        ...station,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        hasGeolocation: true,
        geolocatedBy: 'geolocate-script',
        geolocatedFrom: locationString,
        geolocatedAt: new Date().toISOString(),
    }

    logger.success(
        `Successfully geolocated station ${station.stationName}: ${locationString} => [${coordinates.latitude}, ${coordinates.longitude}]`,
    )

    return updatedStation
}

/**
 * Process all stations without geolocation
 */
async function processAllStations(): Promise<void> {
    try {
        // Read the filtered stations
        const spinner = ora('Reading filtered stations from file...').start()
        const stations = await readFilteredStations()
        spinner.succeed(`Read ${stations.length} filtered stations from file`)

        // Find stations without geolocation
        const stationsWithoutGeo = stations.filter(
            (station: RadioStation) =>
                !station.hasGeolocation ||
                !station.latitude ||
                !station.longitude,
        )
        logger.info(
            `Found ${stationsWithoutGeo.length} stations without geolocation out of ${stations.length} total`,
        )

        if (stationsWithoutGeo.length === 0) {
            logger.success('All stations already have geolocation data')
            return
        }

        // Process each station
        const updatedStations = [...stations]
        for (let i = 0; i < stationsWithoutGeo.length; i++) {
            const station = stationsWithoutGeo[i]
            const progressSpinner = ora(
                `Processing station ${i + 1}/${stationsWithoutGeo.length}: ${station.stationName}`,
            ).start()

            try {
                const updatedStation = await processStation(station)

                // Update the station in the full list
                const index = updatedStations.findIndex(
                    (s: RadioStation) => s.stationId === station.stationId,
                )
                if (index !== -1) {
                    updatedStations[index] = updatedStation
                }

                if (
                    updatedStation.hasGeolocation &&
                    updatedStation.latitude &&
                    updatedStation.longitude
                ) {
                    progressSpinner.succeed(
                        `Geolocated station ${i + 1}/${stationsWithoutGeo.length}: ${station.stationName} [${updatedStation.latitude}, ${updatedStation.longitude}]`,
                    )
                } else {
                    progressSpinner.warn(
                        `Could not geolocate station ${i + 1}/${stationsWithoutGeo.length}: ${station.stationName}`,
                    )
                }
            } catch (error) {
                progressSpinner.fail(
                    `Error processing station ${i + 1}/${stationsWithoutGeo.length}: ${station.stationName}`,
                )
                logger.error(
                    `Error processing station ${station.stationName}:`,
                    error,
                )
            }
        }

        // Save the updated stations
        const saveSpinner = ora('Saving updated stations...').start()
        await writeFilteredStations(updatedStations)
        saveSpinner.succeed(
            `Saved ${updatedStations.length} stations with updated geolocation data`,
        )

        // Log summary
        const newlyGeolocated = updatedStations.filter(
            (station: RadioStation) =>
                station.hasGeolocation &&
                station.latitude &&
                station.longitude &&
                station.geolocatedBy === 'geolocate-script',
        )
        logger.success(
            `Successfully geolocated ${newlyGeolocated.length} stations`,
        )
    } catch (error) {
        logger.error('Error processing stations:', error)
        throw error
    }
}

/**
 * Process a specific station by ID
 */
async function processStationById(stationId: string): Promise<void> {
    try {
        // Read the filtered stations
        const spinner = ora('Reading filtered stations from file...').start()
        const stations = await readFilteredStations()
        spinner.succeed(`Read ${stations.length} filtered stations from file`)

        // Find the station
        const station = stations.find(
            (s: RadioStation) => s.stationId === stationId,
        )
        if (!station) {
            spinner.fail(`Station with ID ${stationId} not found`)
            return
        }

        spinner.text = `Processing station: ${station.stationName}`
        logger.info(
            `Processing single station: ${station.stationName} (${stationId})`,
        )

        // Process the station
        const updatedStation = await processStation(station)

        // Update the station in the full list
        const index = stations.findIndex(
            (s: RadioStation) => s.stationId === stationId,
        )
        if (index !== -1) {
            stations[index] = updatedStation
        }

        if (
            updatedStation.hasGeolocation &&
            updatedStation.latitude &&
            updatedStation.longitude
        ) {
            spinner.succeed(
                `Successfully geolocated station ${station.stationName}: [${updatedStation.latitude}, ${updatedStation.longitude}]`,
            )
        } else {
            spinner.warn(`Could not geolocate station ${station.stationName}`)
        }

        // Save the updated stations
        const saveSpinner = ora('Saving updated stations...').start()
        await writeFilteredStations(stations)
        saveSpinner.succeed('Saved stations with updated geolocation data')
    } catch (error) {
        logger.error('Error processing station:', error)
        throw error
    }
}

/**
 * Main function
 */
async function main() {
    logger.info('Starting station geolocation process')

    try {
        // Parse command line arguments
        const args = process.argv.slice(2)

        if (args.length > 0) {
            // If a station ID is provided, process only that station
            const stationId = args[0]
            await processStationById(stationId)
        } else {
            // Otherwise, process all stations without geolocation
            await processAllStations()
        }

        logger.success('Station geolocation completed successfully')
    } catch (error) {
        logger.error('Error during station geolocation:', error)
        process.exit(1)
    }
}

// Run the main function if this file is executed directly
if (import.meta.path === Bun.main) {
    main().catch((error) => {
        logger.error('Unhandled error in main function:', error)
        process.exit(1)
    })
}

export default main
