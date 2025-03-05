import { useState, useEffect } from 'react'
import { useStationTopics, StationTopicData } from '@/hooks/useStationTopics'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Radio } from 'lucide-react'

interface StationTopicsProps {
    stationId: string | null
    stationName?: string
    className?: string
    maxTopics?: number
}

export function StationTopics({
    stationId,
    stationName,
    className,
    maxTopics = 5,
}: StationTopicsProps) {
    const { topics, isLoading, error } = useStationTopics(stationId)
    const [visibleTopics, setVisibleTopics] = useState<StationTopicData[]>([])

    // Display station ID or name in a nicely formatted way
    const displayStationInfo =
        stationName ||
        (stationId ? stationId.substring(0, 8) + '...' : 'Unknown Station')

    // Animate topics in and out when they change
    useEffect(() => {
        if (!isLoading) {
            setVisibleTopics(topics.slice(0, maxTopics))
        }
    }, [topics, maxTopics, isLoading])

    if (isLoading || !visibleTopics.length) {
        return (
            <div className="text-sm text-gray-400 px-3 py-2 italic flex items-center justify-center select-none bg-black/30">
                <Radio className="w-4 h-4 mr-2 text-gray-400" />
                No topics available for this station
            </div>
        )
    }

    if (error) {
        return (
            <div
                className={cn(
                    'backdrop-blur-md bg-black/30 border border-red-800/50 text-white shadow-xl rounded-lg overflow-hidden',
                    className,
                )}
            >
                <div className="p-4">
                    <div className="text-sm text-red-400 flex items-center">
                        <Radio className="w-4 h-4 mr-3 text-red-500" />
                        Failed to load topics
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div
            className={cn(
                'backdrop-blur-md bg-black/30 border border-gray-700/50 shadow-xl text-white rounded-lg overflow-hidden',
                className,
            )}
        >
            {/* Header section with improved spacing */}
            <div className="py-3 px-5 border-b border-gray-700/30">
                <div className="flex items-center text-gray-200">
                    <div className="flex flex-col">
                        <span className="text-sm font-medium">
                            Current Topics
                        </span>
                        <span className="text-xs font-normal text-gray-400 mt-1">
                            {displayStationInfo}
                        </span>
                    </div>
                </div>
            </div>

            {/* Content section */}
            <div className="p-4">
                <div className="flex flex-wrap gap-2">
                    {visibleTopics.map((topic) => (
                        <Badge
                            key={topic.id}
                            variant={topic.isTrending ? 'default' : 'secondary'}
                            className={cn(
                                'transition-all duration-300 animate-in fade-in slide-in-from-bottom-2',
                                'text-sm py-1 px-3',
                                topic.isTrending
                                    ? 'bg-black/40 border-indigo-500/40 text-indigo-400'
                                    : 'bg-black/30 text-gray-300 border-gray-700/50',
                                'shadow-sm hover:shadow',
                            )}
                        >
                            {topic.name}
                            {topic.isTrending && (
                                <span className="inline-flex w-1.5 h-1.5 ml-1.5 bg-indigo-500 rounded-full animate-pulse" />
                            )}
                        </Badge>
                    ))}
                </div>
            </div>
        </div>
    )
}
