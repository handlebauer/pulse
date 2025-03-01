-- Create transcriptions table
create table if not exists public.transcriptions (
    id uuid default gen_random_uuid() primary key,
    station_id uuid references public.stations(id) not null,
    
    -- Audio data and timing
    audio_data text not null, -- base64 encoded audio segment
    start_time timestamp with time zone not null,
    end_time timestamp with time zone not null,
    duration interval generated always as (end_time - start_time) stored,
    
    -- Transcription content
    transcription jsonb not null default '[]'::jsonb, -- Array of {timecode, caption} objects
    
    -- Status and metadata
    status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
    error_message text,
    
    -- Timestamps
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    
    -- Constraints
    constraint valid_duration check (end_time > start_time)
);

-- Add indexes for common queries
create index transcriptions_station_id_idx on public.transcriptions(station_id);
create index transcriptions_status_idx on public.transcriptions(status);
create index transcriptions_created_at_idx on public.transcriptions(created_at);

-- Create updated_at function if it doesn't exist
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
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
comment on column public.transcriptions.audio_data is 'Base64 encoded audio segment data';
comment on column public.transcriptions.transcription is 'JSON array of transcription objects with timecode and caption';
comment on column public.transcriptions.status is 'Current status of the transcription process'; 