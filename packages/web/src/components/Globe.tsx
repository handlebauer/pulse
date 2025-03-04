'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { RadioPlayer } from './RadioPlayer'

type Station = {
    id: string
    stationName: string
    latitude: number
    longitude: number
    streamUrl: string
}

interface GlobeProps {
    stations: Station[]
}

export function Globe({ stations }: GlobeProps) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<mapboxgl.Map | null>(null)
    const popup = useRef<mapboxgl.Popup | null>(null)
    const [selectedStation, setSelectedStation] = useState<Station | null>(null)

    useEffect(() => {
        if (!mapContainer.current) return

        // Add custom CSS for the popup close button
        const style = document.createElement('style')
        style.textContent = `
            .mapboxgl-popup-close-button {
                font-size: 16px !important;
                padding: 0 4px !important;
                line-height: 1 !important;
                color: #666 !important;
                background: transparent !important;
                cursor: pointer !important;
                border: none !important;
                transition: color 0.2s ease !important;
            }
            .mapboxgl-popup-close-button:hover {
                color: #000 !important;
                background: #fff !important;
            }
        `
        document.head.appendChild(style)

        mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || ''

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/dark-v11',
            projection: 'globe',
            zoom: 2.25,
            center: [0, 20],
        })

        map.current.on('load', () => {
            if (!map.current) return

            // Add stations as points
            map.current.addSource('stations', {
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
                        },
                    })),
                },
            })

            map.current.addLayer({
                id: 'stations-hit-area',
                type: 'circle',
                source: 'stations',
                paint: {
                    'circle-radius': 15,
                    'circle-color': '#fff',
                    'circle-opacity': 0,
                },
            })

            map.current.addLayer({
                id: 'stations',
                type: 'circle',
                source: 'stations',
                paint: {
                    'circle-radius': 6,
                    'circle-color': '#fff',
                    'circle-opacity': 0.8,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#fff',
                    'circle-stroke-opacity': 0.3,
                },
            })

            // Change cursor to pointer when hovering over a station
            map.current.on('mouseenter', 'stations-hit-area', () => {
                if (map.current) {
                    map.current.getCanvas().style.cursor = 'pointer'
                }
            })

            map.current.on('mouseleave', 'stations-hit-area', () => {
                if (map.current) {
                    map.current.getCanvas().style.cursor = ''
                }
            })

            // Show popup on click
            map.current.on('click', 'stations-hit-area', (e) => {
                if (!map.current || !e.features?.[0]) return

                const feature = e.features[0]
                if (feature.geometry.type !== 'Point') return

                const coordinates = feature.geometry.coordinates.slice() as [
                    number,
                    number,
                ]

                // Find the clicked station
                const stationId = feature.properties?.id
                const clickedStation = stations.find(
                    (station) => station.id === stationId,
                )
                if (!clickedStation) return

                // Update selected station
                setSelectedStation(clickedStation)

                // Close existing popup if it exists
                if (popup.current) {
                    popup.current.remove()
                }

                // Create new popup
                popup.current = new mapboxgl.Popup()
                    .setLngLat(coordinates)
                    .setHTML(
                        `<div class="text-lg font-medium">${clickedStation.stationName}</div>`,
                    )
                    .addTo(map.current)
            })
        })

        // Cleanup
        return () => {
            if (popup.current) {
                popup.current.remove()
            }
            if (map.current) {
                map.current.remove()
                map.current = null
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
