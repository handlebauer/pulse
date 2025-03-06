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
 * Represents a segment in a transcription
 */
interface TranscriptionSegment {
    caption: string
    isCommercial?: boolean
    isMusic?: boolean
    startTime?: number
    endTime?: number
    // Using unknown instead of any for better type safety
    [key: string]: string | number | boolean | undefined | unknown
}

/**
 * Input for text-based topic extraction without database dependency
 */
export interface TextInput {
    text: string
    stationName?: string
    segment?: {
        isCommercial?: boolean
        isMusic?: boolean
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
 * Represents a topic mention with its context
 */
export interface TopicMention {
    topicId: string
    transcriptionId: string
    matchText: string
    contextBefore: string
    contextAfter: string
    segmentIndex: number
    position: number
    confidence: number
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

        // Skip commercial or music segments if specified
        if (input.segment?.isCommercial || input.segment?.isMusic) {
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

        // Concatenate all transcription segments, filtering out commercials and music
        const segments =
            transcription.transcription as unknown as TranscriptionResult[]
        const fullText = segments
            .filter((segment) => !segment.isCommercial && !segment.isMusic)
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
                    try {
                        // Get the transcription data
                        const { data: transcriptionData } = await this.dbClient
                            .from('transcriptions')
                            .select('*')
                            .eq('id', transcriptionId)
                            .single()

                        if (transcriptionData) {
                            // Process the mentions using our new TypeScript method
                            await this.processTopicMentions(
                                transcriptionData,
                                topicId,
                                topic.name,
                                topic.normalizedName,
                            )
                        }
                    } catch (error) {
                        console.error('Error finding topic mentions:', error)
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

    /**
     * Find all mentions of a topic in a transcription with surrounding context
     *
     * @param transcription - The transcription object from the database
     * @param topicId - The database ID of the topic
     * @param topicName - The display name of the topic
     * @param normalizedName - The normalized name for case-insensitive matching
     * @returns Array of topic mentions with context
     */
    async findTopicMentions(
        transcription: Transcription,
        topicId: string,
        normalizedName: string,
    ): Promise<TopicMention[]> {
        if (
            !transcription.transcription ||
            !Array.isArray(transcription.transcription)
        ) {
            return []
        }

        const mentions: TopicMention[] = []
        const segments = transcription.transcription as TranscriptionSegment[]

        // Create a regex with word boundaries
        const topicRegex = new RegExp(`\\b${normalizedName}\\b`, 'gi')

        // Process each segment of the transcription
        for (
            let segmentIndex = 0;
            segmentIndex < segments.length;
            segmentIndex++
        ) {
            const segment = segments[segmentIndex]

            // Skip if no caption or marked as commercial/music
            if (!segment?.caption || segment.isCommercial || segment.isMusic) {
                continue
            }

            const segmentText = segment.caption
            let match: RegExpExecArray | null

            // Find each match in the segment
            while (
                (match = topicRegex.exec(segmentText.toLowerCase())) !== null
            ) {
                const matchPosition = match.index
                const matchLength = match[0].length

                // Get the actual match text (preserving original case)
                const matchText = segmentText.substring(
                    matchPosition,
                    matchPosition + matchLength,
                )

                // Get text before and after the match
                const textBeforeMatch = segmentText.substring(0, matchPosition)
                const textAfterMatch = segmentText.substring(
                    matchPosition + matchLength,
                )

                // Split into words
                const beforeWords = textBeforeMatch.trim().split(/\s+/)
                const afterWords = textAfterMatch.trim().split(/\s+/)

                // Get exactly 10 words of context (or all if less than 10)
                let contextBefore = ''
                if (beforeWords.length > 10) {
                    contextBefore = beforeWords
                        .slice(beforeWords.length - 10)
                        .join(' ')
                    // Ensure we preserve the trailing space if it existed
                    if (textBeforeMatch.endsWith(' ')) {
                        contextBefore += ' '
                    }
                } else {
                    // Keep all text but ensure trailing space is preserved
                    contextBefore = textBeforeMatch.trimStart()
                }

                let contextAfter = ''
                if (afterWords.length > 10) {
                    contextAfter = afterWords.slice(0, 10).join(' ')
                    // Ensure we preserve the trailing space if needed
                    if (
                        afterWords.length > 10 &&
                        afterWords[10].startsWith(' ')
                    ) {
                        contextAfter += ' '
                    }
                } else {
                    // Keep all text but ensure leading space is preserved
                    contextAfter = textAfterMatch.trimEnd()
                }

                // Create the mention object
                const mention: TopicMention = {
                    topicId,
                    transcriptionId: transcription.id,
                    matchText,
                    contextBefore,
                    contextAfter,
                    segmentIndex,
                    position: matchPosition,
                    confidence: 1.0,
                }

                mentions.push(mention)
            }
        }

        return mentions
    }

    /**
     * Save topic mentions to the database
     *
     * @param mentions - Array of topic mentions to save
     */
    async saveTopicMentions(mentions: TopicMention[]): Promise<void> {
        if (mentions.length === 0) {
            return
        }

        try {
            // Process in batches to avoid overloading the database
            const batchSize = 100
            for (let i = 0; i < mentions.length; i += batchSize) {
                const batch = mentions.slice(i, i + batchSize)

                // Simply insert mentions without worrying about conflicts
                const { error } = await this.dbClient
                    .from('transcription_topics')
                    .insert(
                        batch.map((mention) => ({
                            transcriptionId: mention.transcriptionId,
                            topicId: mention.topicId,
                            matchText: mention.matchText,
                            contextBefore: mention.contextBefore,
                            contextAfter: mention.contextAfter,
                            segmentIndex: mention.segmentIndex,
                            position: mention.position,
                            confidence: mention.confidence,
                        })),
                    )

                if (error) {
                    console.error('Error inserting topic mentions:', error)
                }
            }
        } catch (error) {
            console.error('Exception while saving topic mentions:', error)
        }
    }

    /**
     * Process topic mentions for a given transcription and topic
     *
     * @param transcription - The transcription object
     * @param topicId - The database ID of the topic
     * @param topicName - The display name of the topic
     * @param normalizedName - The normalized name for matching
     */
    async processTopicMentions(
        transcription: Transcription,
        topicId: string,
        topicName: string,
        normalizedName: string,
    ): Promise<number> {
        // Find all mentions of the topic
        const mentions = await this.findTopicMentions(
            transcription,
            topicId,
            normalizedName,
        )

        // Save mentions to the database
        await this.saveTopicMentions(mentions)

        return mentions.length
    }
}
