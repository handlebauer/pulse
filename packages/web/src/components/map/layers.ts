import { Station } from './types'

// Helper function to create a small offset for stations with the same coordinates
const createSpreadCoordinates = (
    stations: Station[],
): Record<string, [number, number]> => {
    // Group stations by their coordinates
    const coordinateGroups: Record<string, Station[]> = {}

    stations.forEach((station) => {
        const key = `${station.longitude},${station.latitude}`
        if (!coordinateGroups[key]) {
            coordinateGroups[key] = []
        }
        coordinateGroups[key].push(station)
    })

    // Create offsets for stations with the same coordinates
    const spreadCoordinates: Record<string, [number, number]> = {}

    Object.entries(coordinateGroups).forEach(([key, stationsAtLocation]) => {
        if (stationsAtLocation.length === 1) {
            // No need for offset if there's only one station at this location
            const station = stationsAtLocation[0]
            spreadCoordinates[station.id] = [
                station.longitude,
                station.latitude,
            ]
            return
        }

        // Get the base coordinates
        const [baseLng, baseLat] = key.split(',').map(Number)

        // For multiple stations, create a semi-random but controlled pattern
        // that still favors land areas but looks more natural

        // Base spread distance - moderate to keep points reasonably close
        const baseSpreadDistance = 0.06

        // Create a semi-random pattern with some constraints to favor land
        stationsAtLocation.forEach((station, index) => {
            // Use a combination of deterministic and semi-random positioning

            // Start with a golden angle to create a natural-looking spiral
            // This creates a more organic pattern than a grid but is still evenly distributed
            const goldenAngle = 137.5 * (Math.PI / 180) // Golden angle in radians
            const angle = index * goldenAngle

            // Distance increases slightly with index but with some variation
            // This creates a spiral-like pattern but with natural variation
            const distance = baseSpreadDistance * (0.8 + (index % 3) * 0.2)

            // Calculate base offsets using the angle and distance
            let offsetX = Math.cos(angle) * distance
            let offsetY = Math.sin(angle) * distance

            // Add some controlled randomness to make it look less perfect
            // Use a seeded random based on station ID to keep it consistent
            const randomSeed = station.id.charCodeAt(0) / 255
            const smallRandomX =
                (Math.sin(index * 0.7) * 0.4 + 0.6) * randomSeed * 0.02
            const smallRandomY =
                (Math.cos(index * 0.7) * 0.4 + 0.6) * randomSeed * 0.02

            offsetX += smallRandomX
            offsetY += smallRandomY

            // Apply directional bias based on location to favor land
            // For example, for London we might want to bias slightly south and east
            // This is a simple heuristic that can be adjusted
            const biasX = 0.01
            const biasY = -0.005 // Slight southward bias for London

            // Compress the Y (latitude) spread slightly as land often extends more east-west
            offsetY *= 0.7

            spreadCoordinates[station.id] = [
                baseLng + offsetX + biasX,
                baseLat + offsetY + biasY,
            ]
        })
    })

    return spreadCoordinates
}

export const addStationLayers = (map: mapboxgl.Map, stations: Station[]) => {
    // Create spread coordinates for stations with the same location
    const spreadCoordinates = createSpreadCoordinates(stations)

    // Add stations source with clustering enabled
    map.addSource('stations', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: stations.map((station) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [station.longitude, station.latitude],
                },
                properties: {
                    id: station.id,
                    name: station.stationName,
                    streamUrl: station.streamUrl,
                    // Store the spread coordinates for use when zoomed in
                    spreadLongitude: spreadCoordinates[station.id][0],
                    spreadLatitude: spreadCoordinates[station.id][1],
                },
            })),
        },
        cluster: true,
        clusterMaxZoom: 7, // Lower the max zoom for clustering to break clusters even earlier
        clusterRadius: 30, // Reduce cluster radius further to make clusters break apart more easily
    })

    // Add cluster layers
    map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'stations',
        filter: ['has', 'point_count'],
        paint: {
            'circle-color': 'rgba(165, 180, 252, 0.8)', // Light indigo/lavender color that's thematic but different from station points
            'circle-radius': [
                'step',
                ['get', 'point_count'],
                10, // Size for clusters with < 3 points
                3,
                15, // Size for clusters with 3-7 points
                8,
                20, // Size for clusters with >= 8 points
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
            'circle-stroke-opacity': 0.7, // Increased to match unclustered points
        },
    })

    // Add cluster count labels
    map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'stations',
        filter: ['has', 'point_count'],
        layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12,
        },
        paint: {
            'text-color': '#000000', // Changed from #333333 (dark gray) to black for better visibility
        },
    })

    // Add unclustered point layer (replacing the original station layer)
    map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'stations',
        filter: ['!', ['has', 'point_count']],
        paint: {
            'circle-radius': 6,
            'circle-color': '#6366f1', // Changed from '#fff' to indigo color to match topic-stations
            'circle-opacity': 0.8,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#eeeeee', // Keep white border
            'circle-stroke-opacity': 0.5, // Increased from 0.3 to make the white border more visible
        },
    })

    // Add hit area for unclustered points
    map.addLayer({
        id: 'unclustered-point-hit-area',
        type: 'circle',
        source: 'stations',
        filter: ['!', ['has', 'point_count']],
        paint: {
            'circle-radius': 15,
            'circle-color': '#fff',
            'circle-opacity': 0,
        },
    })
}

// Function to handle cluster clicks - zoom in to expand the cluster
export const setupClusterClickHandlers = (map: mapboxgl.Map) => {
    // Inspect a cluster on click
    map.on('click', 'clusters', (e) => {
        if (!e.features || e.features.length === 0) return

        const feature = e.features[0]
        const clusterId = feature.properties?.cluster_id

        if (!clusterId) return

        const source = map.getSource('stations') as mapboxgl.GeoJSONSource

        // Use getClusterExpansionZoom but with a cap to prevent excessive zooming
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err || zoom === undefined || zoom === null) return

            // Cap the zoom level to maintain context
            // Use a slightly lower zoom level to keep more context visible
            const targetZoom = Math.min(zoom, 9.5)

            // Get the cluster's coordinates
            const coordinates = (feature.geometry as GeoJSON.Point)
                .coordinates as [number, number]

            // Zoom to the cluster with a smoother, longer animation
            map.easeTo({
                center: coordinates,
                zoom: targetZoom,
                duration: 1200, // Longer animation for smoother experience
            })

            // Force the spread of points at this zoom level
            // Do it immediately and again after animation completes
            // Trigger a manual update of station positions immediately
            const zoomEvent = new Event('zoom')
            map.getCanvas().dispatchEvent(zoomEvent)

            // And again after animation completes
            setTimeout(() => {
                map.getCanvas().dispatchEvent(zoomEvent)
            }, 1300) // Slightly after the animation completes
        })
    })

    // Change cursor when hovering over clusters
    map.on('mouseenter', 'clusters', () => {
        map.getCanvas().style.cursor = 'pointer'
    })

    map.on('mouseleave', 'clusters', () => {
        map.getCanvas().style.cursor = ''
    })
}

// Function to update station positions based on zoom level
export const setupZoomHandler = (map: mapboxgl.Map) => {
    // Track if a cluster was recently clicked
    let wasClusterClicked = false

    // Listen for cluster clicks to set the flag
    map.on('click', 'clusters', () => {
        wasClusterClicked = true
        // Reset the flag after some time
        setTimeout(() => {
            wasClusterClicked = false
        }, 5000) // Reset after 5 seconds (increased from 2 seconds)
    })

    // Function to update station positions
    const updateStationPositions = () => {
        const currentZoom = map.getZoom()
        const source = map.getSource('stations') as mapboxgl.GeoJSONSource

        // Only update positions if we have the source
        if (!source) return

        // Get the current data
        const data = source['_data'] as GeoJSON.FeatureCollection
        if (!data || !data.features) return

        // Update coordinates based on zoom level
        const updatedFeatures = data.features.map((feature) => {
            // Skip clusters
            if (feature.properties?.cluster) return feature

            // For high zoom levels or after a cluster click, use the spread coordinates
            // Lower the threshold to 4 to spread points at even lower zoom levels
            if (currentZoom >= 4 || wasClusterClicked) {
                const spreadLongitude = feature.properties?.spreadLongitude
                const spreadLatitude = feature.properties?.spreadLatitude

                if (
                    spreadLongitude !== undefined &&
                    spreadLatitude !== undefined
                ) {
                    return {
                        ...feature,
                        geometry: {
                            ...feature.geometry,
                            coordinates: [spreadLongitude, spreadLatitude],
                        },
                    }
                }
            }

            return feature
        })

        // Update the source data
        source.setData({
            type: 'FeatureCollection',
            features: updatedFeatures,
        })
    }

    // Listen for zoom events
    map.on('zoom', updateStationPositions)

    // Also update positions when the map moves
    map.on('moveend', updateStationPositions)

    // Initial update
    map.once('idle', updateStationPositions)
}
