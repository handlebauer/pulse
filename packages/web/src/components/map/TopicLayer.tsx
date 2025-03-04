import { useEffect, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import { TranscriptionData } from '@/hooks/useTranscriptions'
import { Station } from './types'

interface TopicLayerProps {
    map: mapboxgl.Map | null
    stations: Station[]
    transcriptionMap: Record<string, TranscriptionData>
}

// Distance threshold for considering two points as being too close (in pixels)
const COLLISION_THRESHOLD = 100

// Possible offset directions for overlapping topics
const OFFSET_DIRECTIONS = [
    { x: 0, y: -30 }, // up
    { x: 30, y: -15 }, // up-right
    { x: 30, y: 15 }, // down-right
    { x: 0, y: 30 }, // down
    { x: -30, y: 15 }, // down-left
    { x: -30, y: -15 }, // up-left
]

export function TopicLayer({
    map,
    stations,
    transcriptionMap,
}: TopicLayerProps) {
    const [markers, setMarkers] = useState<mapboxgl.Marker[]>([])
    const [stationToMarkerMap, setStationToMarkerMap] = useState<
        Record<string, mapboxgl.Marker>
    >({})

    // Keep track of placed markers with their positions and offsets
    const [placedMarkerPositions, setPlacedMarkerPositions] = useState<
        Array<{
            id: string
            lngLat: [number, number]
            pixelCoords: { x: number; y: number }
            offsetIndex: number
        }>
    >([])

    // Clean up markers on unmount
    useEffect(() => {
        return () => {
            markers.forEach((marker) => marker.remove())
        }
    }, [markers])

    // Function to calculate pixel distance between two points
    const getPixelDistance = useCallback(
        (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
            return Math.sqrt(
                Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2),
            )
        },
        [],
    )

    // Function to get the appropriate coordinates based on zoom level
    const getCoordinatesForStation = useCallback(
        (station: Station, zoomLevel: number) => {
            if (!map) return [station.longitude, station.latitude]

            // Get the stations source
            const source = map.getSource('stations') as mapboxgl.GeoJSONSource
            if (!source || !source['_data'])
                return [station.longitude, station.latitude]

            // Get the feature collection
            const data = source['_data'] as GeoJSON.FeatureCollection
            if (!data || !data.features)
                return [station.longitude, station.latitude]

            // Find the feature for this station
            const feature = data.features.find(
                (f) => f.properties && f.properties.id === station.id,
            )

            if (!feature || !feature.properties)
                return [station.longitude, station.latitude]

            // For high zoom levels (>= 4), use the spread coordinates if available
            if (zoomLevel >= 4) {
                const spreadLongitude = feature.properties.spreadLongitude
                const spreadLatitude = feature.properties.spreadLatitude

                if (
                    spreadLongitude !== undefined &&
                    spreadLatitude !== undefined
                ) {
                    return [spreadLongitude, spreadLatitude]
                }
            }

            // Default to original coordinates
            return [station.longitude, station.latitude]
        },
        [map],
    )

    // Function to find optimal offset direction for a marker to avoid collisions
    const findOptimalOffset = useCallback(
        (
            id: string,
            lngLat: [number, number],
            existingPositions: typeof placedMarkerPositions,
        ) => {
            if (!map) return { offsetIndex: 0, pixelCoords: { x: 0, y: 0 } }

            // Convert to pixel coordinates
            const point = map.project(new mapboxgl.LngLat(lngLat[0], lngLat[1]))
            const pixelCoords = { x: point.x, y: point.y }

            // Try each offset direction and find one with minimal collisions
            for (let i = 0; i < OFFSET_DIRECTIONS.length; i++) {
                const offsetPoint = {
                    x: pixelCoords.x + OFFSET_DIRECTIONS[i].x,
                    y: pixelCoords.y + OFFSET_DIRECTIONS[i].y,
                }

                // Check if this offset causes collisions with existing markers
                const hasCollision = existingPositions.some((pos) => {
                    // Don't check against self
                    if (pos.id === id) return false

                    // Check if the distance is below threshold
                    const offsetPixelCoords = {
                        x:
                            pos.pixelCoords.x +
                            OFFSET_DIRECTIONS[pos.offsetIndex].x,
                        y:
                            pos.pixelCoords.y +
                            OFFSET_DIRECTIONS[pos.offsetIndex].y,
                    }

                    return (
                        getPixelDistance(offsetPoint, offsetPixelCoords) <
                        COLLISION_THRESHOLD
                    )
                })

                if (!hasCollision) {
                    // Found a good offset with no collisions
                    return { offsetIndex: i, pixelCoords }
                }
            }

            // If all positions have collisions, use the first offset as fallback
            return { offsetIndex: 0, pixelCoords }
        },
        [map, getPixelDistance],
    )

    // Update marker positions when zoom changes
    const updateMarkerPositions = useCallback(() => {
        if (!map) return

        const currentZoom = map.getZoom()
        const newPlacedPositions: typeof placedMarkerPositions = []

        // First pass: collect all initial positions
        const initialPositions = stations
            .filter((station) => transcriptionMap[station.id]?.topics.length)
            .map((station) => {
                const [lng, lat] = getCoordinatesForStation(
                    station,
                    currentZoom,
                )
                return {
                    id: station.id,
                    lngLat: [lng, lat] as [number, number],
                }
            })

        // Second pass: determine optimal offsets
        initialPositions.forEach(({ id, lngLat }) => {
            // Find optimal offset to avoid collisions
            const { offsetIndex, pixelCoords } = findOptimalOffset(
                id,
                lngLat,
                newPlacedPositions,
            )

            // Add to placed positions
            newPlacedPositions.push({
                id,
                lngLat,
                pixelCoords,
                offsetIndex,
            })

            // Update marker position and offset
            const marker = stationToMarkerMap[id]
            if (marker) {
                // Update marker position
                marker.setLngLat(lngLat)

                // Apply the offset to the HTML element
                const el = marker.getElement()
                const topicEl = el.querySelector('.topic-text')
                if (topicEl) {
                    const offset = OFFSET_DIRECTIONS[offsetIndex]
                    // Apply offset through CSS transform
                    const translateX = -50 + (offset.x * 100) / 30 // Convert to percentage relative to -50%
                    topicEl.setAttribute(
                        'style',
                        `
                        background-color: rgba(0, 0, 0, 0.7);
                        color: white;
                        padding: 4px 8px;
                        border-radius: 12px;
                        font-size: 12px;
                        font-weight: bold;
                        white-space: nowrap;
                        position: absolute;
                        bottom: ${40 + offset.y}px;
                        left: 50%;
                        transform: translateX(${translateX}%);
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    `,
                    )
                }
            }
        })

        setPlacedMarkerPositions(newPlacedPositions)
    }, [
        map,
        stations,
        transcriptionMap,
        stationToMarkerMap,
        getCoordinatesForStation,
        findOptimalOffset,
    ])

    // Update markers when transcription data changes
    useEffect(() => {
        if (!map) return

        // Remove existing markers
        markers.forEach((marker) => marker.remove())
        const newMarkers: mapboxgl.Marker[] = []
        const newStationToMarkerMap: Record<string, mapboxgl.Marker> = {}
        const currentZoom = map.getZoom()
        const newPlacedPositions: typeof placedMarkerPositions = []

        // First pass: collect all initial positions
        const initialPositions = stations
            .filter((station) => transcriptionMap[station.id]?.topics.length)
            .map((station) => {
                const [lng, lat] = getCoordinatesForStation(
                    station,
                    currentZoom,
                )
                return {
                    id: station.id,
                    lngLat: [lng, lat] as [number, number],
                }
            })

        // Second pass: determine optimal offsets and create markers
        initialPositions.forEach(({ id, lngLat }) => {
            const station = stations.find((s) => s.id === id)
            if (!station) return

            const transcription = transcriptionMap[station.id]
            if (!transcription || !transcription.topics.length) return

            // Find optimal offset to avoid collisions
            const { offsetIndex, pixelCoords } = findOptimalOffset(
                id,
                lngLat,
                newPlacedPositions,
            )

            // Add to placed positions
            newPlacedPositions.push({
                id,
                lngLat,
                pixelCoords,
                offsetIndex,
            })

            // Create topic bubble
            const el = document.createElement('div')
            el.className = 'topic-bubble'
            el.style.position = 'relative'

            // Get the offset
            const offset = OFFSET_DIRECTIONS[offsetIndex]

            // Create topic text with the applied offset
            const topicEl = document.createElement('div')
            topicEl.className = 'topic-text'
            topicEl.textContent = transcription.topics[0] // Show the top topic

            // Apply offset through styles
            const translateX = -50 + (offset.x * 100) / 30 // Convert to percentage relative to -50%
            topicEl.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'
            topicEl.style.color = 'white'
            topicEl.style.padding = '4px 8px'
            topicEl.style.borderRadius = '12px'
            topicEl.style.fontSize = '12px'
            topicEl.style.fontWeight = 'bold'
            topicEl.style.whiteSpace = 'nowrap'
            topicEl.style.position = 'absolute'
            topicEl.style.bottom = `${30 + offset.y}px`
            topicEl.style.left = '50%'
            topicEl.style.transform = `translateX(${translateX}%)`
            topicEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)'

            el.appendChild(topicEl)

            // Add tooltip with more topics on hover
            if (transcription.topics.length > 1) {
                el.title = transcription.topics.join(', ')

                // Add indicator dot for additional topics
                const dotEl = document.createElement('div')
                dotEl.style.width = '6px'
                dotEl.style.height = '6px'
                dotEl.style.borderRadius = '50%'
                dotEl.style.backgroundColor = '#4CAF50'
                dotEl.style.position = 'absolute'
                dotEl.style.top = '-3px'
                dotEl.style.right = '-3px'

                topicEl.appendChild(dotEl)
            }

            // Create and add marker
            const marker = new mapboxgl.Marker({ element: el })
                .setLngLat(lngLat)
                .addTo(map)

            newMarkers.push(marker)
            newStationToMarkerMap[station.id] = marker
        })

        setMarkers(newMarkers)
        setStationToMarkerMap(newStationToMarkerMap)
        setPlacedMarkerPositions(newPlacedPositions)
    }, [
        map,
        stations,
        transcriptionMap,
        getCoordinatesForStation,
        findOptimalOffset,
    ])

    // Set up event listeners for map zoom and movement
    useEffect(() => {
        if (!map) return

        // Listen for zoom events to update marker positions
        map.on('zoom', updateMarkerPositions)

        // Also update positions when the map moves
        map.on('moveend', updateMarkerPositions)

        // Clean up event listeners on unmount
        return () => {
            map.off('zoom', updateMarkerPositions)
            map.off('moveend', updateMarkerPositions)
        }
    }, [map, updateMarkerPositions])

    return null // This is a non-visual component that manipulates the map
}
