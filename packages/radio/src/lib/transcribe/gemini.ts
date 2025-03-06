import dedent from 'dedent'
import { OpenAI } from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { type TranscriptionResult } from '@/lib/stream/stream-manager'

const DEFAULT_MODEL = 'gemini-2.0-flash'
const DEFAULT_PROMPT = dedent`
    Please transcribe this radio stream, and classify whether each segment is a commercial advertisement or contains music.
    Use the following format for each segment of the transcription.
`

// Define a schema for the transcription result
const TranscriptionResultSchema = z.array(
    z.object({
        timecode: z.string(),
        caption: z.string(),
        isCommercial: z.boolean(),
        isMusic: z.boolean(),
    }),
)

/**
 * Creates a Google-based transcription service
 *
 * @param apiKey Google API key
 * @param model Google model to use
 * @returns Transcription service
 */
export function createGoogleTranscriptionService(
    apiKey: string,
    model: string = DEFAULT_MODEL,
) {
    if (!apiKey) {
        throw new Error('Google API key is required for transcription')
    }

    const client = new OpenAI({
        apiKey: apiKey,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    })

    /**
     * Transcribes audio from a file path
     * @param audioFilePath The path to the audio file
     * @returns The transcription results
     */
    async function transcribeAudio(
        audioFilePath: string,
    ): Promise<TranscriptionResult[]> {
        try {
            // Generate content using a prompt and the metadata of the uploaded file.
            const audioFile = await Bun.file(audioFilePath).arrayBuffer()
            const base64Audio = Buffer.from(audioFile).toString('base64')

            const response = await client.beta.chat.completions.parse({
                model: model || DEFAULT_MODEL,
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a helpful assistant that transcribes radio broadcasts accurately, providing structured results.',
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: DEFAULT_PROMPT,
                            },
                            {
                                type: 'input_audio',
                                input_audio: {
                                    data: base64Audio,
                                    format: 'mp3',
                                },
                            },
                        ],
                    },
                ],
                response_format: zodResponseFormat(
                    TranscriptionResultSchema,
                    'transcription',
                ),
            })

            const transcriptionResults = response.choices[0]?.message?.parsed

            if (!transcriptionResults) {
                console.error(
                    '[Google Transcription] Failed to parse transcription result',
                )
                return []
            }

            return transcriptionResults.map((item) => ({
                timecode: item.timecode,
                caption: item.caption,
                isCommercial: item.isCommercial,
                isMusic: item.isMusic,
            }))
        } catch (error) {
            console.error(
                '[Google Transcription] Error processing transcription:',
                error,
            )
            return []
        }
    }

    return {
        transcribeAudio,
    }
}
