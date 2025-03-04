/**
 * A record from the database that contains the audio and the transcription
 */
export interface TranscriptRecord {
    id: number
    text: string
    audio: Buffer | Uint8Array
    timestamp: string
    duration: number
    processed: boolean
}
