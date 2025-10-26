/**
 * Side Panel Logging Setup
 * Initializes runtime logging for side panel
 */

import { initializeRuntimeLogging } from "../shared/runtime-logging.js";

// Initialize runtime logging for side panel
initializeRuntimeLogging({
  origin: "side-panel",
  tags: ["ui", "react", "chat"],
  category: "sidepanel",
  bridge: {
    enabled: false,
    batchSize: 25,
    flushIntervalMs: 2000,
    maxQueueSize: 2000,
  },
  autoToggle: true,
});

export { initializeRuntimeLogging };
