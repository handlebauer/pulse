import dedent from 'dedent'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { type TranscriptionResult } from '@/lib/stream/stream-manager'

const DEFAULT_MODEL = 'gemini-2.0-flash'
const DEFAULT_PROMPT = dedent`
    Please transcribe this radio stream, and classify whether each segment is a commercial advertisement or contains music.
    Use the following format: 

    {
        timecode: 'hh:mm:ss',
        caption: 'This is the caption for the first 4 seconds of the radio stream.',
        isCommercial: boolean,
        isMusic: boolean
    }
    
    Guidelines for commercial classification:
    - Segments that promote products, services, or businesses should be marked as commercial (true)
    - Segments with jingles, slogans, or calls to action for purchases should be marked as commercial (true)
    
    Guidelines for music classification:
    - Segments containing songs, instrumentals, or music performances should be marked as music (true)
    - Segments with spoken content should be marked as music (true) only if the music is foreground
    
    Your final output should be an array of transcription objects.
`

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

    const googleAI = new GoogleGenerativeAI(apiKey)

    const aiModel = googleAI.getGenerativeModel({
        model: model || DEFAULT_MODEL,
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
        const result = await aiModel.generateContent([
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
                console.log(
                    '[Google Transcription] Failed to parse result:',
                    text,
                )
            }

            // Ensure the result matches our expected format
            if (Array.isArray(parsed)) {
                return parsed.map((item) => ({
                    timecode: item.timecode || '00:00:00',
                    caption: item.caption || '',
                    isCommercial: item.isCommercial === true,
                    isMusic: item.isMusic === true,
                }))
            }

            console.error(
                '[Google Transcription] Unexpected result format',
                parsed,
            )
            return []
        } catch (error) {
            console.error(
                '[Google Transcription] Error parsing transcription result:',
                error,
            )
            return []
        }
    }

    return {
        transcribeAudio,
    }
}
