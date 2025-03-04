import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { extractTopics } from '@/utils/textProcessing'

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

export interface TranscriptionData {
    stationId: string
    topics: string[]
    recentText: string
    updatedAt: string
}

export function useTranscriptions() {
    const [transcriptionMap, setTranscriptionMap] = useState<
        Record<string, TranscriptionData>
    >({})
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        // Fetch initial transcription data
        const fetchInitialData = async () => {
            setIsLoading(true)

            const { data, error } = await supabase
                .from('transcriptions')
                .select('stationId, transcription, updatedAt')
                .order('updatedAt', { ascending: false })
                .limit(100)

            if (error) {
                console.error('Error fetching transcriptions:', error)
                setIsLoading(false)
                return
            }

            console.log('[data]', data)

            // Process transcriptions into a map by stationId
            const newTranscriptionMap: Record<string, TranscriptionData> = {}

            data.forEach((item) => {
                const transcription = item.transcription
                if (!transcription || !Array.isArray(transcription)) return

                // Get the most recent text
                const recentText = transcription
                    .map((t: any) => t.caption)
                    .join(' ')

                // Extract topics
                const topics = extractTopics(recentText)

                // Only add if we don't already have newer data for this station
                if (
                    !newTranscriptionMap[item.stationId] ||
                    new Date(item.updatedAt) >
                        new Date(newTranscriptionMap[item.stationId].updatedAt)
                ) {
                    newTranscriptionMap[item.stationId] = {
                        stationId: item.stationId,
                        topics,
                        recentText,
                        updatedAt: item.updatedAt,
                    }
                }
            })

            setTranscriptionMap(newTranscriptionMap)
            setIsLoading(false)
        }

        fetchInitialData()

        // Subscribe to realtime updates
        const subscription = supabase
            .channel('transcriptions-channel')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'transcriptions',
                },
                (payload) => {
                    const newData = payload.new as any
                    if (!newData || !newData.transcription) return

                    // Process the new transcription
                    const recentText = Array.isArray(newData.transcription)
                        ? newData.transcription
                              .map((t: any) => t.caption)
                              .join(' ')
                        : ''

                    const topics = extractTopics(recentText)

                    setTranscriptionMap((prev) => ({
                        ...prev,
                        [newData.stationId]: {
                            stationId: newData.stationId,
                            topics,
                            recentText,
                            updatedAt: newData.updatedAt,
                        },
                    }))
                },
            )
            .subscribe()

        return () => {
            subscription.unsubscribe()
        }
    }, [])

    return { transcriptionMap, isLoading }
}
