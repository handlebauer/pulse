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
import { TopicLayer } from './map/TopicLayer'
import { useTranscriptions } from '@/hooks/useTranscriptions'

interface GlobeProps {
    stations: Station[]
}

export function Globe({ stations }: GlobeProps) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const refs = useRef<MapRefs>({ map: null, popup: null })
    const [selectedStation, setSelectedStation] = useState<Station | null>(null)
    const { transcriptionMap, isLoading } = useTranscriptions()

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
            setupMapEventHandlers(
                mapInstance,
                stations,
                currentRefs,
                setSelectedStation,
            )
            setupClusterClickHandlers(mapInstance)
            setupZoomHandler(mapInstance)

            // Fit map to the bounds of all stations
            if (stations.length > 0) {
                // Create a bounds object
                const bounds = new mapboxgl.LngLatBounds()

                // Extend the bounds to include all station coordinates
                stations.forEach((station) => {
                    bounds.extend([station.longitude, station.latitude])
                })

                // Fit the map to these bounds with some padding
                mapInstance.fitBounds(bounds, {
                    padding: 50, // Add some padding around the bounds
                    maxZoom: 3, // Limit how far it can zoom in
                    duration: 1000, // Animation duration in milliseconds
                })
            }
        })

        // Cleanup
        return () => {
            const { map, popup } = currentRefs
            removePopup(popup)
            if (map) {
                map.remove()
            }
        }
    }, [stations])

    return (
        <>
            <div ref={mapContainer} className="w-full h-screen fixed inset-0" />

            {/* Topic visualization layer */}
            <TopicLayer
                map={refs.current.map}
                stations={stations}
                transcriptionMap={transcriptionMap}
            />

            {/* Radio player */}
            {selectedStation && (
                <RadioPlayer
                    stationName={selectedStation.stationName}
                    streamUrl={selectedStation.streamUrl}
                    stationId={selectedStation.id}
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
