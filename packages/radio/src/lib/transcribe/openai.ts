import { OpenAI } from 'openai'
import { type TranscriptionResult } from '@/lib/stream/stream-manager'
import { existsSync, readFileSync } from 'fs'

const DEFAULT_MODEL = 'whisper-1'

/**
 * Creates an OpenAI-based transcription service
 *
 * @param apiKey OpenAI API key
 * @param model OpenAI model to use
 * @returns Transcription service
 */
export function createOpenAITranscriptionService(
    apiKey: string,
    model: string = DEFAULT_MODEL,
) {
    if (!apiKey) {
        throw new Error('OpenAI API key is required for transcription')
    }

    const openai = new OpenAI({ apiKey })

    /**
     * Transcribes audio from a file path
     * @param audioFilePath The path to the audio file
     * @returns The transcription results
     */
    async function transcribeAudio(
        audioFilePath: string,
    ): Promise<TranscriptionResult[]> {
        try {
            if (!existsSync(audioFilePath)) {
                console.error(
                    '[OpenAI Transcription] Audio file not found:',
                    audioFilePath,
                )
                return []
            }

            // Read the file as a Buffer
            const audioData = readFileSync(audioFilePath)

            // OpenAI Whisper transcription
            const response = await openai.audio.transcriptions.create({
                model: model || DEFAULT_MODEL,
                file: new File([audioData], 'audio.mp3', { type: 'audio/mp3' }),
                response_format: 'verbose_json',
                timestamp_granularities: ['segment'],
            })

            if (!response.segments || !Array.isArray(response.segments)) {
                console.error('[OpenAI Transcription] No segments in response')
                return []
            }

            // Convert OpenAI segments to our TranscriptionResult format
            return response.segments.map((segment) => {
                // Convert seconds to timecode (HH:MM:SS)
                const timecode = formatTimecode(segment.start)

                return {
                    timecode,
                    caption: segment.text.trim(),
                    // OpenAI doesn't detect commercials by default, so we'll mark all as non-commercial
                    // This could be improved by using a separate OpenAI classification call
                    isCommercial: false,
                    // OpenAI doesn't detect music by default, marking all as non-music
                    // This could be improved by using a separate OpenAI classification call
                    isMusic: false,
                }
            })
        } catch (error) {
            console.error(
                '[OpenAI Transcription] Error transcribing audio:',
                error,
            )
            return []
        }
    }

    /**
     * Format seconds to timecode (HH:MM:SS)
     */
    function formatTimecode(seconds: number): string {
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        const secs = Math.floor(seconds % 60)

        return [
            hours.toString().padStart(2, '0'),
            minutes.toString().padStart(2, '0'),
            secs.toString().padStart(2, '0'),
        ].join(':')
    }

    return {
        transcribeAudio,
    }
}
