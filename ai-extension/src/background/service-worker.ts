/**
 * Service Worker Lifecycle Management
 * Handles initialization, state persistence, and termination/restart
 * Requirements: 1.7, 15.4
 */

// Polyfill for Vite's preload helper in service worker context
// Service workers don't have access to document or window, so we provide minimal polyfills
if (typeof document === "undefined") {
  (globalThis as any).document = {
    createElement: () => ({ rel: "", href: "" }),
    head: { appendChild: () => {} },
    getElementsByTagName: () => [],
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    getElementsByClassName: () => [],
    body: null,
  };
}

if (typeof window === "undefined") {
  (globalThis as any).window = globalThis;
}

import { logger, performanceMonitor } from "./monitoring.js";
import { getQuotaManager } from "./quota-manager.js";
import { AIManager } from "./ai-manager.js";
import { initializeRuntimeLogging } from "../shared/runtime-logging.js";
import {
  getLogBridgeClient,
  type LogBatch,
} from "../shared/log-bridge-client.js";
import { attachLoggerBridge } from "./logger-wrapper.js";
import { getLogCollector } from "./log-collector.js";
import { CloudAIManager } from "./cloud-ai-manager.js";
import { getStreamingHandler } from "./streaming-handler.js";
import {
  indexedDBManager,
  ContentType,
  ProcessingStatus,
} from "./indexeddb-manager.js";
import { contentProcessor } from "./content-processor.js";
import { vectorSearchService } from "./vector-search-service.js";
import { initializeDevInstrumentation } from "../devtools/instrumentation.js";
import { PocketReportGenerator } from "./pocket-report-generator.js";
import {
  AriaController,
  type AriaControllerEventDetail,
} from "./research/aria-controller.js";
import { getProviderConfigManager } from "./provider-config-manager.js";
import { SettingsManager } from "./routing/settings-manager.js";
import { AgentRuntimeService } from "./agent-runtime/agent-runtime-service.js";
import type {
  AgentRunStartPayload,
  AgentRunStatusPayload,
  AgentRunEventPayload,
  AgentRunControlPayload,
} from "../shared/types/index.d.ts";

// Initialize runtime logging (disabled by default until debug recording is enabled)
initializeRuntimeLogging({
  origin: "background",
  tags: ["service-worker"],
  category: "background",
  bridge: {
    enabled: false,
    batchSize: 25,
    flushIntervalMs: 2000,
    maxQueueSize: 5000,
  },
});

const logBridgeClient = getLogBridgeClient();
attachLoggerBridge(logger, logBridgeClient, {
  tags: ["service-worker", "logger"],
});
const logCollector = getLogCollector();
const backgroundDevtools = initializeDevInstrumentation("background", {
  logger,
});

if (import.meta.env?.VITE_DEBUG_RECORDER && backgroundDevtools) {
  backgroundDevtools.recordEvent("lifecycle:service_worker_loaded", {
    timestamp: Date.now(),
  });
}

// Listen for debug recorder toggle and manage log collection sessions
// Note: The bridge client enable/disable is already handled by runtime-logging autoToggle
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName !== "local" ||
    !Object.prototype.hasOwnProperty.call(changes, "debugRecorderEnabled")
  ) {
    return;
  }

  const change = changes.debugRecorderEnabled;
  const enabled = change?.newValue === true;

  if (enabled) {
    void logCollector.startSession().catch((error) => {
      logger.error("ServiceWorker", "Failed to start log session", error);
    });
  } else {
    void logCollector.stopSession().catch((error) => {
      logger.error("ServiceWorker", "Failed to stop log session", error);
    });
  }
});
import * as abbreviationStorage from "./abbreviation-storage.js";
import { aiManager as aiManagerInstance } from "./ai-manager.js";
import { ensureGeminiNanoProvider } from "./builtin-provider-bootstrap.js";
import { sanitizeModelSheet } from "./model-sheet-sanitizer.js";
import { ChromeLocalStorage } from "./storage-wrapper.js";
import { GeminiNanoFormatter } from "./gemini-nano-formatter.js";
import { ContentProcessorBackground } from "./content-processor-background.js";
import {
  vectorIndexingQueue,
  IndexingOperation,
} from "./vector-indexing-queue.js";
import { registerFsAccessHandlers } from "./storage/fs-access-manager.js";
import { MetadataQueueManager } from "./metadata-queue-manager.js";
import { TranscriptionExecutor } from "./provider-execution/transcription-executor.js";
import { WorkflowManager } from "../browser-agent/workflow-manager.js";
import { BrowserToolRegistry } from "../browser-agent/tool-registry.js";
import { ALL_BROWSER_TOOLS } from "../browser-agent/tools/index.js";
import {
  createVisionManager,
  type CaptureResult,
} from "../browser-agent/vision.js";
import { createDatabaseManager } from "../storage/schema.js";
import {
  apiRequest as performApiRequest,
  startNetworkMonitoring,
  stopNetworkMonitoring,
  getNetworkLogs,
  setAuthToken as storeAuthToken,
  clearAuthToken as removeAuthToken,
} from "../browser-agent/api-testing.js";
import type {
  ApiRequestPayload,
  ApiRequestResponsePayload,
  ApiStartNetworkMonitoringPayload,
  ApiStopNetworkMonitoringPayload,
  ApiNetworkLogsResponsePayload,
  ApiSetAuthTokenPayload,
  ApiAuthResponsePayload,
  AiProcessRequestPayload,
  AiProcessResponsePayload,
  AudioTranscribeRequestPayload,
  AudioTranscribeResponsePayload,
  ProviderSettingsLoadPayload,
  ProviderSettingsSavePayload,
  SpeechSettingsLoadPayload,
  SpeechSettingsSavePayload,
  SettingsRoutingLoadPayload,
  SettingsRoutingSavePayload,
} from "../shared/types/index.d.ts";

// Initialize formatter and background processor
const storageWrapper = new ChromeLocalStorage();
const geminiFormatter = new GeminiNanoFormatter(
  aiManagerInstance,
  storageWrapper,
);
const backgroundProcessor = new ContentProcessorBackground(geminiFormatter);

// Initialize browser agent workflow manager
const browserToolRegistry = new BrowserToolRegistry(logger, performanceMonitor);
const database = createDatabaseManager();

// Initialize vision manager
const visionManager = createVisionManager(logger);

logger.info(
  "ServiceWorker",
  "Vision manager initialized (disabled by default)",
);

function normalizeScreenshotInput(input: any): string | CaptureResult {
  if (typeof input === "string") {
    return input;
  }

  if (input && typeof input === "object" && typeof input.dataUrl === "string") {
    return {
      dataUrl: input.dataUrl,
      format: (input.format ?? "png") as "png" | "jpeg",
      width: input.width ?? 0,
      height: input.height ?? 0,
      timestamp: input.timestamp ?? Date.now(),
      tabId: input.tabId,
      tabUrl: input.tabUrl,
      devicePixelRatio: input.devicePixelRatio,
      elementMappings: input.elementMappings,
    } satisfies CaptureResult;
  }

  throw new Error("Invalid screenshot payload");
}

function toCaptureResult(input: any): CaptureResult {
  const normalized = normalizeScreenshotInput(input);
  if (typeof normalized === "string") {
    throw new Error("Expected structured screenshot payload");
  }
  return normalized;
}

function decodeBase64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

// Register all browser agent tools
ALL_BROWSER_TOOLS.forEach((tool) => {
  browserToolRegistry.register(tool);
});

logger.info("ServiceWorker", "Browser tool registry initialized", {
  totalTools: browserToolRegistry.getAllTools().length,
});

// Initialize workflow manager - ensure DB is ready first
let workflowManager: WorkflowManager;

// Safe initialization after DB is ready
async function initializeWorkflowManager(): Promise<void> {
  try {
    // Ensure database is opened and upgraded to v4 before using workflow manager
    await database.open();
    logger.info("ServiceWorker", "Database ready for workflow manager");

    workflowManager = new WorkflowManager(
      browserToolRegistry,
      database,
      logger,
    );
    logger.info("ServiceWorker", "WorkflowManager initialized");

    // Resume incomplete workflows after manager is ready
    await workflowManager.resumeIncompleteWorkflows();
    logger.info("ServiceWorker", "Incomplete workflows resumed");

    // Periodic cleanup of stale checkpoints (>1 hour)
    const WORKFLOW_CHECKPOINT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
    setInterval(() => {
      void workflowManager.cleanupStaleCheckpoints().catch((error) => {
        logger.error("ServiceWorker", "Checkpoint cleanup failed", error);
      });
    }, WORKFLOW_CHECKPOINT_CLEANUP_INTERVAL_MS);
  } catch (error) {
    logger.error(
      "ServiceWorker",
      "Failed to initialize workflow manager",
      error,
    );
  }
}

// Initialize workflow manager asynchronously
void initializeWorkflowManager();

/**
 * Context Menu Management
 * Creates and handles "Save to Pocket" context menu
 */
async function createContextMenu(): Promise<void> {
  try {
    // Remove existing context menus
    await chrome.contextMenus.removeAll();

    // Create "Save to Pocket" context menu for text selection
    chrome.contextMenus.create({
      id: "save-to-pocket",
      title: "Save to Pocket",
      contexts: ["selection"],
    });

    // Create "Save to Pocket" context menu for images
    chrome.contextMenus.create({
      id: "save-image-to-pocket",
      title: "Save to Pocket",
      contexts: ["image"],
    });

    logger.info("ServiceWorker", "Context menu created");
  } catch (error) {
    logger.error("ServiceWorker", "Failed to create context menu", error);
  }
}

/**
 * Ensure content script is loaded in the tab
 */
async function ensureContentScriptLoaded(tabId: number): Promise<boolean> {
  try {
    // Try to ping the content script
    await chrome.tabs.sendMessage(tabId, { kind: "PING", payload: {} });
    return true;
  } catch (error) {
    // Content script not responding, it might be loading or the page doesn't support it
    // Wait a bit and try again
    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      await chrome.tabs.sendMessage(tabId, { kind: "PING", payload: {} });
      return true;
    } catch (retryError) {
      logger.error("ServiceWorker", "Content script not responding", {
        tabId,
        error: retryError,
      });
      return false;
    }
  }
}

/**
 * Send message to content script with retry logic
 */
async function sendMessageWithRetry(
  tabId: number,
  message: any,
  maxRetries: number = 3,
): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);

      // Check for chrome.runtime.lastError
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message || "";
        logger.warn(
          "ServiceWorker",
          "chrome.runtime.lastError detected",
          errorMsg,
        );

        // If it's a message channel closed error, throw immediately
        if (
          errorMsg.includes("message channel closed") ||
          errorMsg.includes("message port closed")
        ) {
          throw new Error(errorMsg);
        }
      }

      return response;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Don't retry if message channel closed - this is likely intentional (user cancelled)
      if (
        errorMessage.includes("message channel closed") ||
        errorMessage.includes("message port closed")
      ) {
        logger.info("ServiceWorker", "Message channel closed, not retrying");
        throw error;
      }

      logger.warn(
        "ServiceWorker",
        `Send message attempt ${attempt} failed`,
        error,
      );

      if (attempt < maxRetries) {
        // Try to ensure content script is loaded before retry
        await ensureContentScriptLoaded(tabId);

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      } else {
        throw error;
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PocketSelectionResolver = {
  resolve: (response: {
    pocketId: string;
    editedTitle?: string | undefined;
  }) => void;
  reject: (error: Error) => void;
  timeoutId: number;
};

type PocketSelectionContext = {
  selectionText?: string;
  preview?: string;
  sourceUrl?: string;
};

const pocketSelectionRequests = new Map<string, PocketSelectionResolver>();

async function dispatchPocketSelectionRequest(request: {
  requestId: string;
  pockets: Array<{
    id: string;
    name: string;
    description?: string;
    color?: string;
  }>;
  selectionText?: string;
  preview?: string;
  sourceUrl?: string;
}): Promise<void> {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await chrome.runtime.sendMessage({
        kind: "POCKET_SELECTION_REQUEST",
        payload: request,
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("Receiving end does not exist") &&
        attempt < maxAttempts
      ) {
        await delay(200 * attempt);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Failed to dispatch pocket selection request");
}

async function requestPocketSelection(
  tabId: number,
  pockets: Array<{
    id: string;
    name: string;
    description?: string;
    color?: string;
  }>,
  context: PocketSelectionContext,
): Promise<{ pocketId: string; editedTitle?: string | undefined }> {
  if (pockets.length === 1) {
    return { pocketId: pockets[0]!.id, editedTitle: undefined };
  }

  const requestId = crypto.randomUUID();

  try {
    await chrome.sidePanel.open({ tabId });
    logger.info("ServiceWorker", "Side panel opened for pocket selection");
  } catch (error) {
    logger.warn(
      "ServiceWorker",
      "Failed to open side panel before pocket selection",
      error,
    );
  }

  const normalizedPockets = pockets.map((pocket) => ({
    id: pocket.id,
    name: pocket.name,
    ...(pocket.description ? { description: pocket.description } : {}),
    ...(pocket.color ? { color: pocket.color } : {}),
  }));

  await dispatchPocketSelectionRequest({
    requestId,
    pockets: normalizedPockets,
    ...(context.selectionText ? { selectionText: context.selectionText } : {}),
    ...(context.preview ? { preview: context.preview } : {}),
    ...(context.sourceUrl ? { sourceUrl: context.sourceUrl } : {}),
  });

  return await new Promise<{
    pocketId: string;
    editedTitle?: string | undefined;
  }>((resolve, reject) => {
    const timeoutId = setTimeout(async () => {
      pocketSelectionRequests.delete(requestId);
      try {
        await chrome.runtime.sendMessage({
          kind: "POCKET_SELECTION_RESPONSE",
          payload: {
            requestId,
            status: "error",
            error: "timeout",
          },
        });
      } catch (error) {
        logger.warn(
          "ServiceWorker",
          "Failed to notify pocket selection timeout",
          error,
        );
      }
      reject(new Error("POCKET_SELECTION_TIMEOUT"));
    }, 45000) as unknown as number;

    pocketSelectionRequests.set(requestId, {
      resolve: (response) => {
        clearTimeout(timeoutId);
        pocketSelectionRequests.delete(requestId);
        resolve(response);
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        pocketSelectionRequests.delete(requestId);
        reject(error);
      },
      timeoutId,
    });
  });
}

// Context menu click handler (registered once at module level)
let contextMenuHandlerRegistered = false;
let isProcessingSaveToPocket = false;

if (!contextMenuHandlerRegistered) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // Handle text selection
    if (info.menuItemId === "save-to-pocket" && tab?.id) {
      // Prevent multiple simultaneous operations
      if (isProcessingSaveToPocket) {
        logger.warn(
          "ServiceWorker",
          "Save to pocket already in progress, ignoring duplicate click",
        );
        return;
      }

      isProcessingSaveToPocket = true;

      try {
        logger.info("ServiceWorker", "Context menu clicked", {
          tabId: tab.id,
          selectionText: info.selectionText?.substring(0, 50),
        });

        // Ensure content script is loaded
        const isLoaded = await ensureContentScriptLoaded(tab.id);
        if (!isLoaded) {
          logger.error("ServiceWorker", "Content script could not be loaded");
          // Show notification to user
          await chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/48.png",
            title: "Save to Pocket Failed",
            message:
              "Could not load content script. Please refresh the page and try again.",
          });
          return;
        }

        // Initialize IndexedDB and load pockets
        await indexedDBManager.init();
        let pockets = await indexedDBManager.listPockets();

        if (pockets.length === 0) {
          logger.info(
            "ServiceWorker",
            "No pockets found, creating default pocket",
          );
          await indexedDBManager.createPocket({
            name: "My Pocket",
            description: "Default pocket for saved content",
            tags: [],
            color: "#3b82f6",
            contentIds: [],
          });
          pockets = await indexedDBManager.listPockets();
        }

        // Capture the selection snippet before prompting the user
        const snippetResponse = await sendMessageWithRetry(tab.id, {
          kind: "CAPTURE_SELECTION_SNIPPET",
          payload: {
            selectionText: info.selectionText,
            sourceUrl: tab.url,
          },
        });

        const snippetEnvelope = snippetResponse?.data || snippetResponse;
        if (
          !snippetEnvelope ||
          snippetEnvelope.status !== "success" ||
          !snippetEnvelope.snippet
        ) {
          const captureError =
            snippetEnvelope?.error || "Failed to capture selected text";
          logger.error("ServiceWorker", "Snippet capture failed", {
            captureError,
            snippetEnvelope,
          });
          throw new Error(
            typeof captureError === "string"
              ? captureError
              : JSON.stringify(captureError),
          );
        }

        const snippet = snippetEnvelope.snippet;
        const snippetTextRaw =
          snippet?.content?.text?.content || info.selectionText || "";
        const snippetText =
          typeof snippetTextRaw === "string" ? snippetTextRaw.trim() : "";

        if (!snippetText) {
          throw new Error("Captured selection was empty");
        }

        const snippetPreview = snippetText.slice(0, 200);
        const snippetTitleCandidate = snippetText.slice(0, 80);

        // Determine target pocket (prompt via side panel if multiple)
        let targetPocketId: string;
        if (pockets.length === 1) {
          targetPocketId = pockets[0]!.id;
          logger.info("ServiceWorker", "Auto-selecting sole pocket", {
            pocketId: targetPocketId,
          });
        } else {
          try {
            const response = await requestPocketSelection(tab.id, pockets, {
              selectionText: snippetText,
              preview: snippetPreview,
              sourceUrl: snippet.metadata?.url || tab.url || "",
            });
            targetPocketId = response.pocketId;
          } catch (selectionError) {
            if (selectionError instanceof Error) {
              if (selectionError.message === "POCKET_SELECTION_CANCELLED") {
                logger.info(
                  "ServiceWorker",
                  "User cancelled pocket selection from side panel",
                );
                return;
              }
              if (selectionError.message === "POCKET_SELECTION_TIMEOUT") {
                throw new Error("Pocket selection timed out");
              }
            }
            throw selectionError;
          }
        }

        const targetPocket =
          pockets.find((p) => p.id === targetPocketId) || null;

        // Normalize metadata before saving
        snippet.metadata = {
          ...snippet.metadata,
          url: snippet.metadata?.url || tab.url || "",
          timestamp: snippet.metadata?.timestamp || Date.now(),
        };

        if (!snippet.metadata.title) {
          try {
            const source = snippet.metadata.url
              ? new URL(snippet.metadata.url)
              : null;
            snippet.metadata.title =
              snippetTitleCandidate || source?.hostname || "Saved snippet";
          } catch {
            snippet.metadata.title = snippetTitleCandidate || "Saved snippet";
          }
        }

        logger.info("ServiceWorker", "Processing captured snippet", {
          pocketId: targetPocketId,
          preview: snippetPreview,
        });

        const processed = await contentProcessor.processContent({
          pocketId: targetPocketId,
          mode: "selection",
          content: snippet.content,
          metadata: snippet.metadata,
          sourceUrl: snippet.metadata.url || tab.url || "",
          sanitize: true,
        });

        logger.info("ServiceWorker", "Content processed and saved", {
          contentId: processed.contentId,
          type: processed.type,
        });

        const savedContent = await indexedDBManager.getContent(
          processed.contentId,
        );

        // Broadcast content created event (will be received if side panel is open)
        if (savedContent) {
          try {
            await chrome.runtime.sendMessage({
              kind: "CONTENT_CREATED",
              payload: { content: savedContent },
            });
            logger.info("ServiceWorker", "Broadcasted CONTENT_CREATED event");
          } catch (broadcastError) {
            // This is expected if side panel is not open - user will see content when they open it
            logger.debug(
              "ServiceWorker",
              "Broadcast not received (side panel may be closed)",
              broadcastError,
            );
          }
        }

        await chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/48.png",
          title: "Saved to Pocket",
          message: targetPocket?.name
            ? `Saved to ${targetPocket.name}`
            : "Selection saved successfully",
        });

        logger.info("ServiceWorker", "Selection saved via context menu", {
          pocketId: targetPocketId,
          contentId: processed.contentId,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        logger.error("ServiceWorker", "Context menu handler error", {
          message: errorMessage,
          stack: errorStack,
          error: error,
        });

        // Show error notification
        await chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/48.png",
          title: "Save to Pocket Failed",
          message:
            error instanceof Error
              ? error.message
              : "An unknown error occurred",
        });
      } finally {
        isProcessingSaveToPocket = false;
      }
    }

    // Handle image save
    if (info.menuItemId === "save-image-to-pocket" && tab?.id) {
      // Prevent multiple simultaneous operations
      if (isProcessingSaveToPocket) {
        logger.warn(
          "ServiceWorker",
          "Save to pocket already in progress, ignoring duplicate click",
        );
        return;
      }

      isProcessingSaveToPocket = true;

      try {
        logger.info("ServiceWorker", "Image context menu clicked", {
          tabId: tab.id,
          srcUrl: info.srcUrl,
        });

        // Ensure content script is loaded
        const isLoaded = await ensureContentScriptLoaded(tab.id);
        if (!isLoaded) {
          logger.error("ServiceWorker", "Content script could not be loaded");
          await chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/48.png",
            title: "Save to Pocket Failed",
            message:
              "Could not load content script. Please refresh the page and try again.",
          });
          return;
        }

        // Initialize IndexedDB and load pockets
        await indexedDBManager.init();
        let pockets = await indexedDBManager.listPockets();

        if (pockets.length === 0) {
          logger.info(
            "ServiceWorker",
            "No pockets found, creating default pocket",
          );
          await indexedDBManager.createPocket({
            name: "My Pocket",
            description: "Default pocket for saved content",
            tags: [],
            color: "#3b82f6",
            contentIds: [],
          });
          pockets = await indexedDBManager.listPockets();
        }

        // Capture image data from content script
        const imageResponse = await sendMessageWithRetry(tab.id, {
          kind: "CAPTURE_IMAGE_DATA",
          payload: {
            srcUrl: info.srcUrl,
            pageUrl: tab.url,
          },
        });

        const imageEnvelope = imageResponse?.data || imageResponse;
        if (
          !imageEnvelope ||
          imageEnvelope.status !== "success" ||
          !imageEnvelope.imageData
        ) {
          const captureError =
            imageEnvelope?.error || "Failed to capture image";
          logger.error("ServiceWorker", "Image capture failed", {
            captureError,
            imageEnvelope,
          });
          throw new Error(
            typeof captureError === "string"
              ? captureError
              : JSON.stringify(captureError),
          );
        }

        const imageData = imageEnvelope.imageData;
        const defaultImageTitle =
          imageData.alt || imageData.title || "Saved Image";
        const imagePreview = `Image: ${imageData.width}x${imageData.height}`;

        // Open side panel to allow user to edit title and select pocket
        try {
          await chrome.sidePanel.open({ tabId: tab.id });
        } catch (error) {
          logger.warn(
            "ServiceWorker",
            "Failed to open side panel for image save",
            error,
          );
        }

        // Request pocket selection with editable title
        const requestId = crypto.randomUUID();

        await dispatchPocketSelectionRequest({
          requestId,
          pockets: pockets.map((pocket) => ({
            id: pocket.id,
            name: pocket.name,
            ...(pocket.description ? { description: pocket.description } : {}),
            ...(pocket.color ? { color: pocket.color } : {}),
          })),
          selectionText: defaultImageTitle,
          preview: imagePreview,
          sourceUrl: tab.url || "",
        });

        // Wait for user response with edited title and selected pocket
        const response = await new Promise<{
          pocketId: string;
          editedTitle?: string | undefined;
        }>((resolve, reject) => {
          const timeoutId = setTimeout(async () => {
            pocketSelectionRequests.delete(requestId);
            try {
              await chrome.runtime.sendMessage({
                kind: "POCKET_SELECTION_RESPONSE",
                payload: {
                  requestId,
                  status: "error",
                  error: "timeout",
                },
              });
            } catch (error) {
              logger.warn(
                "ServiceWorker",
                "Failed to notify pocket selection timeout",
                error,
              );
            }
            reject(new Error("POCKET_SELECTION_TIMEOUT"));
          }, 45000) as unknown as number;

          pocketSelectionRequests.set(requestId, {
            resolve: (response) => {
              clearTimeout(timeoutId);
              pocketSelectionRequests.delete(requestId);
              resolve(response);
            },
            reject: (error) => {
              clearTimeout(timeoutId);
              pocketSelectionRequests.delete(requestId);
              reject(error);
            },
            timeoutId,
          });
        });

        const targetPocketId = response.pocketId;
        const finalImageTitle = response.editedTitle || defaultImageTitle;
        const targetPocket =
          pockets.find((p) => p.id === targetPocketId) || null;

        // Process and save image
        const processed = await contentProcessor.processContent({
          pocketId: targetPocketId,
          mode: "image",
          content: {
            image: {
              src: imageData.src,
              alt: imageData.alt,
              title: imageData.title,
              width: imageData.width,
              height: imageData.height,
            },
          },
          metadata: {
            title: finalImageTitle,
            timestamp: Date.now(),
            url: tab.url || "",
            dimensions: { width: imageData.width, height: imageData.height },
          },
          sourceUrl: tab.url || "",
          sanitize: false,
        });

        logger.info("ServiceWorker", "Image processed and saved", {
          contentId: processed.contentId,
          type: processed.type,
        });

        const savedContent = await indexedDBManager.getContent(
          processed.contentId,
        );

        if (savedContent) {
          try {
            await chrome.runtime.sendMessage({
              kind: "CONTENT_CREATED",
              payload: { content: savedContent },
            });
            logger.info("ServiceWorker", "Broadcasted CONTENT_CREATED event");
          } catch (broadcastError) {
            logger.warn(
              "ServiceWorker",
              "Failed to broadcast CONTENT_CREATED",
              broadcastError,
            );
          }
        }

        await chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/48.png",
          title: "Saved to Pocket",
          message: targetPocket?.name
            ? `Image saved to ${targetPocket.name}`
            : "Image saved successfully",
        });

        logger.info("ServiceWorker", "Image saved via context menu", {
          pocketId: targetPocketId,
          contentId: processed.contentId,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        logger.error("ServiceWorker", "Image context menu handler error", {
          message: errorMessage,
          stack: errorStack,
          error: error,
        });

        await chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/48.png",
          title: "Save to Pocket Failed",
          message:
            error instanceof Error
              ? error.message
              : "An unknown error occurred",
        });
      } finally {
        isProcessingSaveToPocket = false;
      }
    }
  });
  contextMenuHandlerRegistered = true;
  logger.info("ServiceWorker", "Context menu handler registered");
}

type ServiceWorkerState = {
  initialized: boolean;
  lastActive: number;
  activeRequests: Map<string, any>;
  sessionData: Record<string, any>;
};

class ServiceWorkerLifecycle {
  private state: ServiceWorkerState = {
    initialized: false,
    lastActive: Date.now(),
    activeRequests: new Map(),
    sessionData: {},
  };

  private readonly STATE_KEY = "service_worker_state";
  private readonly HEARTBEAT_INTERVAL = 25000; // 25 seconds (before 30s timeout)
  private heartbeatTimer: number | null = null;

  /**
   * Preload embedding model in background
   * This ensures the model is ready when users first use RAG search
   */
  private preloadEmbeddingModel(): void {
    // Import and preload in background (don't await)
    import("./local-embedding-engine.js")
      .then(({ localEmbeddingEngine }) => {
        logger.info(
          "ServiceWorker",
          "Preloading embedding model in background...",
        );

        // Generate a dummy embedding to trigger model loading
        localEmbeddingEngine
          .generateEmbedding("preload")
          .then(() => {
            logger.info(
              "ServiceWorker",
              "Embedding model preloaded successfully",
            );
          })
          .catch((error) => {
            logger.warn(
              "ServiceWorker",
              "Failed to preload embedding model (will load on first use)",
              { error },
            );
          });
      })
      .catch((error) => {
        logger.warn(
          "ServiceWorker",
          "Failed to import embedding engine for preload",
          { error },
        );
      });
  }

  /**
   * Initialize the service worker
   * Restores state from storage and sets up event listeners
   */
  async initialize(): Promise<void> {
    const startTime = performance.now();
    logger.info("ServiceWorker", "Initializing...");

    try {
      // Restore state from storage
      await performanceMonitor.measureAsync(
        "service-worker-restore-state",
        () => this.restoreState(),
      );

      // Set up heartbeat to keep service worker alive during active operations
      this.startHeartbeat();

      // Start performance monitoring (Requirement 13.1, 13.2)
      performanceMonitor.startMonitoring(30000); // Monitor every 30 seconds

      // Initialize quota manager (Requirement 5.8, 13.1, 13.9)
      const quotaManager = getQuotaManager();
      await quotaManager.initialize();
      quotaManager.startMonitoring(60000); // Monitor every 60 seconds

      // Mark as initialized
      this.state.initialized = true;
      this.state.lastActive = Date.now();

      await this.persistState();

      // Start background processor for Gemini Nano formatting
      backgroundProcessor.start().catch((error) => {
        logger.error(
          "ServiceWorker",
          "Failed to start background processor",
          error,
        );
      });

      // Preload embedding model in background (don't block initialization)
      this.preloadEmbeddingModel();
      // Enable runtime logging if debug recorder is enabled
      const debugRecorderEnabled = await chrome.storage.local.get(
        "debugRecorderEnabled",
      );
      if (debugRecorderEnabled.debugRecorderEnabled === true) {
        try {
          await logCollector.startSession();
          logger.info(
            "ServiceWorker",
            "Debug recorder enabled - logs will be captured",
          );
        } catch (error) {
          logger.error(
            "ServiceWorker",
            "Failed to enable debug recorder",
            error,
          );
        }
      }

      const initTime = performance.now() - startTime;
      performanceMonitor.recordMetric(
        "service-worker-init-time",
        initTime,
        "ms",
      );

      logger.info("ServiceWorker", "Initialized successfully", {
        timestamp: new Date().toISOString(),
        initTime: `${initTime.toFixed(2)}ms`,
      });

      // Check if initialization meets performance target (Requirement 13.1)
      if (initTime > 100) {
        logger.warn("ServiceWorker", "Initialization exceeded 100ms target", {
          initTime: `${initTime.toFixed(2)}ms`,
        });
      }
    } catch (error) {
      logger.error("ServiceWorker", "Initialization failed", error);
      throw error;
    }
  }

  /**
   * Restore state from chrome.storage.local
   */
  private async restoreState(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(this.STATE_KEY);
      if (result[this.STATE_KEY]) {
        const savedState = result[this.STATE_KEY];
        this.state.sessionData = savedState.sessionData || {};
        this.state.lastActive = savedState.lastActive || Date.now();

        logger.info("ServiceWorker", "State restored", {
          lastActive: new Date(this.state.lastActive).toISOString(),
        });
      }
    } catch (error) {
      logger.error("ServiceWorker", "Failed to restore state", error);
      // Continue with default state
    }
  }

  /**
   * Persist current state to chrome.storage.local
   */
  async persistState(): Promise<void> {
    try {
      const stateToSave = {
        sessionData: this.state.sessionData,
        lastActive: this.state.lastActive,
        timestamp: Date.now(),
      };

      await chrome.storage.local.set({
        [this.STATE_KEY]: stateToSave,
      });

      logger.debug("ServiceWorker", "State persisted");
    } catch (error) {
      logger.error("ServiceWorker", "Failed to persist state", error);
    }
  }

  /**
   * Start heartbeat to prevent service worker termination during active operations
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      this.state.lastActive = Date.now();
      logger.debug("ServiceWorker", "Heartbeat", {
        activeRequests: this.state.activeRequests.size,
      });

      // Keep service worker alive with Chrome API call
      // This prevents the 30-second termination timeout
      chrome.runtime.getPlatformInfo(() => {
        // Empty callback - just keeping SW alive
      });

      // Persist state periodically
      this.persistState();

      // Record heartbeat metric
      performanceMonitor.recordMetric(
        "service-worker-heartbeat",
        this.state.activeRequests.size,
        "count",
      );
    }, this.HEARTBEAT_INTERVAL) as unknown as number;
  }

  /**
   * Stop heartbeat when no active operations
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      logger.debug("ServiceWorker", "Heartbeat stopped");
    }
  }

  /**
   * Handle service worker termination
   * Ensures state is persisted before termination
   */
  async handleTermination(): Promise<void> {
    logger.info("ServiceWorker", "Handling termination...");

    try {
      // Stop heartbeat
      this.stopHeartbeat();

      // Stop performance monitoring
      performanceMonitor.stopMonitoring();

      // Stop quota monitoring
      const quotaManager = getQuotaManager();
      quotaManager.stopMonitoring();

      // Persist final state
      await this.persistState();

      // Log final performance summary
      const summary = performanceMonitor.getSummary();
      logger.info("ServiceWorker", "Performance summary", summary);

      logger.info("ServiceWorker", "Termination handled successfully");
    } catch (error) {
      logger.error("ServiceWorker", "Error during termination", error);
    }
  }

  /**
   * Track active request
   */
  trackRequest(requestId: string, data: any): void {
    this.state.activeRequests.set(requestId, {
      ...data,
      startTime: Date.now(),
    });
    this.state.lastActive = Date.now();

    logger.debug("ServiceWorker", "Request tracked", {
      requestId,
      activeCount: this.state.activeRequests.size,
    });

    performanceMonitor.recordMetric(
      "active-requests",
      this.state.activeRequests.size,
      "count",
    );

    // Ensure heartbeat is running when we have active requests
    if (this.state.activeRequests.size === 1) {
      this.startHeartbeat();
    }
  }

  /**
   * Complete tracked request
   */
  completeRequest(requestId: string): void {
    const request = this.state.activeRequests.get(requestId);
    if (request) {
      const duration = Date.now() - request.startTime;
      performanceMonitor.recordMetric("request-duration", duration, "ms", {
        requestId,
        kind: request.kind,
      });

      logger.debug("ServiceWorker", "Request completed", {
        requestId,
        duration: `${duration}ms`,
      });
    }

    this.state.activeRequests.delete(requestId);
    this.state.lastActive = Date.now();

    performanceMonitor.recordMetric(
      "active-requests",
      this.state.activeRequests.size,
      "count",
    );

    // Stop heartbeat if no active requests (Requirement 13.7)
    if (this.state.activeRequests.size === 0) {
      this.stopHeartbeat();
    }
  }

  /**
   * Get session data
   */
  getSessionData(key: string): any {
    return this.state.sessionData[key];
  }

  /**
   * Set session data
   */
  async setSessionData(key: string, value: any): Promise<void> {
    this.state.sessionData[key] = value;
    await this.persistState();
  }

  /**
   * Check if service worker is initialized
   */
  isInitialized(): boolean {
    return this.state.initialized;
  }

  /**
   * Get last active timestamp
   */
  getLastActive(): number {
    return this.state.lastActive;
  }
}

// Create singleton instance
const lifecycle = new ServiceWorkerLifecycle();

// Install event - first time installation or update
chrome.runtime.onInstalled.addListener(async (details) => {
  logger.info("ServiceWorker", "onInstalled", { reason: details.reason });

  try {
    // Initialize lifecycle
    await lifecycle.initialize();

    // Configure side panel
    await chrome.sidePanel.setOptions({
      path: "src/sidepanel/sidepanel.html",
      enabled: true,
    });

    // Create context menu for "Save to Pocket"
    await createContextMenu();

    // Handle different installation reasons
    if (details.reason === "install") {
      logger.info("ServiceWorker", "First time installation");
      // Set default preferences
      await chrome.storage.sync.set({
        userPreferences: {
          theme: "auto",
          language: "en",
          defaultAIModel: "nano",
          privacyMode: "balanced",
        },
      });
    } else if (details.reason === "update") {
      logger.info("ServiceWorker", "Extension updated", {
        previousVersion: details.previousVersion,
      });
      // Handle migration if needed
    }
  } catch (error) {
    logger.error("ServiceWorker", "Installation error", error);
  }
});

// Startup event - service worker starts/restarts
chrome.runtime.onStartup.addListener(async () => {
  logger.info("ServiceWorker", "onStartup - Browser started");

  try {
    await lifecycle.initialize();
    await createContextMenu();
  } catch (error) {
    logger.error("ServiceWorker", "Startup error", error);
  }
});

// Suspend event - service worker about to be terminated
chrome.runtime.onSuspend.addListener(async () => {
  logger.info("ServiceWorker", "onSuspend - About to terminate");

  try {
    await lifecycle.handleTermination();
  } catch (error) {
    logger.error("ServiceWorker", "Suspend error", error);
  }
});

// Action click - open side panel
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return;

  try {
    await chrome.sidePanel.open({ tabId: tab.id });
    logger.info("ServiceWorker", "Side panel opened", { tabId: tab.id });
  } catch (error) {
    logger.error("ServiceWorker", "Failed to open side panel", error);
  }
});

/**
 * Message Router
 * Handles inter-component communication with request/response pattern
 * Requirements: 14.5, 15.1
 */

import type { MessageKind, BaseMessage } from "../shared/types/index.d.ts";

type MessageHandler<T = any, R = any> = (
  payload: T,
  sender: chrome.runtime.MessageSender,
) => Promise<R>;

type MessageResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
};

class MessageRouter {
  private handlers: Map<MessageKind, MessageHandler> = new Map();

  /**
   * Register a message handler for a specific message kind
   */
  registerHandler<T, R>(
    kind: MessageKind,
    handler: MessageHandler<T, R>,
  ): void {
    if (this.handlers.has(kind)) {
      logger.warn("MessageRouter", `Overwriting handler for ${kind}`);
    }
    this.handlers.set(kind, handler);
    logger.debug("MessageRouter", `Registered handler for ${kind}`);
  }

  /**
   * Unregister a message handler
   */
  unregisterHandler(kind: MessageKind): void {
    this.handlers.delete(kind);
    logger.debug("MessageRouter", `Unregistered handler for ${kind}`);
  }

  /**
   * Validate message structure
   */
  private validateMessage(
    message: any,
  ): message is BaseMessage<MessageKind, any> {
    if (!message || typeof message !== "object") {
      return false;
    }

    if (!message.kind || typeof message.kind !== "string") {
      return false;
    }

    if (!message.payload) {
      return false;
    }

    return true;
  }

  /**
   * Route incoming message to appropriate handler
   */
  async routeMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
  ): Promise<MessageResponse> {
    // Validate message structure
    if (!this.validateMessage(message)) {
      logger.error("MessageRouter", "Invalid message structure", message);
      return {
        success: false,
        error: {
          code: "INVALID_MESSAGE",
          message: "Message must have 'kind' and 'payload' properties",
          details: message,
        },
      };
    }

    const { kind, payload, requestId } = message;

    // Track request if requestId provided
    if (requestId) {
      lifecycle.trackRequest(requestId, { kind, sender });
    }

    try {
      // Find handler for message kind
      const handler = this.handlers.get(kind);

      if (!handler) {
        logger.warn("MessageRouter", `No handler registered for ${kind}`);
        return {
          success: false,
          error: {
            code: "NO_HANDLER",
            message: `No handler registered for message kind: ${kind}`,
          },
        };
      }

      // Execute handler with performance tracking
      logger.debug("MessageRouter", `Routing ${kind}`, { requestId, sender });
      const result = await performanceMonitor.measureAsync(
        `message-handler-${kind}`,
        () => handler(payload, sender),
        { requestId },
      );

      // Complete request tracking
      if (requestId) {
        lifecycle.completeRequest(requestId);
      }

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      logger.error("MessageRouter", `Error handling ${kind}`, error);

      // Complete request tracking on error
      if (requestId) {
        lifecycle.completeRequest(requestId);
      }

      return {
        success: false,
        error: {
          code: "HANDLER_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          details: error,
        },
      };
    }
  }

  /**
   * Send message to content script
   */
  async sendToContentScript<T>(
    tabId: number,
    message: BaseMessage<MessageKind, any>,
  ): Promise<MessageResponse<T>> {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } catch (error) {
      logger.error("MessageRouter", "Failed to send to content script", error);
      return {
        success: false,
        error: {
          code: "SEND_FAILED",
          message:
            error instanceof Error ? error.message : "Failed to send message",
        },
      };
    }
  }

  /**
   * Send message to side panel
   */
  async sendToSidePanel<T>(
    message: BaseMessage<MessageKind, any>,
  ): Promise<MessageResponse<T>> {
    try {
      const response = await chrome.runtime.sendMessage(message);
      return response;
    } catch (error) {
      logger.error("MessageRouter", "Failed to send to side panel", error);
      return {
        success: false,
        error: {
          code: "SEND_FAILED",
          message:
            error instanceof Error ? error.message : "Failed to send message",
        },
      };
    }
  }

  /**
   * Broadcast message to all tabs
   */
  async broadcast(message: BaseMessage<MessageKind, any>): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({});
      const promises = tabs.map((tab) => {
        if (tab.id) {
          return this.sendToContentScript(tab.id, message).catch((error) => {
            logger.debug(
              "MessageRouter",
              `Failed to broadcast to tab ${tab.id}`,
              error,
            );
          });
        }
      });
      await Promise.allSettled(promises);
    } catch (error) {
      logger.error("MessageRouter", "Broadcast failed", error);
    }
  }
}

// Create singleton instance
const messageRouter = new MessageRouter();
registerFsAccessHandlers(messageRouter);

const ariaController = new AriaController();

ariaController.onEvent((detail: AriaControllerEventDetail) => {
  logger.info("AriaController", "Dispatching ARIA event", {
    runId: detail.run.runId,
    type: detail.type,
    status: detail.run.status,
  });

  messageRouter
    .sendToSidePanel({
      kind: "ARIA_EVENT",
      payload: detail,
    } as BaseMessage<MessageKind, AriaControllerEventDetail>)
    .catch((error) => {
      logger.warn("AriaController", "Failed to forward ARIA_EVENT", {
        runId: detail.run.runId,
        error,
      });
    });
});

// Register LOG_BATCH handler for collecting logs from all runtimes
messageRouter.registerHandler("LOG_BATCH", async (payload: LogBatch) => {
  try {
    await logCollector.collectBatch(payload);
    return { success: true };
  } catch (error) {
    logger.error("Handler", "LOG_BATCH error", error);
    return { success: false, error: "Failed to collect log batch" };
  }
});

// Register ARIA research handlers
messageRouter.registerHandler("ARIA_RUN_START", async (payload: any) => {
  logger.info("Handler", "ARIA_RUN_START", payload);

  const config = payload?.config;
  if (!config || typeof config !== "object") {
    return {
      success: false,
      error: "ARIA_RUN_START requires a configuration object",
      reason: "INVALID_CONFIG",
    };
  }

  const result = ariaController.startRun(config);
  if (!result.success) {
    logger.error("Handler", "ARIA_RUN_START failed", {
      error: result.error,
    });
    return {
      success: false,
      error: result.error,
      reason: result.reason,
    };
  }

  return {
    success: true,
    runId: result.run.runId,
    status: result.run.status,
    phase: result.run.phase,
    run: result.run,
    message: result.message,
  };
});

messageRouter.registerHandler("ARIA_RUN_STATUS", async (payload: any) => {
  logger.info("Handler", "ARIA_RUN_STATUS", payload);

  const runId = typeof payload?.runId === "string" ? payload.runId : undefined;
  if (!runId) {
    return {
      success: false,
      error: "ARIA_RUN_STATUS requires a runId",
      reason: "INVALID_CONFIG",
    };
  }

  const result = ariaController.getStatus(runId);
  if (!result.success) {
    return {
      success: false,
      error: result.error,
      reason: result.reason,
    };
  }

  return {
    success: true,
    runId: result.run.runId,
    status: result.run.status,
    phase: result.run.phase,
    run: result.run,
    message: result.message,
  };
});

messageRouter.registerHandler("ARIA_RUN_PAUSE", async (payload: any) => {
  logger.info("Handler", "ARIA_RUN_PAUSE", payload);

  const runId = typeof payload?.runId === "string" ? payload.runId : undefined;
  if (!runId) {
    return {
      success: false,
      error: "ARIA_RUN_PAUSE requires a runId",
      reason: "INVALID_CONFIG",
    };
  }

  const result = ariaController.pauseRun(runId);
  if (!result.success) {
    return {
      success: false,
      error: result.error,
      reason: result.reason,
    };
  }

  return {
    success: true,
    runId: result.run.runId,
    status: result.run.status,
    phase: result.run.phase,
    run: result.run,
    message: result.message,
  };
});

messageRouter.registerHandler("ARIA_RUN_RESUME", async (payload: any) => {
  logger.info("Handler", "ARIA_RUN_RESUME", payload);

  const runId = typeof payload?.runId === "string" ? payload.runId : undefined;
  if (!runId) {
    return {
      success: false,
      error: "ARIA_RUN_RESUME requires a runId",
      reason: "INVALID_CONFIG",
    };
  }

  const result = ariaController.resumeRun(runId);
  if (!result.success) {
    return {
      success: false,
      error: result.error,
      reason: result.reason,
    };
  }

  return {
    success: true,
    runId: result.run.runId,
    status: result.run.status,
    phase: result.run.phase,
    run: result.run,
    message: result.message,
  };
});

messageRouter.registerHandler("ARIA_RUN_CANCEL", async (payload: any) => {
  logger.info("Handler", "ARIA_RUN_CANCEL", payload);

  const runId = typeof payload?.runId === "string" ? payload.runId : undefined;
  if (!runId) {
    return {
      success: false,
      error: "ARIA_RUN_CANCEL requires a runId",
      reason: "INVALID_CONFIG",
    };
  }

  const result = ariaController.cancelRun(runId);
  if (!result.success) {
    return {
      success: false,
      error: result.error,
      reason: result.reason,
    };
  }

  return {
    success: true,
    runId: result.run.runId,
    status: result.run.status,
    phase: result.run.phase,
    run: result.run,
    message: result.message,
  };
});

// ─── Canonical Agent Runtime Handlers (Phase 07-03) ─────────────────────────

const agentRuntimeService = new AgentRuntimeService();

messageRouter.registerHandler(
  "AGENT_RUN_START",
  async (payload: AgentRunStartPayload) => {
    logger.info("Handler", "AGENT_RUN_START", { mode: payload.mode });

    try {
      const run = await agentRuntimeService.startRun({
        mode: payload.mode,
        metadata: payload.metadata,
      });

      // Forward run status to side panel
      messageRouter
        .sendToSidePanel({
          kind: "AGENT_RUN_STATUS",
          payload: { run },
        } as BaseMessage<MessageKind, AgentRunStatusPayload>)
        .catch((error) => {
          logger.warn("Handler", "Failed to forward AGENT_RUN_STATUS", error);
        });

      return {
        success: true,
        runId: run.runId,
        status: run.status,
        run,
      };
    } catch (error) {
      logger.error("Handler", "AGENT_RUN_START error", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

messageRouter.registerHandler(
  "AGENT_RUN_STATUS",
  async (payload: { runId: string }) => {
    logger.info("Handler", "AGENT_RUN_STATUS", { runId: payload.runId });

    try {
      const run = await agentRuntimeService.getRun(payload.runId);
      if (!run) {
        return { success: false, error: `Run not found: ${payload.runId}` };
      }

      return { success: true, run };
    } catch (error) {
      logger.error("Handler", "AGENT_RUN_STATUS error", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

messageRouter.registerHandler(
  "AGENT_RUN_EVENT",
  async (payload: AgentRunEventPayload) => {
    logger.info("Handler", "AGENT_RUN_EVENT", {
      runId: payload.event.runId,
      type: payload.event.type,
    });

    try {
      const run = await agentRuntimeService.applyEvent(payload.event);

      // Forward updated status to side panel
      messageRouter
        .sendToSidePanel({
          kind: "AGENT_RUN_STATUS",
          payload: { run },
        } as BaseMessage<MessageKind, AgentRunStatusPayload>)
        .catch((error) => {
          logger.warn("Handler", "Failed to forward AGENT_RUN_STATUS", error);
        });

      return { success: true, run };
    } catch (error) {
      logger.error("Handler", "AGENT_RUN_EVENT error", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

messageRouter.registerHandler(
  "AGENT_RUN_CONTROL",
  async (payload: AgentRunControlPayload) => {
    logger.info("Handler", "AGENT_RUN_CONTROL", {
      runId: payload.runId,
      action: payload.action,
    });

    try {
      let run;
      switch (payload.action) {
        case "pause":
          run = await agentRuntimeService.pauseRun(payload.runId);
          break;
        case "resume":
          run = await agentRuntimeService.resumeRun(payload.runId);
          break;
        case "cancel":
          run = await agentRuntimeService.cancelRun(payload.runId);
          break;
        default:
          return {
            success: false,
            error: `Unknown action: ${payload.action}`,
          };
      }

      // Forward updated status to side panel
      messageRouter
        .sendToSidePanel({
          kind: "AGENT_RUN_STATUS",
          payload: { run },
        } as BaseMessage<MessageKind, AgentRunStatusPayload>)
        .catch((error) => {
          logger.warn("Handler", "Failed to forward AGENT_RUN_STATUS", error);
        });

      return { success: true, run };
    } catch (error) {
      logger.error("Handler", "AGENT_RUN_CONTROL error", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

// Register content capture handler
messageRouter.registerHandler("CAPTURE_REQUEST", async (payload, sender) => {
  logger.info("Handler", "CAPTURE_REQUEST", payload);

  try {
    const { mode, pocketId, content, metadata } = payload as {
      mode: string;
      pocketId: string;
      content?: any;
      metadata?: any;
    };

    // Validate payload
    if (!mode) {
      throw new Error("Missing required field: mode");
    }

    // For notes, pocketId can be empty string (means no specific pocket)
    if (mode !== "note" && !pocketId) {
      throw new Error("Missing required field: pocketId");
    }

    // Handle direct note creation (from side panel)
    if (mode === "note" && content !== undefined) {
      logger.info("Handler", "Processing direct note creation", {
        hasContentId: !!metadata?.contentId,
        contentLength: content?.length,
        pocketId: pocketId || "(empty)",
      });

      await indexedDBManager.init();

      // Ensure we have a valid pocketId - create default "Notes" pocket if needed
      let targetPocketId = pocketId;
      if (!targetPocketId || targetPocketId === "") {
        logger.info(
          "Handler",
          "No pocketId provided, checking for default Notes pocket",
        );

        // Check if a "Notes" pocket exists
        const pockets = await indexedDBManager.listPockets();
        const notesPocket = pockets.find(
          (p) => p.name === "Notes" || p.name === "My Notes",
        );

        if (!notesPocket) {
          // Create default Notes pocket
          logger.info("Handler", "Creating default Notes pocket");
          targetPocketId = await indexedDBManager.createPocket({
            name: "Notes",
            description: "Default pocket for notes",
            tags: ["notes"],
            color: "#3b82f6",
            contentIds: [],
          });
          logger.info("Handler", "Default Notes pocket created", {
            pocketId: targetPocketId,
          });
        } else {
          targetPocketId = notesPocket.id;
          logger.info("Handler", "Using existing Notes pocket", {
            pocketId: targetPocketId,
          });
        }
      }

      // Check if this is an update (contentId in metadata)
      if (metadata?.contentId) {
        // Update existing note
        logger.info("Handler", "Updating existing note", {
          contentId: metadata.contentId,
        });

        await indexedDBManager.updateContent(metadata.contentId, {
          content: content,
          metadata: {
            title: metadata.title,
            tags: metadata.tags,
            category: metadata.category,
            timestamp: Date.now(),
            updatedAt: Date.now(),
          },
        });

        // Enqueue vector indexing UPDATE job (non-blocking)
        vectorIndexingQueue
          .enqueueContent(metadata.contentId, IndexingOperation.UPDATE)
          .catch((error) => {
            logger.error("Handler", "Failed to enqueue vector update job", {
              contentId: metadata.contentId,
              error,
            });
          });

        // Fetch updated record for ACK/broadcast
        const updatedRecord = await indexedDBManager.getContent(
          metadata.contentId,
        );
        if (updatedRecord) {
          // Broadcast update event so UI refreshes instantly
          await messageRouter.sendToSidePanel({
            kind: "CONTENT_UPDATED",
            payload: { content: updatedRecord },
          } as any);
        }

        logger.info("Handler", "Note updated successfully", {
          contentId: metadata.contentId,
        });

        return {
          status: "success",
          contentId: metadata.contentId,
          type: "note",
          content: updatedRecord,
          preview: (content || "").substring(0, 100),
        };
      } else {
        // Create new note
        logger.info("Handler", "Creating new note", {
          pocketId: targetPocketId,
        });

        const processed = await contentProcessor.processContent({
          pocketId: targetPocketId,
          mode: "note",
          content: { text: content, type: "note" },
          metadata: {
            title: metadata?.title || "Untitled Note",
            tags: metadata?.tags,
            category: metadata?.category,
            domain: "",
          },
          sourceUrl: "",
          sanitize: false,
        });

        // Fetch created record for ACK/broadcast
        const createdRecord = await indexedDBManager.getContent(
          processed.contentId,
        );
        if (createdRecord) {
          await messageRouter.sendToSidePanel({
            kind: "CONTENT_CREATED",
            payload: { content: createdRecord },
          } as any);
        }

        logger.info("Handler", "Note created successfully", {
          contentId: processed.contentId,
          type: processed.type,
          pocketId: targetPocketId,
        });

        return {
          status: "success",
          contentId: processed.contentId,
          type: processed.type,
          content: createdRecord,
          preview: processed.preview,
        };
      }
    }

    // Handle content script-based captures (full-page, selection, element)
    const tabId = sender.tab?.id;
    if (!tabId) {
      throw new Error("No active tab found for content capture");
    }

    // Send capture request to content script
    const response = await messageRouter.sendToContentScript<any>(tabId, {
      kind: "CAPTURE_REQUEST",
      payload: { mode, pocketId },
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || "Content capture failed");
    }

    const captureResult = (response.data as any).result;

    // Process and store the captured content

    // Use enhanced processing for full-page captures
    const processed =
      captureResult.mode === "full-page"
        ? await contentProcessor.processFullPageCapture({
            pocketId,
            mode: captureResult.mode,
            content: captureResult.content,
            metadata: captureResult.metadata,
            sourceUrl: sender.tab?.url || "",
            sanitize: true,
          })
        : await contentProcessor.processContent({
            pocketId,
            mode: captureResult.mode,
            content: captureResult.content,
            metadata: captureResult.metadata,
            sourceUrl: sender.tab?.url || "",
            sanitize: true,
          });

    // Fetch created record and broadcast event for UI live updates
    try {
      const createdRecord = await indexedDBManager.getContent(
        processed.contentId,
      );
      if (createdRecord) {
        logger.info("Handler", "Broadcasting CONTENT_CREATED event", {
          contentId: createdRecord.id,
          pocketId: createdRecord.pocketId,
        });

        const broadcastResult = await messageRouter.sendToSidePanel({
          kind: "CONTENT_CREATED",
          payload: { content: createdRecord },
        } as any);

        logger.info("Handler", "Broadcast result", broadcastResult);
      } else {
        logger.warn("Handler", "Created record not found", {
          contentId: processed.contentId,
        });
      }
    } catch (e) {
      logger.error("Handler", "Failed to broadcast content created event", e);
    }

    logger.info("Handler", "CAPTURE_REQUEST completed", {
      contentId: processed.contentId,
      type: processed.type,
      status: processed.status,
    });

    return {
      status: "success",
      contentId: processed.contentId,
      type: processed.type,
      preview: processed.preview,
    };
  } catch (error) {
    logger.error("Handler", "CAPTURE_REQUEST error", error);
    throw error;
  }
});

// Register file upload handler
messageRouter.registerHandler("FILE_UPLOAD", async (payload, sender) => {
  const { pocketId, fileName, fileType, fileSize, fileData } = payload as {
    pocketId: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    fileData: string;
  };

  logger.info("Handler", "FILE_UPLOAD", {
    fileName,
    fileType,
    fileSize,
  });

  try {
    // Validate payload
    if (!pocketId || !fileName || !fileData) {
      throw new Error("Missing required fields for file upload");
    }

    await indexedDBManager.init();

    // Determine file extension and type
    const fileExtension = fileName.split(".").pop()?.toLowerCase() || "";
    const contentType =
      fileExtension === "pdf"
        ? "pdf"
        : ["doc", "docx"].includes(fileExtension)
          ? "document"
          : ["xls", "xlsx"].includes(fileExtension)
            ? "spreadsheet"
            : ["txt", "md"].includes(fileExtension)
              ? "text"
              : "file";

    // Create content record for the file
    const processed = await contentProcessor.processContent({
      pocketId,
      mode: "file",
      content: {
        fileData,
        fileName,
        fileType,
        fileSize,
        fileExtension,
      },
      metadata: {
        title: fileName,
        domain: "local-file",
        fileType,
        fileSize,
        fileExtension,
      },
      sourceUrl: "",
      sanitize: false,
    });

    // Fetch created record and broadcast event
    const createdRecord = await indexedDBManager.getContent(
      processed.contentId,
    );
    if (createdRecord) {
      logger.info("Handler", "Broadcasting FILE_UPLOAD CONTENT_CREATED event", {
        contentId: createdRecord.id,
        pocketId: createdRecord.pocketId,
      });

      await messageRouter.sendToSidePanel({
        kind: "CONTENT_CREATED",
        payload: { content: createdRecord },
      } as any);
    }

    logger.info("Handler", "FILE_UPLOAD completed", {
      contentId: processed.contentId,
      fileName,
    });

    return {
      status: "success",
      contentId: processed.contentId,
      type: contentType,
      preview: fileName,
    };
  } catch (error) {
    logger.error("Handler", "FILE_UPLOAD error", error);
    throw error;
  }
});

// Register screenshot capture handler
messageRouter.registerHandler("CAPTURE_SCREENSHOT", async (payload, sender) => {
  logger.info("Handler", "CAPTURE_SCREENSHOT", { sender: sender?.tab?.id });

  try {
    // Get the active tab
    const tab = sender?.tab;
    if (!tab || !tab.id) {
      throw new Error("No active tab found");
    }

    // Capture visible tab
    const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });

    logger.info("Handler", "Screenshot captured successfully", {
      tabId: tab.id,
      dataLength: screenshot.length,
    });

    return { success: true, screenshot };
  } catch (error) {
    logger.error("Handler", "CAPTURE_SCREENSHOT error", error);
    return { success: false, screenshot: null, error: String(error) };
  }
});

messageRouter.registerHandler(
  "VISION_CAPTURE_FOR_ANALYSIS",
  async (payload: any, sender) => {
    logger.info("Handler", "VISION_CAPTURE_FOR_ANALYSIS", {
      senderTabId: sender?.tab?.id,
    });

    if (!visionManager || !(await visionManager.isAvailable())) {
      return {
        success: false,
        error:
          "Vision feature is disabled or missing configuration. Provide a valid Gemini API key and enable vision in settings.",
      };
    }

    const requestedTabId =
      typeof payload?.tabId === "number" ? payload.tabId : sender?.tab?.id;

    if (!requestedTabId) {
      return {
        success: false,
        error: "No tab context provided for vision capture",
      };
    }

    try {
      const capture = await visionManager.captureForVision({
        tabId: requestedTabId,
        format: payload?.format,
        quality: payload?.quality,
        annotateElements: payload?.annotateElements ?? false,
        includeMappings: true,
      });

      return {
        success: true,
        dataUrl: capture.dataUrl,
        format: capture.format,
        width: capture.width,
        height: capture.height,
        timestamp: capture.timestamp,
        tabId: capture.tabId,
        tabUrl: capture.tabUrl,
        devicePixelRatio: capture.devicePixelRatio,
        elementMappings: capture.elementMappings,
      };
    } catch (error) {
      logger.error("Handler", "VISION_CAPTURE_FOR_ANALYSIS error", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

messageRouter.registerHandler(
  "VISION_ANALYZE_SCREENSHOT",
  async (payload: any, sender) => {
    logger.info("Handler", "VISION_ANALYZE_SCREENSHOT", {
      senderTabId: sender?.tab?.id,
    });

    if (!visionManager || !(await visionManager.isAvailable())) {
      return {
        success: false,
        error:
          "Vision feature is disabled or missing configuration. Provide a valid Gemini API key and enable vision in settings.",
      };
    }

    if (!payload?.screenshot || !payload?.prompt) {
      return {
        success: false,
        error: "VISION_ANALYZE_SCREENSHOT requires screenshot and prompt",
      };
    }

    const screenshotInput = normalizeScreenshotInput(payload.screenshot);

    try {
      const analysisOptions: Parameters<
        typeof visionManager.analyzeScreenshot
      >[1] = {
        prompt: payload.prompt,
        model: payload.model,
        useCache: payload.useCache,
        maxTokens: payload.maxTokens,
        temperature: payload.temperature,
      };

      if (sender?.tab?.url) {
        analysisOptions.tabUrl = sender.tab.url;
      }

      const result = await visionManager.analyzeScreenshot(
        screenshotInput,
        analysisOptions,
      );

      return {
        success: true,
        result,
      };
    } catch (error) {
      logger.error("Handler", "VISION_ANALYZE_SCREENSHOT error", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

messageRouter.registerHandler(
  "VISION_DETECT_PAGE_STATE",
  async (payload: any, sender) => {
    logger.info("Handler", "VISION_DETECT_PAGE_STATE", {
      senderTabId: sender?.tab?.id,
    });

    if (!visionManager || !(await visionManager.isAvailable())) {
      return {
        success: false,
        error:
          "Vision feature is disabled or missing configuration. Provide a valid Gemini API key and enable vision in settings.",
      };
    }

    if (!payload?.screenshot) {
      return {
        success: false,
        error: "VISION_DETECT_PAGE_STATE requires a screenshot",
      };
    }

    let screenshotInput: string | CaptureResult;
    try {
      screenshotInput = normalizeScreenshotInput(payload.screenshot);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    try {
      const result = await visionManager.detectPageState(screenshotInput);

      if (result.requiresHumanIntervention) {
        logger.warn(
          "Handler",
          "Vision detection flagged human escalation",
          result,
        );
      }

      return {
        success: true,
        result,
      };
    } catch (error) {
      logger.error("Handler", "VISION_DETECT_PAGE_STATE error", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

messageRouter.registerHandler(
  "VISION_FIND_ELEMENT",
  async (payload: any, sender) => {
    logger.info("Handler", "VISION_FIND_ELEMENT", {
      senderTabId: sender?.tab?.id,
    });

    if (!visionManager || !(await visionManager.isAvailable())) {
      return {
        success: false,
        error:
          "Vision feature is disabled or missing configuration. Provide a valid Gemini API key and enable vision in settings.",
      };
    }

    if (!payload?.screenshot || !payload?.description) {
      return {
        success: false,
        error: "VISION_FIND_ELEMENT requires screenshot and description",
      };
    }

    let captureResult: CaptureResult;
    try {
      captureResult = toCaptureResult(payload.screenshot);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    try {
      const result = await visionManager.findElementByDescription(
        captureResult,
        payload.description,
      );

      return {
        success: true,
        result,
      };
    } catch (error) {
      logger.error("Handler", "VISION_FIND_ELEMENT error", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

messageRouter.registerHandler("VISION_GET_USAGE_STATS", async () => {
  if (!visionManager) {
    return {
      success: false,
      error: "Vision manager not initialized",
    };
  }

  const stats = visionManager.getUsageStats();
  return {
    success: true,
    stats,
  };
});

messageRouter.registerHandler(
  "AI_PROCESS_REQUEST",
  async (
    payload: AiProcessRequestPayload,
  ): Promise<AiProcessResponsePayload> => {
    logger.info("Handler", "AI_PROCESS_REQUEST", payload);

    try {
      const { prompt, task, preferLocal, style, originalText } = payload;

      if (task === "enhance") {
        logger.info("Handler", "Processing text enhancement", {
          style,
          textLength: originalText?.length,
        });

        const availability = await aiManager.checkModelAvailability();

        if (availability === "no" && preferLocal) {
          throw new Error(
            "Gemini Nano is not available on this device. Please enable on-device AI in Chrome settings.",
          );
        }

        let sessionId: string;
        const activeSessions = aiManager.getActiveSessions();

        if (activeSessions.length > 0) {
          sessionId = activeSessions[0]!;
          logger.debug("Handler", "Reusing existing AI session", { sessionId });
        } else {
          sessionId = await aiManager.initializeGeminiNano({
            temperature: 0.7,
          });
          logger.info("Handler", "Created new AI session", { sessionId });
        }

        const startTime = performance.now();
        const enhancedText = await aiManager.processPrompt(sessionId, prompt, {
          operation: "enhance" as any,
        });
        const processingTime = performance.now() - startTime;

        logger.info("Handler", "Enhancement completed", {
          processingTime: `${processingTime.toFixed(2)}ms`,
          originalLength: originalText?.length,
          enhancedLength: enhancedText.length,
        });

        const usage = aiManager.getSessionUsage(sessionId);
        logger.debug("Handler", "Token usage", usage);

        return {
          enhancedText,
          processingTime,
          tokensUsed: usage.used,
          source: "gemini-nano",
        };
      }

      logger.warn("Handler", "Unsupported AI task type", { task });
      return { status: "processing", taskId: crypto.randomUUID() };
    } catch (error) {
      logger.error("Handler", "AI_PROCESS_REQUEST error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "AUDIO_TRANSCRIBE_REQUEST",
  async (
    payload: AudioTranscribeRequestPayload,
  ): Promise<AudioTranscribeResponsePayload> => {
    logger.info("Handler", "AUDIO_TRANSCRIBE_REQUEST", {
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      durationMs: payload.durationMs,
      sourceUrl: payload.sourceUrl,
    });

    try {
      const audioBlob = decodeBase64ToBlob(
        payload.audioBase64,
        payload.mimeType,
      );
      const result = await transcriptionExecutor.transcribeAudio({
        audio: audioBlob,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
      });

      return {
        success: true,
        text: result.text,
        providerId: result.providerId,
        modelId: result.modelId,
        language: result.language,
        ...(result.segments && { segments: result.segments }),
        ...(result.words && { words: result.words }),
      };
    } catch (error) {
      logger.error("Handler", "AUDIO_TRANSCRIBE_REQUEST error", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

messageRouter.registerHandler("AI_FORMAT_REQUEST", async (payload: any) => {
  const { content, instructions, preferLocal } = payload as {
    content?: unknown;
    instructions?: string;
    preferLocal?: boolean;
  };

  logger.info("Handler", "AI_FORMAT_REQUEST", {
    hasContent: typeof content === "string" && content.length > 0,
    length: typeof content === "string" ? content.length : 0,
  });

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Content is required for formatting");
  }

  const userInstructions =
    instructions && instructions.trim().length > 0
      ? instructions.trim()
      : "Improve the formatting of the provided markdown note. Ensure headings, lists, and code blocks are well structured. Fix indentation and whitespace issues. Preserve the original meaning and return valid markdown only.";

  const preferLocalProcessing = preferLocal !== false;
  let formattedContent: string | null = null;
  let usedAI = false;
  let sessionId: string | null = null;

  if (preferLocalProcessing) {
    try {
      const availability = await aiManager.checkModelAvailability();
      if (availability !== "no") {
        sessionId = await aiManager.initializeGeminiNano({
          temperature: 0.2,
          topK: 32,
          initialPrompts: [
            {
              role: "system",
              content:
                "You are a meticulous markdown editor. Format notes to be clean, readable, and consistent. Preserve all semantic meaning, code blocks, and lists. Output valid markdown only without additional commentary, and do not wrap the entire response inside a fenced code block.",
            },
          ],
        });

        const prompt = `Instructions:\n${userInstructions}\n\n---\nORIGINAL MARKDOWN:\n${content}\n---\n\nReturn the reformatted markdown with improved structure and readability. Do not enclose the entire response in a single markdown code block.`;

        const aiResult = await aiManager.processPrompt(sessionId, prompt);
        let trimmed = aiResult.trim();

        const fencedMarkdownMatch = trimmed.match(
          /^```(?:markdown)?\s*\n([\s\S]*?)```$/i,
        );
        if (fencedMarkdownMatch && typeof fencedMarkdownMatch[1] === "string") {
          trimmed = fencedMarkdownMatch[1].trimEnd();
        }

        if (trimmed.length > 0) {
          formattedContent = trimmed;
          usedAI = true;
        }
      }
    } catch (error) {
      logger.warn(
        "Handler",
        "AI_FORMAT_REQUEST local formatting failed",
        error,
      );
    } finally {
      if (sessionId) {
        aiManager.destroySession(sessionId);
      }
    }
  }

  const basicFormat = (text: string) =>
    text
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  if (!formattedContent || formattedContent.length === 0) {
    formattedContent = basicFormat(content);
  }

  // Ensure we never return empty content
  if (!formattedContent || formattedContent.length === 0) {
    formattedContent = content;
  }

  return {
    formattedContent,
    usedAI,
  };
});

messageRouter.registerHandler("POCKET_CREATE", async (payload: any) => {
  logger.info("Handler", "POCKET_CREATE", payload);
  try {
    await indexedDBManager.init();
    const pocketId = await indexedDBManager.createPocket(payload);
    const pocket = await indexedDBManager.getPocket(pocketId);
    logger.info("Handler", "POCKET_CREATE success", { pocketId });
    return { pocket };
  } catch (error) {
    logger.error("Handler", "POCKET_CREATE error", error);
    throw error;
  }
});

messageRouter.registerHandler("POCKET_UPDATE", async (payload: any) => {
  logger.info("Handler", "POCKET_UPDATE", payload);
  try {
    await indexedDBManager.init();
    await indexedDBManager.updatePocket(payload.id, payload.updates);
    const pocket = await indexedDBManager.getPocket(payload.id);
    logger.info("Handler", "POCKET_UPDATE success", { id: payload.id });
    return { pocket };
  } catch (error) {
    logger.error("Handler", "POCKET_UPDATE error", error);
    throw error;
  }
});

messageRouter.registerHandler("POCKET_GET", async (payload: any) => {
  logger.info("Handler", "POCKET_GET", payload);
  try {
    await indexedDBManager.init();
    const pocket = await indexedDBManager.getPocket(payload.pocketId);
    logger.info("Handler", "POCKET_GET success", {
      pocketId: payload.pocketId,
    });
    return { pocket };
  } catch (error) {
    logger.error("Handler", "POCKET_GET error", error);
    throw error;
  }
});

messageRouter.registerHandler("POCKET_LIST", async (payload) => {
  logger.info("Handler", "POCKET_LIST", payload);
  try {
    await indexedDBManager.init();
    const pockets = await indexedDBManager.listPockets();
    logger.info("Handler", "POCKET_LIST success", { count: pockets.length });
    return { pockets };
  } catch (error) {
    logger.error("Handler", "POCKET_LIST error", error);
    throw error;
  }
});

messageRouter.registerHandler("POCKET_DELETE", async (payload: any) => {
  logger.info("Handler", "POCKET_DELETE", payload);
  try {
    await indexedDBManager.init();
    await indexedDBManager.deletePocket(payload.id);
    logger.info("Handler", "POCKET_DELETE success", { id: payload.id });
    return { success: true };
  } catch (error) {
    logger.error("Handler", "POCKET_DELETE error", error);
    throw error;
  }
});

messageRouter.registerHandler(
  "POCKET_SELECTION_RESPONSE",
  async (payload: any) => {
    const { requestId, status, pocketId, editedTitle, error } = payload as {
      requestId: string;
      status: "success" | "cancelled" | "error";
      pocketId?: string;
      editedTitle?: string;
      error?: string;
    };

    logger.info("Handler", "POCKET_SELECTION_RESPONSE", {
      requestId,
      status,
      editedTitle,
    });

    const pending = pocketSelectionRequests.get(requestId);
    if (!pending) {
      logger.warn("Handler", "No pending pocket selection request", {
        requestId,
        status,
      });
      return { acknowledged: false };
    }

    if (status === "success" && pocketId) {
      pending.resolve({ pocketId, editedTitle });
    } else if (status === "cancelled") {
      pending.reject(new Error("POCKET_SELECTION_CANCELLED"));
    } else {
      pending.reject(new Error(error || "Pocket selection failed"));
    }

    return { acknowledged: true };
  },
);

// Register content handlers (Requirement 2.6, 7.6)
messageRouter.registerHandler("CONTENT_GET", async (payload: any) => {
  logger.info("Handler", "CONTENT_GET", payload);
  try {
    await indexedDBManager.init();
    const content = await indexedDBManager.getContent(payload.contentId);
    logger.info("Handler", "CONTENT_GET result", {
      contentId: payload.contentId,
      found: !!content,
    });
    return { content };
  } catch (error) {
    logger.error("Handler", "CONTENT_GET error", error);
    throw error;
  }
});

// Register search handlers (Requirement 7.2, 7.3)
messageRouter.registerHandler("POCKET_SEARCH", async (payload: any) => {
  logger.info("Handler", "POCKET_SEARCH", payload);
  try {
    const results = await vectorSearchService.searchPockets(
      payload.query,
      payload.limit || 10,
    );
    logger.info("Handler", "POCKET_SEARCH result", {
      query: payload.query,
      count: results.length,
    });
    return { results };
  } catch (error) {
    logger.error("Handler", "POCKET_SEARCH error", error);
    throw error;
  }
});

messageRouter.registerHandler("CONTENT_SEARCH", async (payload: any) => {
  logger.info("Handler", "CONTENT_SEARCH", payload);
  try {
    const results = await vectorSearchService.searchContent(
      payload.query,
      payload.pocketId,
      payload.limit || 20,
    );
    logger.info("Handler", "CONTENT_SEARCH result", {
      query: payload.query,
      pocketId: payload.pocketId,
      count: results.length,
    });
    return { results };
  } catch (error) {
    logger.error("Handler", "CONTENT_SEARCH error", error);
    throw error;
  }
});

messageRouter.registerHandler("GENERATE_REPORT", async (payload: any) => {
  logger.info("Handler", "GENERATE_REPORT", payload);

  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY ?? undefined;

    const normalizedPocketId =
      typeof payload?.pocketId === "string" &&
      payload.pocketId.trim().length > 0
        ? payload.pocketId.trim()
        : undefined;

    const reportGenerator = new PocketReportGenerator(apiKey);
    const reportData = await reportGenerator.generateReport(normalizedPocketId);

    logger.info("Handler", "GENERATE_REPORT success", {
      pocketId: normalizedPocketId ?? "all",
      totalItems: reportData.metadata?.totalItems ?? 0,
    });

    return reportData;
  } catch (error) {
    logger.error("Handler", "GENERATE_REPORT error", error);

    throw error instanceof Error ? error : new Error(String(error));
  }
});

messageRouter.registerHandler("CONTENT_DELETE", async (payload: any) => {
  logger.info("Handler", "CONTENT_DELETE", payload);
  try {
    // Use contentProcessor.deleteContent to handle deletion and vector indexing
    await contentProcessor.deleteContent(payload.contentId);

    // Broadcast deletion so UI can update instantly
    try {
      await messageRouter.sendToSidePanel({
        kind: "CONTENT_DELETED",
        payload: { contentId: payload.contentId },
      } as any);
    } catch (broadcastError) {
      logger.warn("Handler", "Failed to broadcast content deletion", {
        contentId: payload.contentId,
        error: broadcastError,
      });
    }

    return { success: true };
  } catch (error) {
    logger.error("Handler", "CONTENT_DELETE failed", {
      contentId: payload.contentId,
      error,
    });
    return { success: false, error: (error as Error).message };
  }
});

messageRouter.registerHandler("VECTOR_INDEXING_RETRY", async (payload: any) => {
  try {
    const { contentId } = payload as { contentId: string };
    if (!contentId) {
      throw new Error("Missing required field: contentId");
    }

    await indexedDBManager.init();
    const content = await indexedDBManager.getContent(contentId);
    if (!content) {
      throw new Error(`Content not found: ${contentId}`);
    }

    await vectorIndexingQueue.enqueueContent(
      contentId,
      IndexingOperation.UPDATE,
      "high",
    );

    logger.info("Handler", "VECTOR_INDEXING_RETRY enqueued", { contentId });
    return { enqueued: true };
  } catch (error) {
    logger.error("Handler", "VECTOR_INDEXING_RETRY error", error);
    throw error;
  }
});

// Register content list handler
messageRouter.registerHandler("CONTENT_LIST", async (payload) => {
  logger.info("Handler", "CONTENT_LIST", payload);

  try {
    const { pocketId } = payload as { pocketId: string };

    if (!pocketId) {
      throw new Error("Missing required field: pocketId");
    }

    await indexedDBManager.init();
    const contents = await indexedDBManager.getContentByPocket(pocketId);

    logger.info("Handler", "CONTENT_LIST success", {
      pocketId,
      count: contents.length,
    });

    return { content: contents };
  } catch (error) {
    logger.error("Handler", "CONTENT_LIST error", error);
    throw error;
  }
});

// Provider settings handlers (Phase 04)

const settingsManager = new SettingsManager();
const transcriptionExecutor = new TranscriptionExecutor(settingsManager);

messageRouter.registerHandler(
  "PROVIDER_SETTINGS_LOAD",
  async (payload: ProviderSettingsLoadPayload) => {
    logger.info("Handler", "PROVIDER_SETTINGS_LOAD");
    try {
      const configManager = getProviderConfigManager();
      if (!configManager.isInitialized()) {
        await configManager.initialize();
      }
      const providers = await configManager.listProviders();
      const { providerType } = payload;
      const filtered = providerType
        ? providers.filter((provider: any) => provider.type === providerType)
        : providers;
      return { providers: filtered };
    } catch (error) {
      logger.error("Handler", "PROVIDER_SETTINGS_LOAD error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "PROVIDER_SETTINGS_SAVE",
  async (payload: ProviderSettingsSavePayload) => {
    logger.info("Handler", "PROVIDER_SETTINGS_SAVE");
    try {
      const configManager = getProviderConfigManager();
      if (!configManager.isInitialized()) {
        await configManager.initialize();
      }
      const {
        providerId,
        type,
        name,
        apiKey,
        enabled,
        baseUrl,
        endpointMode,
        modelId,
      } = payload;

      if (providerId) {
        const updates: any = {
          enabled: enabled ?? true,
        };
        if (name !== undefined) updates.name = name;
        if (baseUrl !== undefined) updates.baseUrl = baseUrl;
        if (endpointMode !== undefined) updates.endpointMode = endpointMode;
        if (modelId !== undefined) updates.modelId = modelId;

        const updated = await configManager.updateProvider(providerId, updates);
        if (apiKey) {
          await configManager.setProviderApiKey(providerId, apiKey);
        }
        return { provider: updated };
      }

      const addPayload: {
        type: any;
        name: string;
        apiKey?: string;
        enabled: boolean;
        baseUrl?: string;
        endpointMode?: any;
        modelId?: string;
      } = {
        type: type as any,
        name: name ?? "New Provider",
        enabled: enabled ?? true,
      };

      if (baseUrl !== undefined) {
        addPayload.baseUrl = baseUrl;
      }
      if (endpointMode !== undefined) {
        addPayload.endpointMode = endpointMode as any;
      }
      if (modelId !== undefined) {
        addPayload.modelId = modelId;
      }

      if (apiKey) {
        addPayload.apiKey = apiKey;
      }

      const provider = await configManager.addProvider(addPayload);
      return { provider };
    } catch (error) {
      logger.error("Handler", "PROVIDER_SETTINGS_SAVE error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "PROVIDER_SETTINGS_ADD_MODEL",
  async (payload: { providerId: string; modelId: string; name?: string }) => {
    logger.info("Handler", "PROVIDER_SETTINGS_ADD_MODEL");
    try {
      const configManager = getProviderConfigManager();
      if (!configManager.isInitialized()) {
        await configManager.initialize();
      }

      const provider = await configManager.getProvider(payload.providerId);
      if (!provider) {
        throw new Error(`Provider ${payload.providerId} not found`);
      }

      const trimmedModelId = payload.modelId.trim();
      if (!trimmedModelId) {
        throw new Error("Model ID is required");
      }

      await settingsManager.addModel(provider.id, {
        modelId: trimmedModelId,
        providerType: provider.type,
        name: payload.name?.trim() || trimmedModelId,
      });

      const updatedProvider = await configManager.updateProvider(provider.id, {
        modelId: trimmedModelId,
      });

      return {
        provider: updatedProvider,
        modelSheet: await settingsManager.getModelSheet(),
      };
    } catch (error) {
      logger.error("Handler", "PROVIDER_SETTINGS_ADD_MODEL error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "PROVIDER_SETTINGS_REMOVE_MODEL",
  async (payload: { providerId: string; modelId: string }) => {
    logger.info("Handler", "PROVIDER_SETTINGS_REMOVE_MODEL");
    try {
      await settingsManager.removeModel(payload.modelId);
      return { success: true };
    } catch (error) {
      logger.error("Handler", "PROVIDER_SETTINGS_REMOVE_MODEL error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "PROVIDER_SETTINGS_DELETE_KEY",
  async (payload: { providerId: string }) => {
    logger.info("Handler", "PROVIDER_SETTINGS_DELETE_KEY");
    try {
      const configManager = getProviderConfigManager();
      if (!configManager.isInitialized()) {
        await configManager.initialize();
      }
      await configManager.updateProvider(payload.providerId, { apiKey: null });
      return { success: true };
    } catch (error) {
      logger.error("Handler", "PROVIDER_SETTINGS_DELETE_KEY error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "PROVIDER_SETTINGS_RETEST",
  async (payload: { providerId: string }) => {
    logger.info("Handler", "PROVIDER_SETTINGS_RETEST");
    try {
      const configManager = getProviderConfigManager();
      if (!configManager.isInitialized()) {
        await configManager.initialize();
      }
      const provider = await configManager.getProvider(payload.providerId);
      if (!provider) {
        return { valid: false, error: "Provider not found" };
      }

      const apiKey = await configManager.getDecryptedApiKey(provider.id);

      // Attempt to validate by fetching models list
      let url = "";
      if (provider.baseUrl) {
        url = `${provider.baseUrl.replace(/\/$/, "")}/models`;
      } else if (provider.type === "anthropic") {
        url = "https://api.anthropic.com/v1/models";
      } else if (provider.type === "openai") {
        url = "https://api.openai.com/v1/models";
      } else if (provider.type === "google") {
        url = "https://generativelanguage.googleapis.com/v1beta/models";
      } else {
        url = "https://api.openai.com/v1/models";
      }

      const headers: Record<string, string> = {};
      if (apiKey) {
        if (provider.type === "anthropic") {
          headers["x-api-key"] = apiKey;
          headers["anthropic-version"] = "2023-06-01";
        } else {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }
      }

      const response = await fetch(url, { headers });
      if (response.ok) {
        const data = await response.json();
        const count = data.data?.length || 0;
        return { valid: true, modelsAvailable: count };
      } else {
        return {
          valid: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }
    } catch (error) {
      logger.error("Handler", "PROVIDER_SETTINGS_RETEST error", error);
      return { valid: false, error: "Network error or invalid endpoint" };
    }
  },
);

messageRouter.registerHandler(
  "PROVIDER_SETTINGS_VALIDATE_ENDPOINT",
  async (payload: any) => {
    logger.info("Handler", "PROVIDER_SETTINGS_VALIDATE_ENDPOINT");
    try {
      const { baseUrl, providerType, apiKey } = payload as {
        baseUrl: string;
        providerType: string;
        apiKey?: string;
      };

      // Basic URL validation
      try {
        new URL(baseUrl);
      } catch {
        return { valid: false, error: "Invalid URL format" };
      }

      // Attempt to validate by fetching models list
      const { MODEL_LIST_ENDPOINTS } = await import(
        "./routing/model-catalog.js"
      );
      const endpoint = MODEL_LIST_ENDPOINTS[providerType];
      if (!endpoint) {
        // No API endpoint for this provider type, just validate URL shape
        return { valid: true, modelsAvailable: 0 };
      }

      const url = endpoint.url(baseUrl);
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return {
          valid: false,
          error: `Endpoint returned status ${response.status}`,
        };
      }

      const json = await response.json();
      const models = endpoint.extractModels(json);
      return { valid: true, modelsAvailable: models.length };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Validation failed";
      return { valid: false, error: message };
    }
  },
);

// Speech settings handlers (Phase 04)

messageRouter.registerHandler(
  "SPEECH_SETTINGS_LOAD",
  async (payload: SpeechSettingsLoadPayload) => {
    logger.info("Handler", "SPEECH_SETTINGS_LOAD");
    try {
      void payload;
      const settings = await settingsManager.getSpeechSettings();
      return { settings };
    } catch (error) {
      logger.error("Handler", "SPEECH_SETTINGS_LOAD error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "SPEECH_SETTINGS_SAVE",
  async (payload: SpeechSettingsSavePayload) => {
    logger.info("Handler", "SPEECH_SETTINGS_SAVE");
    try {
      await settingsManager.setSpeechSettings(payload);
      const settings = await settingsManager.getSpeechSettings();
      return { settings };
    } catch (error) {
      logger.error("Handler", "SPEECH_SETTINGS_SAVE error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "SETTINGS_ROUTING_LOAD",
  async (payload: SettingsRoutingLoadPayload) => {
    logger.info("Handler", "SETTINGS_ROUTING_LOAD");
    try {
      const routingPreferences = await settingsManager.getRoutingPreferences();
      const modelSheet = await settingsManager.getModelSheet();
      return { routingPreferences, modelSheet };
    } catch (error) {
      logger.error("Handler", "SETTINGS_ROUTING_LOAD error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "SETTINGS_ROUTING_SAVE",
  async (payload: SettingsRoutingSavePayload) => {
    logger.info("Handler", "SETTINGS_ROUTING_SAVE");
    try {
      if (payload.routingPreferences) {
        await settingsManager.updateRoutingPreferences(
          payload.routingPreferences,
        );
      }
      if (payload.modelSheet) {
        await settingsManager.updateModelSheet(
          payload.modelSheet as Record<string, any>,
        );
      }
      return { success: true };
    } catch (error) {
      logger.error("Handler", "SETTINGS_ROUTING_SAVE error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler("SETTINGS_SNAPSHOT_LOAD", async () => {
  logger.info("Handler", "SETTINGS_SNAPSHOT_LOAD");
  try {
    const configManager = getProviderConfigManager();
    if (!configManager.isInitialized()) {
      await configManager.initialize();
    }

    await ensureGeminiNanoProvider(configManager);

    const [providers, initialModelSheet, routingPreferences, speechSettings] =
      await Promise.all([
        configManager.listProviders(),
        settingsManager.getModelSheet(),
        settingsManager.getRoutingPreferences(),
        settingsManager.getSpeechSettings(),
      ]);

    let modelSheet = initialModelSheet;
    const sanitizedModelSheet = sanitizeModelSheet(modelSheet, providers);
    if (sanitizedModelSheet.changed) {
      modelSheet = sanitizedModelSheet.sheet;
      await settingsManager.updateModelSheet(modelSheet);
    }

    const providersMissingModels = providers.some((provider) => {
      if (!provider.enabled) {
        return false;
      }

      const canDiscoverModels =
        provider.type === "gemini-nano" ||
        !!provider.apiKeyId ||
        provider.apiKeyRequired === false;

      if (!canDiscoverModels) {
        return false;
      }

      return !Object.values(modelSheet).some(
        (entry) => entry.providerId === provider.id,
      );
    });

    if (providersMissingModels) {
      try {
        modelSheet = await settingsManager.refreshModelCatalog();
      } catch (error) {
        logger.warn(
          "Handler",
          "SETTINGS_SNAPSHOT_LOAD catalog refresh failed",
          error,
        );
      }
    }

    let addedManualModel = false;
    for (const provider of providers) {
      if (!provider.modelId) {
        continue;
      }

      const hasPersistedModel = Object.values(modelSheet).some(
        (entry) =>
          entry.providerId === provider.id && entry.modelId === provider.modelId,
      );

      if (hasPersistedModel) {
        continue;
      }

      await settingsManager.addModel(provider.id, {
        modelId: provider.modelId,
        providerType: provider.type,
      });
      addedManualModel = true;
    }

    if (addedManualModel) {
      modelSheet = await settingsManager.getModelSheet();
    }

    return {
      providers,
      modelSheet,
      routingPreferences,
      speechSettings,
    };
  } catch (error) {
    logger.error("Handler", "SETTINGS_SNAPSHOT_LOAD error", error);
    throw error;
  }
});

messageRouter.registerHandler("ERROR", async (payload) => {
  logger.error("Handler", "ERROR", payload);
  // Log error for debugging
  return { acknowledged: true };
});

// Register content import handler for pocket import feature
messageRouter.registerHandler("CONTENT_IMPORT", async (payload) => {
  logger.info("Handler", "CONTENT_IMPORT", payload);

  try {
    const { pocketId, content, sourceUrl, metadata } = payload as {
      pocketId: string;
      content: any;
      sourceUrl: string;
      metadata: any;
    };

    if (!pocketId) {
      throw new Error("Missing required field: pocketId");
    }

    await indexedDBManager.init();

    // Save content directly to IndexedDB
    const contentId = await indexedDBManager.saveContent({
      pocketId,
      type: metadata.type || ContentType.TEXT,
      content,
      metadata: {
        ...metadata,
        timestamp: metadata.timestamp || Date.now(),
        updatedAt: Date.now(),
      },
      sourceUrl: sourceUrl || "",
      processingStatus: ProcessingStatus.COMPLETED,
    });

    logger.info("Handler", "Content imported successfully", {
      contentId,
      pocketId,
      type: metadata.type,
    });

    // Enqueue vector indexing (non-blocking)
    vectorIndexingQueue
      .enqueueContent(contentId, IndexingOperation.CREATE)
      .catch((error) => {
        logger.error(
          "Handler",
          "Failed to enqueue vector indexing for imported content",
          { contentId, error },
        );
      });

    // Broadcast content created event
    try {
      const createdRecord = await indexedDBManager.getContent(contentId);
      if (createdRecord) {
        await messageRouter.sendToSidePanel({
          kind: "CONTENT_CREATED",
          payload: { content: createdRecord },
        } as any);
      }
    } catch (broadcastError) {
      logger.warn(
        "Handler",
        "Failed to broadcast CONTENT_CREATED for import",
        broadcastError,
      );
    }

    return { contentId, status: "success" };
  } catch (error) {
    logger.error("Handler", "CONTENT_IMPORT error", error);
    throw error;
  }
});

// Initialize AI managers for streaming
const aiManager = new AIManager();
// Explicitly pass API key to CloudAIManager to ensure it's available in service worker context
const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
const cloudAIManager = new CloudAIManager(geminiApiKey);
const streamingHandler = getStreamingHandler(aiManager, cloudAIManager);

// Initialize metadata queue manager for background metadata generation
let metadataQueueManager: MetadataQueueManager | null = null;

// Initialize metadata queue manager after a short delay to avoid blocking startup
setTimeout(() => {
  try {
    logger.info("ServiceWorker", "Initializing metadata queue manager...");

    if (!aiManager) {
      throw new Error("AIManager not available for metadata queue manager");
    }

    metadataQueueManager = new MetadataQueueManager(aiManager);
    logger.info("ServiceWorker", "MetadataQueueManager instance created");

    metadataQueueManager.start();
    logger.info("ServiceWorker", "Metadata queue manager started successfully");
  } catch (error) {
    logger.error("ServiceWorker", "Failed to start metadata queue manager", {
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
  }
}, 2000); // 2 second delay

// Export for use in other modules
export { metadataQueueManager };

// Register streaming handlers
messageRouter.registerHandler(
  "AI_PROCESS_STREAM_START",
  async (payload, sender) => {
    logger.info("Handler", "AI_PROCESS_STREAM_START", payload);
    return await streamingHandler.startStreaming(payload as any, sender);
  },
);

messageRouter.registerHandler("AI_PROCESS_CANCEL", async (payload) => {
  logger.info("Handler", "AI_PROCESS_CANCEL", payload);
  return await streamingHandler.cancelStreaming(payload as any);
});

// Register text correction handler for voice input post-processing
messageRouter.registerHandler(
  "AI_PROCESS_TEXT_CORRECTION",
  async (payload: any) => {
    logger.info("Handler", "AI_PROCESS_TEXT_CORRECTION", payload);
    try {
      const { text } = payload;

      if (!text || typeof text !== "string") {
        throw new Error("Invalid text provided for correction");
      }

      // Check if Nano is available
      const availability = await aiManager.checkModelAvailability();
      if (availability === "no") {
        logger.warn("Handler", "Nano not available, returning original text");
        return { correctedText: text };
      }

      // Create a session for text correction
      const sessionId = await aiManager.initializeGeminiNano({
        temperature: 0.3,
        initialPrompts: [
          {
            role: "system",
            content:
              "You are a text correction assistant. Fix grammar, spelling, remove filler words (um, uh, like, you know, etc.), and slightly improve clarity while preserving the original meaning and intent. Return only the corrected text without explanations or quotes.",
          },
        ],
      });

      // Process the text
      const correctedText = await aiManager.processPrompt(sessionId, text);

      // Clean up session
      aiManager.destroySession(sessionId);

      logger.info("Handler", "Text correction complete", {
        original: text,
        corrected: correctedText,
      });

      return { correctedText };
    } catch (error) {
      logger.error("Handler", "AI_PROCESS_TEXT_CORRECTION error", error);
      // Return original text on error
      return { correctedText: payload.text };
    }
  },
);

// Register context collection handlers for auto context engine
messageRouter.registerHandler("PAGE_CONTEXT_REQUEST", async (payload: any) => {
  logger.info("Handler", "PAGE_CONTEXT_REQUEST", payload);

  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab || !tab.id) {
      throw new Error("No active tab found");
    }

    // Inject content script to get page context
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // This function runs in the content script context
        const pageContext: {
          title: string;
          url: string;
          domain: string;
          contextType: "general";
          metaDescription?: string;
          metaKeywords?: string[];
          headings?: string[];
          mainContent?: string;
          pageType?: string;
          language?: string;
        } = {
          title: document.title,
          url: window.location.href,
          domain: window.location.hostname,
          // Detect context type based on URL patterns
          contextType: "general" as const,
        };

        // Try to get meta description
        const metaDesc = document.querySelector('meta[name="description"]');
        const metaDescContent = metaDesc?.getAttribute("content");
        if (metaDescContent) {
          pageContext.metaDescription = metaDescContent;
        }

        // Try to get meta keywords
        const metaKeywords = document.querySelector('meta[name="keywords"]');
        const metaKeywordsContent = metaKeywords?.getAttribute("content");
        if (metaKeywordsContent) {
          pageContext.metaKeywords = metaKeywordsContent
            .split(",")
            .map((k) => k.trim());
        }

        // Extract main headings (H1, H2)
        const headings: string[] = [];
        const h1Elements = document.querySelectorAll("h1");
        const h2Elements = document.querySelectorAll("h2");

        h1Elements.forEach((h) => {
          const text = h.textContent?.trim();
          if (text && text.length > 0 && text.length < 200) {
            headings.push(text);
          }
        });

        h2Elements.forEach((h) => {
          const text = h.textContent?.trim();
          if (
            text &&
            text.length > 0 &&
            text.length < 200 &&
            headings.length < 10
          ) {
            headings.push(text);
          }
        });

        if (headings.length > 0) {
          pageContext.headings = headings;
        }

        // Extract main content intelligently
        let mainContent = "";

        // Try to find main content area
        const mainElement = document.querySelector(
          'main, article, [role="main"], .main-content, #main-content, #content',
        );

        if (mainElement) {
          // Get text from main element, excluding scripts and styles
          const clone = mainElement.cloneNode(true) as HTMLElement;
          clone
            .querySelectorAll("script, style, nav, header, footer, aside")
            .forEach((el) => el.remove());
          mainContent = clone.textContent || "";
        } else {
          // Fallback: get body text
          const bodyClone = document.body.cloneNode(true) as HTMLElement;
          bodyClone
            .querySelectorAll(
              'script, style, nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"]',
            )
            .forEach((el) => el.remove());
          mainContent = bodyClone.textContent || "";
        }

        // Clean and truncate main content
        mainContent = mainContent
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 2000); // Limit to 2000 characters

        if (mainContent.length > 100) {
          pageContext.mainContent = mainContent;
        }

        // Detect page type
        const ogType = document
          .querySelector('meta[property="og:type"]')
          ?.getAttribute("content");
        if (ogType) {
          pageContext.pageType = ogType;
        } else {
          // Infer from structure
          if (document.querySelector("article")) {
            pageContext.pageType = "article";
          } else if (
            document.querySelector('form[role="search"], input[type="search"]')
          ) {
            pageContext.pageType = "search";
          } else if (
            document.querySelector('.product, [itemtype*="Product"]')
          ) {
            pageContext.pageType = "product";
          }
        }

        // Get page language
        const lang =
          document.documentElement.lang ||
          document
            .querySelector('meta[http-equiv="content-language"]')
            ?.getAttribute("content");
        if (lang) {
          pageContext.language = lang;
        }

        return pageContext;
      },
    });

    if (results && results[0] && results[0].result) {
      logger.info("Handler", "PAGE_CONTEXT_REQUEST success", results[0].result);
      return {
        success: true,
        context: results[0].result,
      };
    } else {
      throw new Error("Failed to get page context");
    }
  } catch (error) {
    logger.error("Handler", "PAGE_CONTEXT_REQUEST error", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

messageRouter.registerHandler("TAB_CONTEXT_REQUEST", async (payload: any) => {
  logger.info("Handler", "TAB_CONTEXT_REQUEST", payload);

  try {
    const maxTabs = payload.maxTabs || 6;

    // Get recent tabs from all windows
    const tabs = await chrome.tabs.query({});

    // Filter and map tabs
    const tabContexts = tabs
      .filter((tab) => tab.url && tab.title && !tab.url.startsWith("chrome://"))
      .slice(0, maxTabs)
      .map((tab) => {
        const url = new URL(tab.url!);
        const domain = url.hostname;

        // Basic context type detection for tabs
        let contextType: "general" | "sensitive" | "work" | "social" =
          "general";
        if (
          domain.includes("bank") ||
          domain.includes("health") ||
          domain.includes("gov")
        ) {
          contextType = "sensitive";
        } else if (
          domain.includes("work") ||
          domain.includes("company") ||
          domain.includes("office")
        ) {
          contextType = "work";
        } else if (
          domain.includes("social") ||
          domain.includes("twitter") ||
          domain.includes("facebook")
        ) {
          contextType = "social";
        }

        return {
          title: tab.title!,
          url: tab.url!,
          domain: domain,
          contextType,
        };
      });

    logger.info("Handler", "TAB_CONTEXT_REQUEST success", {
      tabsCount: tabContexts.length,
    });

    return {
      success: true,
      tabs: tabContexts,
    };
  } catch (error) {
    logger.error("Handler", "TAB_CONTEXT_REQUEST error", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

messageRouter.registerHandler(
  "SELECTION_CONTEXT_REQUEST",
  async (payload: any) => {
    logger.info("Handler", "SELECTION_CONTEXT_REQUEST", payload);

    try {
      // Get the active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab || !tab.id) {
        throw new Error("No active tab found");
      }

      // Inject content script to get selection context
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) {
            return null;
          }

          const range = selection.getRangeAt(0);
          const selectedText = range.toString().trim();

          if (!selectedText) {
            return null;
          }

          // Get surrounding context (characters before and after)
          const container = range.commonAncestorContainer;
          const fullText = container.textContent || "";
          const offset = fullText.indexOf(selectedText);

          let surroundingText = "";
          if (offset !== -1) {
            const contextRadius = 200; // characters before and after
            const start = Math.max(0, offset - contextRadius);
            const end = Math.min(
              fullText.length,
              offset + selectedText.length + contextRadius,
            );
            surroundingText = fullText.substring(start, end);
          }

          return {
            text: selectedText,
            surroundingText: surroundingText,
          };
        },
      });

      if (results && results[0] && results[0].result) {
        logger.info("Handler", "SELECTION_CONTEXT_REQUEST success", {
          textLength: results[0].result.text.length,
        });

        return {
          success: true,
          context: results[0].result,
        };
      } else {
        // No selection
        return {
          success: true,
          context: null,
        };
      }
    } catch (error) {
      logger.error("Handler", "SELECTION_CONTEXT_REQUEST error", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

messageRouter.registerHandler("INPUT_CONTEXT_REQUEST", async (payload: any) => {
  logger.info("Handler", "INPUT_CONTEXT_REQUEST", payload);

  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab || !tab.id) {
      throw new Error("No active tab found");
    }

    // Inject content script to get input context
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Get focused element
        const activeElement = document.activeElement;
        if (!activeElement) {
          return null;
        }

        const tagName = activeElement.tagName.toLowerCase();
        const type = (activeElement as HTMLInputElement).type || "";
        const role = activeElement.getAttribute("role") || undefined;
        const placeholder =
          (activeElement as HTMLInputElement).placeholder || undefined;

        // Basic intent detection based on input attributes and form context
        let intent = "";
        if (tagName === "input" || tagName === "textarea") {
          if (type === "search") {
            intent = "search";
          } else if (type === "email") {
            intent = "email";
          } else if (type === "password") {
            intent = "password";
          } else if (type === "tel") {
            intent = "phone";
          } else if (placeholder) {
            if (placeholder.toLowerCase().includes("search")) {
              intent = "search";
            } else if (placeholder.toLowerCase().includes("email")) {
              intent = "email";
            } else if (placeholder.toLowerCase().includes("message")) {
              intent = "message";
            }
          }
        } else if (tagName === "select") {
          intent = "selection";
        }

        return {
          tagName,
          type,
          role,
          placeholder,
          intent,
        };
      },
    });

    if (results && results[0] && results[0].result) {
      logger.info(
        "Handler",
        "INPUT_CONTEXT_REQUEST success",
        results[0].result,
      );

      return {
        success: true,
        context: results[0].result,
      };
    } else {
      // No focused input
      return {
        success: true,
        context: null,
      };
    }
  } catch (error) {
    logger.error("Handler", "INPUT_CONTEXT_REQUEST error", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// Register conversation handlers (Requirement 8.8, 7.6)
messageRouter.registerHandler("CONVERSATION_LIST", async (payload) => {
  logger.info("Handler", "CONVERSATION_LIST", payload);
  try {
    await indexedDBManager.init(); // Ensure DB is initialized
    const conversations = await indexedDBManager.listConversations();
    logger.info("Handler", "CONVERSATION_LIST result", {
      count: conversations.length,
    });
    return { conversations };
  } catch (error) {
    logger.error("Handler", "CONVERSATION_LIST error", error);
    throw error;
  }
});

messageRouter.registerHandler("CONVERSATION_GET", async (payload: any) => {
  logger.info("Handler", "CONVERSATION_GET", payload);
  try {
    await indexedDBManager.init();
    const conversation = await indexedDBManager.getConversation(
      payload.conversationId,
    );
    logger.info("Handler", "CONVERSATION_GET result", {
      found: !!conversation,
    });
    return { conversation };
  } catch (error) {
    logger.error("Handler", "CONVERSATION_GET error", error);
    throw error;
  }
});

messageRouter.registerHandler("CONVERSATION_CREATE", async (payload: any) => {
  logger.info("Handler", "CONVERSATION_CREATE", payload);
  try {
    await indexedDBManager.init();
    logger.info("Handler", "Creating conversation", {
      messageCount: payload.messages?.length || 0,
    });
    const conversationId = await indexedDBManager.saveConversation(
      {
        pocketId: payload.pocketId,
        messages: payload.messages || [],
        model: payload.model || "gemini-nano",
        tokensUsed: 0,
      },
      payload.conversationId,
    );
    const conversation = await indexedDBManager.getConversation(conversationId);
    logger.info("Handler", "CONVERSATION_CREATE result", {
      id: conversationId,
    });

    // Trigger background metadata generation
    if (
      metadataQueueManager &&
      conversation &&
      conversation.messages.length > 0
    ) {
      metadataQueueManager.enqueueConversation(conversationId, "normal");
      logger.info(
        "Handler",
        "Queued metadata generation for new conversation",
        {
          conversationId,
        },
      );
    }

    return { conversation };
  } catch (error) {
    logger.error("Handler", "CONVERSATION_CREATE error", error);
    throw error;
  }
});

messageRouter.registerHandler("CONVERSATION_UPDATE", async (payload: any) => {
  logger.info("Handler", "CONVERSATION_UPDATE", payload);
  try {
    await indexedDBManager.init();
    await indexedDBManager.updateConversation(
      payload.conversationId,
      payload.message,
    );
    logger.info("Handler", "CONVERSATION_UPDATE success");
    return { success: true };
  } catch (error) {
    logger.error("Handler", "CONVERSATION_UPDATE error", error);
    throw error;
  }
});

messageRouter.registerHandler(
  "CONVERSATION_GENERATE_METADATA",
  async (payload: any) => {
    logger.info("Handler", "CONVERSATION_GENERATE_METADATA", payload);
    try {
      const { ConversationMetadataGenerator } = await import(
        "./conversation-metadata-generator.js"
      );
      const generator = new ConversationMetadataGenerator(aiManager);
      const metadata = await generator.generateMetadata(payload.messages);
      logger.info("Handler", "CONVERSATION_GENERATE_METADATA success");
      return { metadata };
    } catch (error) {
      logger.error("Handler", "CONVERSATION_GENERATE_METADATA error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "CONVERSATION_SEMANTIC_SEARCH",
  async (payload: any) => {
    logger.info("Handler", "CONVERSATION_SEMANTIC_SEARCH", payload);
    try {
      const { SemanticSearchService } = await import(
        "./semantic-search-service.js"
      );
      const searchService = new SemanticSearchService(aiManager);
      const results = await searchService.searchConversations(
        payload.query,
        payload.conversations,
      );
      logger.info("Handler", "CONVERSATION_SEMANTIC_SEARCH success", {
        resultsCount: results.length,
      });
      return { results };
    } catch (error) {
      logger.error("Handler", "CONVERSATION_SEMANTIC_SEARCH error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler("METADATA_QUEUE_STATUS", async (payload: any) => {
  logger.info("Handler", "METADATA_QUEUE_STATUS", payload);
  try {
    if (!metadataQueueManager) {
      return {
        queueLength: 0,
        isProcessing: false,
        conversationsWithoutMetadata: 0,
      };
    }

    const status = metadataQueueManager.getStatus();

    // Count conversations without metadata
    await indexedDBManager.init();
    const conversations = await indexedDBManager.listConversations();
    const conversationsWithoutMetadata = conversations.filter(
      (c) => !c.metadata,
    ).length;

    logger.info("Handler", "METADATA_QUEUE_STATUS success", status);
    return {
      ...status,
      conversationsWithoutMetadata,
    };
  } catch (error) {
    logger.error("Handler", "METADATA_QUEUE_STATUS error", error);
    return {
      queueLength: 0,
      isProcessing: false,
      conversationsWithoutMetadata: 0,
    };
  }
});

messageRouter.registerHandler("CONVERSATION_DELETE", async (payload: any) => {
  logger.info("Handler", "CONVERSATION_DELETE", payload);
  try {
    await indexedDBManager.init();
    await indexedDBManager.deleteConversation(payload.conversationId);
    logger.info("Handler", "CONVERSATION_DELETE success");
    return { success: true };
  } catch (error) {
    logger.error("Handler", "CONVERSATION_DELETE error", error);
    throw error;
  }
});

// Register conversation pocket attachment handlers
messageRouter.registerHandler(
  "CONVERSATION_ATTACH_POCKET",
  async (payload: any) => {
    logger.info("Handler", "CONVERSATION_ATTACH_POCKET", payload);
    try {
      await indexedDBManager.init();
      await indexedDBManager.attachPocketToConversation(
        payload.conversationId,
        payload.pocketId,
      );

      // Get pocket details for response
      const pocket = await indexedDBManager.getPocket(payload.pocketId);

      logger.info("Handler", "CONVERSATION_ATTACH_POCKET success", {
        conversationId: payload.conversationId,
        pocketId: payload.pocketId,
        pocketName: pocket?.name,
      });

      return {
        success: true,
        conversationId: payload.conversationId,
        attachedPocketId: payload.pocketId,
        pocketName: pocket?.name,
        pocketDescription: pocket?.description,
      };
    } catch (error) {
      logger.error("Handler", "CONVERSATION_ATTACH_POCKET error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "CONVERSATION_DETACH_POCKET",
  async (payload: any) => {
    logger.info("Handler", "CONVERSATION_DETACH_POCKET", payload);
    try {
      await indexedDBManager.init();
      await indexedDBManager.detachPocketFromConversation(
        payload.conversationId,
        payload.pocketId, // Optional: detach specific pocket or all if undefined
      );

      logger.info("Handler", "CONVERSATION_DETACH_POCKET success", {
        conversationId: payload.conversationId,
        pocketId: payload.pocketId || "all",
      });

      return {
        success: true,
        conversationId: payload.conversationId,
        attachedPocketId: null,
        attachedPocketIds: [],
      };
    } catch (error) {
      logger.error("Handler", "CONVERSATION_DETACH_POCKET error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "CONVERSATION_GET_ATTACHED_POCKET",
  async (payload: any) => {
    logger.info("Handler", "CONVERSATION_GET_ATTACHED_POCKET", payload);
    try {
      await indexedDBManager.init();
      const pockets = await indexedDBManager.getAttachedPockets(
        payload.conversationId,
      );
      const pocketIds = await indexedDBManager.getAttachedPocketIds(
        payload.conversationId,
      );

      logger.info("Handler", "CONVERSATION_GET_ATTACHED_POCKET success", {
        conversationId: payload.conversationId,
        found: pockets.length > 0,
        pocketCount: pockets.length,
      });

      return {
        success: true,
        conversationId: payload.conversationId,
        attachedPocketId: pockets.length > 0 ? pockets[0]?.id : null, // For backward compatibility
        attachedPocketIds: pocketIds,
        pockets: pockets.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          color: p.color,
        })),
        pocketName: pockets.length > 0 ? pockets[0]?.name : undefined,
        pocketDescription:
          pockets.length > 0 ? pockets[0]?.description : undefined,
      };
    } catch (error) {
      logger.error("Handler", "CONVERSATION_GET_ATTACHED_POCKET error", error);
      throw error;
    }
  },
);

// Register abbreviation handlers (Requirement 10.1, 10.2, 10.3, 10.5)
messageRouter.registerHandler("ABBREVIATION_CREATE", async (payload: any) => {
  logger.info("Handler", "ABBREVIATION_CREATE", payload);
  try {
    const abbreviation = await abbreviationStorage.createAbbreviation(
      payload.shortcut,
      payload.expansion,
      payload.category,
    );
    logger.info("Handler", "ABBREVIATION_CREATE success", {
      shortcut: abbreviation.shortcut,
    });
    return { success: true, data: abbreviation };
  } catch (error) {
    logger.error("Handler", "ABBREVIATION_CREATE error", error);
    throw error;
  }
});

messageRouter.registerHandler("ABBREVIATION_GET", async (payload: any) => {
  logger.info("Handler", "ABBREVIATION_GET", payload);
  try {
    const abbreviation = await abbreviationStorage.getAbbreviation(
      payload.shortcut,
    );
    logger.info("Handler", "ABBREVIATION_GET success", {
      found: !!abbreviation,
    });
    return { success: true, data: abbreviation };
  } catch (error) {
    logger.error("Handler", "ABBREVIATION_GET error", error);
    throw error;
  }
});

messageRouter.registerHandler("ABBREVIATION_UPDATE", async (payload: any) => {
  logger.info("Handler", "ABBREVIATION_UPDATE", payload);
  try {
    const abbreviation = await abbreviationStorage.updateAbbreviation(
      payload.shortcut,
      {
        expansion: payload.expansion,
        category: payload.category,
      },
    );
    logger.info("Handler", "ABBREVIATION_UPDATE success", {
      shortcut: abbreviation.shortcut,
    });
    return { success: true, data: abbreviation };
  } catch (error) {
    logger.error("Handler", "ABBREVIATION_UPDATE error", error);
    throw error;
  }
});

messageRouter.registerHandler("ABBREVIATION_DELETE", async (payload: any) => {
  logger.info("Handler", "ABBREVIATION_DELETE", payload);
  try {
    await abbreviationStorage.deleteAbbreviation(payload.shortcut);
    logger.info("Handler", "ABBREVIATION_DELETE success", {
      shortcut: payload.shortcut,
    });
    return { success: true };
  } catch (error) {
    logger.error("Handler", "ABBREVIATION_DELETE error", error);
    throw error;
  }
});

messageRouter.registerHandler("ABBREVIATION_LIST", async (payload: any) => {
  logger.info("Handler", "ABBREVIATION_LIST", payload);
  try {
    const abbreviations = await abbreviationStorage.listAbbreviations(
      payload?.category,
    );
    logger.info("Handler", "ABBREVIATION_LIST success", {
      count: abbreviations.length,
    });
    return { success: true, data: abbreviations };
  } catch (error) {
    logger.error("Handler", "ABBREVIATION_LIST error", error);
    throw error;
  }
});

messageRouter.registerHandler("ABBREVIATION_EXPAND", async (payload: any) => {
  logger.info("Handler", "ABBREVIATION_EXPAND", payload);
  try {
    const result = await abbreviationStorage.expandAbbreviation(
      payload.shortcut,
    );
    logger.info("Handler", "ABBREVIATION_EXPAND success", {
      shortcut: payload.shortcut,
      expansion: result.expansion,
    });
    return { success: true, data: result };
  } catch (error) {
    logger.error("Handler", "ABBREVIATION_EXPAND error", error);
    throw error;
  }
});

// Browser Agent Workflow Handlers
messageRouter.registerHandler(
  "BROWSER_AGENT_START_WORKFLOW",
  async (payload: any) => {
    logger.info("Handler", "BROWSER_AGENT_START_WORKFLOW", payload);
    try {
      if (!workflowManager) {
        throw new Error("WorkflowManager not initialized yet");
      }
      const state = await workflowManager.startWorkflow({
        workflowId: payload.workflowId,
        variables: payload.variables || {},
        config: payload.config,
        tabId: payload.tabId,
        userId: payload.userId,
      });
      logger.info("Handler", "BROWSER_AGENT_START_WORKFLOW success", {
        workflowId: state.workflowId,
      });
      return { success: true, data: state };
    } catch (error) {
      logger.error("Handler", "BROWSER_AGENT_START_WORKFLOW error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "BROWSER_AGENT_PAUSE_WORKFLOW",
  async (payload: any) => {
    logger.info("Handler", "BROWSER_AGENT_PAUSE_WORKFLOW", payload);
    try {
      if (!workflowManager) {
        throw new Error("WorkflowManager not initialized yet");
      }
      await workflowManager.pauseWorkflow(payload.workflowId, payload.reason);
      logger.info("Handler", "BROWSER_AGENT_PAUSE_WORKFLOW success", {
        workflowId: payload.workflowId,
      });
      return { success: true };
    } catch (error) {
      logger.error("Handler", "BROWSER_AGENT_PAUSE_WORKFLOW error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "BROWSER_AGENT_RESUME_WORKFLOW",
  async (payload: any) => {
    logger.info("Handler", "BROWSER_AGENT_RESUME_WORKFLOW", payload);
    try {
      if (!workflowManager) {
        throw new Error("WorkflowManager not initialized yet");
      }
      await workflowManager.resumeWorkflow(
        payload.workflowId,
        payload.userInput,
      );
      logger.info("Handler", "BROWSER_AGENT_RESUME_WORKFLOW success", {
        workflowId: payload.workflowId,
      });
      return { success: true };
    } catch (error) {
      logger.error("Handler", "BROWSER_AGENT_RESUME_WORKFLOW error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "BROWSER_AGENT_CANCEL_WORKFLOW",
  async (payload: any) => {
    logger.info("Handler", "BROWSER_AGENT_CANCEL_WORKFLOW", payload);
    try {
      if (!workflowManager) {
        throw new Error("WorkflowManager not initialized yet");
      }
      await workflowManager.cancelWorkflow(payload.workflowId, payload.options);
      logger.info("Handler", "BROWSER_AGENT_CANCEL_WORKFLOW success", {
        workflowId: payload.workflowId,
      });
      return { success: true };
    } catch (error) {
      logger.error("Handler", "BROWSER_AGENT_CANCEL_WORKFLOW error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "BROWSER_AGENT_WORKFLOW_STATUS",
  async (payload: any) => {
    logger.info("Handler", "BROWSER_AGENT_WORKFLOW_STATUS", payload);
    try {
      if (!workflowManager) {
        throw new Error("WorkflowManager not initialized yet");
      }
      const status = await workflowManager.getWorkflowStatus(
        payload.workflowId,
      );
      logger.info("Handler", "BROWSER_AGENT_WORKFLOW_STATUS success", {
        workflowId: payload.workflowId,
        found: !!status,
      });
      return { success: true, data: status };
    } catch (error) {
      logger.error("Handler", "BROWSER_AGENT_WORKFLOW_STATUS error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "BROWSER_AGENT_LIST_WORKFLOWS",
  async (_payload: any) => {
    logger.info("Handler", "BROWSER_AGENT_LIST_WORKFLOWS");
    try {
      if (!workflowManager) {
        return { success: true, data: [] };
      }
      const workflows = workflowManager.getAllWorkflows();
      logger.info("Handler", "BROWSER_AGENT_LIST_WORKFLOWS success", {
        count: workflows.length,
      });
      return { success: true, data: workflows };
    } catch (error) {
      logger.error("Handler", "BROWSER_AGENT_LIST_WORKFLOWS error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "BROWSER_AGENT_APPROVAL_RESPONSE",
  async (payload: any) => {
    logger.info("Handler", "BROWSER_AGENT_APPROVAL_RESPONSE", payload);
    try {
      const { requestId, approved, modifiedParams } = payload;

      if (!requestId) {
        throw new Error("No requestId provided for approval response");
      }

      // Store approval decision for workflow manager to retrieve
      await lifecycle.setSessionData(`approval:${requestId}`, {
        approved,
        modifiedParams,
        timestamp: Date.now(),
      });

      logger.info("Handler", "BROWSER_AGENT_APPROVAL_RESPONSE recorded", {
        requestId,
        approved,
      });

      return { success: true, acknowledged: true };
    } catch (error) {
      logger.error("Handler", "BROWSER_AGENT_APPROVAL_RESPONSE error", error);
      throw error;
    }
  },
);

// API Testing Handlers
messageRouter.registerHandler(
  "API_REQUEST",
  async (payload: ApiRequestPayload) => {
    logger.info("Handler", "API_REQUEST", {
      method: payload.method,
      url: payload.url,
    });
    try {
      const response = await performApiRequest(payload);
      const result: ApiRequestResponsePayload = {
        success: true,
        response,
      };

      logger.info("Handler", "API_REQUEST success", {
        status: response.status,
        durationMs: response.timing.durationMs,
        retryCount: response.retryCount,
      });

      return result;
    } catch (error) {
      logger.error("Handler", "API_REQUEST error", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      } as ApiRequestResponsePayload;
    }
  },
);

messageRouter.registerHandler(
  "API_START_NETWORK_MONITORING",
  async (payload: ApiStartNetworkMonitoringPayload) => {
    logger.info("Handler", "API_START_NETWORK_MONITORING", payload);
    try {
      startNetworkMonitoring(payload.tabId);
      logger.info("Handler", "API_START_NETWORK_MONITORING success");
      return { success: true };
    } catch (error) {
      logger.error("Handler", "API_START_NETWORK_MONITORING error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "API_STOP_NETWORK_MONITORING",
  async (payload: ApiStopNetworkMonitoringPayload) => {
    logger.info("Handler", "API_STOP_NETWORK_MONITORING", payload);
    try {
      const logs = stopNetworkMonitoring(payload.tabId);
      logger.info("Handler", "API_STOP_NETWORK_MONITORING success", {
        logsCount: logs.length,
      });
      return {
        success: true,
        logs,
      } as ApiNetworkLogsResponsePayload;
    } catch (error) {
      logger.error("Handler", "API_STOP_NETWORK_MONITORING error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "API_GET_NETWORK_LOGS",
  async (payload: { tabId?: number }) => {
    logger.info("Handler", "API_GET_NETWORK_LOGS", payload);
    try {
      const logs = getNetworkLogs(payload.tabId);
      logger.info("Handler", "API_GET_NETWORK_LOGS success", {
        logsCount: logs.length,
      });
      return {
        success: true,
        logs,
      } as ApiNetworkLogsResponsePayload;
    } catch (error) {
      logger.error("Handler", "API_GET_NETWORK_LOGS error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler(
  "API_SET_AUTH_TOKEN",
  async (payload: ApiSetAuthTokenPayload) => {
    logger.info("Handler", "API_SET_AUTH_TOKEN");
    try {
      await storeAuthToken(payload.token);
      logger.info("Handler", "API_SET_AUTH_TOKEN success");
      return { success: true } as ApiAuthResponsePayload;
    } catch (error) {
      logger.error("Handler", "API_SET_AUTH_TOKEN error", error);
      throw error;
    }
  },
);

messageRouter.registerHandler("API_CLEAR_AUTH_TOKEN", async () => {
  logger.info("Handler", "API_CLEAR_AUTH_TOKEN");
  try {
    await removeAuthToken();
    logger.info("Handler", "API_CLEAR_AUTH_TOKEN success");
    return { success: true } as ApiAuthResponsePayload;
  } catch (error) {
    logger.error("Handler", "API_CLEAR_AUTH_TOKEN error", error);
    throw error;
  }
});

// Message listener - routes all messages through the router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logger.debug("ServiceWorker", "Received message", {
    kind: message?.kind,
    sender: sender.tab?.id || sender.id,
  });

  // Ensure lifecycle is initialized
  if (!lifecycle.isInitialized()) {
    lifecycle
      .initialize()
      .then(() => messageRouter.routeMessage(message, sender))
      .then(sendResponse)
      .catch((error) => {
        logger.error("ServiceWorker", "Message handling error", error);
        sendResponse({
          success: false,
          error: {
            code: "INITIALIZATION_ERROR",
            message: "Failed to initialize service worker",
          },
        });
      });
    return true; // Keep channel open for async response
  }

  // Route message
  messageRouter
    .routeMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      logger.error("ServiceWorker", "Message routing error", error);
      sendResponse({
        success: false,
        error: {
          code: "ROUTING_ERROR",
          message: "Failed to route message",
        },
      });
    });

  return true; // Keep channel open for async response
});

// Memory cleanup listener (Requirement 13.7, 13.9)
globalThis.addEventListener("memory-cleanup-needed", (event: Event) => {
  const customEvent = event as CustomEvent;
  logger.warn("ServiceWorker", "Memory cleanup triggered", customEvent.detail);

  // Perform cleanup operations
  performCleanup();
});

// Quota event listener (Requirement 5.8, 13.1, 13.9)
globalThis.addEventListener("quota-event", (event: Event) => {
  const customEvent = event as CustomEvent;
  const { type, data } = customEvent.detail;

  logger.info("ServiceWorker", `Quota event: ${type}`, data);

  // Handle critical storage events
  if (type === "critical") {
    // Notify user about storage issues
    chrome.notifications
      .create({
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title: "Storage Almost Full",
        message:
          "AI Pocket is running low on storage. Some old data has been cleaned up automatically.",
      })
      .catch((error) => {
        logger.error("ServiceWorker", "Failed to create notification", error);
      });
  } else if (type === "warning") {
    logger.warn("ServiceWorker", "Storage warning threshold exceeded", data);
  }
});

/**
 * Perform memory cleanup operations
 * Requirements: 13.7, 13.9
 */
async function performCleanup(): Promise<void> {
  logger.info("ServiceWorker", "Starting memory cleanup");

  try {
    // Clear old logs
    const logs = logger.getLogs();
    if (logs.length > 500) {
      logger.info("ServiceWorker", "Trimming old logs");
      // Logs are automatically trimmed in the Logger class
    }

    // Clear old metrics
    const summary = performanceMonitor.getSummary();
    if (summary.totalMetrics > 300) {
      logger.info("ServiceWorker", "Clearing old metrics");
      // Metrics are automatically trimmed in the PerformanceMonitor class
    }

    // Trigger quota cleanup if memory usage is high
    const quotaManager = getQuotaManager();
    const usage = await quotaManager.getTotalUsage();
    if (usage.total.percentUsed > 80) {
      logger.info(
        "ServiceWorker",
        "Triggering quota cleanup due to high memory usage",
      );
      await quotaManager.performCleanup("warning");
    }

    // Force garbage collection if available (Chrome only)
    if (globalThis.gc) {
      logger.info("ServiceWorker", "Forcing garbage collection");
      globalThis.gc();
    }

    logger.info("ServiceWorker", "Memory cleanup completed");
  } catch (error) {
    logger.error("ServiceWorker", "Memory cleanup failed", error);
  }
}

// Export for use in other modules
export {
  lifecycle,
  messageRouter,
  logger,
  performanceMonitor,
  geminiFormatter,
  backgroundProcessor,
  agentRuntimeService,
};
