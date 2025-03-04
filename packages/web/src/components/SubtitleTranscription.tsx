import { TranscriptionData } from '@/hooks/useTranscriptions'
import { AlertCircle } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'

interface SubtitleTranscriptionProps {
    transcriptionData: TranscriptionData
    visible: boolean
}

export function SubtitleTranscription({
    transcriptionData,
    visible,
}: SubtitleTranscriptionProps) {
    const [opacity, setOpacity] = useState(0)
    const prevTextRef = useRef(transcriptionData.recentText)
    const [animateNewText, setAnimateNewText] = useState(false)

    // Animate in/out for visibility
    useEffect(() => {
        if (visible) {
            const timer = setTimeout(() => setOpacity(1), 50)
            return () => clearTimeout(timer)
        } else {
            setOpacity(0)
        }
    }, [visible])

    // Detect and animate new transcription text
    useEffect(() => {
        // Check if text has changed
        console.log('Checking transcription update:', {
            prevText: prevTextRef.current?.substring(0, 20) + '...',
            newText: transcriptionData.recentText?.substring(0, 20) + '...',
            updatedAt: transcriptionData.updatedAt,
        })

        if (prevTextRef.current !== transcriptionData.recentText) {
            console.log('New transcription text:', transcriptionData.recentText)

            // Text has changed, trigger animation
            setAnimateNewText(true)

            // Reset animation after a short delay
            const timer = setTimeout(() => {
                setAnimateNewText(false)
                // Update the previous text ref
                prevTextRef.current = transcriptionData.recentText
            }, 1000)

            return () => clearTimeout(timer)
        }
    }, [transcriptionData.recentText, transcriptionData.updatedAt])

    if (!visible) return null

    const isCommercial = transcriptionData?.hasCommercials || false

    return (
        <div
            className="fixed left-1/2 transform -translate-x-1/2 z-50 w-auto max-w-4xl text-center pointer-events-none"
            style={{
                bottom: '20%', // Position above radio player
                transition: 'opacity 0.3s ease-in-out',
                opacity: opacity,
            }}
        >
            <div
                className={`px-8 py-4 rounded-2xl backdrop-blur-sm shadow-2xl
                    ${isCommercial ? 'bg-red-900/30' : 'bg-black/40'}`}
            >
                {isCommercial && (
                    <div className="flex items-center justify-center gap-2 mb-3">
                        <AlertCircle className="h-4 w-4 text-red-300" />
                        <span className="text-sm font-semibold text-red-300 tracking-wider uppercase">
                            Commercial Break
                        </span>
                    </div>
                )}
                <p
                    className={`text-2xl font-medium leading-relaxed tracking-wide text-center
                    ${isCommercial ? 'text-white/80 italic' : 'text-white'}
                    text-shadow-subtitle ${animateNewText ? 'animate-pulse' : ''}`}
                    style={{
                        textShadow:
                            '0 2px 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1)',
                        fontWeight: 500,
                        lineHeight: 1.4,
                    }}
                >
                    {transcriptionData.recentText}
                </p>

                {!isCommercial && transcriptionData.topics.length > 0 && (
                    <div className="mt-4 flex justify-center gap-2 flex-wrap">
                        {transcriptionData.topics
                            .slice(0, 3)
                            .map((topic, i) => (
                                <span
                                    key={i}
                                    className="text-xs bg-white/15 text-white/90 px-3 py-1 rounded-full"
                                >
                                    {topic}
                                </span>
                            ))}
                    </div>
                )}
            </div>
        </div>
    )
}
