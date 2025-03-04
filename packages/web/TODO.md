# Radio Transcription Visualization - Implementation Plan

## Phase 1: Server-Side Topic Processing

**Motivation:** The current approach of extracting topics in the browser using simple word frequency is inefficient and lacks depth. By moving topic extraction to the server and using AI-powered analysis, we can generate more meaningful topics, identify connections between stations, and track trends over time. This foundational phase creates the data infrastructure that powers all subsequent visualization features and ensures topics are processed once centrally rather than redundantly in each user's browser.

- [x] Database Schema Updates (in @pulse/web)

    - [x] Create `topics` table for storing extracted topics
        - Fields: `id` (UUID), `name` (text), `normalized_name` (text), `is_trending` (boolean), `trend_score` (integer), timestamps
        - Add unique constraint on `normalized_name`
        - Create index on `is_trending` for fast trending topic queries
    - [x] Create `station_topics` table for station-topic relationships
        - Fields: `id` (UUID), `stationId` (UUID, FK), `topicId` (UUID, FK), `relevance_score` (float), `mention_count` (integer), `first_mentioned_at` (timestamp), `last_mentioned_at` (timestamp), timestamps
        - Add unique constraint on `(stationId, topicId)`
        - Create index on `last_mentioned_at` for recent mentions queries
    - [x] Create `topic_connections` table for station connections
        - Fields: `id` (UUID), `topicId` (UUID, FK), `stationId1` (UUID, FK), `stationId2` (UUID, FK), `strength` (float), `active` (boolean), timestamps
        - Add constraint to ensure `stationId1 < stationId2` to prevent duplicate connections
        - Add unique constraint on `(topicId, stationId1, stationId2)`
        - Create index on `active` for filtering active connections
    - [x] Add stored procedures for trend and connection calculations
        - Create `calculate_trending_topics()` procedure that updates trend scores based on:
            - Number of stations mentioning the topic
            - Total mention count
            - Recency of mentions
            - Sets `is_trending = true` for topics above threshold
        - Create `update_topic_connections()` procedure that:
            - Finds stations discussing the same topics
            - Calculates connection strength based on relevance scores
            - Creates/updates connections and marks them active
            - Cleans up inactive connections after a period
    - [x] Enable realtime subscriptions for new tables
        - Add all tables to the Supabase realtime publication
        - Test realtime events with Supabase client

- [x] Topic Processing Engine (in @pulse/radio)

    - [x] Implement AI-powered topic extraction using Gemini API
        - Create a `TopicExtractor` class in `src/lib/topics/topic-extractor.ts`
        - Use Gemini 2.0 Flash model with formatted prompt to extract topics
        - Request proper JSON response with topic name, normalized form, and relevance score
        - Handle rate limiting and API failures gracefully
    - [x] Create normalized topic representation system
        - Process topic names to create consistent normalized forms (lowercase, singular form)
        - Remove stop words and unnecessary modifiers
        - Handle synonyms and closely related terms (e.g., "president" and "presidency")
        - Ensure consistent naming for people, places, and events
    - [x] Develop relevance scoring algorithm
        - Score topics based on frequency, prominence in discussion
        - Weight named entities (people, organizations, places) higher
        - Consider context and position in transcription
        - Scale scores between 0.0-1.0 with clear thresholds for significance
    - [x] Implement functions to identify relationships between topics
        - Detect subtopics and parent topics
        - Identify topics that frequently co-occur
        - Create semantic relationships between related topics
        - Build topic graph for navigation and discovery
    - [x] Create connection strength calculation
        - Calculate strength based on both stations' relevance scores for the topic
        - Consider the recency of mentions
        - Apply decay factor for older mentions
        - Normalize strengths on a 0.0-1.0 scale

- [x] Scheduled Processing (in @pulse/ops)
    - [x] Create script to process recent transcriptions
        - Build `process-topics.ts` script that:
            - Fetches recent transcriptions (last 15 minutes)
            - Extracts topics from each transcription
            - Saves topics to database with proper relationships
            - Logs processing stats and error rates
    - [x] Implement trending topics calculation
        - Run the `calculate_trending_topics()` procedure
        - Add configurable thresholds for trending status
        - Implement cooldown period to prevent topic flapping
    - [x] Add connection discovery logic
        - Run the `update_topic_connections()` procedure
        - Filter connections by minimum strength threshold
        - Optimize to avoid excessive connections
    - [x] Set up scheduled job to run processing regularly
        - Create `scheduled-topics.ts` that runs every 5 minutes
        - Implement proper locking to prevent concurrent runs
        - Add ability to run manual processing with `--once` flag
    - [x] Add monitoring and error handling
        - Implement detailed logging of processing steps
        - Track success/failure metrics
        - Add retry mechanism for failed operations
        - Send alerts for persistent failures

## Phase 2: Enhanced UI - Station Topics

**Motivation:** With robust topic data now available from the server, we need intuitive ways to display this information to users. This phase focuses on creating UI components that show what topics are being discussed on each station and which topics are trending globally. By highlighting trending topics and providing real-time updates, users will gain immediate insight into the radio conversation landscape without having to manually listen to each station.

- [x] Topic Data Hooks (in @pulse/web)

    - [x] Create `useStationTopics` hook for station-specific topics
    - [x] Create `useTrendingTopics` hook for global trends
    - [x] Implement realtime updates for topic data
    - [x] Add error handling and loading states

- [ ] Topic Visualization Components (in @pulse/web)

    - [ ] Create `StationTopics` component to show current discussion topics
    - [ ] Create `TrendingTopics` component for global trending topics
    - [ ] Implement visual distinction for trending vs. regular topics
    - [ ] Add animations for topic appearance/disappearance
    - [ ] Optimize rendering for smooth performance

- [ ] Update Globe Component (in @pulse/web)
    - [ ] Integrate new topic components
    - [ ] Remove client-side topic extraction
    - [ ] Ensure proper component lifecycle management
    - [ ] Test with various station counts and data volumes

## Phase 3: Enhanced UI - Topic Connections

**Motivation:** One of the most powerful features of this system is the ability to visualize when multiple stations are discussing the same topics. This phase creates visual connections between stations that share topics, allowing users to discover geographic patterns in media coverage. By implementing interactive controls for these connections, users can explore how stories and discussions spread across regions and identify which topics bridge different communities.

- [ ] Connection Data Management (in @pulse/web)

    - [ ] Create `useTopicConnections` hook
    - [ ] Implement filtering and sorting of connections
    - [ ] Add connection toggling functionality
    - [ ] Set up realtime updates for connections

- [ ] Connection Visualization (in @pulse/web)

    - [ ] Create `TopicConnections` component
    - [ ] Implement MapboxGL line drawing for connections
    - [ ] Add styles based on connection strength
    - [ ] Create controls for toggling connection visibility
    - [ ] Add hover interactions to show connection details

- [ ] Visual Effects (in @pulse/web)
    - [ ] Implement animated/dashed lines for connections
    - [ ] Add highlight effects for connected stations
    - [ ] Create smooth transitions for connection appearance
    - [ ] Optimize rendering for many simultaneous connections

## Phase 4: Auto-Tour and Exploration Features

**Motivation:** To make the system more engaging and accessible, we need features that guide users through interesting patterns without requiring manual exploration. The auto-tour feature creates a passive viewing experience where users can watch the globe slowly rotate while the system highlights points of interest. This helps users discover unexpected connections and trending topics they might not find on their own, making the visualization valuable even for casual users who don't want to actively navigate.

- [ ] Globe Auto-Rotation (in @pulse/web)

    - [ ] Implement smooth globe rotation mechanism
    - [ ] Add user controls to start/stop auto-rotation
    - [ ] Create camera transition animations

- [ ] Points of Interest Detection (in @pulse/web)

    - [ ] Implement algorithm to identify interesting features
    - [ ] Create priority scoring for different feature types
    - [ ] Develop camera positioning for optimal viewing

- [ ] Tour Narration System (in @pulse/web)

    - [ ] Design overlay for explanatory information
    - [ ] Implement logic to generate contextual descriptions
    - [ ] Create smooth transitions between tour points

- [ ] User Controls and Interaction (in @pulse/web)
    - [ ] Add controls to customize tour experience
    - [ ] Implement manual navigation between points of interest
    - [ ] Create bookmarking functionality for interesting findings

## Phase 5: Technical Improvements

**Motivation:** To ensure the system works reliably at scale, we need to address technical challenges proactively. This phase focuses on optimizing performance, implementing robust error handling, and establishing quality assurance practices. These improvements are essential to handle large volumes of stations and users while maintaining a smooth, responsive experience, especially when visualizing complex connection patterns or processing extensive topic data.

- [ ] Performance Optimization (in @pulse/web)

    - [ ] Implement virtualization for large datasets
    - [ ] Add caching for API responses
    - [ ] Optimize MapboxGL rendering
    - [ ] Reduce unnecessary re-renders

- [ ] Data Management (across all packages)

    - [ ] Implement pagination for historical data (in @pulse/web)
    - [ ] Add data pruning strategy for old records (in @pulse/ops)
    - [ ] Optimize database queries (in @pulse/radio and @pulse/web)
    - [ ] Implement batched updates (in @pulse/radio)

- [ ] Error Handling and Recovery (across all packages)

    - [ ] Add comprehensive error boundaries (in @pulse/web)
    - [ ] Implement retry mechanisms for failed requests (in all packages)
    - [ ] Create fallback UI states (in @pulse/web)
    - [ ] Add detailed logging (in all packages)

- [ ] Testing and Quality Assurance (across all packages)
    - [ ] Create unit tests for critical components (in all packages)
    - [ ] Implement end-to-end tests for key user flows (in @pulse/web)
    - [ ] Add performance benchmarking (in all packages)
    - [ ] Establish monitoring for production deployment (in @pulse/ops)
