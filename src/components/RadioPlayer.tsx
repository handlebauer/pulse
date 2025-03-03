import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'

interface RadioPlayerProps {
    stationName: string
    streamUrl: string
}

export function RadioPlayer({ stationName, streamUrl }: RadioPlayerProps) {
    const {
        isPlaying,
        volume,
        isMuted,
        togglePlayPause,
        handleVolumeChange,
        toggleMute,
    } = useAudioPlayer({ streamUrl })

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm p-4 rounded-lg shadow-lg flex items-center gap-4 z-50">
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

            <div className="flex flex-col min-w-[200px]">
                <span className="text-sm font-medium text-white mb-1">
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
        </div>
    )
}
