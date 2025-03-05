'use client'

import { useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TrendingTopics } from '../topics/TrendingTopics'
import { MapControlButton } from './MapControlButton'
import { MapControls } from './MapControls'

interface MapLayerControlsProps {
    onTopicClick: (topicId: string) => void
    selectedTopicId: string | null
}

export function MapLayerControls({
    onTopicClick,
    selectedTopicId,
}: MapLayerControlsProps) {
    const [showTrendingTopics, setShowTrendingTopics] = useState(false)
    const [isTopicsEmpty, setIsTopicsEmpty] = useState(false)
    const [hasError, setHasError] = useState(false)

    const toggleTrendingTopics = () => {
        setShowTrendingTopics((prev) => !prev)
    }

    const handleEmptyStateChange = (isEmpty: boolean, error?: boolean) => {
        setIsTopicsEmpty(isEmpty)
        setHasError(!!error)
    }

    // Determine which message to show in the label
    const getEmptyStateMessage = () => {
        if (hasError) {
            return 'Failed to load topics'
        }
        return 'No topics trending at this time'
    }

    return (
        <MapControls position="top-right">
            <MapControlButton
                icon={<TrendingUp className="h-5 w-5" />}
                title="Toggle Trending Topics"
                onClick={toggleTrendingTopics}
                isActive={showTrendingTopics}
                labelText="Trending Topics"
                emptyStateText={getEmptyStateMessage()}
                isEmpty={isTopicsEmpty}
            />

            {/* Trending Topics panel - conditionally visible but fixed width */}
            <div className="w-full max-w-xs mt-1">
                <div
                    className={cn(
                        'transition-all duration-300',
                        showTrendingTopics
                            ? 'opacity-100 translate-y-0'
                            : 'opacity-0 -translate-y-4 pointer-events-none',
                    )}
                >
                    <TrendingTopics
                        className="shadow-xl w-full"
                        onTopicClick={onTopicClick}
                        selectedTopicId={selectedTopicId}
                        isVisible={showTrendingTopics}
                        onEmptyStateChange={handleEmptyStateChange}
                    />
                </div>
            </div>
        </MapControls>
    )
}
