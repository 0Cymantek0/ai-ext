/**
 * Offscreen Document Logging Setup
 * Initializes runtime logging for offscreen documents
 */

import { initializeRuntimeLogging } from "../shared/runtime-logging.js";

// Initialize runtime logging for offscreen documents
initializeRuntimeLogging({
  origin: "offscreen",
  tags: ["offscreen", "pdf", "processing"],
  category: "offscreen",
  bridge: {
    enabled: false,
    batchSize: 25,
    flushIntervalMs: 2000,
    maxQueueSize: 2000,
  },
  autoToggle: true,
});

export { initializeRuntimeLogging };
