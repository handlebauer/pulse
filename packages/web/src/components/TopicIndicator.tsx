import React, { useState, useEffect } from 'react'
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
    const { soundbites: initialSoundbites, loading } =
        useTopicMentions(selectedTopicId)
    const [soundbites, setSoundbites] = useState<TopicSoundbite[]>([])
    const [audioElements, setAudioElements] = useState<{
        [key: string]: HTMLAudioElement
    }>({})

    // Update soundbites when they come from the hook
    useEffect(() => {
        setSoundbites(initialSoundbites)
    }, [initialSoundbites])

    // Create or get audio elements for each soundbite
    useEffect(() => {
        const elements: { [key: string]: HTMLAudioElement } = {}

        soundbites.forEach((soundbite) => {
            // Only create new audio elements if we don't have them yet
            if (!audioElements[soundbite.id]) {
                const audio = new Audio(
                    `data:audio/mp3;base64,${soundbite.audioData}`,
                )

                audio.addEventListener('ended', () => {
                    setSoundbites((prev) =>
                        prev.map((sb) =>
                            sb.id === soundbite.id
                                ? { ...sb, isPlaying: false }
                                : sb,
                        ),
                    )
                })

                elements[soundbite.id] = audio
            } else {
                elements[soundbite.id] = audioElements[soundbite.id]
            }
        })

        setAudioElements(elements)

        // Cleanup audio elements on unmount
        return () => {
            Object.values(audioElements).forEach((audio) => {
                audio.pause()
                audio.src = ''
            })
        }
    }, [soundbites])

    const togglePlay = (soundbiteId: string) => {
        // Stop all currently playing audio
        soundbites.forEach((soundbite) => {
            if (soundbite.isPlaying && soundbite.id !== soundbiteId) {
                audioElements[soundbite.id]?.pause()
            }
        })

        // Toggle play state for the clicked soundbite
        setSoundbites((prev) =>
            prev.map((soundbite) => {
                if (soundbite.id === soundbiteId) {
                    const isCurrentlyPlaying = !soundbite.isPlaying

                    if (isCurrentlyPlaying) {
                        audioElements[soundbiteId]?.play()
                    } else {
                        audioElements[soundbiteId]?.pause()
                    }

                    return { ...soundbite, isPlaying: isCurrentlyPlaying }
                } else {
                    return { ...soundbite, isPlaying: false }
                }
            }),
        )
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
                    <h3 className="text-sm font-medium text-indigo-300 mb-2">
                        Listen to Soundbites
                    </h3>

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
