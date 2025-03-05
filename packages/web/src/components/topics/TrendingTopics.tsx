import { useState, useEffect } from 'react'
import { useTrendingTopics } from '@/hooks/useTrendingTopics'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

// Define the topic and station types
interface Station {
    id: string
    stationName?: string
}

interface Topic {
    id: string
    name: string
    stations?: Station[]
}

export interface TrendingTopicsProps {
    className?: string
    onTopicClick?: (topicId: string) => void
    selectedTopicId?: string | null
    maxTopics?: number
    isVisible?: boolean
    onEmptyStateChange?: (isEmpty: boolean, hasError?: boolean) => void
}

export function TrendingTopics({
    className,
    onTopicClick,
    selectedTopicId,
    maxTopics = 15,
    isVisible = true,
    onEmptyStateChange,
}: TrendingTopicsProps) {
    const { topics, isLoading, error } = useTrendingTopics(maxTopics)
    const [visibleTopics, setVisibleTopics] = useState<Topic[]>([])
    const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null)

    useEffect(() => {
        console.log('got here')
    }, [])

    // Update empty state
    useEffect(() => {
        if (onEmptyStateChange && !isLoading) {
            onEmptyStateChange(visibleTopics.length === 0 || !!error, !!error)
        }
    }, [visibleTopics.length, isLoading, onEmptyStateChange, error])

    // Animate topics in and out based on loading state
    useEffect(() => {
        if (!isLoading && topics.length > 0) {
            // Transform the data to match the component's expected structure
            const transformedTopics = topics.map((topic) => ({
                id: topic.id,
                name: topic.name,
                stations:
                    topic.recentStations?.map((station) => ({
                        id: station.stationId,
                        stationName:
                            station.stationName ||
                            `Station ${station.stationId.substring(0, 8)}...`,
                    })) || [],
            }))
            setVisibleTopics(transformedTopics)
        } else if (isLoading) {
            setVisibleTopics([])
        }
    }, [isLoading, topics])

    const handleTopicClick = (e: React.MouseEvent, topicId: string) => {
        e.preventDefault()
        if (onTopicClick) {
            onTopicClick(topicId)
        }
    }

    const toggleExpanded = (e: React.MouseEvent, topicId: string) => {
        e.stopPropagation()
        setExpandedTopicId(expandedTopicId === topicId ? null : topicId)
    }

    if (!isVisible) {
        return null
    }

    // Remove the empty state message display, as we'll now show it in the button label
    if (!isLoading && visibleTopics.length === 0) {
        return null
    }

    // If there's an error and we're visible, show the error message
    if (error) {
        return (
            <div
                className={cn(
                    'bg-black/40 border border-gray-700/50 text-gray-200 rounded-md',
                    'w-[320px]',
                    className,
                )}
                style={{ minWidth: '320px', maxWidth: '320px' }}
            >
                <div className="text-sm text-red-400 px-3 py-2">
                    Failed to load trending topics
                </div>
            </div>
        )
    }

    return (
        <div
            className={cn(
                'bg-black/40 border border-gray-700/50 text-gray-200 overflow-hidden rounded-md',
                'w-[320px]',
                className,
            )}
            style={{ minWidth: '320px', maxWidth: '320px' }}
        >
            <div className="space-y-1.5 py-2 max-h-[70vh] overflow-y-auto custom-scrollbar px-2">
                {isLoading
                    ? // Loading skeletons
                      Array.from({ length: 5 }).map((_, i) => (
                          <div key={`skeleton-${i}`} className="w-full mb-1.5">
                              <Skeleton className="h-7 w-full bg-gray-700/30" />
                          </div>
                      ))
                    : // Actual topics
                      visibleTopics.map((topic) => (
                          <div
                              key={topic.id}
                              className="w-full"
                              style={{ width: '100%' }}
                          >
                              <div
                                  className="mb-1 w-full"
                                  style={{ width: '100%' }}
                              >
                                  <Button
                                      variant="ghost"
                                      className={cn(
                                          'text-sm text-left justify-between px-3 py-1.5 h-auto w-full',
                                          'bg-black/25 hover:bg-black/50 border border-gray-700/30',
                                          'text-gray-200 hover:text-gray-100',
                                          selectedTopicId === topic.id &&
                                              'border-indigo-500/30 text-indigo-300',
                                          'rounded-md transition-all',
                                          expandedTopicId === topic.id
                                              ? 'rounded-b-none border-b-0'
                                              : '',
                                      )}
                                      style={{ width: '100%' }}
                                      onClick={(e) => {
                                          handleTopicClick(e, topic.id)
                                          // Don't expand when clicking with modifier keys (for selection only)
                                          if (
                                              !e.ctrlKey &&
                                              !e.metaKey &&
                                              !e.shiftKey
                                          ) {
                                              toggleExpanded(e, topic.id)
                                          }
                                      }}
                                      aria-label={`Topic: ${topic.name}${expandedTopicId === topic.id ? ' (expanded)' : ''}`}
                                      aria-expanded={
                                          expandedTopicId === topic.id
                                      }
                                  >
                                      <div className="truncate mr-2">
                                          {topic.name}
                                      </div>
                                      <div className="flex-shrink-0">
                                          {expandedTopicId === topic.id ? (
                                              <ChevronUp className="h-4 w-4" />
                                          ) : (
                                              <ChevronDown className="h-4 w-4" />
                                          )}
                                      </div>
                                  </Button>
                              </div>

                              {expandedTopicId === topic.id &&
                                  topic.stations && (
                                      <div
                                          className="pl-3 pr-2 py-2 text-xs text-gray-300 bg-black/20 border-x border-b border-gray-700/30 rounded-b-md animate-in fade-in slide-in-from-top-1 duration-200 border-indigo-500/30"
                                          style={{
                                              width: '100%',
                                              marginTop: '-1px',
                                              maxWidth: 'calc(100% - 2px)',
                                              marginLeft: '1px',
                                              boxSizing: 'border-box',
                                          }}
                                      >
                                          <div className="space-y-1">
                                              {topic.stations.length > 0 ? (
                                                  topic.stations.map(
                                                      (
                                                          station: Station,
                                                          i: number,
                                                      ) => (
                                                          <div
                                                              key={`${topic.id}-station-${i}`}
                                                              className="flex items-center"
                                                              style={{
                                                                  width: '100%',
                                                              }}
                                                          >
                                                              <span className="truncate max-w-[250px]">
                                                                  {station.stationName ||
                                                                      station.id ||
                                                                      `Station ${i + 1}`}
                                                              </span>
                                                          </div>
                                                      ),
                                                  )
                                              ) : (
                                                  <div className="text-gray-500">
                                                      No stations available
                                                  </div>
                                              )}
                                          </div>
                                      </div>
                                  )}
                          </div>
                      ))}
            </div>
        </div>
    )
}
