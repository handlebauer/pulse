import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { detectHlsStream } from '@/lib/utils'

interface UseAudioPlayerProps {
    streamUrl: string
}

export function useAudioPlayer({ streamUrl }: UseAudioPlayerProps) {
    const [isPlaying, setIsPlaying] = useState(false)
    const [volume, setVolume] = useState([0.5])
    const [isMuted, setIsMuted] = useState(false)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const hlsRef = useRef<Hls | null>(null)
    const networkRetries = useRef(0)
    const mediaRetries = useRef(0)

    useEffect(() => {
        setIsPlaying(false)

        // Create new audio element
        audioRef.current = new Audio()

        // Function to initialize HLS
        const initHls = () => {
            if (!audioRef.current) return

            // Reset retry counters
            networkRetries.current = 0
            mediaRetries.current = 0

            if (Hls.isSupported()) {
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
            } else if (
                audioRef.current.canPlayType('application/vnd.apple.mpegurl')
            ) {
                // For Safari with native HLS support
                audioRef.current.src = streamUrl
            } else {
                // Fall back to regular audio
                initRegularAudio()
            }
        }

        // Function to initialize regular audio
        const initRegularAudio = () => {
            if (!audioRef.current) return
            audioRef.current.src = streamUrl
        }

        // Initialize audio based on stream type
        detectHlsStream(streamUrl).then((isHls) => {
            if (isHls) {
                initHls()
            } else {
                initRegularAudio()
            }
        })

        return () => {
            if (audioRef.current) {
                audioRef.current.pause()
                audioRef.current = null
            }
            if (hlsRef.current) {
                hlsRef.current.destroy()
                hlsRef.current = null
            }
        }
    }, [streamUrl])

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume[0]
        }
    }, [volume])

    const togglePlayPause = async () => {
        if (!audioRef.current) return

        if (isPlaying) {
            audioRef.current.pause()
        } else {
            audioRef.current.play()
        }
        setIsPlaying(!isPlaying)
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
