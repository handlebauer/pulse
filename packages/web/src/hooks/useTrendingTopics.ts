import { useEffect, useState } from 'react'
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

    useEffect(() => {
        // Fetch trending topics
        const fetchTrendingTopics = async () => {
            setIsLoading(true)
            setError(null)

            try {
                // First fetch trending topics
                const { data: trendingTopics, error: topicsError } =
                    await supabase
                        .from('topics')
                        .select('id, name, normalized_name, trend_score')
                        .eq('is_trending', true)
                        .order('trend_score', { ascending: false })
                        .limit(limit)

                if (topicsError) {
                    throw new Error(
                        `Error fetching trending topics: ${topicsError.message}`,
                    )
                }

                if (!trendingTopics || trendingTopics.length === 0) {
                    setTopics([])
                    setIsLoading(false)
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

                // Fetch station names
                const { data: stationsData, error: stationsError } =
                    await supabase
                        .from('stations')
                        .select('id, stationName')
                        .in('id', stationIds)

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

                setTopics(formattedTopics)
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err
                        : new Error('Unknown error occurred'),
                )
                console.error('Error in useTrendingTopics:', err)
            } finally {
                setIsLoading(false)
            }
        }

        fetchTrendingTopics()

        // Set up realtime subscription for topic changes
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
                    // Refetch all trending topics when changes occur
                    await fetchTrendingTopics()
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
                    // Refetch trending topics less frequently on station_topics changes
                    // to avoid excessive updates
                    if (!isLoading) {
                        await fetchTrendingTopics()
                    }
                },
            )
            .subscribe()

        return () => {
            topicsSubscription.unsubscribe()
            stationTopicsSubscription.unsubscribe()
        }
    }, [limit, isLoading])

    return { topics, isLoading, error }
}
