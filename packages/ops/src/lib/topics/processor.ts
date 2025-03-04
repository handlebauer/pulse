/**
 * Topic Processor Integration
 *
 * This module provides functions for processing topics from a single
 * transcription, designed to be called immediately after transcription.
 */
import { TopicExtractor } from '@pulse/radio'
import { createSupabaseClient } from '@/lib/db'
import createLogger from '@/lib/logger'
import { defaultConfig } from '@/config'

const logger = createLogger('TopicProcessor')

/**
 * Process topics for a single transcription
 *
 * This function is designed to be called immediately after a new
 * transcription is created, to extract and save topics in real-time.
 */
export async function processTranscriptionTopics(
    transcriptionId: string,
    updateTrends = true,
    updateConnections = true,
): Promise<number> {
    logger.debug(`Processing topics for transcription ${transcriptionId}`)
    const supabase = createSupabaseClient()

    try {
        // 1. Fetch the transcription
        const { data: transcription, error: fetchError } = await supabase
            .from('transcriptions')
            .select('*') // Get all fields needed by the TopicExtractor
            .eq('id', transcriptionId)
            .single()

        if (fetchError || !transcription) {
            logger.error(
                `Failed to fetch transcription ${transcriptionId}`,
                fetchError,
            )
            return 0
        }

        // 2. Use the TopicExtractor to process the transcription
        const dbConfig = defaultConfig.database
        const transcriptionConfig = defaultConfig.transcription

        const topicExtractor = new TopicExtractor(dbConfig, transcriptionConfig)

        logger.debug(
            `Processing transcription ${transcriptionId} through TopicExtractor`,
        )
        const processedCount =
            await topicExtractor.processTranscription(transcription)

        // 3. Update trends and connections if requested
        if (updateTrends) {
            logger.debug('Updating trending topics')
            await topicExtractor.updateTopicTrends()
        }

        if (updateConnections) {
            logger.debug('Updating topic connections')
            await topicExtractor.updateTopicConnections()
        }

        logger.info(
            `Successfully processed ${processedCount} topics for transcription ${transcriptionId}`,
        )
        return processedCount
    } catch (error) {
        logger.error(
            `Error processing topics for transcription ${transcriptionId}`,
            error,
        )
        return 0
    }
}
