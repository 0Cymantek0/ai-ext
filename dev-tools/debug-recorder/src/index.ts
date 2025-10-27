/**
 * Debug Recorder Public API
 */

export { SessionStore } from './session-store.js';
export { SessionController } from './session-controller.js';
export { ReportGenerator } from './report-generator.js';
export { normalizeSession } from './normalizer.js';
export { BridgeServer } from './bridge-server.js';
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

export type { SessionState, SessionConfig } from './session-controller.js';
