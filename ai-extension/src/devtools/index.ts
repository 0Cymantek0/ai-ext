/**
 * Dev Instrumentation Public API
 *
 * Re-exports instrumentation functions that can be safely imported across
 * all runtime surfaces. When VITE_DEBUG_RECORDER is false, the code within
 * instrumentation.ts is tree-shaken away by the bundler.
 */

export {
  initializeDevInstrumentation,
  getDevInstrumentation,
  teardownDevInstrumentation,
  type DevInstrumentationHandle,
  type InstrumentationSurface,
  type RuntimeLoggerLike,
  type InitializeInstrumentationOptions,
  type InstrumentationEvent,
} from "./instrumentation.js";
