#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { RadioStation } from '@pulse/radio'

// Path to the stations JSON file
const STATIONS_FILE_PATH = path.join(__dirname, 'db', 'stations.json')
const BACKUP_FILE_PATH = path.join(__dirname, 'db', 'stations.backup.json')

// Read the stations file
console.log(`Reading stations from ${STATIONS_FILE_PATH}...`)
const stationsData = fs.readFileSync(STATIONS_FILE_PATH, 'utf8')
const stations = JSON.parse(stationsData)

console.log(`Loaded ${stations.length} stations`)

// Create backup of original data
console.log(`Creating backup at ${BACKUP_FILE_PATH}...`)
fs.writeFileSync(BACKUP_FILE_PATH, stationsData, 'utf8')
console.log(`Backup created successfully`)

// Group stations by geo coordinates
const stationsByCoordinates: Record<string, RadioStation[]> = {}
const stationsWithoutCoordinates: RadioStation[] = []

stations.forEach((station: RadioStation) => {
    // Skip stations without geo coordinates
    if (
        !station.hasGeolocation ||
        station.latitude === null ||
        station.longitude === null
    ) {
        stationsWithoutCoordinates.push(station)
        return
    }

    // Create a key from the coordinates (with fixed precision to handle floating point comparison)
    const key = `${station.latitude.toFixed(6)},${station.longitude.toFixed(6)}`

    // Initialize array for this coordinate if it doesn't exist
    if (!stationsByCoordinates[key]) {
        stationsByCoordinates[key] = []
    }

    // Add station to the list for this coordinate
    stationsByCoordinates[key].push(station)
})

// For each set of coordinates, keep only the station with the highest votes
const dedupedStations: RadioStation[] = []

Object.keys(stationsByCoordinates).forEach((coordKey) => {
    const stationsAtCoord = stationsByCoordinates[coordKey]

    if (stationsAtCoord.length === 1) {
        // Only one station at this coordinate, no need to dedupe
        dedupedStations.push(stationsAtCoord[0])
        return
    }

    // Multiple stations at this coordinate
    console.log(
        `Found ${stationsAtCoord.length} stations at coordinate ${coordKey}`,
    )

    // Sort stations by votes (highest first) and keep the first one
    stationsAtCoord.sort((a, b) => b.votes - a.votes)

    const keptStation = stationsAtCoord[0]
    const removedStations = stationsAtCoord.slice(1)

    dedupedStations.push(keptStation)

    console.log(`Kept: ${keptStation.stationName} (${keptStation.votes} votes)`)
    removedStations.forEach((station) => {
        console.log(
            `  Removed: ${station.stationName} (${station.votes} votes)`,
        )
    })
})

// Write the deduped stations (without stationsWithoutCoordinates) to the original file
console.log(
    `\nWriting ${dedupedStations.length} stations to ${STATIONS_FILE_PATH}...`,
)
fs.writeFileSync(
    STATIONS_FILE_PATH,
    JSON.stringify(dedupedStations, null, 2),
    'utf8',
)

// Summary
const removedDuplicates =
    stations.length - dedupedStations.length - stationsWithoutCoordinates.length
console.log(`\nCleanup complete!`)
console.log(`Original station count: ${stations.length}`)
console.log(
    `Stations without coordinates removed: ${stationsWithoutCoordinates.length}`,
)
console.log(`Duplicate stations removed: ${removedDuplicates}`)
console.log(`Final station count: ${dedupedStations.length}`)
console.log(`Backup saved to: ${BACKUP_FILE_PATH}`)
