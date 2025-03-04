import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Play, Pause, Volume2, VolumeX, MessageSquare } from 'lucide-react'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { useTranscriptions } from '@/hooks/useTranscriptions'
import { useState } from 'react'

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

    // Get transcription data for this station if available
    const transcriptionData = stationId ? transcriptionMap[stationId] : null
    const hasTranscription = !!transcriptionData?.recentText

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-black/80 px-6 pr-10 pt-4 pb-2 border border-zinc-800 backdrop-blur-sm p-4 rounded-lg shadow-lg flex flex-col items-center gap-4 z-50 w-auto max-w-md">
            <div className="flex items-center gap-4 w-full">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={togglePlayPause}
                    className="text-white hover:bg-white/20 hover:text-white cursor-pointer"
                >
                    {isPlaying ? (
                        <Pause className="h-6 w-6" />
                    ) : (
                        <Play className="h-6 w-6" />
                    )}
                </Button>

                <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-white mb-1 truncate">
                        {stationName}
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleMute}
                            className="text-white hover:bg-white/20 hover:text-white cursor-pointer"
                        >
                            {isMuted ? (
                                <VolumeX className="h-4 w-4" />
                            ) : (
                                <Volume2 className="h-4 w-4" />
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
                </div>

                {hasTranscription && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowTranscription(!showTranscription)}
                        className={`text-white hover:bg-white/20 hover:text-white cursor-pointer ${showTranscription ? 'bg-white/20' : ''}`}
                        title="Show transcription"
                    >
                        <MessageSquare className="h-5 w-5" />
                    </Button>
                )}
            </div>

            {/* Transcription panel */}
            {showTranscription && transcriptionData && (
                <div className="w-full mt-2 border-t border-white/20 pt-3">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="text-xs font-medium text-white/70">
                            LIVE TRANSCRIPTION
                        </h4>
                        <div className="flex gap-1">
                            {transcriptionData.topics
                                .slice(0, 3)
                                .map((topic, i) => (
                                    <span
                                        key={i}
                                        className="text-xs bg-white/10 text-white/90 px-2 py-0.5 rounded-full"
                                    >
                                        {topic}
                                    </span>
                                ))}
                        </div>
                    </div>
                    <p className="text-sm text-white/90 max-h-24 overflow-y-auto">
                        {transcriptionData.recentText}
                    </p>
                </div>
            )}
        </div>
    )
}
