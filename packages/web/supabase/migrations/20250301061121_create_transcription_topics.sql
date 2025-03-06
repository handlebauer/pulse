-- Create transcription_topics table for connecting transcriptions to topics
CREATE TABLE IF NOT EXISTS public.transcription_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "transcriptionId" UUID NOT NULL REFERENCES public.transcriptions(id) ON DELETE CASCADE,
    "topicId" UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
    "matchText" TEXT NOT NULL, -- The exact text that matched the topic
    "contextBefore" TEXT, -- Text before the mention (for context)
    "contextAfter" TEXT, -- Text after the mention (for context)
    "segmentIndex" INTEGER, -- Which segment in the transcription array contained this mention
    "position" INTEGER, -- Character position in the segment text
    "confidence" FLOAT NOT NULL DEFAULT 1.0, -- Confidence score for this mention (0.0-1.0)
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for common queries
CREATE INDEX idx_transcription_topics_transcription ON public.transcription_topics("transcriptionId");
CREATE INDEX idx_transcription_topics_topic ON public.transcription_topics("topicId");

-- Add timestamps trigger
CREATE TRIGGER set_updated_at_transcription_topics
    BEFORE UPDATE ON public.transcription_topics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE public.transcription_topics ENABLE ROW LEVEL SECURITY;

-- Allow insert/update access to service role only
CREATE POLICY "Allow insert/update access to service role only"
    ON public.transcription_topics
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow public read access to transcription_topics
CREATE POLICY "Allow public read access to transcription_topics"
    ON public.transcription_topics
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Enable realtime for the transcription_topics table
-- Add the transcription_topics table to the publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.transcription_topics;

-- Create a function to find topic mentions in a transcription text
CREATE OR REPLACE FUNCTION public.find_topic_mentions(
    p_transcription_id UUID,
    p_topic_id UUID,
    p_topic_name TEXT,
    p_normalized_topic_name TEXT
)
RETURNS VOID AS $$
DECLARE
    v_transcription_data JSONB;
    v_segment JSONB;
    v_segment_text TEXT;
    v_segment_index INTEGER;
    v_match_position INTEGER;
    v_match_text TEXT;
    v_context_before TEXT;
    v_context_after TEXT;
    v_word_pattern TEXT;
    v_word_boundary TEXT := '([^\w]|^|$)'; -- Word boundary pattern for case insensitive whole word search
BEGIN
    -- Get the transcription data
    SELECT transcription INTO v_transcription_data
    FROM public.transcriptions
    WHERE id = p_transcription_id;
    
    -- Return if no transcription data
    IF v_transcription_data IS NULL OR jsonb_array_length(v_transcription_data) = 0 THEN
        RETURN;
    END IF;
    
    -- Prepare the word pattern for whole word search (accounting for word boundaries)
    -- This makes "biden" match "Biden" but not "forbidden"
    v_word_pattern := v_word_boundary || p_normalized_topic_name || v_word_boundary;
    
    -- Loop through each segment in the transcription
    FOR v_segment_index IN 0..jsonb_array_length(v_transcription_data) - 1 LOOP
        -- Get the segment
        v_segment := v_transcription_data->v_segment_index;
        
        -- Get the caption text
        v_segment_text := v_segment->>'caption';
        
        -- Skip if no caption or it's marked as commercial
        IF v_segment_text IS NULL OR 
           (v_segment->>'isCommercial')::boolean = true THEN
            CONTINUE;
        END IF;
        
        -- Find topic mention in the text (case insensitive)
        v_match_position := position(lower(p_normalized_topic_name) in lower(v_segment_text));
        
        -- If found, extract the match and context
        WHILE v_match_position > 0 LOOP
            -- Extract the actual match text (preserving original case)
            v_match_text := substring(v_segment_text from v_match_position for length(p_normalized_topic_name));
            
            -- Get context before (up to 10 words)
            v_context_before := substring(
                v_segment_text from 1 for v_match_position - 1
            );
            -- Limit to last ~10 words
            v_context_before := regexp_replace(
                v_context_before, 
                '^.*((?:\s+\S+){0,10})$', 
                '\1'
            );
            
            -- Get context after (up to 10 words)
            v_context_after := substring(
                v_segment_text from v_match_position + length(p_normalized_topic_name)
            );
            -- Limit to first ~10 words
            v_context_after := regexp_replace(
                v_context_after, 
                '^((?:\S+\s+){0,10}).*$', 
                '\1'
            );
            
            -- Insert the mention
            INSERT INTO public.transcription_topics (
                "transcriptionId",
                "topicId",
                "matchText",
                "contextBefore",
                "contextAfter",
                "segmentIndex",
                "position",
                "confidence"
            ) VALUES (
                p_transcription_id,
                p_topic_id,
                v_match_text,
                v_context_before,
                v_context_after,
                v_segment_index,
                v_match_position,
                1.0 -- Set a default confidence
            );
            
            -- Find next mention after this one
            v_match_position := position(
                lower(p_normalized_topic_name) in 
                lower(substring(v_segment_text from v_match_position + length(p_normalized_topic_name)))
            );
            
            -- Adjust position if found
            IF v_match_position > 0 THEN
                v_match_position := v_match_position + length(p_normalized_topic_name);
            END IF;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Grant appropriate permissions for the new function
ALTER FUNCTION public.find_topic_mentions(UUID, UUID, TEXT, TEXT) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.find_topic_mentions(UUID, UUID, TEXT, TEXT) TO service_role;

-- Comments
COMMENT ON TABLE public.transcription_topics IS 'Connects transcriptions to topics with context about where the topic was mentioned';
COMMENT ON COLUMN public.transcription_topics."matchText" IS 'The exact text that matched the topic, preserving original case';
COMMENT ON COLUMN public.transcription_topics."contextBefore" IS 'Text before the topic mention for context in UI';
COMMENT ON COLUMN public.transcription_topics."contextAfter" IS 'Text after the topic mention for context in UI';
COMMENT ON FUNCTION public.find_topic_mentions IS 'Finds mentions of a topic in a transcription and stores them with context'; 