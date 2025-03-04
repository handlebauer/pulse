/**
 * Topic Utility Functions
 *
 * Helper functions for normalizing topics and identifying relationships between them.
 */

import type { Topic } from './topic-extractor'

/**
 * Rules for normalizing topic names
 */
interface NormalizationRule {
    pattern: RegExp
    replacement: string
}

// Common rules for normalizing topic names
const normalizationRules: NormalizationRule[] = [
    // Remove leading articles
    { pattern: /^(the|a|an) /i, replacement: '' },
    // Convert to singular form (simple cases)
    { pattern: /s$/i, replacement: '' },
    // Remove possessive forms
    { pattern: /'s$/i, replacement: '' },
    // Convert spaces to underscores for consistent representation
    { pattern: /\s+/g, replacement: '_' },
]

/**
 * Normalize a topic name for consistent representation
 *
 * @param name The topic name to normalize
 * @returns Normalized topic name
 */
export function normalizeTopic(name: string): string {
    // Convert to lowercase
    let normalized = name.toLowerCase().trim()

    // Apply normalization rules
    for (const rule of normalizationRules) {
        normalized = normalized.replace(rule.pattern, rule.replacement)
    }

    return normalized
}

/**
 * Calculate similarity between two topics based on their normalized names
 *
 * @param topic1 First topic
 * @param topic2 Second topic
 * @returns Similarity score between 0 and 1
 */
export function calculateTopicSimilarity(topic1: Topic, topic2: Topic): number {
    // If normalized names are identical, return maximum similarity
    if (topic1.normalizedName === topic2.normalizedName) {
        return 1.0
    }

    // Check if one contains the other
    if (topic1.normalizedName.includes(topic2.normalizedName)) {
        return 0.8
    }

    if (topic2.normalizedName.includes(topic1.normalizedName)) {
        return 0.8
    }

    // Calculate word overlap
    const words1 = topic1.normalizedName.split('_')
    const words2 = topic2.normalizedName.split('_')

    // Count common words
    const commonWords = words1.filter((word) => words2.includes(word))

    // Calculate Jaccard similarity
    const similarity =
        commonWords.length /
        (words1.length + words2.length - commonWords.length)

    return similarity
}

/**
 * Find relationships between topics
 *
 * @param topics Array of topics to analyze
 * @returns Array of topic pairs with their relationship strength
 */
export function findTopicRelationships(
    topics: Topic[],
): { topic1: Topic; topic2: Topic; strength: number }[] {
    const relationships: { topic1: Topic; topic2: Topic; strength: number }[] =
        []

    // Compare each topic with every other topic
    for (let i = 0; i < topics.length; i++) {
        for (let j = i + 1; j < topics.length; j++) {
            const topic1 = topics[i]
            const topic2 = topics[j]

            // Calculate similarity
            const similarity = calculateTopicSimilarity(topic1, topic2)

            // Only consider significant relationships
            if (similarity > 0.3) {
                relationships.push({
                    topic1,
                    topic2,
                    strength: similarity,
                })
            }
        }
    }

    return relationships
}

/**
 * Identify potential parent-child relationships between topics
 *
 * @param topics Array of topics to analyze
 * @returns Array of parent-child topic pairs
 */
export function identifyTopicHierarchy(
    topics: Topic[],
): { parent: Topic; child: Topic }[] {
    const hierarchy: { parent: Topic; child: Topic }[] = []

    // Compare each topic with every other topic
    for (const topic1 of topics) {
        for (const topic2 of topics) {
            // Skip comparing a topic with itself
            if (topic1 === topic2) continue

            // Check if topic2 is potentially a subtopic of topic1
            if (
                topic2.normalizedName.includes(topic1.normalizedName) &&
                topic2.normalizedName.length > topic1.normalizedName.length
            ) {
                hierarchy.push({
                    parent: topic1,
                    child: topic2,
                })
            }
        }
    }

    return hierarchy
}
