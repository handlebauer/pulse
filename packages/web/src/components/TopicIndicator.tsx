import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { PlayCircle, PauseCircle } from 'lucide-react'
import { useTopicMentions, TopicSoundbite } from '@/hooks/useTopicMentions'

// Define interface for Topic
interface Topic {
    id: string
    name: string
}

interface TopicIndicatorProps {
    selectedTopicId: string | null
    visibleTopics: Topic[]
    topicStations: string[] // Array of station IDs
    setSelectedTopicId: (id: string | null) => void
}

export function TopicIndicator({
    selectedTopicId,
    visibleTopics,
    topicStations,
    setSelectedTopicId,
}: TopicIndicatorProps) {
    console.log('TopicIndicator rendered')

    const { soundbites: initialSoundbites, loading } =
        useTopicMentions(selectedTopicId)
    const [soundbites, setSoundbites] = useState<TopicSoundbite[]>([])
    // Single audio element approach - much simpler to manage
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const currentlyPlayingRef = useRef<string | null>(null)

    // Update soundbites when they come from the hook
    useEffect(() => {
        setSoundbites(initialSoundbites)
        // Stop any playing audio when soundbites change
        if (audioRef.current) {
            audioRef.current.pause()
            currentlyPlayingRef.current = null
        }
    }, [initialSoundbites])

    // Create the audio element once
    useEffect(() => {
        // Create a single audio element that we'll reuse
        const audio = new Audio()

        // Add event listeners
        audio.addEventListener('ended', () => {
            // Reset playing state when audio ends
            setSoundbites((prev) =>
                prev.map((sb) =>
                    sb.id === currentlyPlayingRef.current
                        ? { ...sb, isPlaying: false }
                        : sb,
                ),
            )
            currentlyPlayingRef.current = null
        })

        audio.addEventListener('error', (e) => {
            console.error('Audio error:', e)
            // Reset playing state
            setSoundbites((prev) =>
                prev.map((sb) =>
                    sb.id === currentlyPlayingRef.current
                        ? { ...sb, isPlaying: false }
                        : sb,
                ),
            )
            currentlyPlayingRef.current = null
        })

        audioRef.current = audio

        // Cleanup on unmount
        return () => {
            if (audio) {
                audio.pause()
                audio.src = ''
                audio.remove()
            }
            audioRef.current = null
        }
    }, [])

    const togglePlay = (soundbiteId: string) => {
        const soundbite = soundbites.find((sb) => sb.id === soundbiteId)
        if (!soundbite) {
            console.error('Soundbite not found:', soundbiteId)
            return
        }

        const audio = audioRef.current
        if (!audio) {
            console.error('Audio element not available')
            return
        }

        // Are we playing this soundbite, or pausing it?
        const isCurrentlyPlaying = currentlyPlayingRef.current === soundbiteId
        const willPlay = !isCurrentlyPlaying

        // Update UI immediately
        setSoundbites((prev) =>
            prev.map((sb) => ({
                ...sb,
                isPlaying: sb.id === soundbiteId ? willPlay : false,
            })),
        )

        // Handle audio
        try {
            // Always pause current audio first
            audio.pause()

            if (willPlay) {
                // We're going to play this soundbite
                // Set the source if it's a new soundbite
                if (currentlyPlayingRef.current !== soundbiteId) {
                    // Prepare the source
                    const audioSrc = soundbite.audioData.startsWith('data:')
                        ? soundbite.audioData
                        : `data:audio/mp3;base64,${soundbite.audioData}`

                    // Set the source
                    audio.src = audioSrc

                    // Wait for audio to be ready, then play
                    audio.oncanplaythrough = () => {
                        console.log('Audio ready to play')
                        try {
                            const playPromise = audio.play()
                            if (playPromise) {
                                playPromise.catch((err) => {
                                    console.error('Play failed:', err)
                                    // Only update UI for non-abort errors
                                    if (err.name !== 'AbortError') {
                                        setSoundbites((prev) =>
                                            prev.map((sb) => ({
                                                ...sb,
                                                isPlaying: false,
                                            })),
                                        )
                                        currentlyPlayingRef.current = null
                                    }
                                })
                            }
                        } catch (err) {
                            console.error('Error playing audio:', err)
                            setSoundbites((prev) =>
                                prev.map((sb) => ({
                                    ...sb,
                                    isPlaying: false,
                                })),
                            )
                            currentlyPlayingRef.current = null
                        }
                    }

                    // Set this as the currently playing soundbite
                    currentlyPlayingRef.current = soundbiteId
                } else {
                    // Resume playing the current soundbite
                    try {
                        audio.play()
                        currentlyPlayingRef.current = soundbiteId
                    } catch (err) {
                        console.error('Error resuming audio:', err)
                        setSoundbites((prev) =>
                            prev.map((sb) => ({
                                ...sb,
                                isPlaying: false,
                            })),
                        )
                        currentlyPlayingRef.current = null
                    }
                }
            } else {
                // We're pausing the current soundbite
                currentlyPlayingRef.current = null
            }
        } catch (err) {
            console.error('Error in togglePlay:', err)
            setSoundbites((prev) =>
                prev.map((sb) => ({
                    ...sb,
                    isPlaying: false,
                })),
            )
            currentlyPlayingRef.current = null
        }
    }

    if (!selectedTopicId) return null

    // Find the topic name
    const selectedTopic = visibleTopics.find((t) => t.id === selectedTopicId)

    if (!selectedTopic) return null

    // Get number of stations discussing this topic
    const stationCount = topicStations.length

    return (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-20 animate-in fade-in zoom-in-90 duration-300 flex flex-col items-center">
            <div
                className="bg-black/50 text-gray-200 
                 px-4 py-2 rounded-full shadow-lg border border-gray-700/50 
                 flex items-center space-x-2 backdrop-blur-md"
            >
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse mr-1.5" />
                <span className="text-sm">
                    Viewing {stationCount}{' '}
                    {stationCount === 1 ? 'station' : 'stations'} discussing{' '}
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

            {/* Soundbites Section */}
            {soundbites.length > 0 && (
                <div className="mt-2 bg-black/50 backdrop-blur-md p-3 rounded-lg border border-gray-700/50 w-96 max-w-full">
                    <div className="space-y-3">
                        {soundbites.map((soundbite) => (
                            <div
                                key={soundbite.id}
                                className="flex items-start space-x-3"
                            >
                                <button
                                    onClick={() => togglePlay(soundbite.id)}
                                    className="flex-shrink-0 mt-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                                >
                                    {soundbite.isPlaying ? (
                                        <PauseCircle size={20} />
                                    ) : (
                                        <PlayCircle size={20} />
                                    )}
                                </button>
                                <div className="flex-1">
                                    <div className="text-xs font-medium text-gray-300">
                                        {soundbite.stationName}
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1 line-clamp-3">
                                        &ldquo;
                                        {soundbite.transcriptContext.before}
                                        <span className="font-bold text-indigo-400">
                                            {soundbite.transcriptContext.match}
                                        </span>
                                        {soundbite.transcriptContext.after}
                                        &rdquo;
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {loading && (
                <div className="mt-2 text-sm text-gray-400">
                    Loading soundbites...
                </div>
            )}

            {!loading && soundbites.length === 0 && (
                <div className="mt-2 text-sm text-gray-400">
                    No topic-specific soundbites available
                </div>
            )}
        </div>
    )
}
