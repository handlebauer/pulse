import { useEffect, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { TranscriptionData } from '@/hooks/useTranscriptions'
import { Station } from './types'

interface TopicLayerProps {
    map: mapboxgl.Map | null
    stations: Station[]
    transcriptionMap: Record<string, TranscriptionData>
}

export function TopicLayer({
    map,
    stations,
    transcriptionMap,
}: TopicLayerProps) {
    const [markers, setMarkers] = useState<mapboxgl.Marker[]>([])

    // Clean up markers on unmount
    useEffect(() => {
        return () => {
            markers.forEach((marker) => marker.remove())
        }
    }, [markers])

    // Update markers when transcription data changes
    useEffect(() => {
        if (!map) return

        // Remove existing markers
        markers.forEach((marker) => marker.remove())
        const newMarkers: mapboxgl.Marker[] = []

        // Create markers for stations with transcription data
        stations.forEach((station) => {
            const transcription = transcriptionMap[station.id]
            if (!transcription || !transcription.topics.length) return

            // Create topic bubble
            const el = document.createElement('div')
            el.className = 'topic-bubble'
            el.style.position = 'relative'

            // Create topic text
            const topicEl = document.createElement('div')
            topicEl.className = 'topic-text'
            topicEl.textContent = transcription.topics[0] // Show the top topic
            topicEl.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'
            topicEl.style.color = 'white'
            topicEl.style.padding = '4px 8px'
            topicEl.style.borderRadius = '12px'
            topicEl.style.fontSize = '12px'
            topicEl.style.fontWeight = 'bold'
            topicEl.style.whiteSpace = 'nowrap'
            topicEl.style.position = 'absolute'
            topicEl.style.bottom = '30px'
            topicEl.style.left = '50%'
            topicEl.style.transform = 'translateX(-50%)'
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
                .setLngLat([station.longitude, station.latitude])
                .addTo(map)

            newMarkers.push(marker)
        })

        setMarkers(newMarkers)
    }, [map, stations, transcriptionMap])

    return null // This is a non-visual component that manipulates the map
}
