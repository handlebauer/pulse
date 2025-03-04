#!/usr/bin/env bun

import ora from 'ora'
import { createClient } from '@supabase/supabase-js'
import { Tables } from '@/lib/db/types'

type Topic = Tables<'topics'>
type StationTopic = Tables<'station_topics'>

// Create Supabase admin client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Sample topics to seed
const sampleTopics = [
    {
        name: 'Politics',
        normalized_name: 'politics',
        is_trending: true,
        trend_score: 100,
    },
    {
        name: 'Economy',
        normalized_name: 'economy',
        is_trending: true,
        trend_score: 85,
    },
    {
        name: 'Climate Change',
        normalized_name: 'climate change',
        is_trending: true,
        trend_score: 75,
    },
    {
        name: 'Technology',
        normalized_name: 'technology',
        is_trending: false,
        trend_score: 60,
    },
    {
        name: 'Healthcare',
        normalized_name: 'healthcare',
        is_trending: false,
        trend_score: 55,
    },
    {
        name: 'Education',
        normalized_name: 'education',
        is_trending: false,
        trend_score: 45,
    },
    {
        name: 'Immigration',
        normalized_name: 'immigration',
        is_trending: false,
        trend_score: 40,
    },
    {
        name: 'Sports',
        normalized_name: 'sports',
        is_trending: false,
        trend_score: 35,
    },
    {
        name: 'Entertainment',
        normalized_name: 'entertainment',
        is_trending: false,
        trend_score: 30,
    },
    {
        name: 'Weather',
        normalized_name: 'weather',
        is_trending: false,
        trend_score: 25,
    },
]

/**
 * Seed topics into the database
 */
async function seedTopics(): Promise<Topic[]> {
    const spinner = ora('Seeding sample topics...').start()

    try {
        const { error } = await supabase.from('topics').upsert(sampleTopics, {
            onConflict: 'normalized_name',
        })

        if (error) {
            spinner.fail('Error seeding topics')
            throw error
        }

        // Fetch the topics after insertion to return them
        const { data: insertedTopics, error: fetchError } = await supabase
            .from('topics')
            .select('*')
            .in(
                'normalized_name',
                sampleTopics.map((t) => t.normalized_name),
            )

        if (fetchError) {
            spinner.fail('Error fetching inserted topics')
            throw fetchError
        }

        spinner.succeed(`Successfully seeded ${insertedTopics.length} topics`)
        return insertedTopics
    } catch (error) {
        spinner.fail('Error seeding topics')
        console.error('Topics seeding error:', error)
        throw error
    }
}

/**
 * Create relationships between stations and topics
 */
async function seedStationTopics(topics: Topic[]) {
    const spinner = ora('Connecting stations to topics...').start()

    try {
        // First, get existing stations from the database
        const { data: stations, error: stationsError } = await supabase
            .from('stations')
            .select('id, stationName, country, countryCode')
            .limit(50) // Limit to first 50 stations for simplicity

        if (stationsError) {
            spinner.fail('Error fetching stations')
            throw stationsError
        }

        if (!stations || stations.length === 0) {
            spinner.warn('No stations found to connect to topics')
            return
        }

        // Create station-topic connections with varying relevance scores and mention counts
        const stationTopics: Omit<
            StationTopic,
            'id' | 'created_at' | 'updated_at'
        >[] = []

        // Assign topics to stations (simplified approach)
        stations.forEach((station) => {
            // Assign 2-4 random topics to each station
            const numTopics = 2 + Math.floor(Math.random() * 3) // 2 to 4 topics
            const assignedTopicIndexes: number[] = []

            for (let i = 0; i < numTopics; i++) {
                // Select a random topic that hasn't been assigned to this station yet
                let topicIndex
                do {
                    topicIndex = Math.floor(Math.random() * topics.length)
                } while (assignedTopicIndexes.includes(topicIndex))

                assignedTopicIndexes.push(topicIndex)

                // Get time values as ISO strings
                const firstMentioned = new Date(
                    Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000,
                )
                const lastMentioned = new Date()

                // Create station-topic relationship with random relevance and mentions
                stationTopics.push({
                    stationId: station.id,
                    topicId: topics[topicIndex].id,
                    relevance_score: 0.3 + Math.random() * 0.7, // Between 0.3 and 1.0
                    mention_count: 1 + Math.floor(Math.random() * 50), // Between 1 and 50 mentions
                    first_mentioned_at: firstMentioned.toISOString(),
                    last_mentioned_at: lastMentioned.toISOString(),
                })
            }
        })

        // Insert station-topic relationships
        const { error } = await supabase
            .from('station_topics')
            .upsert(stationTopics, { onConflict: 'stationId,topicId' })

        if (error) {
            spinner.fail('Error creating station-topic relationships')
            throw error
        }

        spinner.succeed(
            `Successfully connected topics to ${stations.length} stations`,
        )
    } catch (error) {
        spinner.fail('Error in station-topic mapping')
        console.error('Station-topic mapping error:', error)
        throw error
    }
}

/**
 * Run the stored procedures to calculate trending topics and connections
 */
async function runStoredProcedures() {
    const spinner = ora('Running stored procedures...').start()

    try {
        // Call calculate_trending_topics procedure
        const { error: trendingError } = await supabase.rpc(
            'calculate_trending_topics',
        )

        if (trendingError) {
            spinner.fail('Error calculating trending topics')
            throw trendingError
        }

        // Call update_topic_connections procedure
        const { error: connectionsError } = await supabase.rpc(
            'update_topic_connections',
        )

        if (connectionsError) {
            spinner.fail('Error updating topic connections')
            throw connectionsError
        }

        spinner.succeed('Successfully ran stored procedures')
    } catch (error) {
        spinner.fail('Error running stored procedures')
        console.error('Stored procedure error:', error)
        throw error
    }
}

/**
 * Main function to seed all topic-related data
 */
export async function seedTopicData() {
    console.log('\nSeeding topic-related data...')

    try {
        // Step 1: Seed topics
        const topics = await seedTopics()

        // Step 2: Connect stations to topics
        await seedStationTopics(topics)

        // Step 3: Run stored procedures to calculate trending topics and connections
        await runStoredProcedures()

        console.log('\nTopic data seeding completed successfully!\n')
    } catch (error) {
        console.error('\nError during topic data seeding:', error)
        throw error
    }
}

// Allow direct execution of this script
if (require.main === module) {
    seedTopicData().catch((error) => {
        console.error('Fatal error:', error)
        process.exit(1)
    })
}
