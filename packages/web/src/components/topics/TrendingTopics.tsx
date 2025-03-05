import { useState, useEffect } from 'react'
import { useTrendingTopics } from '@/hooks/useTrendingTopics'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
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
}

export function TrendingTopics({
    className,
    onTopicClick,
    selectedTopicId,
    maxTopics = 15,
    isVisible = true,
}: TrendingTopicsProps) {
    const { topics, isLoading, error } = useTrendingTopics(maxTopics)
    const [visibleTopics, setVisibleTopics] = useState<Topic[]>([])
    const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null)

    useEffect(() => {
        console.log('got here')
    }, [])

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

    // Show empty state message when no topics are available and not loading
    if (!isLoading && visibleTopics.length === 0) {
        return (
            <div className="fixed -top-12 -right-12 w-[320px] z-10 text-sm text-gray-400 bg-black/30 px-3 py-2 flex items-center h-10 select-none">
                No topics trending at this time
            </div>
        )
    }

    if (error) {
        return (
            <Card
                className={cn(
                    'bg-black/40 border-gray-700/50 text-gray-200',
                    'w-[320px]',
                    className,
                )}
                style={{ minWidth: '320px', maxWidth: '320px' }}
            >
                <CardHeader className="pb-2 px-3">
                    <CardTitle className="text-lg text-gray-300">
                        Trending Topics
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-red-400 px-3">
                    Failed to load trending topics
                </CardContent>
            </Card>
        )
    }

    return (
        <Card
            className={cn(
                'bg-black/40 border-gray-700/50 text-gray-200 overflow-hidden',
                'w-[320px]',
                className,
            )}
            style={{ minWidth: '320px', maxWidth: '320px' }}
        >
            <CardHeader className="pb-2 px-3">
                <CardTitle className="text-lg text-gray-300">
                    Trending Topics
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 pb-3 max-h-[70vh] overflow-y-auto custom-scrollbar px-3">
                {isLoading
                    ? // Loading skeletons
                      Array.from({ length: 5 }).map((_, i) => (
                          <div key={`skeleton-${i}`} className="w-full mb-1.5">
                              <Skeleton className="h-9 bg-gray-700/30 w-full rounded-md" />
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
                                          <div className="font-medium mb-1.5">
                                              Stations discussing this:
                                          </div>
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
                                                              <span className="w-1.5 h-1.5 bg-gray-500 rounded-full mr-1.5 flex-shrink-0"></span>
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
            </CardContent>
        </Card>
    )
}
