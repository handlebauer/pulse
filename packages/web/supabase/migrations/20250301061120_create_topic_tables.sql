-- Create topics table
CREATE TABLE IF NOT EXISTS public.topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    is_trending BOOLEAN DEFAULT false,
    trend_score INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Constraints
    CONSTRAINT unique_normalized_name UNIQUE (normalized_name)
);

-- Create index for trending topics
CREATE INDEX idx_topics_is_trending ON public.topics(is_trending);

-- Create station_topics table for station-topic relationships
CREATE TABLE IF NOT EXISTS public.station_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "stationId" UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    "topicId" UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    relevance_score FLOAT NOT NULL,
    mention_count INTEGER DEFAULT 1 NOT NULL,
    first_mentioned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_mentioned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Constraints
    CONSTRAINT unique_station_topic UNIQUE ("stationId", "topicId")
);

-- Create index for recent mentions
CREATE INDEX idx_station_topics_last_mentioned ON public.station_topics(last_mentioned_at DESC);

-- Create topic_connections table for station connections
CREATE TABLE IF NOT EXISTS public.topic_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "topicId" UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    "stationId1" UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    "stationId2" UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    strength FLOAT NOT NULL,
    active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Constraints
    CONSTRAINT ensure_station_order CHECK ("stationId1" < "stationId2"),
    CONSTRAINT unique_topic_connection UNIQUE ("topicId", "stationId1", "stationId2")
);

-- Create index for active connections
CREATE INDEX idx_topic_connections_active ON public.topic_connections(active);

-- Create function to calculate trending topics
CREATE OR REPLACE FUNCTION public.calculate_trending_topics()
RETURNS VOID AS $$
BEGIN
    -- Reset all trending flags - adding WHERE TRUE to satisfy PostgreSQL requirement
    UPDATE public.topics SET is_trending = false WHERE TRUE;
    
    -- Update trend scores based on station mentions, total mentions, and recency
    UPDATE public.topics t
    SET 
        trend_score = (
            SELECT
                -- Count of distinct stations mentioning the topic (weighted: x3)
                COUNT(DISTINCT st."stationId") * 3 +
                -- Total mention count across all stations (weighted: x1)
                SUM(st.mention_count) +
                -- Recency factor - more recent mentions get higher scores (weighted: x2)
                SUM(
                    CASE
                        -- Mentions in the last hour get highest weight
                        WHEN st.last_mentioned_at > NOW() - INTERVAL '1 hour' THEN 10
                        -- Mentions in the last 3 hours get medium weight
                        WHEN st.last_mentioned_at > NOW() - INTERVAL '3 hours' THEN 5
                        -- Mentions in the last day get low weight
                        WHEN st.last_mentioned_at > NOW() - INTERVAL '1 day' THEN 2
                        -- Older mentions get minimal weight
                        ELSE 0
                    END
                ) * 2
            FROM public.station_topics st
            WHERE st."topicId" = t.id
        ),
        is_trending = (
            SELECT
                -- Set trending flag based on threshold
                CASE
                    -- Topics with high trend scores are marked as trending
                    WHEN (
                        SELECT
                            COUNT(DISTINCT st."stationId") * 3 +
                            SUM(st.mention_count) +
                            SUM(
                                CASE
                                    WHEN st.last_mentioned_at > NOW() - INTERVAL '1 hour' THEN 10
                                    WHEN st.last_mentioned_at > NOW() - INTERVAL '3 hours' THEN 5
                                    WHEN st.last_mentioned_at > NOW() - INTERVAL '1 day' THEN 2
                                    ELSE 0
                                END
                            ) * 2
                        FROM public.station_topics st
                        WHERE st."topicId" = t.id
                    ) > 20 THEN true
                    ELSE false
                END
        )
    WHERE
        EXISTS (
            SELECT 1
            FROM public.station_topics st
            WHERE st."topicId" = t.id
            AND st.last_mentioned_at > NOW() - INTERVAL '1 day'
        );
END;
$$ LANGUAGE plpgsql;

-- Create function to update topic connections
CREATE OR REPLACE FUNCTION public.update_topic_connections()
RETURNS VOID AS $$
BEGIN
    -- Mark all existing connections as inactive first - adding WHERE TRUE to satisfy PostgreSQL requirement
    UPDATE public.topic_connections SET active = false WHERE TRUE;
    
    -- Identify and update active connections
    INSERT INTO public.topic_connections ("topicId", "stationId1", "stationId2", strength, active)
    SELECT
        st1."topicId",
        st1."stationId" as "stationId1",
        st2."stationId" as "stationId2",
        -- Calculate connection strength based on relevance scores and recency
        (st1.relevance_score * st2.relevance_score) * (
            CASE
                -- Both stations mentioned the topic recently (within 6 hours)
                WHEN st1.last_mentioned_at > NOW() - INTERVAL '6 hours' AND 
                     st2.last_mentioned_at > NOW() - INTERVAL '6 hours' THEN 1.0
                -- At least one station mentioned the topic recently (within 12 hours)
                WHEN st1.last_mentioned_at > NOW() - INTERVAL '12 hours' OR 
                     st2.last_mentioned_at > NOW() - INTERVAL '12 hours' THEN 0.75
                -- Both stations mentioned the topic within the last day
                WHEN st1.last_mentioned_at > NOW() - INTERVAL '1 day' AND 
                     st2.last_mentioned_at > NOW() - INTERVAL '1 day' THEN 0.5
                -- Both stations mentioned the topic within the last 3 days
                WHEN st1.last_mentioned_at > NOW() - INTERVAL '3 days' AND 
                     st2.last_mentioned_at > NOW() - INTERVAL '3 days' THEN 0.25
                -- Older mentions get lower strength
                ELSE 0.1
            END
        ) as strength,
        true as active
    FROM 
        public.station_topics st1
    JOIN 
        public.station_topics st2 ON st1."topicId" = st2."topicId" AND st1."stationId" < st2."stationId"
    WHERE
        -- Both stations should have mentioned the topic within the last week
        st1.last_mentioned_at > NOW() - INTERVAL '7 days' AND
        st2.last_mentioned_at > NOW() - INTERVAL '7 days' AND
        -- Minimum relevance threshold for both stations
        st1.relevance_score >= 0.3 AND
        st2.relevance_score >= 0.3
    ON CONFLICT ("topicId", "stationId1", "stationId2") DO UPDATE SET
        strength = EXCLUDED.strength,
        active = true,
        updated_at = NOW();
    
    -- Remove old inactive connections (inactive for more than 30 days)
    DELETE FROM public.topic_connections
    WHERE active = false AND updated_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Create function to update station_topics with proper handling of first_mentioned_at and mention_count
CREATE OR REPLACE FUNCTION public.upsert_station_topic(
    p_station_id UUID,
    p_topic_id UUID,
    p_relevance_score FLOAT,
    p_last_mentioned_at TIMESTAMPTZ
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.station_topics (
        "stationId", 
        "topicId", 
        relevance_score, 
        last_mentioned_at,
        first_mentioned_at,
        mention_count
    )
    VALUES (
        p_station_id,
        p_topic_id,
        p_relevance_score,
        p_last_mentioned_at,
        p_last_mentioned_at,  -- Set first_mentioned_at to the current timestamp for new records
        1                     -- Initialize mention_count to 1 for new records
    )
    ON CONFLICT ("stationId", "topicId") DO UPDATE SET
        relevance_score = p_relevance_score,
        last_mentioned_at = p_last_mentioned_at,
        mention_count = public.station_topics.mention_count + 1;
END;
$$ LANGUAGE plpgsql;

-- Grant appropriate permissions for the new function
ALTER FUNCTION public.upsert_station_topic(UUID, UUID, FLOAT, TIMESTAMPTZ) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.upsert_station_topic(UUID, UUID, FLOAT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_station_topic(UUID, UUID, FLOAT, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_station_topic(UUID, UUID, FLOAT, TIMESTAMPTZ) TO authenticated;

-- Add timestamps triggers for all tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update trigger for topics table
CREATE TRIGGER set_updated_at_topics
    BEFORE UPDATE ON public.topics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update trigger for station_topics table
CREATE TRIGGER set_updated_at_station_topics
    BEFORE UPDATE ON public.station_topics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update trigger for topic_connections table
CREATE TRIGGER set_updated_at_topic_connections
    BEFORE UPDATE ON public.topic_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime for all tables
-- Check if the publication exists, if not create it
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END
$$;

-- Add tables to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.topics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.station_topics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.topic_connections;

-- Add row-level security policies
-- Topics RLS
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to topics"
    ON public.topics
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow service role full access to topics"
    ON public.topics
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Station_topics RLS
ALTER TABLE public.station_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to station_topics"
    ON public.station_topics
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow service role full access to station_topics"
    ON public.station_topics
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Topic_connections RLS
ALTER TABLE public.topic_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to topic_connections"
    ON public.topic_connections
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow service role full access to topic_connections"
    ON public.topic_connections
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.topics IS 'Stores extracted topics from radio transcriptions';
COMMENT ON TABLE public.station_topics IS 'Stores relationships between stations and topics';
COMMENT ON TABLE public.topic_connections IS 'Stores connections between stations discussing the same topics';
COMMENT ON FUNCTION public.calculate_trending_topics() IS 'Calculates trending topics based on mention frequency, count, and recency';
COMMENT ON FUNCTION public.update_topic_connections() IS 'Updates connections between stations based on shared topics'; 