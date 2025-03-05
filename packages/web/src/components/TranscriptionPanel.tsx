import { TranscriptionData } from '@/hooks/useTranscriptions'
import { AlertCircle, Music } from 'lucide-react'

interface TranscriptionPanelProps {
    transcriptionData: TranscriptionData
}

export function TranscriptionPanel({
    transcriptionData,
}: TranscriptionPanelProps) {
    const isCommercial = transcriptionData?.hasCommercials || false
    const hasMusic = transcriptionData?.hasMusic || false

    return (
        <div
            className={`w-full mt-2 border-t pt-3 ${
                isCommercial
                    ? 'border-red-500/50'
                    : hasMusic
                      ? 'border-blue-500/50'
                      : 'border-white/20'
            }`}
        >
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                    <h4 className="text-xs font-medium text-white/70">
                        LIVE TRANSCRIPTION
                    </h4>
                    {isCommercial && (
                        <div className="flex items-center gap-1 bg-red-500/80 text-white px-2 py-0.5 rounded-full animate-pulse">
                            <AlertCircle className="h-3 w-3" />
                            <span className="text-xs font-medium">
                                COMMERCIAL BREAK
                            </span>
                        </div>
                    )}
                    {hasMusic && !isCommercial && (
                        <div className="flex items-center gap-1 bg-blue-500/80 text-white px-2 py-0.5 rounded-full">
                            <Music className="h-3 w-3" />
                            <span className="text-xs font-medium">MUSIC</span>
                        </div>
                    )}
                </div>
                <div className="flex gap-1">
                    {transcriptionData.topics.slice(0, 3).map((topic, i) => (
                        <span
                            key={i}
                            className="text-xs bg-white/10 text-white/90 px-2 py-0.5 rounded-full"
                        >
                            {topic}
                        </span>
                    ))}
                </div>
            </div>
            <p
                className={`text-sm max-h-24 overflow-y-auto ${
                    isCommercial
                        ? 'text-white/70 italic'
                        : hasMusic
                          ? 'text-blue-100'
                          : 'text-white/90'
                }`}
            >
                {isCommercial
                    ? `Commercial break detected: ${transcriptionData.recentText}`
                    : hasMusic
                      ? `Music detected: ${transcriptionData.recentText}`
                      : transcriptionData.recentText}
            </p>
        </div>
    )
}
