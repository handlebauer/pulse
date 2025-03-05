# @pulse/ops

Operational scripts and services for Pulse.

This package contains scripts and services for managing the operational aspects of the Pulse platform, including:

- Fetching and processing radio station data
- Validating radio station streams
- Running the stream orchestrator service
- Processing transcription topics

## Installation

```bash
bun install
```

## Scripts

### Station Data Pipeline

The station data pipeline consists of five steps:

1. **Fetch**: Fetch radio stations from the Radio Browser API

    - Input: None (uses Radio Browser API)
    - Output: Writes to `packages/web/scripts/db/stations.json`

2. **Classify**: Classify radio stations using AI

    - Input: Reads from `packages/web/scripts/db/stations.json`
    - Output: Updates the same file with classification data (category, subcategory)

3. **Validate**: Validate radio station streams

    - Input: Reads from `packages/web/scripts/db/stations.json`
    - Output: Updates the same file with stream status (isOnline, updatedAt)

4. **Geolocate**: Add geographical information to radio stations

    - Input: Reads from `packages/web/scripts/db/stations.json`
    - Output: Updates the same file with geolocation data (latitude, longitude)

5. **Filter**: Create specialized subsets of stations

    - Input: Reads from `packages/web/scripts/db/stations.json`
    - Output: Writes to `packages/web/scripts/db/filtered-stations.json`
    - Current filters: Talk and news stations only
    - Supports "preserved" stations: Stations that will never be filtered out, regardless of category

You can run the full pipeline or individual steps:

```bash
# Run the full pipeline (fetch → classify → validate → geolocate → filter)
bun run stations:pipeline

# Run individual steps
bun run stations:fetch     # Only fetch stations
bun run stations:classify  # Only classify stations
bun run stations:validate  # Only validate streams
bun run stations:geolocate # Only geolocate stations
bun run stations:filter    # Only filter stations

# Run the pipeline with specific steps
bun run stations:pipeline fetch             # Only fetch
bun run stations:pipeline classify          # Only classify
bun run stations:pipeline validate          # Only validate
bun run stations:pipeline geolocate         # Only geolocate
bun run stations:pipeline filter            # Only filter
bun run stations:pipeline fetch-classify    # Fetch then classify
bun run stations:pipeline classify-validate # Classify then validate
bun run stations:pipeline validate-filter   # Validate then filter
bun run stations:pipeline no-filter         # Run all steps except filtering
```

### Topic Processing

Process transcriptions to extract topics and update topic trends:

```bash
# Process topics from transcriptions
bun run topics:process
```

- Input: Reads transcriptions from the database
- Output: Extracts topics and updates the topics table in the database

### Scheduled Services

#### Scheduled Validation

The scheduled validation script runs the validation step on a regular interval to keep station data fresh:

```bash
# Start the scheduled validation service (runs every X minutes based on config)
bun run scheduled:validate

# Run a single validation cycle and exit
bun run scheduled:validate --once
```

- Input: Reads from `packages/web/scripts/db/stations.json`
- Output: Updates the same file with stream status (isOnline, updatedAt)
- Schedule: Configurable via `VALIDATE_STREAMS_INTERVAL` in .env (default: 5 minutes)

#### Scheduled Topic Processing

The scheduled topic processing script runs the topic extraction on a regular interval:

```bash
# Start the scheduled topic processing service
bun run scheduled:topics

# Run a single topic processing cycle and exit
bun run scheduled:topics --once
```

- Input: Reads recent transcriptions from the database
- Output: Extracts topics and updates topic trends
- Schedule: Configurable via environment variables

### Radio Services

#### Stream Orchestrator Service

The basic stream orchestrator service manages the streaming of radio stations:

```bash
# Start the stream orchestrator service
bun run service:orchestrator
```

- Input: Reads online stations from the database
- Output:
    - Creates audio segments in the configured directory
    - Updates station streaming status in the database
    - Optionally transcribes audio if configured

#### Radio Pipeline Service

The enhanced radio pipeline service combines streaming, transcription, and topic processing:

```bash
# Start the comprehensive radio pipeline service with all online stations
bun run service:radio-pipeline

# Test with a single specific station by ID
bun run service:radio-pipeline --station STATION_ID1

# Test with multiple specific stations by ID (can specify --station multiple times)
bun run service:radio-pipeline --station STATION_ID1 --station STATION_ID2
# or using the short form
bun run service:radio-pipeline -s STATION_ID1 -s STATION_ID2
```

- Input: Reads online stations from the database (or specific stations if IDs are provided)
- Output:
    - Creates audio segments in the configured directory
    - Transcribes audio in real-time
    - Processes topics from transcriptions in real-time

### Preserved Stations

The preserved stations feature allows you to specify a list of radio station IDs that should never be filtered out, regardless of their category, minimum votes, language, or other attributes. This is useful for ensuring that specific stations are always included in your dataset.

These station IDs are respected at both the **fetch stage** (prior to any filtering) and the **filter stage**, ensuring that these stations always make it through the entire pipeline.

To use this feature:

1. Create a JSONC file (JSON with comments) containing an array of Radko Browser station IDs:

```jsonc
[
    // WBEZ - Chicago Public Radio
    "96186f9e-0601-11e8-ae97-52543be04c81",
    // WABC - Talk radio from New York
    "11ae85d0-df31-464c-9bb2-6c67dae8c935",
]
```

2. Place this file at the path configured in your environment (default: `packages/web/scripts/db/preserved-stations.jsonc`), or specify a custom path when running the stations pipeline:

```bash
# When running the full stations pipeline
bun run stations:pipeline --preserved-stations /path/to/preserved-stations.jsonc

# When running just the fetch step
bun run stations:pipeline fetch --preserved-stations /path/to/preserved-stations.jsonc

# When running just the filter step
bun run stations:pipeline filter --preserved-stations /path/to/preserved-stations.jsonc

# When using the radio pipeline service
bun run service:radio-pipeline --preserved-stations /path/to/preserved-stations.jsonc
```

The system will ensure these stations are:

1. Fetched directly from the Radio Browser API even if they don't meet the minimum votes, language, or online status criteria
2. Included in the final filtered dataset, even if they would normally be filtered out based on category or other criteria

This feature works across the entire pipeline, from initial fetching to final filtering.

## Data Flow

```
Radio Browser API → fetch.ts → stations.json → classify.ts → stations.json → validate.ts → stations.json → geolocate.ts → stations.json → filter.ts → filtered-stations.json
                                                                                      ↓
                                                                            scheduled-validate.ts
                                                                                      ↓
                                                                                 stations.json
                                                                                      ↓
                                                                            orchestrator.ts → audio segments
                                                                                      ↓
                                                                            radio-pipeline.ts → transcriptions → topics
```

## Configuration

Configuration is loaded from environment variables. Create a `.env` file in the root of the package with the following variables:

```
# Database
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Scheduling
VALIDATE_STREAMS_INTERVAL=5  # in minutes

# Logging
LOG_LEVEL=1  # 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR

# Stream Orchestrator
BASE_SEGMENT_DIR=data/segments
DEFAULT_SEGMENT_LENGTH=30  # in seconds
DEFAULT_KEEP_SEGMENTS=10   # number of segments to keep
```

See `.env.example` for a complete list of configuration options.

## Development

This package is part of the Pulse monorepo and depends on the `@pulse/radio` and `@pulse/web` packages.

## License

MIT
