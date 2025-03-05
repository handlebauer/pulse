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
import { Button } from '@/components/ui/button'
import { useTrendingTopics } from '@/hooks/useTrendingTopics'
import { cn } from '@/lib/utils'
import { useAudioPlayerContext } from '@/contexts/AudioPlayerContext'
import { MapLayerControls } from './map/MapLayerControls'
import { MapControls } from './map/MapControls'

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

    const handleTopicClick = (topicId: string) => {
        setSelectedTopicId((prevId) => (prevId === topicId ? null : topicId))

        // When a topic is clicked, we could:
        // 1. Highlight stations that discuss this topic
        // 2. Pan/zoom to show these stations
        // 3. Show visual connections between stations

        // For now, we'll just highlight the topic in the UI
        // Additional implementation would be part of Phase 3 in the TODO list
    }

    // Add a topic indicator when a topic is selected
    const TopicIndicator = () => {
        if (!selectedTopicId) return null

        // Find the topic name
        const selectedTopic = visibleTopics.find(
            (t: { id: string; name: string }) => t.id === selectedTopicId,
        )

        if (!selectedTopic) return null

        return (
            <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-20 animate-in fade-in zoom-in-90 duration-300">
                <div
                    className="bg-black/50 text-gray-200 
                             px-4 py-2 rounded-full shadow-lg border border-gray-700/50 
                             flex items-center space-x-2 backdrop-blur-md"
                >
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse mr-1.5" />
                    <span className="text-sm">
                        Viewing stations discussing{' '}
                        <span className="font-medium text-indigo-400">
                            {selectedTopic.name}
                        </span>
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="ml-1.5 h-5 w-5 p-0 rounded-full text-gray-200 hover:bg-gray-700/50 flex items-center justify-center"
                        onClick={() => setSelectedTopicId(null)}
                    >
                        <span className="text-xs">✕</span>
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="absolute inset-0 overflow-hidden">
            <div ref={mapContainer} className="w-full h-screen fixed inset-0" />

            {/* Topic indicator - shows when a topic is selected (now at top) */}
            <TopicIndicator />

            {/* Map Layer Controls */}
            <MapLayerControls
                onTopicClick={handleTopicClick}
                selectedTopicId={selectedTopicId}
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
