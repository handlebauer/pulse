import { $, ShellPromise } from 'bun'
import path from 'path'
import { readdir, stat, mkdir, unlink } from 'fs/promises'
import { watch } from 'fs'
import { transcribeAudio } from '@/lib/transcribe/gemini'
import { supabaseAdmin } from '@/lib/db/client'

/**
 * Information about a completed segment
 */
export interface SegmentInfo {
    filePath: string
    endTime: Date
    duration: number
    segmentNumber: number
    streamUrl: string
    error?: Error
}

/**
 * Configuration for a stream manager
 */
export interface StreamConfig {
    segmentPath: string
    segmentLength?: number
    segmentPrefix?: string
    keepSegments?: number // Number of most recent segments to keep, default 0 (delete all)
    stationId: string
}

/**
 * Manages a stream of audio segments
 */
export class StreamManager {
    private ffmpegProcess: ShellPromise | null = null
    private segments: SegmentInfo[] = []
    private watcher: ReturnType<typeof watch> | null = null
    private existingSegments: Set<string> = new Set()
    private readonly stationId: string

    constructor(
        private readonly streamUrl: string,
        private readonly config: StreamConfig,
    ) {
        this.config.segmentLength = this.config.segmentLength || 10
        this.config.segmentPrefix = this.config.segmentPrefix || 'segment'
        this.config.keepSegments = this.config.keepSegments || 0
        this.stationId = config.stationId
    }

    private async deleteOldSegments() {
        console.log(
            `[Cleanup] Deleting old segments (keep: ${this.config.keepSegments})`,
        )
        if (this.segments.length <= this.config.keepSegments!) return

        // Sort segments by number to ensure we keep the most recent ones
        const sortedSegments = [...this.segments].sort(
            (a, b) => b.segmentNumber - a.segmentNumber,
        )
        const segmentsToDelete = sortedSegments.slice(this.config.keepSegments!)

        for (const segment of segmentsToDelete) {
            try {
                await unlink(segment.filePath)
                console.log(
                    `[Cleanup] Deleted segment file: ${path.basename(segment.filePath)}`,
                )

                // Remove from our tracking
                this.existingSegments.delete(segment.filePath)
                this.segments = this.segments.filter(
                    (s) => s.filePath !== segment.filePath,
                )
            } catch (error) {
                console.error(
                    `[Cleanup] Failed to delete segment ${path.basename(segment.filePath)}:`,
                    error,
                )
            }
        }
    }

    async start() {
        const outputDir = path.dirname(this.config.segmentPath)

        // Ensure output directory exists
        try {
            await mkdir(outputDir, { recursive: true })
        } catch (error) {
            if (
                error &&
                typeof error === 'object' &&
                'code' in error &&
                error.code !== 'EEXIST'
            ) {
                throw error
            }
        }

        // Initialize segment watching
        await this.initializeSegmentWatcher()

        // Find the highest existing segment number to start from
        const existingSegmentNums = Array.from(this.existingSegments).map(
            (filePath) => {
                const match = path.basename(filePath).match(/\d+/)
                return match ? parseInt(match[0], 10) : -1
            },
        )
        const startNumber =
            existingSegmentNums.length > 0
                ? Math.max(...existingSegmentNums) + 1
                : 0
        console.log(`Starting FFmpeg with segment number: ${startNumber}`)

        // Start the FFmpeg process with the correct start number
        this.ffmpegProcess = this.streamUrl.endsWith('.m3u8')
            ? $`ffmpeg -protocol_whitelist file,http,https,tcp,tls -i ${this.streamUrl} -f segment -segment_time ${this.config.segmentLength} -segment_start_number ${startNumber} -reset_timestamps 1 ${this.config.segmentPath}`.quiet()
            : $`ffmpeg -i ${this.streamUrl} -f segment -segment_time ${this.config.segmentLength} -segment_start_number ${startNumber} -reset_timestamps 1 ${this.config.segmentPath}`.quiet()

        // Handle FFmpeg process in the background
        ;(async () => {
            try {
                await this.ffmpegProcess
            } catch (error) {
                console.error('Error in FFmpeg process:')
                if (error && typeof error === 'object') {
                    if ('stderr' in error && error.stderr instanceof Buffer) {
                        console.error(
                            'FFmpeg error output:',
                            error.stderr.toString(),
                        )
                    }
                    if ('exitCode' in error) {
                        console.error('Exit code:', error.exitCode)
                    }
                    console.error('Full error:', error)
                } else {
                    console.error(error)
                }
            } finally {
                this.ffmpegProcess = null
            }
        })()

        return this
    }

    async stop() {
        if (this.ffmpegProcess) {
            // Kill the FFmpeg process using pkill
            await $`pkill -TERM -P ${process.pid}`.quiet().nothrow()
            this.ffmpegProcess = null
        }

        if (this.watcher) {
            this.watcher.close()
            this.watcher = null
        }
    }

    private async initializeSegmentWatcher() {
        const basePath = path.dirname(this.config.segmentPath)

        // Initialize existing segments
        const existingSegmentFiles = (await readdir(basePath))
            .filter(
                (file: string) =>
                    file.startsWith(this.config.segmentPrefix!) &&
                    file.endsWith('.mp3'),
            )
            .map((file) => path.join(basePath, file))
            .sort()

        if (existingSegmentFiles.length > 0) {
            console.log(
                `Found ${existingSegmentFiles.length} existing segment files`,
            )

            // Add existing segments to our tracking
            for (const filePath of existingSegmentFiles) {
                this.existingSegments.add(filePath)
                const segmentInfo: SegmentInfo = {
                    filePath,
                    endTime: new Date(),
                    duration: this.config.segmentLength!,
                    segmentNumber: parseInt(
                        path.basename(filePath).match(/\d+/)?.[0] ?? '0',
                        10,
                    ),
                    streamUrl: this.streamUrl,
                }
                this.segments.push(segmentInfo)
            }
        }

        // Set up the watcher
        this.watcher = watch(basePath, (eventType, filename) => {
            if (!filename) return

            const segmentPath = path.join(basePath, filename)
            const isTargetFile =
                filename.startsWith(this.config.segmentPrefix!) &&
                !this.existingSegments.has(segmentPath)

            console.log(
                `[Watcher] Event: ${eventType} for file: ${filename} (isTarget: ${isTargetFile})`,
            )

            // Handle deletion events (which come as 'rename' events when file disappears)
            if (
                eventType === 'rename' &&
                this.existingSegments.has(segmentPath)
            ) {
                // Check if file still exists
                stat(segmentPath).catch(() => {
                    // File doesn't exist anymore, it was deleted
                    console.log(`[Watcher] Detected deletion of ${filename}`)
                    this.existingSegments.delete(segmentPath)
                    this.segments = this.segments.filter(
                        (s) => s.filePath !== segmentPath,
                    )
                })
                return
            }

            if (eventType === 'rename' && isTargetFile) {
                this.existingSegments.add(segmentPath)

                const checkSegment = async () => {
                    try {
                        const stats = await stat(segmentPath)
                        const waitTime = (1000 * this.config.segmentLength!) / 2
                        if (stats.size === 0) {
                            // If the file is empty, wait for half the segment length before checking again
                            setTimeout(checkSegment, waitTime)
                        } else {
                            // If the file is not empty, process it
                            console.log(
                                `[Segment ${filename}] File size: ${stats.size} bytes`,
                            )
                            const segmentNumber = parseInt(
                                path.basename(segmentPath).match(/\d+/)?.[0] ??
                                    '0',
                                10,
                            )

                            const segmentInfo: SegmentInfo = {
                                filePath: segmentPath,
                                endTime: new Date(),
                                duration: this.config.segmentLength!,
                                segmentNumber: segmentNumber,
                                streamUrl: this.streamUrl,
                            }
                            this.segments.push(segmentInfo)

                            // Process the segment
                            try {
                                await this.processSegment(segmentInfo)
                            } catch (error) {
                                console.error(
                                    `[Segment ${filename}] Processing failed:`,
                                    error,
                                )
                                segmentInfo.error =
                                    error instanceof Error
                                        ? error
                                        : new Error(String(error))
                            }

                            console.log(
                                `[Segment ${filename}] Processing complete (segment #${segmentInfo.segmentNumber})`,
                            )
                            // Clean up old segments after processing new one
                            await this.deleteOldSegments()
                            return true
                        }
                    } catch (error) {
                        if (
                            error &&
                            typeof error === 'object' &&
                            'code' in error &&
                            error.code === 'ENOENT'
                        ) {
                            console.log(
                                `[Segment ${filename}] File no longer exists, skipping`,
                            )
                            this.existingSegments.delete(segmentPath)
                            return false
                        }
                        throw error
                    }
                }

                ;(async () => {
                    const isComplete = await checkSegment()
                    if (isComplete) {
                        console.log(
                            `[Segment ${filename}] Added to segment list`,
                        )
                    }
                })()
            }
        })
    }

    private async processSegment(segmentInfo: SegmentInfo): Promise<void> {
        try {
            console.log(
                `[Segment ${segmentInfo.segmentNumber}] Starting processing`,
            )

            // Read the audio file and convert to base64
            const audioData = Buffer.from(
                await Bun.file(segmentInfo.filePath).arrayBuffer(),
            ).toString('base64')

            // Create database entry with pending status
            const { data: transcription, error: insertError } =
                await supabaseAdmin
                    .from('transcriptions')
                    .insert({
                        station_id: this.stationId,
                        audio_data: audioData,
                        start_time: new Date(
                            segmentInfo.endTime.getTime() -
                                segmentInfo.duration * 1000,
                        ),
                        end_time: segmentInfo.endTime,
                        status: 'processing',
                    })
                    .select()
                    .single()

            if (insertError) throw insertError

            // Transcribe the audio
            try {
                const transcriptionResult = await transcribeAudio(
                    segmentInfo.filePath,
                )

                // Update the database entry with transcription and completed status
                const { error: updateError } = await supabaseAdmin
                    .from('transcriptions')
                    .update({
                        transcription: transcriptionResult,
                        status: 'completed',
                    })
                    .eq('id', transcription.id)

                if (updateError) throw updateError

                console.log(
                    `[Segment ${segmentInfo.segmentNumber}] Processing completed successfully`,
                )
            } catch (transcriptionError: unknown) {
                // Update the database entry with error status
                const { error: updateError } = await supabaseAdmin
                    .from('transcriptions')
                    .update({
                        status: 'failed',
                        error_message:
                            transcriptionError instanceof Error
                                ? transcriptionError.message
                                : String(transcriptionError),
                    })
                    .eq('id', transcription.id)

                if (updateError) throw updateError

                throw transcriptionError
            }
        } catch (error) {
            console.error(
                `[Segment ${segmentInfo.segmentNumber}] Processing failed:`,
                error,
            )
            throw error
        }
    }

    getSegments(): SegmentInfo[] {
        return [...this.segments]
    }
}

// Convenience function to create and start a stream manager
export async function createStream(streamUrl: string, config: StreamConfig) {
    const manager = new StreamManager(streamUrl, config)
    await manager.start()
    return manager
}
