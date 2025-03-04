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
import { TrendingTopics } from './topics/TrendingTopics'

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
        })

        return () => {
            const { map, popup } = currentRefs
            removePopup(popup)
            if (map) {
                map.remove()
            }
        }
    }, [stations])

    // Add handler for topic clicks
    const handleTopicClick = (topicId: string) => {
        setSelectedTopicId(topicId)
        // Additional logic for highlighting stations discussing this topic could be added here
    }

    return (
        <>
            <div ref={mapContainer} className="w-full h-screen fixed inset-0" />

            {/* Replace TopicLayer with StationTopics and TrendingTopics components */}
            {/* Station Topics panel - only shown when a station is selected */}
            {selectedStation && (
                <div className="fixed top-4 left-4 max-w-xs w-full z-10">
                    <StationTopics
                        stationId={selectedStation.id}
                        className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-4"
                    />
                </div>
            )}

            {/* Trending Topics panel - always visible */}
            <div className="fixed top-4 right-4 max-w-xs w-full z-10">
                <TrendingTopics
                    className="shadow-lg"
                    onTopicClick={handleTopicClick}
                />
            </div>

            {/* Subtitle-style transcription */}
            {selectedStation &&
                selectedStation.id &&
                transcriptionMap[selectedStation.id] && (
                    <SubtitleTranscription
                        key={`subtitle-${selectedStation.id}-${transcriptionMap[selectedStation.id].updatedAt}`}
                        transcriptionData={transcriptionMap[selectedStation.id]}
                        visible={showTranscription}
                    />
                )}

            {/* Radio player */}
            {selectedStation && (
                <RadioPlayer
                    stationName={selectedStation.stationName}
                    streamUrl={selectedStation.streamUrl}
                    stationId={selectedStation.id}
                    showTranscription={showTranscription}
                    setShowTranscription={setShowTranscription}
                    transcriptionMap={transcriptionMap}
                />
            )}

            {/* Loading indicator */}
            {isLoading && (
                <div className="fixed top-4 right-4 bg-black/70 text-white px-3 py-1 rounded-md text-sm">
                    Loading transcription data...
                </div>
            )}
        </>
    )
}
