/**
 * Example: Standalone Topic Extraction
 *
 * This example demonstrates how to use the CoreTopicExtractor
 * to extract topics from text without database dependencies.
 */
import dedent from 'dedent'
import { CoreTopicExtractor, type TextInput } from '../src/lib/topics'

async function main() {
    // Create a configuration
    const config = {
        // provider: 'openai' as const,
        openai: {
            apiKey: process.env.TOPIC_EXTRACTION_OPENAI_API_KEY || '',
            model: process.env.TOPIC_EXTRACTION_OPENAI_MODEL || 'gpt-4o-mini',
        },
        provider: 'google' as const,
        google: {
            apiKey: process.env.TOPIC_EXTRACTION_GOOGLE_API_KEY || '',
            model:
                process.env.TOPIC_EXTRACTION_GOOGLE_MODEL || 'gemini-2.0-flash',
        },
    }

    // Create the extractor
    const extractor = new CoreTopicExtractor(config)

    // Sample radio transcript
    const transcription: TextInput = {
        text: dedent`
            Welcome to the morning news briefing. Today's top stories include:
            
            The Federal Reserve announced they are keeping interest rates steady this quarter.
            Chairman Powell cited concerns about inflation and the overall economic outlook.
            
            In international news, new trade negotiations between the United States and
            European Union are set to begin next month in Brussels.
            
            Looking at the weather, expect rain and thunderstorms throughout the
            afternoon with temperatures reaching about 78 degrees.
            
            And in sports, the Boston Red Sox defeated the New York Yankees 5-2
            in last night's game at Fenway Park. David Ortiz hit a home run in the
            seventh inning, his 20th of the season.
        `,
        stationName: 'WXYZ Radio',
    }

    try {
        console.log('Extracting topics...')

        // Extract topics
        const topics = await extractor.extractTopicsFromText(transcription)

        console.log('\nExtracted Topics:')
        topics.forEach((topic) => {
            console.log(`- ${topic.name} (${topic.relevanceScore.toFixed(2)})`)
        })
    } catch (error) {
        console.error('Error extracting topics:', error)
    }
}

// Run the example
if (require.main === module) {
    main().catch(console.error)
}
