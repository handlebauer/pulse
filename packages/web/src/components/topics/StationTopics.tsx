import { useState, useEffect } from 'react'
import { useStationTopics } from '@/hooks/useStationTopics'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

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
    const [visibleTopics, setVisibleTopics] = useState(topics)

    // Animate topics in and out when they change
    useEffect(() => {
        if (!isLoading) {
            setVisibleTopics(topics.slice(0, maxTopics))
        }
    }, [topics, maxTopics, isLoading])

    if (isLoading && !visibleTopics.length) {
        return (
            <div className={cn('space-y-2', className)}>
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-24" />
                ))}
            </div>
        )
    }

    if (error) {
        return (
            <div className={cn('text-sm text-red-500', className)}>
                Failed to load topics
            </div>
        )
    }

    if (!visibleTopics.length) {
        return (
            <div className={cn('text-sm text-gray-400 italic', className)}>
                No topics available
            </div>
        )
    }

    return (
        <div className={cn('space-y-2', className)}>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Current Topics
            </h3>
            <div className="flex flex-wrap gap-2">
                {visibleTopics.map((topic) => (
                    <Badge
                        key={topic.id}
                        variant={topic.isTrending ? 'default' : 'secondary'}
                        className={cn(
                            'transition-all duration-300 animate-in fade-in slide-in-from-bottom-2',
                            topic.isTrending &&
                                'bg-amber-100 text-amber-900 dark:bg-amber-900/20 dark:text-amber-400 hover:bg-amber-200',
                        )}
                    >
                        {topic.name}
                        {topic.isTrending && (
                            <span className="inline-flex w-2 h-2 ml-1 bg-amber-500 rounded-full animate-pulse" />
                        )}
                    </Badge>
                ))}
            </div>
        </div>
    )
}
