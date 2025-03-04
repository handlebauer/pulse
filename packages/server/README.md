# Radio Streaming Library

A powerful library for streaming, processing, and analyzing radio streams. This library provides functionality to:

- Stream radio content from URLs
- Split streams into manageable audio segments
- Optionally transcribe audio content
- Store metadata and transcriptions in a database
- Manage multiple radio stations simultaneously

## Installation

```bash
npm install radio-stream-library
# or
yarn add radio-stream-library
# or
pnpm add radio-stream-library
# or
bun add radio-stream-library
```

## Prerequisites

- FFmpeg must be installed on your system
- Node.js 18+ or Bun runtime

## Basic Usage

```typescript
import { createOrchestrator, OrchestratorConfig } from 'radio-stream-library'
import path from 'path'

// Configure the orchestrator
const config: OrchestratorConfig = {
    baseSegmentDir: path.join(process.cwd(), 'segments'),
    defaultSegmentLength: 15, // 15 seconds per segment
    defaultKeepSegments: 5, // Keep 5 most recent segments
}

// Create the orchestrator
const orchestrator = createOrchestrator(config)

// Start streaming a station
const streamManager = await orchestrator.startStation(
    'station1',
    'https://example.com/radio-stream.mp3',
)

// Later, stop the station
await orchestrator.stopStation('station1')

// Stop all stations when done
await orchestrator.stopAll()
```

## Advanced Configuration

The library supports extensive configuration options:

```typescript
import { createOrchestrator, RadioLibraryConfig } from 'radio-stream-library'

const config: RadioLibraryConfig = {
    // Database configuration (optional)
    database: {
        url: 'https://your-supabase-url.supabase.co',
        serviceRoleKey: 'your-service-role-key',
    },

    // Transcription configuration (optional)
    transcription: {
        googleApiKey: 'your-google-api-key',
        model: 'gemini-2.0-flash', // If both model and googleApiKey are set, transcription is enabled by default
        enabled: true, // Defaults to true (set to false to disable transcription even when model and API key are set)
    },

    // Radio Browser API configuration (optional)
    radioBrowser: {
        apiUrl: 'https://de1.api.radio-browser.info/json',
        minVotes: 3000,
        onlineOnly: true,
        countries: ['US', 'GB', 'CA', 'AU'],
        englishOnly: true,
    },

    // Stream orchestrator configuration (required)
    orchestrator: {
        baseSegmentDir: path.join(process.cwd(), 'segments'),
        defaultSegmentLength: 15,
        defaultKeepSegments: 5,
    },
}

// Create orchestrator with complete configuration
const orchestrator = createOrchestrator(config.orchestrator)
```

## Working with Multiple Stations

You can manage multiple radio stations with the stream orchestrator:

```typescript
// Start multiple stations from provided data
const stationsData = [
    { id: 'station1', streamUrl: 'https://example.com/station1.mp3' },
    { id: 'station2', streamUrl: 'https://example.com/station2.mp3' },
]

const activeStreams = await orchestrator.startMultipleStations(
    stationsData.map((s) => s.id),
    stationsData,
)

// Get all active streams
const streams = orchestrator.getActiveStreams()
console.log(
    `Currently streaming ${orchestrator.getActiveStreamCount()} stations`,
)
```

## Database Integration

If you provide database configuration, the library will automatically:

1. Store station metadata
2. Save stream segments information
3. Store transcriptions when enabled

To enable database features:

```typescript
const config = {
    // ... other config ...

    // Database configuration
    database: {
        url: 'https://your-supabase-url.supabase.co',
        serviceRoleKey: 'your-service-role-key',
    },

    // ... other config ...
}
```

## Transcription Features

To enable audio transcription:

```typescript
const config = {
    // ... other config ...

    // Transcription configuration
    transcription: {
        googleApiKey: 'your-google-api-key',
        model: 'gemini-2.0-flash', // If both model and googleApiKey are set, transcription is enabled by default
        enabled: false, // Optional: explicitly disable transcription even when model and API key are set
    },

    // ... other config ...
}
```

## API Documentation

### StreamOrchestrator

The main class that manages multiple radio station streams.

#### Methods

- `startStation(stationId: string, streamUrl: string, customConfig?: Partial<StreamConfig>): Promise<StreamManager>`
- `stopStation(stationId: string): Promise<boolean>`
- `stopAll(): Promise<void>`
- `getActiveStreams(): Map<string, StreamManager>`
- `getActiveStreamCount(): number`
- `startMultipleStations(stationIds: string[], stationData?: Array<{ id: string, streamUrl: string }>): Promise<Map<string, StreamManager>>`

### StreamManager

Manages a single radio stream, handling segmentation and processing.

#### Methods

- `start(): Promise<this>`
- `stop(): Promise<void>`
- `getSegments(): SegmentInfo[]`

## License

MIT
