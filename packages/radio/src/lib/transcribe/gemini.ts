import dedent from 'dedent'
import { createGenerativeAIClient } from '@/utils/ai'
import type { TranscriptionConfig } from '@/lib/config/types'
import type { TranscriptionResult } from '@/lib/stream/stream-manager'

const DEFAULT_MODEL = 'gemini-2.0-flash'
const DEFAULT_PROMPT = dedent`
    Please transcribe this radio stream, and classify whether each segment is a commercial advertisement or not.
    Use the following format: 

    {
        timecode: 'hh:mm:ss',
        caption: 'This is the caption for the first 4 seconds of the radio stream.',
        isCommercial: boolean
    }
    
    Guidelines for commercial classification:
    - Segments that promote products, services, or businesses should be marked as commercial (true)
    - Segments with jingles, slogans, or calls to action for purchases should be marked as commercial (true)
    - Regular programming, news, music, talk shows, or station identifications should be marked as non-commercial (false)
    
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

            let parsed = null

            try {
                parsed = JSON.parse(text)
            } catch {
                // Gemini failed to correctly structure output
                console.log('[Transcription] Failed to parse result:', text)
            }

            // Ensure the result matches our expected format
            if (Array.isArray(parsed)) {
                return parsed.map((item) => ({
                    timecode: item.timecode || '00:00:00',
                    caption: item.caption || '',
                    isCommercial: item.isCommercial === true,
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
