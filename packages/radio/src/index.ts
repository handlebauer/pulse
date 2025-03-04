/**
 * Radio Library
 *
 * A library for streaming, processing, and analyzing radio streams.
 */

// Export scripts
export { classifyStations } from '../scripts/radio/classify-stations'
export { fetchStationsData } from '../scripts/radio/fetch-stations'

// Export Stream Orchestrator and related types
export {
    StreamOrchestrator,
    createOrchestrator,
} from './lib/stream/stream-orchestrator'
export type { OrchestratorConfig } from './lib/stream/stream-orchestrator'

// Export Stream Manager for advanced usage
export { StreamManager, createStream } from './lib/stream/stream-manager'
export type {
    StreamConfig,
    StreamManagerDependencies,
    SegmentInfo,
} from './lib/stream/stream-manager'

// Export configuration types
export type {
    RadioLibraryConfig,
    DatabaseConfig,
    RadioBrowserConfig,
    TranscriptionConfig,
} from './lib/config/types'

// Export radio types for consumers
export type { RadioStation, RadioStationFilter } from './lib/radio/types'
export { RadioStationCategory } from './lib/radio/types'
