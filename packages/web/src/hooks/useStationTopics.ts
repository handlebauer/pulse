import { useEffect, useState } from 'react'
import { createClient } from '@/lib/db/clients/browser'

// Initialize Supabase client
const supabase = createClient()

export interface StationTopicData {
    id: string
    name: string
    normalizedName: string
    isTrending: boolean
    trendScore: number | null
    relevanceScore: number
    mentionCount: number
    firstMentionedAt: string
    lastMentionedAt: string
}

// Define a type for the raw data from Supabase
interface RawStationTopic {
    id: string
    relevance_score: number
    mention_count: number
    first_mentioned_at: string
    last_mentioned_at: string
    topics: {
        id: string
        name: string
        normalized_name: string
        is_trending: boolean
        trend_score: number | null
    }
}

export function useStationTopics(stationId: string | null) {
    const [topics, setTopics] = useState<StationTopicData[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)

    useEffect(() => {
        // Don't fetch if no stationId is provided
        if (!stationId) {
            setTopics([])
            setIsLoading(false)
            return
        }

        // Fetch initial station topics
        const fetchStationTopics = async () => {
            setIsLoading(true)
            setError(null)

            try {
                const { data, error } = await supabase
                    .from('station_topics')
                    .select(
                        `
            id, 
            relevance_score, 
            mention_count, 
            first_mentioned_at, 
            last_mentioned_at,
            topics:topicId (
              id, 
              name, 
              normalized_name, 
              is_trending, 
              trend_score
            )
          `,
                    )
                    .eq('stationId', stationId)
                    .order('relevance_score', { ascending: false })
                    .limit(20)

                if (error) {
                    throw new Error(
                        `Error fetching station topics: ${error.message}`,
                    )
                }

                if (data) {
                    const formattedTopics: StationTopicData[] = (
                        data as unknown as RawStationTopic[]
                    ).map((item) => ({
                        id: item.topics.id,
                        name: item.topics.name,
                        normalizedName: item.topics.normalized_name,
                        isTrending: item.topics.is_trending,
                        trendScore: item.topics.trend_score,
                        relevanceScore: item.relevance_score,
                        mentionCount: item.mention_count,
                        firstMentionedAt: item.first_mentioned_at,
                        lastMentionedAt: item.last_mentioned_at,
                    }))

                    setTopics(formattedTopics)
                }
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err
                        : new Error('Unknown error occurred'),
                )
                console.error('Error in useStationTopics:', err)
            } finally {
                setIsLoading(false)
            }
        }

        fetchStationTopics()

        // Set up realtime subscription for station topics
        const subscription = supabase
            .channel(`station-topics-${stationId}`)
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
                    schema: 'public',
                    table: 'station_topics',
                    filter: `stationId=eq.${stationId}`,
                },
                async () => {
                    // Refetch all topics when changes occur
                    // This is simpler than merging changes and ensures we have the latest data
                    await fetchStationTopics()
                },
            )
            .subscribe()

        return () => {
            subscription.unsubscribe()
        }
    }, [stationId])

    return { topics, isLoading, error }
}
