# @pulse/ops

Operational scripts and services for Pulse Radio.

This package contains scripts and services for managing the operational aspects of the Pulse Radio platform, including:

- Fetching and processing radio station data
- Validating radio station streams
- Running the stream orchestrator service

## Installation

```bash
bun install
```

## Scripts

### Station Data Pipeline

The station data pipeline consists of four steps:

1. **Fetch**: Fetch radio stations from the Radio Browser API

    - Input: None (uses Radio Browser API)
    - Output: Writes to `packages/web/scripts/db/stations.json`

2. **Classify**: Classify radio stations using AI

    - Input: Reads from `packages/web/scripts/db/stations.json`
    - Output: Updates the same file with classification data (category, subcategory)

3. **Validate**: Validate radio station streams

    - Input: Reads from `packages/web/scripts/db/stations.json`
    - Output: Updates the same file with stream status (isOnline, updatedAt)

4. **Filter**: Create specialized subsets of stations

    - Input: Reads from `packages/web/scripts/db/stations.json`
    - Output: Writes to `packages/web/scripts/db/filtered-stations.json`
    - Current filters: Talk and news stations only

You can run the full pipeline or individual steps:

```bash
# Run the full pipeline (fetch → classify → validate → filter)
bun run stations:pipeline

# Run individual steps
bun run stations:fetch     # Only fetch stations
bun run stations:classify  # Only classify stations
bun run stations:validate  # Only validate streams
bun run stations:filter    # Only filter stations

# Run the pipeline with specific steps
bun run stations:pipeline fetch             # Only fetch
bun run stations:pipeline classify          # Only classify
bun run stations:pipeline validate          # Only validate
bun run stations:pipeline filter            # Only filter
bun run stations:pipeline fetch-classify    # Fetch then classify
bun run stations:pipeline classify-validate # Classify then validate
bun run stations:pipeline validate-filter   # Validate then filter
bun run stations:pipeline no-filter         # Run all steps except filtering
```

### Scheduled Validation

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

### Stream Orchestrator Service

The stream orchestrator service manages the streaming of radio stations:

```bash
# Start the stream orchestrator service
bun run service:orchestrator
```

- Input: Reads online stations from the database
- Output:
    - Creates audio segments in the configured directory
    - Updates station streaming status in the database
    - Optionally transcribes audio if configured

## Data Flow

```
Radio Browser API → fetch.ts → stations.json → classify.ts → stations.json → validate.ts → stations.json → filter.ts → filtered-stations.json
                                                                                      ↓
                                                                            scheduled-validate.ts
                                                                                      ↓
                                                                                 stations.json
                                                                                      ↓
                                                                            orchestrator.ts → audio segments
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
