import { useState, useEffect } from 'react'
import { useStationTopics, StationTopicData } from '@/hooks/useStationTopics'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Radio } from 'lucide-react'

interface StationTopicsProps {
    stationId: string | null
    className?: string
    maxTopics?: number
}

export function StationTopics({
    stationId,
    className,
    maxTopics = 5,
}: StationTopicsProps) {
    const { topics, isLoading, error } = useStationTopics(stationId)
    const [visibleTopics, setVisibleTopics] = useState<StationTopicData[]>([])

    // Display station ID in a nicely formatted way
    const displayStationId = stationId
        ? stationId.substring(0, 8) + '...'
        : 'Unknown Station'

    // Animate topics in and out when they change
    useEffect(() => {
        if (!isLoading) {
            setVisibleTopics(topics.slice(0, maxTopics))
        }
    }, [topics, maxTopics, isLoading])

    if (isLoading || !visibleTopics.length) {
        return (
            <div className="text-sm text-gray-400 p-2 italic flex items-center justify-center select-none">
                <Radio className="w-4 h-4 mr-2 text-gray-400" />
                No topics available for this station
            </div>
        )
    }

    if (error) {
        return (
            <Card
                className={cn(
                    'backdrop-blur-md bg-black/30 border-red-800/50 text-white shadow-xl',
                    className,
                )}
            >
                <CardContent className="p-4">
                    <div className="text-sm text-red-400 flex items-center">
                        <Radio className="w-4 h-4 mr-2 text-red-500" />
                        Failed to load topics
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card
            className={cn(
                'backdrop-blur-md bg-black/30 border-gray-700/50 shadow-xl text-white',
                className,
            )}
        >
            <CardHeader className="pb-2 border-b border-gray-700/30">
                <CardTitle className="text-sm font-medium flex items-center text-gray-200">
                    <Radio className="w-4 h-4 mr-2 text-indigo-500/90 animate-pulse" />
                    <div className="flex flex-col">
                        <span>Current Topics</span>
                        <span className="text-xs font-normal text-gray-400 mt-0.5">
                            Station {displayStationId}
                        </span>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
        </Card>
    )
}
