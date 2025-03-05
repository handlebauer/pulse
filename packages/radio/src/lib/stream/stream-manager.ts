import { $, ShellPromise } from 'bun'
import path from 'path'
import { readdir, stat, mkdir, unlink } from 'fs/promises'
import { watch } from 'fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fileToBase64 } from '@/utils/general'

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
 * Transcription result from the AI service
 */
export interface TranscriptionResult {
    timecode: string
    caption: string
    isCommercial?: boolean
    isMusic?: boolean
}

/**
 * Dependencies for the stream manager
 */
export interface StreamManagerDependencies {
    /**
     * Supabase client for database operations
     */
    dbClient?: SupabaseClient

    /**
     * Transcription service for audio transcription.
     * This will be initialized if both model and googleApiKey are provided in the transcription config,
     * unless explicitly disabled by setting enabled: false
     */
    transcriptionService?: {
        transcribeAudio: (
            audioFilePath: string,
        ) => Promise<TranscriptionResult[]>
    }
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
    private readonly dependencies: StreamManagerDependencies

    constructor(
        private readonly streamUrl: string,
        private readonly config: StreamConfig,
        dependencies: StreamManagerDependencies = {},
    ) {
        this.config.segmentLength = this.config.segmentLength || 10
        this.config.segmentPrefix = this.config.segmentPrefix || 'segment'
        this.config.keepSegments = this.config.keepSegments || 0
        this.stationId = config.stationId
        this.dependencies = dependencies
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
            // If transcription service is provided, transcribe the segment
            if (this.dependencies.transcriptionService) {
                console.log(
                    `[Processing] Transcribing segment ${path.basename(segmentInfo.filePath)}`,
                )
                const transcription =
                    await this.dependencies.transcriptionService.transcribeAudio(
                        segmentInfo.filePath,
                    )

                // If dbClient is provided, save transcription to the database
                if (this.dependencies.dbClient && transcription.length > 0) {
                    console.log(
                        `[Processing] Saving transcription to database for segment ${path.basename(segmentInfo.filePath)}`,
                    )
                    const response = await this.dependencies.dbClient
                        .from('transcriptions')
                        .insert({
                            stationId: this.stationId,
                            audioData: await fileToBase64(segmentInfo.filePath),
                            startTime: new Date(
                                segmentInfo.endTime.getTime() -
                                    segmentInfo.duration * 1000,
                            ).toISOString(),
                            endTime: segmentInfo.endTime.toISOString(),
                            transcription,
                        })
                        .single()

                    if (response.error) {
                        console.error(
                            '[Processing] Error saving transcription:\n' +
                                `Status: ${response.status} (${response.statusText})\n` +
                                `Error details: ${JSON.stringify(response.error, null, 2)}\n` +
                                `Table: transcriptions\n` +
                                `Segment: ${path.basename(segmentInfo.filePath)}`,
                        )
                    }
                }
            } else {
                console.log(
                    `[Processing] No transcription service provided, skipping transcription for segment ${path.basename(segmentInfo.filePath)}`,
                )
            }
        } catch (error) {
            console.error(
                `[Processing] Error processing segment ${path.basename(segmentInfo.filePath)}:`,
                error,
            )
            segmentInfo.error =
                error instanceof Error ? error : new Error(String(error))
        }
    }

    getSegments(): SegmentInfo[] {
        return [...this.segments]
    }
}

/**
 * Create a new StreamManager instance
 */
export async function createStream(
    streamUrl: string,
    config: StreamConfig,
    dependencies: StreamManagerDependencies = {},
) {
    const manager = new StreamManager(streamUrl, config, dependencies)
    return manager.start()
}
