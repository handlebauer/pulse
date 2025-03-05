'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * MapControls - A container component for map control elements
 *
 * This component provides a consistent positioning system for map controls.
 * It can be placed in any of the four corners of the map:
 * - top-left: For primary navigation controls or feature info
 * - top-right: For layer toggles and map style controls
 * - bottom-left: For attribution or secondary controls
 * - bottom-right: For zoom controls or feature panels
 *
 * Use this component to wrap MapControlButton or other map-related UI elements
 * to ensure consistent positioning and styling across the application.
 */
interface MapControlsProps {
    children: ReactNode
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
    className?: string
}

export function MapControls({
    children,
    position = 'top-right',
    className,
}: MapControlsProps) {
    const positionClasses = {
        'top-left': 'top-6 left-6',
        'top-right': 'top-6 right-6',
        'bottom-left': 'bottom-6 left-6',
        'bottom-right': 'bottom-6 right-6',
    }

    return (
        <div
            className={cn(
                'fixed z-10 flex flex-col gap-2',
                positionClasses[position],
                position.includes('right') ? 'items-end' : 'items-start',
                className,
            )}
        >
            {children}
        </div>
    )
}
