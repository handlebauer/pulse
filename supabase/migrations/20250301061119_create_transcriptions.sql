-- Create transcriptions table
create table if not exists public.transcriptions (
    id uuid default gen_random_uuid() primary key,
    "stationId" uuid references public.stations(id) not null,
    
    -- Audio data and timing
    "audioData" text not null, -- base64 encoded audio segment
    "startTime" timestamp with time zone not null,
    "endTime" timestamp with time zone not null,
    duration interval generated always as ("endTime" - "startTime") stored,
    
    -- Transcription content
    transcription jsonb not null default '[]'::jsonb, -- Array of {timecode, caption} objects
    
    -- Timestamps
    "createdAt" timestamp with time zone default now() not null,
    "updatedAt" timestamp with time zone default now() not null,
    
    -- Constraints
    constraint valid_duration check ("endTime" > "startTime")
);

-- Add indexes for common queries
create index transcriptions_station_id_idx on public.transcriptions("stationId");
create index transcriptions_created_at_idx on public.transcriptions("createdAt");

-- Create updated_at function if it doesn't exist
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new."updatedAt" = now();
    return new;
end;
$$ language plpgsql;

-- Add updated_at trigger
create trigger set_updated_at
    before update on public.transcriptions
    for each row
    execute function update_updated_at_column();

-- Add RLS policies
alter table public.transcriptions enable row level security;

-- Allow insert/update access to service role only
create policy "Allow insert/update access to service role only"
    on public.transcriptions
    for all
    to service_role
    using (true)
    with check (true);

-- Comments
comment on table public.transcriptions is 'Stores radio stream transcriptions with their associated audio segments';
comment on column public.transcriptions."audioData" is 'Base64 encoded audio segment data';
comment on column public.transcriptions.transcription is 'JSON array of transcription objects with timecode and caption';