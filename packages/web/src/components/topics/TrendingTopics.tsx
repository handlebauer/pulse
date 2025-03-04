import { useState, useEffect } from 'react'
import { useTrendingTopics } from '@/hooks/useTrendingTopics'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

interface TrendingTopicsProps {
    className?: string
    maxTopics?: number
    onTopicClick?: (topicId: string) => void
}

export function TrendingTopics({
    className,
    maxTopics = 10,
    onTopicClick,
}: TrendingTopicsProps) {
    const { topics, isLoading, error } = useTrendingTopics(maxTopics)
    const [visibleTopics, setVisibleTopics] = useState(topics)

    // Animate topics in and out when they change
    useEffect(() => {
        if (!isLoading) {
            setVisibleTopics(topics)
        }
    }, [topics, isLoading])

    if (isLoading && !visibleTopics.length) {
        return (
            <Card className={className}>
                <CardHeader>
                    <Skeleton className="h-6 w-40" />
                </CardHeader>
                <CardContent className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                    ))}
                </CardContent>
            </Card>
        )
    }

    if (error) {
        return (
            <Card
                className={cn('border-red-200 dark:border-red-800', className)}
            >
                <CardContent className="py-6">
                    <div className="text-sm text-red-500">
                        Failed to load trending topics
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (!visibleTopics.length) {
        return (
            <Card className={className}>
                <CardContent className="py-6">
                    <div className="text-sm text-gray-400 italic">
                        No trending topics available
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle>Trending Topics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                {visibleTopics.map((topic) => (
                    <div
                        key={topic.id}
                        className="animate-in fade-in slide-in-from-right-5 duration-300"
                    >
                        <Button
                            onClick={() => onTopicClick?.(topic.id)}
                            variant="outline"
                            className={cn(
                                'w-full justify-start group p-3 h-auto',
                                'bg-amber-100/80 hover:bg-amber-200 text-amber-900 border-amber-200',
                                'dark:bg-amber-900/20 dark:hover:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50',
                            )}
                        >
                            <div className="flex-1 flex items-center">
                                <span className="font-medium">
                                    {topic.name}
                                </span>
                                <span className="inline-flex w-2 h-2 mx-2 bg-amber-500 rounded-full animate-pulse" />
                                <span className="text-xs text-amber-700 dark:text-amber-300">
                                    {topic.stationCount}{' '}
                                    {topic.stationCount === 1
                                        ? 'station'
                                        : 'stations'}
                                </span>
                            </div>

                            <div className="hidden sm:flex items-center gap-1 text-xs text-amber-800 dark:text-amber-300/70">
                                {topic.recentStations
                                    .slice(0, 3)
                                    .map((station) => (
                                        <Badge
                                            key={station.stationId}
                                            variant="outline"
                                            className="bg-amber-200/60 dark:bg-amber-900/30 border-amber-300 dark:border-amber-800"
                                        >
                                            {station.stationId.substring(0, 8)}
                                        </Badge>
                                    ))}
                                {topic.recentStations.length > 3 && (
                                    <span className="text-amber-600 dark:text-amber-300/80">
                                        +{topic.recentStations.length - 3} more
                                    </span>
                                )}
                            </div>

                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                className="w-5 h-5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </Button>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}
