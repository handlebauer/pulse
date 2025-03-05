import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { detectHlsStream } from '@/lib/utils'

interface UseAudioPlayerProps {
    streamUrl: string
    externalIsPlaying?: boolean
}

export function useAudioPlayer({
    streamUrl,
    externalIsPlaying,
}: UseAudioPlayerProps) {
    const [isPlaying, setIsPlaying] = useState(false)
    const [volume, setVolume] = useState([0.5])
    const [isMuted, setIsMuted] = useState(false)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const hlsRef = useRef<Hls | null>(null)
    const networkRetries = useRef(0)
    const mediaRetries = useRef(0)
    const prevStreamUrl = useRef<string | null>(null)
    const prevExternalIsPlaying = useRef<boolean | undefined>(undefined)

    // Track external playback state - this effect handles play/pause commands
    useEffect(() => {
        // Only respond to changes in externalIsPlaying
        if (
            externalIsPlaying !== undefined &&
            externalIsPlaying !== prevExternalIsPlaying.current
        ) {
            console.log('External is playing changed:', externalIsPlaying)
            prevExternalIsPlaying.current = externalIsPlaying

            // If we have an audio element
            if (audioRef.current) {
                if (externalIsPlaying) {
                    // Try to play the audio
                    audioRef.current
                        .play()
                        .then(() => {
                            console.log('Audio playback started successfully')
                            setIsPlaying(true)
                        })
                        .catch((error) => {
                            console.error('Error starting playback:', error)
                            // Try again after a short delay (helps with some browser autoplay restrictions)
                            setTimeout(() => {
                                if (audioRef.current) {
                                    audioRef.current
                                        .play()
                                        .then(() => {
                                            console.log(
                                                'Audio playback started on retry',
                                            )
                                            setIsPlaying(true)
                                        })
                                        .catch((e) => {
                                            console.error(
                                                'Failed to play even after retry:',
                                                e,
                                            )
                                            setIsPlaying(false)
                                        })
                                }
                            }, 500)
                        })
                } else {
                    // Pause the audio
                    audioRef.current.pause()
                    setIsPlaying(false)
                }
            }
        }
    }, [externalIsPlaying])

    // Initialize audio when streamUrl changes
    useEffect(() => {
        if (!streamUrl) return

        console.log(
            'Stream URL effect running:',
            streamUrl,
            'previous:',
            prevStreamUrl.current,
        )

        // Don't restart audio if URL hasn't changed
        if (prevStreamUrl.current === streamUrl) {
            return
        }

        console.log('Creating new audio element for stream:', streamUrl)

        // Store current playing state to determine if we should auto-play the new stream
        const wasPlaying = isPlaying || externalIsPlaying

        // Clean up existing audio resources
        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.src = ''
            audioRef.current = null
        }

        if (hlsRef.current) {
            hlsRef.current.destroy()
            hlsRef.current = null
        }

        // Create new audio element
        audioRef.current = new Audio()

        // Remember volume and mute settings
        if (audioRef.current) {
            audioRef.current.volume = isMuted ? 0 : volume[0]

            // Add event listeners to track native audio element state
            audioRef.current.onplay = () => {
                console.log('Audio element started playing')
                setIsPlaying(true)
            }

            audioRef.current.onpause = () => {
                console.log('Audio element paused')
                setIsPlaying(false)
            }

            audioRef.current.onended = () => {
                console.log('Audio playback ended')
                setIsPlaying(false)
            }

            audioRef.current.onerror = (e) => {
                console.warn('Audio error:', e)
                setIsPlaying(false)
            }
        }

        // Function to initialize HLS
        const initHls = () => {
            if (!audioRef.current) return

            // Reset retry counters
            networkRetries.current = 0
            mediaRetries.current = 0

            if (Hls.isSupported()) {
                console.log('Using HLS.js for playback')
                hlsRef.current = new Hls()
                hlsRef.current.loadSource(streamUrl)
                hlsRef.current.attachMedia(audioRef.current)

                hlsRef.current.on(Hls.Events.ERROR, (_event, data) => {
                    if (data.fatal) {
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                if (networkRetries.current < 3) {
                                    networkRetries.current++
                                    hlsRef.current?.startLoad()
                                } else {
                                    // Exceeded retries, destroy and fall back to regular audio
                                    hlsRef.current?.destroy()
                                    hlsRef.current = null
                                    initRegularAudio()
                                }
                                break
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                if (mediaRetries.current < 3) {
                                    mediaRetries.current++
                                    hlsRef.current?.recoverMediaError()
                                } else {
                                    // Exceeded retries, destroy and fall back to regular audio
                                    hlsRef.current?.destroy()
                                    hlsRef.current = null
                                    initRegularAudio()
                                }
                                break
                            default:
                                // Cannot recover, destroy and fall back to regular audio
                                hlsRef.current?.destroy()
                                hlsRef.current = null
                                initRegularAudio()
                                break
                        }
                    }
                })

                // If was playing, resume playback on the new stream
                if (wasPlaying) {
                    console.log(
                        'Was playing, attempting to auto-play HLS stream',
                    )
                    hlsRef.current.on(Hls.Events.MANIFEST_PARSED, () => {
                        if (audioRef.current) {
                            audioRef.current
                                .play()
                                .then(() => console.log('HLS playback started'))
                                .catch((e) =>
                                    console.error(
                                        'Error playing HLS audio:',
                                        e,
                                    ),
                                )
                        }
                    })
                }
            } else if (
                audioRef.current.canPlayType('application/vnd.apple.mpegurl')
            ) {
                // For Safari with native HLS support
                console.log('Using native HLS support')
                audioRef.current.src = streamUrl

                // If was playing, resume playback on the new stream
                if (wasPlaying) {
                    console.log(
                        'Was playing, attempting to auto-play native HLS',
                    )
                    audioRef.current
                        .play()
                        .then(() => console.log('Native HLS playback started'))
                        .catch((e) =>
                            console.error('Error playing native HLS audio:', e),
                        )
                }
            } else {
                // Fall back to regular audio
                console.log('Falling back to regular audio')
                initRegularAudio()
            }
        }

        // Function to initialize regular audio
        const initRegularAudio = () => {
            if (!audioRef.current) return

            console.log('Setting up regular audio with src:', streamUrl)
            audioRef.current.src = streamUrl

            // If was playing, resume playback on the new stream
            if (wasPlaying) {
                console.log(
                    'Was playing, attempting to auto-play regular audio',
                )
                audioRef.current
                    .play()
                    .then(() => console.log('Regular audio playback started'))
                    .catch((e) =>
                        console.error('Error playing regular audio:', e),
                    )
            }
        }

        // Initialize audio based on stream type
        detectHlsStream(streamUrl).then((isHls) => {
            console.log('Stream detected as HLS:', isHls)
            if (isHls) {
                initHls()
            } else {
                initRegularAudio()
            }
        })

        // Remember the stream URL we just handled
        prevStreamUrl.current = streamUrl

        return () => {
            if (audioRef.current) {
                audioRef.current.pause()
                audioRef.current.src = ''
                audioRef.current = null
            }
            if (hlsRef.current) {
                hlsRef.current.destroy()
                hlsRef.current = null
            }
        }
    }, [streamUrl, volume, isMuted])

    // Update volume whenever it changes
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = isMuted ? 0 : volume[0]
        }
    }, [volume, isMuted])

    // Direct toggle play/pause function
    const togglePlayPause = async () => {
        if (!audioRef.current) return

        console.log('Manual togglePlayPause called, current state:', isPlaying)

        if (isPlaying) {
            audioRef.current.pause()
        } else {
            try {
                await audioRef.current.play()
                console.log('Playback started via togglePlayPause')
            } catch (error) {
                console.error(
                    'Error starting playback via togglePlayPause:',
                    error,
                )
                // Attempt to recover
                setTimeout(() => {
                    if (audioRef.current) {
                        audioRef.current
                            .play()
                            .then(() =>
                                console.log(
                                    'Playback started via togglePlayPause retry',
                                ),
                            )
                            .catch((e) =>
                                console.error('Error on retry playback:', e),
                            )
                    }
                }, 500)
            }
        }
    }

    const handleVolumeChange = (value: number[]) => {
        if (!audioRef.current) return
        setVolume(value)
        audioRef.current.volume = isMuted ? 0 : value[0]
    }

    const toggleMute = () => {
        if (!audioRef.current) return
        setIsMuted(!isMuted)
        audioRef.current.volume = !isMuted ? 0 : volume[0]
    }

    return {
        isPlaying,
        volume,
        isMuted,
        togglePlayPause,
        handleVolumeChange,
        toggleMute,
    }
}
