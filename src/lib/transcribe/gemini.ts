import dedent from 'dedent'
import { googleGenerativeAI } from '@/utils/ai'

const model = googleGenerativeAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
        responseMimeType: 'application/json',
    },
})

const prompt = dedent`
    Please transcribe this radio stream, in the format of: 

    {
        timecode: 'hh:mm:ss',
        caption: 'This is the caption for the first 4 seconds of the radio stream.',
    }j
    
    Your final output should be an array of transcription objects.
`

/**
 * Transcribes audio from a file path
 * @param audioFilePath The path to the audio file
 * @returns The transcription text
 */
export async function transcribeAudio(audioFilePath: string) {
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
        { text: prompt },
    ])

    try {
        const text = result.response.text()
        console.log({ text })
        return JSON.parse(text)
    } catch (error) {
        console.error(error)
        return []
    }
}
