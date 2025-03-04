'use client'

import { useEffect, useRef, useState } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'
import { RadioPlayer } from './RadioPlayer'
import { Station, MapRefs } from './map/types'
import { initializeMap, defaultMapConfig } from './map/mapConfig'
import { addStationLayers } from './map/layers'
import { setupMapEventHandlers } from './map/eventHandlers'
import { popupStyles } from './map/styles'
import { removePopup } from './map/popupManager'

interface GlobeProps {
    stations: Station[]
}

export function Globe({ stations }: GlobeProps) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const refs = useRef<MapRefs>({ map: null, popup: null })
    const [selectedStation, setSelectedStation] = useState<Station | null>(null)

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
            {selectedStation && (
                <RadioPlayer
                    stationName={selectedStation.stationName}
                    streamUrl={selectedStation.streamUrl}
                />
            )}
        </>
    )
}
