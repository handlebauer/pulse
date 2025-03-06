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

-- Comments
COMMENT ON TABLE public.transcription_topics IS 'Connects transcriptions to topics with context about where the topic was mentioned';
COMMENT ON COLUMN public.transcription_topics."matchText" IS 'The exact text that matched the topic, preserving original case';
COMMENT ON COLUMN public.transcription_topics."contextBefore" IS 'Text before the topic mention for context in UI';
COMMENT ON COLUMN public.transcription_topics."contextAfter" IS 'Text after the topic mention for context in UI';