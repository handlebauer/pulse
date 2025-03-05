import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/db/clients/browser'

// Initialize Supabase client
const supabase = createClient()

export interface TrendingTopicData {
    id: string
    name: string
    normalizedName: string
    trendScore: number | null
    stationCount: number // Number of stations discussing this topic
    recentStations: {
        stationId: string
        stationName: string
        relevanceScore: number
    }[] // List of recent stations discussing this topic
}

export function useTrendingTopics(limit = 10) {
    const [topics, setTopics] = useState<TrendingTopicData[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)

    // Add these refs to help manage state without triggering effects
    const isMountedRef = useRef(true)
    const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const retryCountRef = useRef(0)
    const MAX_RETRY_COUNT = 3
    const RETRY_DELAY = 5000 // 5 seconds

    useEffect(() => {
        isMountedRef.current = true

        // Fetch trending topics
        const fetchTrendingTopics = async () => {
            if (!isMountedRef.current) return

            setIsLoading(true)

            try {
                // First fetch trending topics
                const { data: trendingTopics, error: topicsError } =
                    await supabase
                        .from('topics')
                        .select('id, name, normalized_name, trend_score')
                        .eq('is_trending', true)
                        .order('trend_score', { ascending: false })
                        .limit(limit)

                if (!isMountedRef.current) return

                if (topicsError) {
                    throw new Error(
                        `Error fetching trending topics: ${topicsError.message}`,
                    )
                }

                // Handle empty topics gracefully - this is expected in some cases
                if (!trendingTopics || trendingTopics.length === 0) {
                    console.log('No trending topics found in database')
                    setTopics([])
                    setError(null)
                    setIsLoading(false)
                    // Reset retry count since we got a valid (empty) response
                    retryCountRef.current = 0
                    return
                }

                // Get topic IDs for the second query
                const topicIds = trendingTopics.map((topic) => topic.id)

                // Then fetch station data for these topics
                const { data: stationTopicsData, error: stationError } =
                    await supabase
                        .from('station_topics')
                        .select('stationId, topicId, relevance_score')
                        .in('topicId', topicIds)
                        .order('relevance_score', { ascending: false })

                if (!isMountedRef.current) return

                if (stationError) {
                    throw new Error(
                        `Error fetching station data for topics: ${stationError.message}`,
                    )
                }

                // Get all unique station IDs to fetch their names
                const stationIds = [
                    ...new Set(
                        stationTopicsData?.map((item) => item.stationId) || [],
                    ),
                ]

                // Skip station name fetch if there are no stations
                if (stationIds.length === 0) {
                    const formattedTopics: TrendingTopicData[] =
                        trendingTopics.map((topic) => ({
                            id: topic.id,
                            name: topic.name,
                            normalizedName: topic.normalized_name,
                            trendScore: topic.trend_score,
                            stationCount: 0,
                            recentStations: [],
                        }))

                    if (isMountedRef.current) {
                        setTopics(formattedTopics)
                        setError(null)
                        retryCountRef.current = 0
                    }
                    return
                }

                // Fetch station names
                const { data: stationsData, error: stationsError } =
                    await supabase
                        .from('stations')
                        .select('id, stationName')
                        .in('id', stationIds)

                if (!isMountedRef.current) return

                if (stationsError) {
                    throw new Error(
                        `Error fetching station names: ${stationsError.message}`,
                    )
                }

                // Create a map of station IDs to station names
                const stationMap = new Map()
                stationsData?.forEach((station) => {
                    stationMap.set(station.id, station.stationName)
                })

                // Group station data by topic
                const stationsByTopic: Record<
                    string,
                    {
                        stationId: string
                        stationName: string
                        relevanceScore: number
                    }[]
                > = {}
                const stationCountByTopic: Record<string, number> = {}

                stationTopicsData?.forEach((item) => {
                    const topicId = item.topicId

                    // Initialize arrays if they don't exist
                    if (!stationsByTopic[topicId]) {
                        stationsByTopic[topicId] = []
                    }

                    // Add station to the topic's stations array
                    stationsByTopic[topicId].push({
                        stationId: item.stationId,
                        stationName:
                            stationMap.get(item.stationId) ||
                            `Station ${item.stationId.substring(0, 8)}...`,
                        relevanceScore: item.relevance_score,
                    })

                    // Count unique stations per topic
                    stationCountByTopic[topicId] =
                        (stationCountByTopic[topicId] || 0) + 1
                })

                // Combine the data
                const formattedTopics: TrendingTopicData[] = trendingTopics.map(
                    (topic) => ({
                        id: topic.id,
                        name: topic.name,
                        normalizedName: topic.normalized_name,
                        trendScore: topic.trend_score,
                        stationCount: stationCountByTopic[topic.id] || 0,
                        recentStations: (stationsByTopic[topic.id] || [])
                            .sort((a, b) => b.relevanceScore - a.relevanceScore)
                            .slice(0, 5) // Limit to 5 most relevant stations
                            .map((station) => ({
                                stationId: station.stationId,
                                stationName: station.stationName,
                                relevanceScore: station.relevanceScore,
                            })),
                    }),
                )

                if (isMountedRef.current) {
                    setTopics(formattedTopics)
                    setError(null)
                    // Reset retry count on successful fetch
                    retryCountRef.current = 0
                }
            } catch (err) {
                if (!isMountedRef.current) return

                console.error('Error in useTrendingTopics:', err)

                // Implement retry logic with exponential backoff
                if (retryCountRef.current < MAX_RETRY_COUNT) {
                    console.log(
                        `Retrying fetch (${retryCountRef.current + 1}/${MAX_RETRY_COUNT}) in ${RETRY_DELAY}ms`,
                    )
                    retryCountRef.current++

                    // Clear any existing timeout
                    if (retryTimeoutRef.current) {
                        clearTimeout(retryTimeoutRef.current)
                    }

                    // Set up retry with delay
                    retryTimeoutRef.current = setTimeout(() => {
                        if (isMountedRef.current) {
                            fetchTrendingTopics()
                        }
                    }, RETRY_DELAY)
                } else {
                    // After max retries, set the error state
                    setError(
                        err instanceof Error
                            ? err
                            : new Error('Unknown error occurred'),
                    )
                }
            } finally {
                if (isMountedRef.current) {
                    setIsLoading(false)
                }
            }
        }

        fetchTrendingTopics()

        // Set up realtime subscription for topic changes with debounce
        const topicsSubscription = supabase
            .channel('trending-topics')
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen for all events
                    schema: 'public',
                    table: 'topics',
                    filter: 'is_trending=eq.true',
                },
                async () => {
                    // Only refetch if not already loading and component is mounted
                    if (!isLoading && isMountedRef.current) {
                        await fetchTrendingTopics()
                    }
                },
            )
            .subscribe()

        // Set up realtime subscription for station_topics changes that might affect trending topics
        const stationTopicsSubscription = supabase
            .channel('trending-station-topics')
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen for all events
                    schema: 'public',
                    table: 'station_topics',
                },
                async () => {
                    // Only refetch if not already loading and component is mounted
                    if (!isLoading && isMountedRef.current) {
                        await fetchTrendingTopics()
                    }
                },
            )
            .subscribe()

        // Cleanup function
        return () => {
            isMountedRef.current = false

            // Clear any pending timeouts
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current)
            }

            // Unsubscribe from channels
            topicsSubscription.unsubscribe()
            stationTopicsSubscription.unsubscribe()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [limit]) // Remove isLoading from dependencies to prevent infinite loop

    return { topics, isLoading, error }
}
