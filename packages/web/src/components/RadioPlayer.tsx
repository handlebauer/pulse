import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Play, Pause, Volume2, VolumeX, MessageSquare } from 'lucide-react'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { useTranscriptions } from '@/hooks/useTranscriptions'
import { useState, useRef, useEffect } from 'react'
import { TranscriptionPanel } from '@/components/TranscriptionPanel'

interface RadioPlayerProps {
    stationName: string
    streamUrl: string
    stationId?: string
}

export function RadioPlayer({
    stationName,
    streamUrl,
    stationId,
}: RadioPlayerProps) {
    const {
        isPlaying,
        volume,
        isMuted,
        togglePlayPause,
        handleVolumeChange,
        toggleMute,
    } = useAudioPlayer({ streamUrl })

    const { transcriptionMap } = useTranscriptions()
    const [showTranscription, setShowTranscription] = useState(false)

    // State for draggable functionality
    const [position, setPosition] = useState<{ x: number; y: number }>({
        x: 50,
        y: 92,
    }) // Default position (percentage)
    const [isDragging, setIsDragging] = useState(false)
    const playerRef = useRef<HTMLDivElement>(null)
    const dragStartRef = useRef<{
        mouseX: number
        mouseY: number
        elemX: number
        elemY: number
    } | null>(null)

    // Get transcription data for this station if available
    const transcriptionData = stationId ? transcriptionMap[stationId] : null
    const hasTranscription = !!transcriptionData?.recentText
    const isCommercial = transcriptionData?.hasCommercials || false

    // Handle mouse down event to start dragging
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        // Don't start dragging if the click is on an interactive element
        if (
            e.target instanceof Element &&
            (e.target.closest('button') ||
                e.target.closest('.slider') ||
                e.target.tagName === 'INPUT')
        ) {
            return
        }

        e.preventDefault()

        // Store the initial mouse position and element position
        dragStartRef.current = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            elemX: position.x,
            elemY: position.y,
        }

        setIsDragging(true)
    }

    // Handle mouse move event during dragging
    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging || !dragStartRef.current) return

        // Calculate the mouse movement delta
        const deltaX = e.clientX - dragStartRef.current.mouseX
        const deltaY = e.clientY - dragStartRef.current.mouseY

        // Convert delta to percentage of viewport
        const deltaXPercent = (deltaX / window.innerWidth) * 100
        const deltaYPercent = (deltaY / window.innerHeight) * 100

        // Calculate new position based on starting position plus delta
        const newX = dragStartRef.current.elemX + deltaXPercent
        const newY = dragStartRef.current.elemY + deltaYPercent

        // Ensure the player stays within the viewport
        const boundedX = Math.max(0, Math.min(newX, 100))
        const boundedY = Math.max(0, Math.min(newY, 100))

        setPosition({ x: boundedX, y: boundedY })
    }

    // Handle mouse up event to stop dragging
    const handleMouseUp = () => {
        setIsDragging(false)
        dragStartRef.current = null
    }

    // Add and remove event listeners
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDragging])

    return (
        <div
            ref={playerRef}
            className="fixed bg-black/80 px-6 pr-10 pt-5 pb-4 border border-zinc-800 backdrop-blur-sm p-4 rounded-lg shadow-lg flex flex-col items-center gap-4 z-50 w-auto max-w-md"
            style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
                transform: 'translate(-50%, -50%)',
                cursor: isDragging ? 'grabbing' : 'default',
            }}
            onMouseDown={handleMouseDown}
        >
            <div className="flex flex-col w-full">
                <span className="text-sm font-medium text-white mb-2 truncate pl-4">
                    {stationName}
                </span>

                <div className="flex items-center gap-4 w-full">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={togglePlayPause}
                        className="text-white pl-1 hover:bg-transparent hover:text-white cursor-pointer flex items-center justify-center h-10 w-10"
                    >
                        {isPlaying ? (
                            <Pause className="h-6 w-6" />
                        ) : (
                            <Play className="h-6 w-6" />
                        )}
                    </Button>

                    <div className="flex items-center gap-2 flex-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleMute}
                            className="text-white hover:bg-transparent hover:text-white cursor-pointer h-10 w-10 flex items-center justify-center"
                        >
                            {isMuted ? (
                                <VolumeX className="h-5 w-5" />
                            ) : (
                                <Volume2 className="h-5 w-5" />
                            )}
                        </Button>
                        <Slider
                            value={volume}
                            onValueChange={handleVolumeChange}
                            max={1}
                            step={0.01}
                            className="w-[100px]"
                        />
                    </div>

                    {hasTranscription && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                                setShowTranscription(!showTranscription)
                            }
                            className={`text-white hover:bg-white/20 hover:text-white cursor-pointer h-10 w-10 flex items-center justify-center ${showTranscription ? 'bg-white/20' : ''}`}
                            title="Show transcription"
                        >
                            <MessageSquare className="h-5 w-5" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Transcription panel */}
            {showTranscription && transcriptionData && (
                <TranscriptionPanel transcriptionData={transcriptionData} />
            )}
        </div>
    )
}
