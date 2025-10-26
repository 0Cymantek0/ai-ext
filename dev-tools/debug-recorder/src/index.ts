/**
 * Debug Recorder Public API
 */

export { SessionStore } from './session-store.js';
export { ReportGenerator } from './report-generator.js';
export { normalizeSession } from './normalizer.js';
export {
  LogFilterPipeline,
  createDefaultLogFilter,
  createStrictLogFilter,
  createVerboseLogFilter,
} from './log-filter.js';

export type {
  Session,
  SessionMetadata,
  RecordingOptions,
  Interaction,
  InteractionType,
  LogEntry,
  ErrorEntry,
  StateSnapshot,
  ReportOptions,
  StructuredLogEnvelope,
  LogOrigin,
  LogFilterConfig,
  TemporalCorrelationConfig,
  NetworkRequestEntry,
} from './types.js';

export type {
  RawSessionCapture,
  RawInteractionEvent,
  RawLogGroup,
  RawLogEntry,
  RawErrorEvent,
  RawAsset,
} from './normalizer.js';
