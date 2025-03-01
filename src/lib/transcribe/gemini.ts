import dedent from 'dedent'
import { createGenerativeAIClient } from '@/utils/ai'
import type { TranscriptionConfig } from '@/lib/config/types'
import type { TranscriptionResult } from '@/lib/stream/stream-manager'

const DEFAULT_MODEL = 'gemini-2.0-flash'
const DEFAULT_PROMPT = dedent`
    Please transcribe this radio stream, in the format of: 

    {
        timecode: 'hh:mm:ss',
        caption: 'This is the caption for the first 4 seconds of the radio stream.',
    }
    
    Your final output should be an array of transcription objects.
`

/**
 * Creates a transcription service
 *
 * @param config Transcription configuration
 * @returns Transcription service
 */
export function createTranscriptionService(config: TranscriptionConfig) {
    const googleAI = createGenerativeAIClient(config)

    const model = googleAI.getGenerativeModel({
        model: config.model || DEFAULT_MODEL,
        generationConfig: {
            responseMimeType: 'application/json',
        },
    })

    /**
     * Transcribes audio from a file path
     * @param audioFilePath The path to the audio file
     * @returns The transcription results
     */
    async function transcribeAudio(
        audioFilePath: string,
    ): Promise<TranscriptionResult[]> {
        if (!config.enabled) {
            console.log('[Transcription] Transcription is disabled')
            return []
        }

        // Generate content using a prompt and the metadata of the uploaded file.
        const result = await model.generateContent([
            {
                inlineData: {
                    mimeType: 'audio/mp3',
                    data: Buffer.from(
                        await Bun.file(audioFilePath).arrayBuffer(),
                    ).toString('base64'),
                },
            },
            { text: DEFAULT_PROMPT },
        ])

        try {
            const text = result.response.text()
            console.log('[Transcription] Raw result:', text)

            const parsed = JSON.parse(text)

            // Ensure the result matches our expected format
            if (Array.isArray(parsed)) {
                return parsed.map((item) => ({
                    timecode: item.timecode || '00:00:00',
                    caption: item.caption || '',
                }))
            }

            console.error('[Transcription] Unexpected result format', parsed)
            return []
        } catch (error) {
            console.error(
                '[Transcription] Error parsing transcription result:',
                error,
            )
            return []
        }
    }

    return {
        transcribeAudio,
    }
}
