import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Get the absolute path to the project root directory
 * This is useful for resolving paths relative to the project root,
 * regardless of where the calling file is located in the project structure.
 *
 * @returns The absolute path to the project root directory
 */
export function getProjectRoot(): string {
    // Get the directory name of the current module
    const currentDir = path.dirname(fileURLToPath(import.meta.url))

    // The src directory is one level up from the project root
    return path.resolve(currentDir, '../..')
}

/**
 * Resolve a path relative to the project root
 *
 * @param relativePath - Path relative to the project root
 * @returns The absolute path
 */
export function resolveFromRoot(relativePath: string): string {
    return path.resolve(getProjectRoot(), relativePath)
}

/**
 * Convert a file to base64 string
 *
 * @param filePath - Path to the file to convert
 * @returns Promise that resolves with the base64 string
 */
export async function fileToBase64(filePath: string): Promise<string> {
    const file = Bun.file(filePath)
    const buffer = await file.arrayBuffer()
    return Buffer.from(buffer).toString('base64')
}
