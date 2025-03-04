import { GoogleGenerativeAI } from '@google/generative-ai'
import type { TranscriptionConfig } from '@/lib/config/types'

/**
 * Create a Google Generative AI client
 *
 * @param config Transcription configuration
 * @returns Google Generative AI client
 */
export function createGenerativeAIClient(config: TranscriptionConfig) {
    if (!config.googleApiKey) {
        throw new Error('Google API key is required for transcription')
    }

    return new GoogleGenerativeAI(config.googleApiKey)
}
