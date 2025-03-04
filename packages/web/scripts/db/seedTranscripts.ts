#!/usr/bin/env bun

import ora from 'ora'
import { createClient } from '@supabase/supabase-js'
import { Tables } from '@/lib/db/types'

type Transcription = Tables<'transcriptions'>

// Create Supabase admin client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Helper function to generate random transcription JSON
function generateTranscriptionContent(
    durationInSeconds: number,
): Record<string, unknown>[] {
    const transcriptionSegments: Record<string, unknown>[] = []
    let currentTimecode = 0

    // Generate 3-8 segments per transcription
    const numSegments = 3 + Math.floor(Math.random() * 6)

    for (let i = 0; i < numSegments; i++) {
        const segmentDuration = Math.floor(
            (durationInSeconds / numSegments) * 1000,
        ) // milliseconds
        const isCommercial = Math.random() < 0.3 // 30% chance of being a commercial

        // Add a segment with appropriate content
        transcriptionSegments.push({
            timecode: currentTimecode,
            caption: isCommercial
                ? generateCommercialCaption()
                : generateNewsCaption(),
            isCommercial,
        })

        currentTimecode += segmentDuration
    }

    return transcriptionSegments
}

// Sample captions for news segments
function generateNewsCaption(): string {
    const newsCaptions = [
        'Breaking news: Federal Reserve announces interest rate decision today.',
        'The President is scheduled to speak about the new infrastructure bill.',
        'Weather forecast shows a major storm system moving towards the east coast.',
        'Scientists report breakthrough in renewable energy technology.',
        'Local authorities issue travel advisory for holiday weekend.',
        'Stock market shows significant gains after positive economic reports.',
        'International diplomacy efforts continue amid regional tensions.',
        'New health guidelines released by CDC regarding seasonal vaccinations.',
        'Tech companies announce collaboration on AI safety standards.',
        'Sports update: championship series continues with game five tonight.',
    ]

    return newsCaptions[Math.floor(Math.random() * newsCaptions.length)]
}

// Sample captions for commercial segments
function generateCommercialCaption(): string {
    const commercialCaptions = [
        'Get the best deals on new cars at City Motors. Visit citymoters.com today!',
        'Try our new premium coffee blend, now available at all grocery stores.',
        'Looking for affordable insurance? Call us at 1-800-INSURE for a free quote.',
        'Summer sale: 40% off all outdoor furniture this weekend only.',
        'Download our app and get free delivery on your first order.',
        'The concert series starts next month. Get your tickets before they sell out!',
        'Introducing our revolutionary cleaning product that makes housework effortless.',
        'Need a vacation? Our travel agency offers exclusive packages to exotic destinations.',
        'Back to school sale: All laptops and tablets at discounted prices.',
        'Experience luxury at our newly renovated resort and spa. Book now for special rates.',
    ]

    return commercialCaptions[
        Math.floor(Math.random() * commercialCaptions.length)
    ]
}

// Generate base64 mock audio data (this is just a placeholder string)
function generateMockAudioData(): string {
    // In a real implementation, this would be actual base64 encoded audio
    // For seeding purposes, we'll just use a placeholder string
    return (
        'data:audio/mp3;base64,MOCK_AUDIO_DATA_' +
        Math.random().toString(36).substring(2, 15)
    )
}

/**
 * Seed transcriptions into the database
 */
async function seedTranscriptions() {
    const spinner = ora('Seeding sample transcriptions...').start()

    try {
        // First, get existing stations from the database
        const { data: stations, error: stationsError } = await supabase
            .from('stations')
            .select('id')
            .limit(20) // Limit to 20 stations for seeding

        if (stationsError) {
            spinner.fail('Error fetching stations')
            throw stationsError
        }

        if (!stations || stations.length === 0) {
            spinner.warn('No stations found to create transcriptions for')
            return
        }

        // Create 2-5 transcriptions per station
        const transcriptions: Omit<
            Transcription,
            'id' | 'createdAt' | 'updatedAt' | 'duration'
        >[] = []

        for (const station of stations) {
            const numTranscriptions = 2 + Math.floor(Math.random() * 4) // 2 to 5 transcriptions

            for (let i = 0; i < numTranscriptions; i++) {
                // Create a random time period between 1 and 7 days ago
                const daysAgo = Math.random() * 7
                const hoursOffset = Math.random() * 24

                const endTime = new Date(
                    Date.now() -
                        daysAgo * 24 * 60 * 60 * 1000 +
                        hoursOffset * 60 * 60 * 1000,
                )

                // Generate a duration between 30 seconds and 3 minutes
                const durationInSeconds = 30 + Math.floor(Math.random() * 150)
                const startTime = new Date(
                    endTime.getTime() - durationInSeconds * 1000,
                )

                transcriptions.push({
                    stationId: station.id,
                    audioData: generateMockAudioData(),
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                    transcription: JSON.stringify(
                        generateTranscriptionContent(durationInSeconds),
                    ),
                })
            }
        }

        // Insert transcriptions in batches to avoid payload size limits
        const batchSize = 10
        for (let i = 0; i < transcriptions.length; i += batchSize) {
            const batch = transcriptions.slice(i, i + batchSize)
            const { error } = await supabase
                .from('transcriptions')
                .insert(batch)

            if (error) {
                spinner.fail(
                    `Error inserting transcription batch ${i / batchSize + 1}`,
                )
                throw error
            }

            spinner.text = `Inserted ${Math.min(i + batchSize, transcriptions.length)}/${transcriptions.length} transcriptions...`
        }

        spinner.succeed(
            `Successfully seeded ${transcriptions.length} transcriptions for ${stations.length} stations`,
        )
    } catch (error) {
        spinner.fail('Error seeding transcriptions')
        console.error('Transcriptions seeding error:', error)
        throw error
    }
}

/**
 * Main function to seed all transcription data
 */
export async function seedTranscriptionData() {
    console.log('\nSeeding transcription data...')

    try {
        // Seed transcriptions
        await seedTranscriptions()

        console.log('\nTranscription data seeding completed successfully!\n')
    } catch (error) {
        console.error('\nError during transcription data seeding:', error)
        throw error
    }
}

// Allow direct execution of this script
if (require.main === module) {
    seedTranscriptionData().catch((error) => {
        console.error('Fatal error:', error)
        process.exit(1)
    })
}
