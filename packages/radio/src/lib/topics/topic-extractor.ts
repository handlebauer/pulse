import { createSupabaseClient } from '../db/client'
import type { Tables } from '../db/types'
import { createTopicExtractionAI, type TopicExtractionAI } from '../../utils/ai'
import type { DatabaseConfig, TopicExtractionConfig } from '../config/types'
import type { TranscriptionResult } from '../stream/stream-manager'
import dedent from 'dedent'

/**
 * Represents a transcription from the database
 */
type Transcription = Tables<'transcriptions'>

/**
 * Input for text-based topic extraction without database dependency
 */
export interface TextInput {
    text: string
    stationName?: string
    segment?: {
        isCommercial?: boolean
    }
}

/**
 * Represents an extracted topic with its relevance score
 */
export interface Topic {
    name: string
    normalizedName: string
    relevanceScore: number
}

/**
 * Core topic extraction functionality without database dependencies
 * Useful for standalone topic extraction or testing
 */
export class CoreTopicExtractor {
    protected aiClient: TopicExtractionAI

    /**
     * Creates a new CoreTopicExtractor instance
     *
     * @param topicExtractionConfig - Topic extraction configuration with AI settings
     */
    constructor(protected topicExtractionConfig: TopicExtractionConfig) {
        this.aiClient = createTopicExtractionAI(topicExtractionConfig)
    }

    /**
     * Extract topics from raw text using AI model
     *
     * @param input - The text to analyze with optional context
     * @returns Array of extracted topics with relevance scores
     */
    async extractTopicsFromText(input: TextInput): Promise<Topic[]> {
        // Skip if no text data
        if (!input.text || input.text.trim().length < 20) {
            return []
        }

        // Skip commercial segments if specified
        if (input.segment?.isCommercial) {
            return []
        }

        // Create a context string if station name is provided
        const contextPrefix = input.stationName
            ? `The following is a transcription from radio station ${input.stationName}.`
            : 'The following is a radio transcription.'

        let prompt = null

        // Craft a prompt that guides the AI to extract meaningful topics
        if (this.topicExtractionConfig.provider === 'google') {
            prompt = dedent`
            ${contextPrefix}
            
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
            - Bias towards one-word topics unless semantic integrity requires more than one word
            
            Respond in valid JSON format as an array of objects with fields: name, normalizedName, relevanceScore.
            
            Here is the transcription:
            
            """
            ${input.text}
            """
        `
        } else if (this.topicExtractionConfig.provider === 'openai') {
            prompt = dedent`
            ${contextPrefix}
            
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
            - Bias your responses towards one-word topics unless semantic integrity requires more than one word

            Here is the transcription:
            
            """
            ${input.text}
            """
        `
        } else {
            throw new Error(
                `Unsupported provider: ${this.topicExtractionConfig.provider}`,
            )
        }

        try {
            // Use our provider-agnostic AI client to generate content
            const text = await this.aiClient.generateContent(prompt)

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
}

/**
 * TopicExtractor class is responsible for extracting topics from transcriptions using AI
 * and saving them to the database with proper relationships
 */
export class TopicExtractor extends CoreTopicExtractor {
    private dbClient

    /**
     * Creates a new TopicExtractor instance
     *
     * @param dbConfig - Database configuration
     * @param topicExtractionConfig - Topic extraction configuration with AI settings
     */
    constructor(
        private dbConfig: DatabaseConfig,
        topicExtractionConfig: TopicExtractionConfig,
    ) {
        super(topicExtractionConfig)
        this.dbClient = createSupabaseClient(dbConfig)
    }

    /**
     * Extract topics from a transcription database object using AI model
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

        // Find the station name if available
        let stationName = undefined
        if (transcription.stationId) {
            try {
                const { data } = await this.dbClient
                    .from('stations')
                    .select('stationName')
                    .eq('id', transcription.stationId)
                    .single()

                stationName = data?.stationName
            } catch {
                // Continue without station name if we can't fetch it
            }
        }

        // Concatenate all transcription segments, filtering out commercials
        const segments =
            transcription.transcription as unknown as TranscriptionResult[]
        const fullText = segments
            .filter((segment) => !segment.isCommercial)
            .map((segment) => segment.caption)
            .join(' ')

        // Use the core extraction method
        return this.extractTopicsFromText({
            text: fullText,
            stationName,
        })
    }

    /**
     * Save extracted topics to database and create relationships with stations
     *
     * @param stationId - The ID of the station that mentioned the topics
     * @param topics - Array of topics extracted from the transcription
     * @param transcriptionId - The ID of the transcription where topics were found
     */
    async saveTopics(
        stationId: string,
        topics: Topic[],
        transcriptionId?: string,
    ): Promise<void> {
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

                // 3. Find and save topic mentions in the transcription
                if (transcriptionId) {
                    const { error: findMentionError } = await this.dbClient.rpc(
                        'find_topic_mentions',
                        {
                            p_transcription_id: transcriptionId,
                            p_topic_id: topicId,
                            p_topic_name: topic.name,
                            p_normalized_topic_name: topic.normalizedName,
                        },
                    )

                    if (findMentionError) {
                        console.error(
                            'Error finding topic mentions:',
                            findMentionError,
                        )
                    }
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

            // Save topics to database with station relationships and transcription links
            await this.saveTopics(
                transcription.stationId,
                topics,
                transcription.id,
            )

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
