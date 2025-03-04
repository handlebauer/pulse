import { createSupabaseClient } from '../db/client'
import type { Tables } from '../db/types'
import { createGenerativeAIClient } from '../../utils/ai'
import type { DatabaseConfig, TranscriptionConfig } from '../config/types'
import type { TranscriptionResult } from '../stream/stream-manager'

/**
 * Represents a transcription from the database
 */
type Transcription = Tables<'transcriptions'>

/**
 * Represents an extracted topic with its relevance score
 */
export interface Topic {
    name: string
    normalizedName: string
    relevanceScore: number
}

/**
 * TopicExtractor class is responsible for extracting topics from transcriptions using AI
 * and saving them to the database with proper relationships
 */
export class TopicExtractor {
    private dbClient
    private aiClient

    /**
     * Creates a new TopicExtractor instance
     *
     * @param dbConfig - Database configuration
     * @param transcriptionConfig - Transcription configuration with AI settings
     */
    constructor(
        private dbConfig: DatabaseConfig,
        private transcriptionConfig: TranscriptionConfig,
    ) {
        this.dbClient = createSupabaseClient(dbConfig)
        this.aiClient = createGenerativeAIClient(transcriptionConfig)
    }

    /**
     * Extract topics from a transcription using AI model
     *
     * @param transcription - The transcription object from the database
     * @returns Array of extracted topics with relevance scores
     */
    async extractTopicsFromTranscription(
        transcription: Transcription,
    ): Promise<Topic[]> {
        // Skip if no transcription data
        if (
            !transcription.transcription ||
            !Array.isArray(transcription.transcription) ||
            transcription.transcription.length === 0
        ) {
            return []
        }

        // Concatenate all transcription segments, filtering out commercials
        const segments =
            transcription.transcription as unknown as TranscriptionResult[]
        const fullText = segments
            .filter((segment) => !segment.isCommercial)
            .map((segment) => segment.caption)
            .join(' ')

        // Skip very short texts that likely don't contain meaningful topics
        if (fullText.length < 20) return []

        // Use AI to extract meaningful topics
        const model = this.aiClient.getGenerativeModel({
            model: this.transcriptionConfig.model || 'gemini-2.0-flash',
        })

        // Craft a prompt that guides the AI to extract meaningful topics
        const prompt = `
            Extract key topics from this radio transcription. Focus on:
            - News topics (people, places, events, organizations)
            - Major discussion themes
            - Important conversational topics
            - Cultural or social references
            
            For each topic:
            - Provide the canonical name (proper capitalization)
            - Provide a normalized form (lowercase, singular, without articles)
            - Assign a relevance score (0.0-1.0) based on importance to the overall discussion
            
            Guidelines for topics:
            - Focus on substantive discussion topics, not casual mentions
            - Prioritize named entities (people, places, organizations)
            - Combine related subtopics into broader themes when appropriate
            - Be specific but not overly narrow
            
            Respond in valid JSON format as an array of objects with fields: name, normalizedName, relevanceScore.
            
            Transcription: "${fullText}"
        `

        try {
            const result = await model.generateContent(prompt)
            const text = result.response.text()

            // Extract JSON from response (handles cases where AI adds extra text)
            const jsonMatch = text.match(/\[[\s\S]*\]/)
            if (!jsonMatch) return []

            // Parse the topics and validate their structure
            const topics = JSON.parse(jsonMatch[0]) as Topic[]
            return topics.filter(
                (t) =>
                    t &&
                    t.name &&
                    t.name.trim() &&
                    t.normalizedName &&
                    t.normalizedName.trim() &&
                    typeof t.relevanceScore === 'number' &&
                    t.relevanceScore >= 0 &&
                    t.relevanceScore <= 1,
            )
        } catch (error) {
            console.error('Error extracting topics:', error)
            return []
        }
    }

    /**
     * Save extracted topics to database and create relationships with stations
     *
     * @param stationId - The ID of the station that mentioned the topics
     * @param topics - Array of topics extracted from the transcription
     */
    async saveTopics(stationId: string, topics: Topic[]): Promise<void> {
        const now = new Date().toISOString()

        for (const topic of topics) {
            try {
                // 1. Insert or get topic record
                const { data: topicData, error: topicError } =
                    await this.dbClient
                        .from('topics')
                        .upsert(
                            {
                                name: topic.name,
                                normalized_name: topic.normalizedName,
                            },
                            { onConflict: 'normalized_name' },
                        )
                        .select()

                if (topicError || !topicData || topicData.length === 0) {
                    console.error('Error upserting topic:', topicError)
                    continue
                }

                const topicId = topicData[0].id

                // 2. Insert or update station_topics
                const { error: stTopicError } = await this.dbClient.rpc(
                    'upsert_station_topic',
                    {
                        p_station_id: stationId,
                        p_topic_id: topicId,
                        p_relevance_score: topic.relevanceScore,
                        p_last_mentioned_at: now,
                    },
                )

                if (stTopicError) {
                    console.error(
                        'Error upserting station_topic:',
                        stTopicError,
                    )
                }
            } catch (error) {
                console.error(`Error processing topic "${topic.name}":`, error)
            }
        }
    }

    /**
     * Process a single transcription - extract topics and save to database
     *
     * @param transcription - The transcription to process
     * @returns Number of topics extracted and saved
     */
    async processTranscription(transcription: Transcription): Promise<number> {
        if (!transcription || !transcription.id || !transcription.stationId) {
            console.error('Invalid transcription object:', transcription)
            return 0
        }

        try {
            // Extract topics using AI
            const topics =
                await this.extractTopicsFromTranscription(transcription)

            if (topics.length === 0) {
                return 0
            }

            // Save topics to database with station relationships
            await this.saveTopics(transcription.stationId, topics)

            return topics.length
        } catch (error) {
            console.error(
                `Error processing transcription ${transcription.id}:`,
                error,
            )
            return 0
        }
    }

    /**
     * Update topic trends across all stations
     * Calls the database function to calculate trending topics
     */
    async updateTopicTrends(): Promise<void> {
        try {
            const { error } = await this.dbClient.rpc(
                'calculate_trending_topics',
            )
            if (error) {
                console.error('Error updating topic trends:', error)
            }
        } catch (error) {
            console.error('Exception updating topic trends:', error)
        }
    }

    /**
     * Find and save connections between stations discussing the same topics
     * Calls the database function to update topic connections
     */
    async updateTopicConnections(): Promise<void> {
        try {
            const { error } = await this.dbClient.rpc(
                'update_topic_connections',
            )
            if (error) {
                console.error('Error updating topic connections:', error)
            }
        } catch (error) {
            console.error('Exception updating topic connections:', error)
        }
    }

    /**
     * Process multiple transcriptions in batch
     *
     * @param transcriptions - Array of transcriptions to process
     * @param updateTrends - Whether to update topic trends after processing
     * @param updateConnections - Whether to update connections after processing
     * @returns Number of topics extracted and saved
     */
    async processTranscriptionBatch(
        transcriptions: Transcription[],
        updateTrends = true,
        updateConnections = true,
    ): Promise<number> {
        let totalTopics = 0

        // Process each transcription
        for (const transcription of transcriptions) {
            const topicCount = await this.processTranscription(transcription)
            totalTopics += topicCount
        }

        // Update trends and connections if requested
        if (totalTopics > 0) {
            if (updateTrends) {
                await this.updateTopicTrends()
            }

            if (updateConnections) {
                await this.updateTopicConnections()
            }
        }

        return totalTopics
    }

    /**
     * Process recent transcriptions from the database
     *
     * @param minutesBack - Number of minutes to look back for recent transcriptions
     * @param limit - Maximum number of transcriptions to process
     * @returns Number of topics extracted and saved
     */
    async processRecentTranscriptions(
        minutesBack = 15,
        limit = 100,
    ): Promise<number> {
        const cutoffTime = new Date(
            Date.now() - minutesBack * 60 * 1000,
        ).toISOString()

        // Fetch recent transcriptions
        const { data: transcriptions, error } = await this.dbClient
            .from('transcriptions')
            .select('*')
            .gt('createdAt', cutoffTime)
            .order('createdAt', { ascending: false })
            .limit(limit)

        if (error || !transcriptions) {
            console.error('Error fetching recent transcriptions:', error)
            return 0
        }

        return this.processTranscriptionBatch(transcriptions)
    }
}
