'use client'

import { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * MapControlButton - A reusable button component for map controls
 *
 * This component is designed to be used for various map control buttons like:
 * - Layer toggles (satellite, terrain, etc.)
 * - Feature toggles (trending topics, heatmaps, etc.)
 * - View controls (zoom, pan, rotate)
 * - Any other map-related controls
 *
 * It includes support for:
 * - Custom icons
 * - Active state styling
 * - Optional label that appears when active
 * - Consistent styling across all map controls
 */
interface MapControlButtonProps {
    icon: ReactNode
    title: string
    onClick: () => void
    isActive?: boolean
    className?: string
    labelText?: string
    emptyStateText?: string
    isEmpty?: boolean
}

export function MapControlButton({
    icon,
    title,
    onClick,
    isActive = false,
    className,
    labelText,
    emptyStateText,
    isEmpty = false,
}: MapControlButtonProps) {
    return (
        <div className="flex items-center gap-2">
            {isActive && (
                <div
                    className={cn(
                        'px-3 py-1 rounded-full text-sm font-medium shadow-md border border-gray-700/50',
                        isEmpty
                            ? 'bg-black/30 text-gray-400 italic'
                            : 'bg-black/40 text-gray-200',
                    )}
                >
                    {isEmpty && emptyStateText ? emptyStateText : labelText}
                </div>
            )}
            <div className="w-10 h-10 relative">
                <Button
                    size="sm"
                    variant="outline"
                    className={cn(
                        'h-10 w-10 p-0 rounded-full bg-black/30 hover:bg-black/50 hover:text-gray-200 hover:border-indigo-500 border-gray-700/50 text-gray-200 shadow-lg absolute top-0 right-0 z-20',
                        className,
                    )}
                    title={title}
                    onClick={onClick}
                >
                    {icon}
                    {isActive && (
                        <div className="absolute inset-0 rounded-full ring-1 ring-indigo-500/70 bg-black/20 pointer-events-none text-gray-200" />
                    )}
                </Button>
            </div>
        </div>
    )
}
