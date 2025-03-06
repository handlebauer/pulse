import React from 'react'
import { Button } from '@/components/ui/button' // Assuming this is the correct import for Button

// Define interface for Topic
interface Topic {
    id: string
    name: string
}

interface TopicIndicatorProps {
    selectedTopicId: string | null
    visibleTopics: Topic[]
    topicStations: string[] // Changed from any[] to string[] as it appears to be an array of station IDs
    setSelectedTopicId: (id: string | null) => void
}

export function TopicIndicator({
    selectedTopicId,
    visibleTopics,
    topicStations,
    setSelectedTopicId,
}: TopicIndicatorProps) {
    if (!selectedTopicId) return null

    // Find the topic name
    const selectedTopic = visibleTopics.find((t) => t.id === selectedTopicId)

    if (!selectedTopic) return null

    // Get number of stations discussing this topic
    const stationCount = topicStations.length

    return (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-20 animate-in fade-in zoom-in-90 duration-300">
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
        </div>
    )
}
