import { useState, useEffect } from 'react'
import { createClient } from '@/lib/db/clients/browser'

// Define interface for Soundbite
export interface TopicSoundbite {
    id: string
    stationId: string
    stationName?: string
    audioData: string
    startTime: string
    endTime: string
    transcriptContext: {
        before: string
        match: string
        after: string
    }
    isPlaying: boolean
}

interface UseTopicMentionsResult {
    soundbites: TopicSoundbite[]
    loading: boolean
    error: Error | null
}

/**
 * Custom hook to fetch topic mentions with their audio context
 *
 * @param topicId - The ID of the topic to fetch mentions for
 * @param limit - Maximum number of mentions to fetch (default: 5)
 * @returns An object containing soundbites, loading state, and error
 */
export function useTopicMentions(
    topicId: string | null,
    limit: number = 5,
): UseTopicMentionsResult {
    const [soundbites, setSoundbites] = useState<TopicSoundbite[]>([])
    const [loading, setLoading] = useState<boolean>(false)
    const [error, setError] = useState<Error | null>(null)

    useEffect(() => {
        if (!topicId) {
            setSoundbites([])
            setError(null)
            return
        }

        const fetchSoundbites = async () => {
            setLoading(true)
            setError(null)

            try {
                const supabase = createClient()

                // First, get topic mentions directly connected to the selected topic
                const { data: mentions, error: mentionsError } = await supabase
                    .from('transcription_topics')
                    .select(
                        `
                        id,
                        transcriptionId,
                        matchText,
                        contextBefore,
                        contextAfter,
                        segmentIndex
                    `,
                    )
                    .eq('topicId', topicId)
                    .order('created_at', { ascending: false })
                    .limit(limit)

                if (mentionsError) {
                    throw new Error(
                        `Error fetching topic mentions: ${mentionsError.message}`,
                    )
                }

                if (!mentions || mentions.length === 0) {
                    setSoundbites([])
                    setLoading(false)
                    return
                }

                // Get the transcriptions for these mentions
                const transcriptionIds = mentions.map(
                    (mention) => mention.transcriptionId,
                )

                const { data: transcriptions, error: transcriptionsError } =
                    await supabase
                        .from('transcriptions')
                        .select(
                            `
                        id, 
                        "stationId", 
                        "audioData", 
                        "startTime", 
                        "endTime", 
                        stations (stationName)
                    `,
                        )
                        .in('id', transcriptionIds)

                if (transcriptionsError || !transcriptions) {
                    throw new Error(
                        `Error fetching transcriptions: ${transcriptionsError?.message}`,
                    )
                }

                // Match transcriptions with their mentions and create soundbites
                const processedSoundbites = transcriptions
                    .map((transcript) => {
                        // Find the corresponding mention for this transcription
                        const mention = mentions.find(
                            (m) => m.transcriptionId === transcript.id,
                        )

                        if (!mention) {
                            return null
                        }

                        return {
                            id: transcript.id,
                            stationId: transcript.stationId,
                            stationName:
                                transcript.stations?.stationName ||
                                'Unknown Station',
                            audioData: transcript.audioData,
                            startTime: transcript.startTime,
                            endTime: transcript.endTime,
                            transcriptContext: {
                                before: mention.contextBefore || '',
                                match: mention.matchText || '',
                                after: mention.contextAfter || '',
                            },
                            isPlaying: false,
                        }
                    })
                    .filter(Boolean) as TopicSoundbite[]

                setSoundbites(processedSoundbites)
            } catch (err) {
                console.error('Error in useTopicMentions:', err)
                setError(err instanceof Error ? err : new Error(String(err)))
                setSoundbites([])
            } finally {
                setLoading(false)
            }
        }

        fetchSoundbites()
    }, [topicId, limit])

    return { soundbites, loading, error }
}
