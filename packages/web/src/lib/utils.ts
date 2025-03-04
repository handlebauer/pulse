import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export async function detectHlsStream(url: string): Promise<boolean> {
    try {
        const response = await fetch(url, { method: 'HEAD' })
        const contentType = response.headers.get('content-type')
        return (
            contentType?.includes('application/vnd.apple.mpegurl') ||
            contentType?.includes('application/x-mpegurl') ||
            url.endsWith('.m3u8')
        )
    } catch {
        // If we can't check content type, assume it might be HLS
        // The player will fall back to regular audio if HLS fails
        return true
    }
}
