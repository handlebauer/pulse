import { type TranscriptionConfig } from '../config/types'
import { createGoogleTranscriptionService } from './gemini'
import { createOpenAITranscriptionService } from './openai'
import { type TranscriptionResult } from '../stream/stream-manager'

/**
 * Transcription service interface
 */
export interface TranscriptionService {
    /**
     * Transcribes audio from a file path
     * @param audioFilePath The path to the audio file
     * @returns The transcription results
     */
    transcribeAudio(audioFilePath: string): Promise<TranscriptionResult[]>
}

/**
 * Creates a transcription service based on the configuration
 *
 * @param config Transcription configuration
 * @returns A provider-agnostic transcription service
 */
export function createTranscriptionService(
    config: TranscriptionConfig,
): TranscriptionService {
    // Skip initialization if transcription is explicitly disabled
    if (config.enabled === false) {
        throw new Error('Transcription is disabled')
    }

    if (config.provider === 'openai') {
        if (!config.openai?.apiKey) {
            throw new Error('OpenAI API key is required for transcription')
        }
        return createOpenAITranscriptionService(
            config.openai.apiKey,
            config.openai.model,
        )
    } else {
        // Default to Google
        if (!config.google?.apiKey) {
            throw new Error('Google API key is required for transcription')
        }
        return createGoogleTranscriptionService(
            config.google.apiKey,
            config.google.model,
        )
    }
}

export { createGoogleTranscriptionService } from './gemini'
export { createOpenAITranscriptionService } from './openai'
