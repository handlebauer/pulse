'use client'

import {
    createContext,
    useContext,
    useState,
    ReactNode,
    useEffect,
} from 'react'
import { Station } from '@/components/map/types'

interface AudioPlayerContextType {
    currentlyPlayingStation: Station | null
    setCurrentlyPlayingStation: (station: Station | null) => void
    isPlaying: boolean
    setIsPlaying: (isPlaying: boolean) => void
    toggleStation: (station: Station) => void
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(
    undefined,
)

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
    const [currentlyPlayingStation, setCurrentlyPlayingStation] =
        useState<Station | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)

    // When currentlyPlayingStation changes, we should reset the isPlaying state
    // only if the station has been set to null
    useEffect(() => {
        if (currentlyPlayingStation === null) {
            setIsPlaying(false)
        }
    }, [currentlyPlayingStation])

    // Helper function to toggle a station's playback
    const toggleStation = (station: Station) => {
        console.log('Toggle station called for:', station.stationName)

        // If it's the same station that's already playing, just toggle play/pause
        if (currentlyPlayingStation?.id === station.id) {
            console.log('Same station - toggling play state from:', isPlaying)
            // Toggle the play state
            setIsPlaying(!isPlaying)
            return
        }

        // If we're switching to a new station, always start playing
        console.log('New station - setting as current and playing')
        // First update the currently playing station
        setCurrentlyPlayingStation(station)
        // Then ensure we're playing
        setIsPlaying(true)
    }

    return (
        <AudioPlayerContext.Provider
            value={{
                currentlyPlayingStation,
                setCurrentlyPlayingStation,
                isPlaying,
                setIsPlaying,
                toggleStation,
            }}
        >
            {children}
        </AudioPlayerContext.Provider>
    )
}

export function useAudioPlayerContext() {
    const context = useContext(AudioPlayerContext)
    if (context === undefined) {
        throw new Error(
            'useAudioPlayerContext must be used within an AudioPlayerProvider',
        )
    }
    return context
}
