/**
 * Radio Browser API Type Definitions
 *
 * Type definitions for the radio-browser.info API client.
 */

/**
 * RadioStationServer represents a radio server that can be used to fetch radio stations.
 */
export type RadioStationServer = {
    name: string
    hostname: string
    ip: string
}

/**
 * Enum of possible station categories assigned by the classification process
 */
export enum RadioStationCategory {
    Music = 'music',
    News = 'news',
    Talk = 'talk',
    Sports = 'sports',
    Mixed = 'mixed',
    Unknown = 'unknown',
}

/**
 * StationData represents the processed and normalized data for a radio station.
 * This is the format we store after fetching from the radio-browser.info API
 * and is used throughout the application.
 */
export interface RadioStation {
    // Basic information
    stationId: string
    stationName: string
    streamUrl: string
    websiteUrl: string
    logoUrl: string

    // Content metadata
    tags: string[]

    // Geographic information
    country: string
    countryCode: string
    state: string
    latitude: number | null
    longitude: number | null
    hasGeolocation: boolean

    // Language information
    language: string
    languageCodes: string[]

    // Technical specifications
    codec: string
    bitrate: number
    isHls: boolean
    hasSslError: boolean
    hasExtendedInfo: boolean

    // Popularity and engagement
    votes: number
    clickCount: number
    clickTrend: number

    // Status information
    isOnline: boolean

    // Classification fields (determined by LLM)
    category?: 'music' | 'news' | 'talk' | 'sports' | 'mixed' | 'unknown'
    subcategory?: string
}

/**
 * RawRadioStation represents the raw data for a radio station from the radio-browser.info API.
 * This is the format we receive from the API and is used for initial processing.
 */
export type RawRadioStation = {
    changeuuid: string
    stationuuid: string
    name: string
    url: string
    url_resolved: string
    homepage: string
    favicon: string
    tags: string
    country: string
    countrycode: string
    state: string
    language: string
    votes: number
    lastchangetime: string
    lastchangetime_iso8601: string
    codec: string
    bitrate: number
    hls: number
    lastcheckok: number
    lastchecktime: string
    lastchecktime_iso8601: string
    lastcheckoktime: string
    lastcheckoktime_iso8601: string
    lastlocalchecktime: string
    lastlocalchecktime_iso8601: string
    clicktimestamp: string
    clicktimestamp_iso8601: string
    clickcount: number
    clicktrend: number
    ssl_error: number
    geo_lat: number | null
    geo_long: number | null
    has_extended_info: boolean
    // Additional fields for determining "live" status
    is_talk?: boolean
    has_live_broadcast?: boolean
    distance?: number // Add distance field for location-based searches
}

/**
 * RadioStationFilter represents the filters that can be applied to the radio-browser.info API.
 * This is used to filter the stations that are returned from the API.
 */
export type RadioStationFilter = {
    name?: string
    country?: string
    countrycode?: string
    state?: string
    language?: string
    tag?: string
    tagList?: string // comma-separated list of tags
    codec?: string
    bitrateMin?: number
    bitrateMax?: number
    hasGeoInfo?: boolean
    has_extended_info?: boolean
    is_talk?: boolean // Custom - not directly in API
    lastcheckok?: string // 1 for stations that are online, 0 for offline stations
    limit?: number
    offset?: number
    order?: string
    reverse?: boolean
}
