// Simple utility to extract key topics from transcription text
// In a production app, you'd use a more sophisticated NLP approach

// Common words to filter out
const STOP_WORDS = new Set([
    'a',
    'an',
    'the',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'with',
    'by',
    'about',
    'as',
    'into',
    'like',
    'through',
    'after',
    'over',
    'between',
    'out',
    'of',
    'from',
    'up',
    'down',
    'is',
    'am',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'shall',
    'should',
    'can',
    'could',
    'may',
    'might',
    'must',
    'that',
    'which',
    'who',
    'whom',
    'this',
    'these',
    'those',
    'i',
    'you',
    'he',
    'she',
    'it',
    'we',
    'they',
    'me',
    'him',
    'her',
    'us',
    'them',
    'what',
    'when',
    'where',
    'how',
    'why',
    'if',
    'then',
    'so',
    'just',
    'now',
    'very',
    'much',
])

/**
 * Extracts key topics from text by finding frequent meaningful words
 */
export function extractTopics(text: string, maxTopics = 5): string[] {
    if (!text) return []

    // Normalize text and split into words
    const words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .split(/\s+/) // Split on whitespace
        .filter(
            (word) =>
                word.length > 3 && // Only words longer than 3 chars
                !STOP_WORDS.has(word), // Filter out stop words
        )

    // Count word frequency
    const wordCounts: Record<string, number> = {}
    words.forEach((word) => {
        wordCounts[word] = (wordCounts[word] || 0) + 1
    })

    // Sort by frequency and return top N
    return Object.entries(wordCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxTopics)
        .map(([word]) => word)
}
