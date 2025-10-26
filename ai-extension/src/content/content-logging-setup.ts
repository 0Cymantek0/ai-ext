/**
 * Content Script Logging Setup
 * Initializes runtime logging for content scripts
 */

import { initializeRuntimeLogging } from "../shared/runtime-logging.js";

// Initialize runtime logging for content scripts
// The autoToggle flag will automatically enable/disable based on debugRecorderEnabled
initializeRuntimeLogging({
  origin: "content-script",
  tags: ["content", "dom", "capture"],
  category: "content-script",
  bridge: {
    enabled: false, // Will be controlled by debugRecorderEnabled
    batchSize: 25,
    flushIntervalMs: 2000,
    maxQueueSize: 2000,
  },
  autoToggle: true,
});

export { initializeRuntimeLogging };
