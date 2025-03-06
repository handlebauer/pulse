'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { RadioPlayer } from './RadioPlayer'
import { Station, MapRefs } from './map/types'
import { initializeMap, defaultMapConfig } from './map/mapConfig'
import {
    addStationLayers,
    setupClusterClickHandlers,
    setupZoomHandler,
} from './map/layers'
import { setupMapEventHandlers } from './map/eventHandlers'
import { popupStyles } from './map/styles'
import { removePopup } from './map/popupManager'
import { useTranscriptions } from '@/hooks/useTranscriptions'
import { SubtitleTranscription } from './SubtitleTranscription'
import { StationTopics } from './topics/StationTopics'
import { useTrendingTopics } from '@/hooks/useTrendingTopics'
import { cn } from '@/lib/utils'
import { useAudioPlayerContext } from '@/contexts/AudioPlayerContext'
import { MapLayerControls } from './map/MapLayerControls'
import { MapControls } from './map/MapControls'
import { TopicIndicator } from './TopicIndicator'

interface GlobeProps {
    stations: Station[]
}

export function Globe({ stations }: GlobeProps) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const refs = useRef<MapRefs>({ map: null, popup: null })
    const [selectedStation, setSelectedStation] = useState<Station | null>(null)
    const { transcriptionMap, isLoading } = useTranscriptions()
    const [showTranscription, setShowTranscription] = useState(false)
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)
    const { topics: visibleTopics } = useTrendingTopics(10)
    const { currentlyPlayingStation } = useAudioPlayerContext()
    const [topicStations, setTopicStations] = useState<string[]>([])
    const [isTrendingTopicsPanelVisible, setIsTrendingTopicsPanelVisible] =
        useState(false)

    useEffect(() => {
        if (!mapContainer.current) return
        const currentRefs = refs.current

        // Add custom CSS for the popup
        const style = document.createElement('style')
        style.textContent = popupStyles
        document.head.appendChild(style)

        // Initialize map
        const mapInstance = initializeMap({
            container: mapContainer.current,
            ...defaultMapConfig,
        })
        currentRefs.map = mapInstance

        // Setup map layers and handlers when loaded
        mapInstance.on('load', () => {
            addStationLayers(mapInstance, stations)

            // Setup cluster click handlers
            setupClusterClickHandlers(mapInstance)

            // Setup zoom handler
            setupZoomHandler(mapInstance)

            // Setup map event handlers
            setupMapEventHandlers(
                mapInstance,
                stations,
                currentRefs,
                (station: Station) => {
                    setSelectedStation(station)
                },
            )

            // Fit map to the bounds of all stations
            if (stations.length > 0) {
                // Create a bounds object
                const bounds = new mapboxgl.LngLatBounds()

                // Extend the bounds to include all stations
                stations.forEach((station) => {
                    bounds.extend([station.longitude, station.latitude])
                })

                // Fit the map to these bounds with some padding
                mapInstance.fitBounds(bounds, {
                    padding: 50, // Add some padding around the bounds
                    maxZoom: 3, // Limit how far it can zoom in
                    duration: 1000, // Animation duration in ms
                })
            }

            // Add a custom layer to visualize topic connections
            addTopicConnectionsLayer(mapInstance)
        })

        return () => {
            const { map, popup } = currentRefs
            removePopup(popup)
            if (map) {
                map.remove()
            }
        }
    }, [stations])

    // Add the topic connections visualization layer
    const addTopicConnectionsLayer = (map: mapboxgl.Map) => {
        // Add special layer for stations discussing a topic
        map.addLayer({
            id: 'topic-stations',
            type: 'circle',
            source: 'stations',
            filter: ['!', ['has', 'point_count']], // Only for unclustered points
            paint: {
                'circle-radius': 10,
                'circle-color': '#6366f1', // Indigo color matching the topic indicator
                'circle-opacity': 0,
                'circle-stroke-width': 3,
                'circle-stroke-color': '#6366f1',
                'circle-stroke-opacity': 0,
            },
        })

        // Add pulsing effect layer
        map.addLayer({
            id: 'topic-stations-pulse',
            type: 'circle',
            source: 'stations',
            filter: ['!', ['has', 'point_count']], // Only for unclustered points
            paint: {
                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['get', 'pulse'],
                    0,
                    15,
                    1,
                    30,
                ],
                'circle-color': '#6366f1',
                'circle-opacity': [
                    'interpolate',
                    ['linear'],
                    ['get', 'pulse'],
                    0,
                    0.4,
                    1,
                    0,
                ],
                'circle-stroke-width': 0,
            },
        })
    }

    // Update when selected topic changes
    useEffect(() => {
        const map = refs.current.map
        if (!map) return

        // Make sure the map style is loaded before modifying layers
        if (!map.isStyleLoaded()) {
            // Wait for the style to load before continuing
            const waitForStyleLoad = () => {
                // Need to get current reference to map since this runs asynchronously
                const currentMap = refs.current.map
                if (!currentMap) return

                if (currentMap.isStyleLoaded()) {
                    updateTopicVisuals(currentMap)
                } else {
                    // Try again in a short moment
                    setTimeout(waitForStyleLoad, 50)
                }
            }
            waitForStyleLoad()
            return
        }

        updateTopicVisuals(map)

        function updateTopicVisuals(map: mapboxgl.Map) {
            // Get stations for the selected topic
            if (selectedTopicId) {
                const selectedTopic = visibleTopics.find(
                    (t: {
                        id: string
                        name: string
                        recentStations?: Array<{ stationId: string }>
                    }) => t.id === selectedTopicId,
                )
                if (selectedTopic && selectedTopic.recentStations) {
                    // Get station IDs for this topic
                    const stationIds = selectedTopic.recentStations.map(
                        (s: { stationId: string }) => s.stationId,
                    )
                    setTopicStations(stationIds)

                    // Update filters to show only stations discussing this topic
                    map.setFilter('topic-stations', [
                        'all',
                        ['!', ['has', 'point_count']], // Exclude clusters
                        ['in', ['get', 'id'], ['literal', stationIds]],
                    ])

                    map.setFilter('topic-stations-pulse', [
                        'all',
                        ['!', ['has', 'point_count']], // Exclude clusters
                        ['in', ['get', 'id'], ['literal', stationIds]],
                    ])

                    // Show the topic stations layer with a fade-in animation
                    map.setPaintProperty(
                        'topic-stations',
                        'circle-opacity',
                        0.8,
                    )
                    map.setPaintProperty(
                        'topic-stations',
                        'circle-stroke-opacity',
                        1,
                    )

                    // Add properties to stations for the pulsing effect
                    const source = map.getSource(
                        'stations',
                    ) as mapboxgl.GeoJSONSource
                    if (source) {
                        const data = source.serialize()
                            ?.data as GeoJSON.FeatureCollection

                        if (data && data.features) {
                            // Add pulse property to each station feature to enable animation
                            data.features.forEach((feature) => {
                                if (
                                    feature.properties &&
                                    stationIds.includes(feature.properties.id)
                                ) {
                                    feature.properties.pulse = 0 // Start value for animation
                                }
                            })

                            source.setData(data)

                            // Animate the pulse effect
                            animatePulse(map, stationIds)
                        }
                    }

                    // If there are at least 2 stations, try to show them all on screen
                    if (stationIds.length >= 2) {
                        fitMapToStations(map, stations, stationIds)
                    }
                }
            } else {
                // Reset filters when no topic is selected
                setTopicStations([])

                // Check if the layers exist before trying to modify them
                if (map.getLayer('topic-stations')) {
                    map.setPaintProperty('topic-stations', 'circle-opacity', 0)
                    map.setPaintProperty(
                        'topic-stations',
                        'circle-stroke-opacity',
                        0,
                    )
                }

                // Clear the pulse animation
                if (map.getLayer('topic-stations-pulse')) {
                    map.setFilter('topic-stations-pulse', ['==', 'id', ''])
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTopicId, visibleTopics, stations])

    // Function to animate the pulsing effect
    const animatePulse = (map: mapboxgl.Map, stationIds: string[]) => {
        let animationFrame: number
        let startTime: number | null = null

        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp
            const progress = ((timestamp - startTime) % 3000) / 3000 // 3-second loop

            const source = map.getSource('stations') as mapboxgl.GeoJSONSource
            if (source) {
                const data = source.serialize()
                    .data as GeoJSON.FeatureCollection
                if (data && data.features) {
                    data.features.forEach((feature) => {
                        if (
                            feature.properties &&
                            stationIds.includes(feature.properties.id)
                        ) {
                            feature.properties.pulse = progress
                        }
                    })
                    source.setData(data)
                }
            }

            animationFrame = requestAnimationFrame(animate)
        }

        animationFrame = requestAnimationFrame(animate)

        // Store the animation frame ID for cleanup
        return () => {
            cancelAnimationFrame(animationFrame)
        }
    }

    // Function to fit map to show all stations discussing a topic
    const fitMapToStations = (
        map: mapboxgl.Map,
        allStations: Station[],
        stationIds: string[],
    ) => {
        const bounds = new mapboxgl.LngLatBounds()
        let hasPoints = false

        allStations.forEach((station) => {
            if (stationIds.includes(station.id)) {
                bounds.extend([station.longitude, station.latitude])
                hasPoints = true
            }
        })

        if (hasPoints) {
            // Add asymmetric padding with more padding on the right side
            // to account for the TrendingTopics panel if it's visible
            const trendingTopicsPanelWidth = isTrendingTopicsPanelVisible
                ? 320
                : 0 // Estimated panel width

            map.fitBounds(bounds, {
                padding: {
                    top: 100,
                    bottom: 100,
                    left: 100,
                    right: 100 + trendingTopicsPanelWidth, // Add extra padding for the panel when visible
                },
                duration: 1000,
            })
        }
    }

    const handleTopicClick = (topicId: string) => {
        setSelectedTopicId((prevId) => (prevId === topicId ? null : topicId))
    }

    const handleTrendingTopicsVisibilityChange = (isVisible: boolean) => {
        setIsTrendingTopicsPanelVisible(isVisible)
    }

    return (
        <div className="absolute inset-0 overflow-hidden">
            <div ref={mapContainer} className="w-full h-screen fixed inset-0" />

            {/* Use the extracted TopicIndicator component */}
            {selectedTopicId && (
                <TopicIndicator
                    selectedTopicId={selectedTopicId}
                    visibleTopics={visibleTopics}
                    topicStations={topicStations}
                    setSelectedTopicId={setSelectedTopicId}
                />
            )}

            {/* Map Layer Controls */}
            <MapLayerControls
                onTopicClick={handleTopicClick}
                selectedTopicId={selectedTopicId}
                onTrendingTopicsVisibilityChange={
                    handleTrendingTopicsVisibilityChange
                }
            />

            {/* Subtitle-style transcription */}
            {selectedStation &&
                selectedStation.id &&
                transcriptionMap[selectedStation.id] && (
                    <div className="transition-all duration-300 animate-in fade-in">
                        <SubtitleTranscription
                            key={`subtitle-${selectedStation.id}-${transcriptionMap[selectedStation.id].updatedAt}`}
                            transcriptionData={
                                transcriptionMap[selectedStation.id]
                            }
                            visible={showTranscription}
                        />
                    </div>
                )}

            {/* Station Topics panel - only shown when a station is selected */}
            {selectedStation && (
                <MapControls position="top-left">
                    <StationTopics
                        stationId={selectedStation.id}
                        stationName={selectedStation.stationName}
                        className="shadow-xl w-full max-w-xs"
                    />
                </MapControls>
            )}

            {/* Radio player */}
            {selectedStation && (
                <div
                    className={cn(
                        'fixed bottom-6 right-6 z-10 transition-all duration-300',
                        selectedTopicId
                            ? 'opacity-90 hover:opacity-100'
                            : 'opacity-100',
                    )}
                >
                    <RadioPlayer
                        stationName={selectedStation.stationName}
                        stationId={selectedStation.id}
                        streamUrl={selectedStation.streamUrl}
                        showTranscription={showTranscription}
                        setShowTranscription={setShowTranscription}
                        transcriptionMap={transcriptionMap}
                        currentlyPlayingStation={currentlyPlayingStation}
                    />
                </div>
            )}

            {/* Loading indicator */}
            {isLoading && (
                <div className="fixed top-4 right-4 bg-black/70 text-white px-3 py-1 rounded-md text-sm">
                    Loading transcription data...
                </div>
            )}
        </div>
    )
}
