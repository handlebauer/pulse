-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create stations table
CREATE TABLE IF NOT EXISTS stations (
    -- Basic information
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "stationId" TEXT UNIQUE NOT NULL,  -- original stationuuid from radio-browser
    "stationName" TEXT NOT NULL,
    "streamUrl" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "logoUrl" TEXT,

    -- Content metadata
    tags TEXT[] DEFAULT '{}',
    category TEXT,  -- 'talk' or 'music'
    subcategory TEXT,
    "isLive" BOOLEAN DEFAULT false,

    -- Geographic information
    country TEXT,
    "countryCode" TEXT,
    state TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    "hasGeolocation" BOOLEAN DEFAULT false,

    -- Language information
    language TEXT,
    "languageCodes" TEXT[] DEFAULT '{}',

    -- Technical specifications
    codec TEXT,
    bitrate INTEGER,
    "isHls" BOOLEAN DEFAULT false,
    "hasSslError" BOOLEAN DEFAULT false,
    "hasExtendedInfo" BOOLEAN DEFAULT false,

    -- Popularity and engagement
    votes INTEGER DEFAULT 0,
    "clickCount" INTEGER DEFAULT 0,
    "clickTrend" INTEGER DEFAULT 0,

    -- Status information
    "isOnline" BOOLEAN DEFAULT true,

    -- Timestamps
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_stations_category ON stations(category);
CREATE INDEX IF NOT EXISTS idx_stations_countryCode ON stations("countryCode");
CREATE INDEX IF NOT EXISTS idx_stations_isOnline ON stations("isOnline");
CREATE INDEX IF NOT EXISTS idx_stations_votes ON stations(votes DESC);
CREATE INDEX IF NOT EXISTS idx_stations_clickCount ON stations("clickCount" DESC);

-- Create spatial index for geographic queries
CREATE INDEX IF NOT EXISTS idx_stations_location ON stations USING gist (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
) WHERE "hasGeolocation" = true;

-- Create GIN index for tag searching
CREATE INDEX IF NOT EXISTS idx_stations_tags ON stations USING gin(tags);

-- Add a trigger to automatically update updatedAt
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp
    BEFORE UPDATE ON stations
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp(); 