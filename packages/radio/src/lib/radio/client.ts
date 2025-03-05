/**
 * Radio Browser API
 *
 * A client for the radio-browser.info API to fetch radio stations and their metadata.
 * Based on the official API documentation: https://api.radio-browser.info/
 */

import type {
    RadioStationServer,
    RawRadioStation,
    RadioStation,
    RadioStationFilter,
} from './types'

export class RadioBrowserAPI {
    private baseUrl: string | null = null
    private readonly userAgent: string
    private cachedServers: RadioStationServer[] = []
    private lastServerFetch: number = 0
    private readonly serverCacheTTL: number = 3600000 // 1 hour in milliseconds

    /**
     * Creates a new instance of the Radio Browser API client
     * @param userAgent User agent to use for API requests (required by the API)
     */
    constructor(userAgent: string = 'pulse-radio-browser/1.0') {
        this.userAgent = userAgent
    }

    /**
     * Get a list of all available API servers via DNS
     * This follows the recommended approach from radio-browser.info
     */
    private async getServers(): Promise<RadioStationServer[]> {
        // Check if we have cached servers that are still valid
        const now = Date.now()
        if (
            this.cachedServers.length > 0 &&
            now - this.lastServerFetch < this.serverCacheTTL
        ) {
            return this.cachedServers
        }

        try {
            // Instead of fetching from all.api.radio-browser.info which has certificate issues,
            // use a specific API server that's known to work
            const response = await fetch(
                `${process.env.RADIO_BROWSER_API_URL}/servers`,
            )

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch servers: ${response.status} ${response.statusText}`,
                )
            }

            const servers = (await response.json()) as RadioStationServer[]

            // Update the cache
            this.cachedServers = servers
            this.lastServerFetch = now

            return servers
        } catch (error) {
            console.error('Error fetching radio browser servers:', error)

            // If we have cached servers, return them as fallback
            if (this.cachedServers.length > 0) {
                console.warn('Using cached servers as fallback')
                return this.cachedServers
            }

            // Last resort, return a hardcoded list of known servers
            return [
                {
                    name: 'de1.api.radio-browser.info',
                    hostname: 'de1.api.radio-browser.info',
                    ip: '',
                },
                {
                    name: 'nl1.api.radio-browser.info',
                    hostname: 'nl1.api.radio-browser.info',
                    ip: '',
                },
                {
                    name: 'at1.api.radio-browser.info',
                    hostname: 'at1.api.radio-browser.info',
                    ip: '',
                },
            ]
        }
    }

    /**
     * Get a random server to use for API requests
     */
    private async getRandomServer(): Promise<string> {
        if (this.baseUrl) {
            return this.baseUrl
        }

        const servers = await this.getServers()

        // If no servers are available, use a default server
        if (!servers || servers.length === 0) {
            return 'de1.api.radio-browser.info'
        }

        // Select a random server from the list
        const randomIndex = Math.floor(Math.random() * servers.length)
        const server = servers[randomIndex]

        this.baseUrl = `https://${server.name}`
        return this.baseUrl
    }

    /**
     * Make an API request to the radio browser
     * @param endpoint The API endpoint to request
     * @param method HTTP method to use
     * @param params Query parameters to include
     */
    private async makeRequest<T>(
        endpoint: string,
        method: string = 'GET',
        params: Record<string, string | number | boolean> = {},
    ): Promise<T> {
        const baseUrl = await this.getRandomServer()
        const url = new URL(`${baseUrl}/json/${endpoint}`)

        // Add query parameters
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.append(key, value.toString())
            }
        })

        const response = await fetch(url.toString(), {
            method,
            headers: {
                'User-Agent': this.userAgent,
                'Content-Type': 'application/json',
            },
        })

        if (!response.ok) {
            throw new Error(
                `API request failed: ${response.status} ${response.statusText}`,
            )
        }

        return (await response.json()) as T
    }

    /**
     * Transform raw station data to our normalized RadioStation format
     */
    private transformStation(raw: RawRadioStation): RadioStation {
        return {
            // Basic information
            stationId: raw.stationuuid,
            stationName: raw.name,
            streamUrl: raw.url_resolved,
            websiteUrl: raw.homepage,
            logoUrl: raw.favicon,

            // Content metadata
            tags: raw.tags
                .split(',')
                .map((tag: string) => tag.trim())
                .filter(Boolean),

            // Geographic information
            country: raw.country,
            countryCode: raw.countrycode,
            state: raw.state,
            latitude: raw.geo_lat,
            longitude: raw.geo_long,
            hasGeolocation: raw.geo_lat !== null && raw.geo_long !== null,

            // Language information
            language: raw.language,
            languageCodes: raw.language
                .split(',')
                .map((lang: string) => lang.trim())
                .filter(Boolean),

            // Technical specifications
            codec: raw.codec,
            bitrate: raw.bitrate,
            isHls: raw.hls === 1,
            hasSslError: raw.ssl_error === 1,
            hasExtendedInfo: raw.has_extended_info,

            // Popularity and engagement
            votes: raw.votes,
            clickCount: raw.clickcount,
            clickTrend: raw.clicktrend,

            // Status information
            isOnline: raw.lastcheckok === 1,
        }
    }

    /**
     * Get a list of stations based on the provided filters
     * @param filter Optional filters to apply to the station search
     */
    async getStations(
        filter: RadioStationFilter = {},
    ): Promise<RadioStation[]> {
        try {
            // Handle custom filters that aren't directly supported by the API
            const { is_talk, ...apiFilters } = filter

            // For talk radio stations, we can add some helpful tags to the search
            const enhancedFilters = { ...apiFilters }
            if (is_talk) {
                // If looking for talk stations, add some common talk radio tags
                enhancedFilters.tagList = 'talk,news,sports,discussion'
            }

            // Make the API request
            const rawStations = await this.makeRequest<RawRadioStation[]>(
                'stations/search',
                'GET',
                enhancedFilters,
            )

            // Transform raw stations to our normalized format
            const stations = rawStations.map((raw) =>
                this.transformStation(raw),
            )

            // Apply custom filters if needed
            let filteredStations = stations

            // If is_talk filter is specified, try to identify talk stations
            // This is an approximation as the API doesn't directly provide this information
            if (is_talk !== undefined) {
                filteredStations = stations.filter((station) => {
                    // Check for talk-related tags or keywords in the station name or tags
                    const isTalkStation = this.detectTalkStation(station)
                    return is_talk ? isTalkStation : !isTalkStation
                })
            }

            // Add our custom fields for client-side filtering
            return filteredStations.map((station) => ({
                ...station,
                category: this.detectTalkStation(station) ? 'talk' : 'music',
                subcategory: undefined, // We could add more sophisticated detection here
                isLive: this.detectLiveBroadcast(station),
            }))
        } catch (error) {
            console.error('Error fetching stations:', error)
            return []
        }
    }

    /**
     * Get stations sorted by popularity (most voted)
     * @param limit Number of stations to return (default: 100)
     */
    async getPopularStations(limit: number = 100): Promise<RadioStation[]> {
        return this.makeRequest<RadioStation[]>('stations', 'GET', {
            order: 'votes',
            reverse: true,
            limit,
        })
    }

    /**
     * Get stations by country
     * @param country Country name or code
     * @param limit Number of stations to return (default: 100)
     */
    async getStationsByCountry(
        country: string,
        limit: number = 100,
    ): Promise<RadioStation[]> {
        // Determine if country is a country code (2 chars) or country name
        const filter =
            country.length === 2
                ? { countrycode: country.toUpperCase(), limit }
                : { country, limit }

        return this.getStations(filter)
    }

    /**
     * Get stations by geographic location
     * @param latitude Latitude coordinate
     * @param longitude Longitude coordinate
     * @param radius Search radius in kilometers
     * @param limit Number of stations to return (default: 100)
     */
    async getStationsByLocation(
        latitude: number,
        longitude: number,
        radius: number = 50,
        limit: number = 100,
    ): Promise<RadioStation[]> {
        try {
            // First try to get stations with geo info
            const stations = await this.getStations({
                hasGeoInfo: true,
                limit: 5000, // Get more stations initially since we'll filter
            })

            console.log(`Found ${stations.length} stations with geo info`)

            // Calculate distance and filter
            const stationsWithCoords = stations.filter(
                (station) =>
                    station.latitude !== null && station.longitude !== null,
            )

            console.log(
                `Found ${stationsWithCoords.length} stations with valid coordinates`,
            )

            const stationsWithDistance = stationsWithCoords.map((station) => {
                const distance = this.calculateDistance(
                    latitude,
                    longitude,
                    station.latitude as number,
                    station.longitude as number,
                )
                return { ...station, distance }
            })

            const filteredStations = stationsWithDistance
                .filter(
                    (station) =>
                        station.distance !== undefined &&
                        station.distance <= radius,
                )
                .sort((a, b) => {
                    if (a.distance === undefined || b.distance === undefined)
                        return 0
                    return a.distance - b.distance
                })
                .slice(0, limit)

            console.log(
                `Found ${filteredStations.length} stations within ${radius}km radius`,
            )

            return filteredStations
        } catch (error) {
            console.error('Error getting stations by location:', error)
            return []
        }
    }

    /**
     * Calculate the distance between two geographic coordinates using the Haversine formula
     * @param lat1 Latitude of point 1
     * @param lon1 Longitude of point 1
     * @param lat2 Latitude of point 2
     * @param lon2 Longitude of point 2
     * @returns Distance in kilometers
     */
    private calculateDistance(
        lat1: number,
        lon1: number,
        lat2: number,
        lon2: number,
    ): number {
        const R = 6371 // Earth's radius in km
        const dLat = this.toRadians(lat2 - lat1)
        const dLon = this.toRadians(lon2 - lon1)

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) *
                Math.cos(this.toRadians(lat2)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2)

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        return R * c
    }

    /**
     * Convert degrees to radians
     */
    private toRadians(degrees: number): number {
        return degrees * (Math.PI / 180)
    }

    /**
     * Attempt to detect if a station is likely to have live broadcasts
     * This is a heuristic approach and may not be 100% accurate
     */
    private detectLiveBroadcast(station: RadioStation): boolean {
        // Check for keywords in tags or station name that suggest live broadcasts
        const keywords = [
            'talk',
            'news',
            'sports',
            'live',
            'radio',
            'community',
            'public',
            'npr',
            'bbc',
            'cbc',
        ]

        // Convert to lowercase for case-insensitive matching
        const nameLower = station.stationName.toLowerCase()
        const tagsLower = station.tags.join(',').toLowerCase()

        // Check for keywords in name or tags
        const hasKeywords = keywords.some(
            (keyword) =>
                nameLower.includes(keyword) || tagsLower.includes(keyword),
        )

        // Stations with high votes and are actually radio stations (not just music streams)
        // are more likely to be legitimate radio stations with live broadcasts
        const hasHighVotes = station.votes > 10

        // Check for negative indicators of music-only streams
        const musicKeywords = [
            'music only',
            '24/7',
            'nonstop',
            'non-stop',
            'commercial free',
            'hits',
        ]
        const isMusicOnly = musicKeywords.some(
            (keyword) =>
                nameLower.includes(keyword) || tagsLower.includes(keyword),
        )

        return (hasKeywords || hasHighVotes) && !isMusicOnly
    }

    /**
     * Attempt to detect if a station is likely to be a talk station
     * This is a heuristic approach and may not be 100% accurate
     */
    private detectTalkStation(station: RadioStation): boolean {
        // Keywords that suggest talk radio
        const talkKeywords = [
            'talk',
            'news',
            'sports',
            'discussion',
            'politics',
            'interview',
            'commentary',
            'public radio',
        ]

        // Convert to lowercase for case-insensitive matching
        const nameLower = station.stationName.toLowerCase()
        const tagsLower = station.tags.join(',').toLowerCase()

        // Check for talk keywords in name or tags
        return talkKeywords.some(
            (keyword) =>
                nameLower.includes(keyword) || tagsLower.includes(keyword),
        )
    }

    /**
     * Get stations by IDs
     * @param stationIds Array of station IDs to fetch
     */
    async getStationsById(stationIds: string[]): Promise<RadioStation[]> {
        if (!stationIds.length) {
            return []
        }

        try {
            // The radio-browser API doesn't have a direct endpoint to fetch stations by ID
            // So we'll fetch them one by one
            const stations: RadioStation[] = []

            for (const stationId of stationIds) {
                try {
                    const rawStations = await this.makeRequest<
                        RawRadioStation[]
                    >('stations/byuuid/' + encodeURIComponent(stationId), 'GET')

                    if (rawStations && rawStations.length > 0) {
                        const station = this.transformStation(rawStations[0])
                        stations.push(station)
                    }
                } catch (error) {
                    console.error(
                        `Error fetching station with ID ${stationId}:`,
                        error,
                    )
                    // Continue with the next ID
                }
            }

            // Add our custom fields for client-side filtering
            return stations.map((station) => ({
                ...station,
                category: this.detectTalkStation(station) ? 'talk' : 'music',
                subcategory: undefined, // We could add more sophisticated detection here
                isLive: this.detectLiveBroadcast(station),
            }))
        } catch (error) {
            console.error('Error fetching stations by IDs:', error)
            return []
        }
    }
}
