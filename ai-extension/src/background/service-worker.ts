/**
 * Service Worker Lifecycle Management
 * Handles initialization, state persistence, and termination/restart
 * Requirements: 1.7, 15.4
 */

// Polyfill for Vite's preload helper in service worker context
// Service workers don't have access to document or window, so we provide minimal polyfills
if (typeof document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => ({ rel: '', href: '' }),
    head: { appendChild: () => { } },
  };
}

if (typeof window === 'undefined') {
  (globalThis as any).window = globalThis;
}

import { logger, performanceMonitor } from "./monitoring.js";
import { getQuotaManager } from "./quota-manager.js";
import { AIManager } from "./ai-manager.js";
import { CloudAIManager } from "./cloud-ai-manager.js";
import { getStreamingHandler } from "./streaming-handler.js";
import { indexedDBManager } from "./indexeddb-manager.js";
import { contentProcessor } from "./content-processor.js";
import { vectorSearchService } from "./vector-search-service.js";
import * as abbreviationStorage from "./abbreviation-storage.js";

/**
 * Context Menu Management
 * Creates and handles "Save to Pocket" context menu
 */
async function createContextMenu(): Promise<void> {
  try {
    // Remove existing context menus
    await chrome.contextMenus.removeAll();

    // Create "Save to Pocket" context menu
    chrome.contextMenus.create({
      id: "save-to-pocket",
      title: "Save to Pocket",
      contexts: ["selection"],
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
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      await chrome.tabs.sendMessage(tabId, { kind: "PING", payload: {} });
      return true;
    } catch (retryError) {
      logger.error("ServiceWorker", "Content script not responding", { tabId, error: retryError });
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
  maxRetries: number = 3
): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);

      // Check for chrome.runtime.lastError
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message || "";
        logger.warn("ServiceWorker", "chrome.runtime.lastError detected", errorMsg);

        // If it's a message channel closed error, throw immediately
        if (errorMsg.includes("message channel closed") ||
          errorMsg.includes("message port closed")) {
          throw new Error(errorMsg);
        }
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Don't retry if message channel closed - this is likely intentional (user cancelled)
      if (errorMessage.includes("message channel closed") ||
        errorMessage.includes("message port closed")) {
        logger.info("ServiceWorker", "Message channel closed, not retrying");
        throw error;
      }

      logger.warn("ServiceWorker", `Send message attempt ${attempt} failed`, error);

      if (attempt < maxRetries) {
        // Try to ensure content script is loaded before retry
        await ensureContentScriptLoaded(tabId);

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 200 * attempt));
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
  resolve: (pocketId: string) => void;
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
  pockets: Array<{ id: string; name: string; description?: string; color?: string }>;
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
      if (message.includes("Receiving end does not exist") && attempt < maxAttempts) {
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
  pockets: Array<{ id: string; name: string; description?: string; color?: string }>,
  context: PocketSelectionContext,
): Promise<string> {
  if (pockets.length === 1) {
    return pockets[0]!.id;
  }

  const requestId = crypto.randomUUID();

  try {
    await chrome.sidePanel.open({ tabId });
  } catch (error) {
    logger.warn("ServiceWorker", "Failed to open side panel before pocket selection", error);
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

  return await new Promise<string>((resolve, reject) => {
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
        logger.warn("ServiceWorker", "Failed to notify pocket selection timeout", error);
      }
      reject(new Error("POCKET_SELECTION_TIMEOUT"));
    }, 45000) as unknown as number;

    pocketSelectionRequests.set(requestId, {
      resolve: (pocketId) => {
        clearTimeout(timeoutId);
        pocketSelectionRequests.delete(requestId);
        resolve(pocketId);
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
    if (info.menuItemId === "save-to-pocket" && tab?.id) {
      // Prevent multiple simultaneous operations
      if (isProcessingSaveToPocket) {
        logger.warn("ServiceWorker", "Save to pocket already in progress, ignoring duplicate click");
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
            message: "Could not load content script. Please refresh the page and try again.",
          });
          return;
        }

        // Initialize IndexedDB and load pockets
        await indexedDBManager.init();
        let pockets = await indexedDBManager.listPockets();

        if (pockets.length === 0) {
          logger.info("ServiceWorker", "No pockets found, creating default pocket");
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
        if (!snippetEnvelope || snippetEnvelope.status !== "success" || !snippetEnvelope.snippet) {
          const captureError = snippetEnvelope?.error || "Failed to capture selected text";
          logger.error("ServiceWorker", "Snippet capture failed", { captureError, snippetEnvelope });
          throw new Error(typeof captureError === "string" ? captureError : JSON.stringify(captureError));
        }

        const snippet = snippetEnvelope.snippet;
        const snippetTextRaw = snippet?.content?.text?.content || info.selectionText || "";
        const snippetText = typeof snippetTextRaw === "string" ? snippetTextRaw.trim() : "";

        if (!snippetText) {
          throw new Error("Captured selection was empty");
        }

        const snippetPreview = snippetText.slice(0, 200);
        const snippetTitleCandidate = snippetText.slice(0, 80);

        // Determine target pocket (prompt via side panel if multiple)
        let targetPocketId: string;
        if (pockets.length === 1) {
          targetPocketId = pockets[0]!.id;
          logger.info("ServiceWorker", "Auto-selecting sole pocket", { pocketId: targetPocketId });
        } else {
          try {
            targetPocketId = await requestPocketSelection(tab.id, pockets, {
              selectionText: snippetText,
              preview: snippetPreview,
              sourceUrl: snippet.metadata?.url || tab.url || "",
            });
          } catch (selectionError) {
            if (selectionError instanceof Error) {
              if (selectionError.message === "POCKET_SELECTION_CANCELLED") {
                logger.info("ServiceWorker", "User cancelled pocket selection from side panel");
                return;
              }
              if (selectionError.message === "POCKET_SELECTION_TIMEOUT") {
                throw new Error("Pocket selection timed out");
              }
            }
            throw selectionError;
          }
        }

        const targetPocket = pockets.find((p) => p.id === targetPocketId) || null;

        // Normalize metadata before saving
        snippet.metadata = {
          ...snippet.metadata,
          url: snippet.metadata?.url || tab.url || "",
          timestamp: snippet.metadata?.timestamp || Date.now(),
        };

        if (!snippet.metadata.title) {
          try {
            const source = snippet.metadata.url ? new URL(snippet.metadata.url) : null;
            snippet.metadata.title = snippetTitleCandidate || source?.hostname || "Saved snippet";
          } catch {
            snippet.metadata.title = snippetTitleCandidate || "Saved snippet";
          }
        }

        logger.info("ServiceWorker", "Processing captured snippet", {
          pocketId: targetPocketId,
          preview: snippetPreview,
        });

        // Auto-format the captured text with Gemini Nano
        let aiFormattedContent: string | null = null;
        try {
          logger.info("ServiceWorker", "Auto-formatting captured text with Gemini Nano");
          const formatResponse = await messageRouter.routeMessage({
            kind: "AI_FORMAT_REQUEST",
            requestId: crypto.randomUUID(),
            payload: {
              content: snippetText,
              instructions: "Format this captured text to be well-structured, properly formatted, and easy to read. Improve markdown syntax, fix formatting issues, and enhance readability while preserving the original meaning.",
              preferLocal: true,
            },
          }, { tab: { id: tab.id } } as chrome.runtime.MessageSender);

          if (formatResponse.success && formatResponse.data?.formattedContent) {
            aiFormattedContent = formatResponse.data.formattedContent;
            logger.info("ServiceWorker", "✓ Text auto-formatted successfully", {
              originalLength: snippetText.length,
              formattedLength: formatResponse.data.formattedContent.length,
              usedAI: formatResponse.data.usedAI,
            });
          } else {
            logger.warn("ServiceWorker", "Format response unsuccessful", formatResponse);
          }
        } catch (formatError) {
          logger.warn("ServiceWorker", "Auto-format failed, continuing with original text", formatError);
        }

        // Add AI formatted content to snippet if available
        if (aiFormattedContent !== null && snippet.content?.text) {
          if (typeof snippet.content.text === 'object') {
            snippet.content.text.aiFormattedContent = aiFormattedContent;
          }
        }

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

        const savedContent = await indexedDBManager.getContent(processed.contentId);

        if (savedContent) {
          try {
            await chrome.runtime.sendMessage({
              kind: "CONTENT_CREATED",
              payload: { content: savedContent },
            });
            logger.info("ServiceWorker", "Broadcasted CONTENT_CREATED event");
          } catch (broadcastError) {
            logger.warn("ServiceWorker", "Failed to broadcast CONTENT_CREATED", broadcastError);
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
        const errorMessage = error instanceof Error ? error.message : String(error);
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
          message: error instanceof Error ? error.message : "An unknown error occurred",
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
        pocketId: pocketId || "(empty)"
      });

      await indexedDBManager.init();

      // Ensure we have a valid pocketId - create default "Notes" pocket if needed
      let targetPocketId = pocketId;
      if (!targetPocketId || targetPocketId === "") {
        logger.info("Handler", "No pocketId provided, checking for default Notes pocket");

        // Check if a "Notes" pocket exists
        const pockets = await indexedDBManager.listPockets();
        let notesPocket = pockets.find(p => p.name === "Notes" || p.name === "My Notes");

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
          logger.info("Handler", "Default Notes pocket created", { pocketId: targetPocketId });
        } else {
          targetPocketId = notesPocket.id;
          logger.info("Handler", "Using existing Notes pocket", { pocketId: targetPocketId });
        }
      }

      // Check if this is an update (contentId in metadata)
      if (metadata?.contentId) {
        // Update existing note
        logger.info("Handler", "Updating existing note", { contentId: metadata.contentId });

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

        // Fetch updated record for ACK/broadcast
        const updatedRecord = await indexedDBManager.getContent(metadata.contentId);
        if (updatedRecord) {
          // Broadcast update event so UI refreshes instantly
          await messageRouter.sendToSidePanel({
            kind: "CONTENT_UPDATED",
            payload: { content: updatedRecord },
          } as any);
        }

        logger.info("Handler", "Note updated successfully", { contentId: metadata.contentId });

        return {
          status: "success",
          contentId: metadata.contentId,
          type: "note",
          content: updatedRecord,
          preview: (content || "").substring(0, 100),
        };
      } else {
        // Create new note
        logger.info("Handler", "Creating new note", { pocketId: targetPocketId });

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
        const createdRecord = await indexedDBManager.getContent(processed.contentId);
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
    const processed = captureResult.mode === "full-page"
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
      const createdRecord = await indexedDBManager.getContent(processed.contentId);
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
        logger.warn("Handler", "Created record not found", { contentId: processed.contentId });
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
    const contentType = fileExtension === "pdf" ? "pdf"
      : ["doc", "docx"].includes(fileExtension) ? "document"
        : ["xls", "xlsx"].includes(fileExtension) ? "spreadsheet"
          : ["txt", "md"].includes(fileExtension) ? "text"
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
    const createdRecord = await indexedDBManager.getContent(processed.contentId);
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

messageRouter.registerHandler("AI_PROCESS_REQUEST", async (payload: any) => {
  logger.info("Handler", "AI_PROCESS_REQUEST", payload);

  try {
    const { prompt, task, preferLocal, style, originalText } = payload as {
      prompt: string;
      task: string;
      preferLocal: boolean;
      style?: string;
      originalText?: string;
    };

    // For text enhancement tasks
    if (task === 'enhance') {
      logger.info("Handler", "Processing text enhancement", { style, textLength: originalText?.length });

      // Check if Gemini Nano is available
      const availability = await aiManager.checkModelAvailability();

      if (availability === 'no' && preferLocal) {
        throw new Error('Gemini Nano is not available on this device. Please enable on-device AI in Chrome settings.');
      }

      // Initialize or get session
      let sessionId: string;
      const activeSessions = aiManager.getActiveSessions();

      if (activeSessions.length > 0) {
        // Reuse existing session
        sessionId = activeSessions[0]!;
        logger.debug("Handler", "Reusing existing AI session", { sessionId });
      } else {
        // Create new session
        sessionId = await aiManager.initializeGeminiNano({
          temperature: 0.7, // Slightly creative for text enhancement
        });
        logger.info("Handler", "Created new AI session", { sessionId });
      }

      // Process the enhancement prompt
      const startTime = performance.now();
      const enhancedText = await aiManager.processPrompt(
        sessionId,
        prompt,
        { operation: 'enhance' as any }
      );
      const processingTime = performance.now() - startTime;

      logger.info("Handler", "Enhancement completed", {
        processingTime: `${processingTime.toFixed(2)}ms`,
        originalLength: originalText?.length,
        enhancedLength: enhancedText.length,
      });

      // Get token usage
      const usage = aiManager.getSessionUsage(sessionId);
      logger.debug("Handler", "Token usage", usage);

      return {
        enhancedText,
        processingTime,
        tokensUsed: usage.used,
        source: 'gemini-nano',
      };
    }

    // For other AI tasks (summarize, embed, etc.)
    logger.warn("Handler", "Unsupported AI task type", { task });
    return { status: "processing", taskId: crypto.randomUUID() };

  } catch (error) {
    logger.error("Handler", "AI_PROCESS_REQUEST error", error);
    throw error;
  }
});

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

  const userInstructions = instructions && instructions.trim().length > 0
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

        const fencedMarkdownMatch = trimmed.match(/^```(?:markdown)?\s*\n([\s\S]*?)```$/i);
        if (fencedMarkdownMatch && typeof fencedMarkdownMatch[1] === "string") {
          trimmed = fencedMarkdownMatch[1].trimEnd();
        }

        if (trimmed.length > 0) {
          formattedContent = trimmed;
          usedAI = true;
        }
      }
    } catch (error) {
      logger.warn("Handler", "AI_FORMAT_REQUEST local formatting failed", error);
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

messageRouter.registerHandler("POCKET_SELECTION_RESPONSE", async (payload: any) => {
  const { requestId, status, pocketId, error } = payload as {
    requestId: string;
    status: "success" | "cancelled" | "error";
    pocketId?: string;
    error?: string;
  };

  logger.info("Handler", "POCKET_SELECTION_RESPONSE", { requestId, status });

  const pending = pocketSelectionRequests.get(requestId);
  if (!pending) {
    logger.warn("Handler", "No pending pocket selection request", { requestId, status });
    return { acknowledged: false };
  }

  if (status === "success" && pocketId) {
    pending.resolve(pocketId);
  } else if (status === "cancelled") {
    pending.reject(new Error("POCKET_SELECTION_CANCELLED"));
  } else {
    pending.reject(new Error(error || "Pocket selection failed"));
  }

  return { acknowledged: true };
});

// Register content handlers (Requirement 2.6, 7.6)
messageRouter.registerHandler("CONTENT_LIST", async (payload: any) => {
  logger.info("Handler", "CONTENT_LIST", payload);
  try {
    await indexedDBManager.init();
    const content = await indexedDBManager.getContentByPocket(payload.pocketId);
    logger.info("Handler", "CONTENT_LIST result", {
      pocketId: payload.pocketId,
      count: content.length,
    });
    return { content };
  } catch (error) {
    logger.error("Handler", "CONTENT_LIST error", error);
    throw error;
  }
});

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
      payload.limit || 10
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
      payload.limit || 20
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

messageRouter.registerHandler("CONTENT_DELETE", async (payload: any) => {
  logger.info("Handler", "CONTENT_DELETE", payload);
  try {
    await indexedDBManager.init();
    await indexedDBManager.deleteContent(payload.contentId);

    // Broadcast deletion so UI can update instantly
    try {
      await messageRouter.sendToSidePanel({
        kind: "CONTENT_DELETED",
        payload: { contentId: payload.contentId },
      } as any);
    } catch (e) {
      logger.warn("Handler", "Failed to broadcast content deleted event", e);
    }

    logger.info("Handler", "CONTENT_DELETE success", { contentId: payload.contentId });
    return { success: true };
  } catch (error) {
    logger.error("Handler", "CONTENT_DELETE error", error);
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

messageRouter.registerHandler("ERROR", async (payload) => {
  logger.error("Handler", "ERROR", payload);
  // Log error for debugging
  return { acknowledged: true };
});

// Initialize AI managers for streaming
const aiManager = new AIManager();
const cloudAIManager = new CloudAIManager();
const streamingHandler = getStreamingHandler(aiManager, cloudAIManager);

// Initialize metadata queue manager for background metadata generation
let metadataQueueManager: import("./metadata-queue-manager.js").MetadataQueueManager | null = null;

// Initialize metadata queue manager after a short delay to avoid blocking startup
setTimeout(async () => {
  try {
    const { MetadataQueueManager } = await import("./metadata-queue-manager.js");
    metadataQueueManager = new MetadataQueueManager(aiManager);
    metadataQueueManager.start();
    logger.info("ServiceWorker", "Metadata queue manager started");
  } catch (error) {
    logger.error("ServiceWorker", "Failed to start metadata queue manager", { error });
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
messageRouter.registerHandler("AI_PROCESS_TEXT_CORRECTION", async (payload: any) => {
  logger.info("Handler", "AI_PROCESS_TEXT_CORRECTION", payload);
  try {
    const { text } = payload;

    if (!text || typeof text !== 'string') {
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
          content: "You are a text correction assistant. Fix grammar, spelling, remove filler words (um, uh, like, you know, etc.), and slightly improve clarity while preserving the original meaning and intent. Return only the corrected text without explanations or quotes."
        }
      ]
    });

    // Process the text
    const correctedText = await aiManager.processPrompt(sessionId, text);

    // Clean up session
    aiManager.destroySession(sessionId);

    logger.info("Handler", "Text correction complete", {
      original: text,
      corrected: correctedText
    });

    return { correctedText };
  } catch (error) {
    logger.error("Handler", "AI_PROCESS_TEXT_CORRECTION error", error);
    // Return original text on error
    return { correctedText: payload.text };
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
    if (metadataQueueManager && conversation && conversation.messages.length > 0) {
      metadataQueueManager.enqueueConversation(conversationId, "normal");
      logger.info("Handler", "Queued metadata generation for new conversation", {
        conversationId,
      });
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

messageRouter.registerHandler("CONVERSATION_GENERATE_METADATA", async (payload: any) => {
  logger.info("Handler", "CONVERSATION_GENERATE_METADATA", payload);
  try {
    const { ConversationMetadataGenerator } = await import("./conversation-metadata-generator.js");
    const generator = new ConversationMetadataGenerator(aiManager);
    const metadata = await generator.generateMetadata(payload.messages);
    logger.info("Handler", "CONVERSATION_GENERATE_METADATA success");
    return { metadata };
  } catch (error) {
    logger.error("Handler", "CONVERSATION_GENERATE_METADATA error", error);
    throw error;
  }
});

messageRouter.registerHandler("CONVERSATION_SEMANTIC_SEARCH", async (payload: any) => {
  logger.info("Handler", "CONVERSATION_SEMANTIC_SEARCH", payload);
  try {
    const { SemanticSearchService } = await import("./semantic-search-service.js");
    const searchService = new SemanticSearchService(aiManager);
    const results = await searchService.searchConversations(
      payload.query,
      payload.conversations
    );
    logger.info("Handler", "CONVERSATION_SEMANTIC_SEARCH success", {
      resultsCount: results.length,
    });
    return { results };
  } catch (error) {
    logger.error("Handler", "CONVERSATION_SEMANTIC_SEARCH error", error);
    throw error;
  }
});

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
    const conversationsWithoutMetadata = conversations.filter(c => !c.metadata).length;

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

// Register abbreviation handlers (Requirement 10.1, 10.2, 10.3, 10.5)
messageRouter.registerHandler("ABBREVIATION_CREATE", async (payload: any) => {
  logger.info("Handler", "ABBREVIATION_CREATE", payload);
  try {
    const abbreviation = await abbreviationStorage.createAbbreviation(
      payload.shortcut,
      payload.expansion,
      payload.category
    );
    logger.info("Handler", "ABBREVIATION_CREATE success", { shortcut: abbreviation.shortcut });
    return { success: true, data: abbreviation };
  } catch (error) {
    logger.error("Handler", "ABBREVIATION_CREATE error", error);
    throw error;
  }
});

messageRouter.registerHandler("ABBREVIATION_GET", async (payload: any) => {
  logger.info("Handler", "ABBREVIATION_GET", payload);
  try {
    const abbreviation = await abbreviationStorage.getAbbreviation(payload.shortcut);
    logger.info("Handler", "ABBREVIATION_GET success", { found: !!abbreviation });
    return { success: true, data: abbreviation };
  } catch (error) {
    logger.error("Handler", "ABBREVIATION_GET error", error);
    throw error;
  }
});

messageRouter.registerHandler("ABBREVIATION_UPDATE", async (payload: any) => {
  logger.info("Handler", "ABBREVIATION_UPDATE", payload);
  try {
    const abbreviation = await abbreviationStorage.updateAbbreviation(payload.shortcut, {
      expansion: payload.expansion,
      category: payload.category
    });
    logger.info("Handler", "ABBREVIATION_UPDATE success", { shortcut: abbreviation.shortcut });
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
    logger.info("Handler", "ABBREVIATION_DELETE success", { shortcut: payload.shortcut });
    return { success: true };
  } catch (error) {
    logger.error("Handler", "ABBREVIATION_DELETE error", error);
    throw error;
  }
});

messageRouter.registerHandler("ABBREVIATION_LIST", async (payload: any) => {
  logger.info("Handler", "ABBREVIATION_LIST", payload);
  try {
    const abbreviations = await abbreviationStorage.listAbbreviations(payload?.category);
    logger.info("Handler", "ABBREVIATION_LIST success", { count: abbreviations.length });
    return { success: true, data: abbreviations };
  } catch (error) {
    logger.error("Handler", "ABBREVIATION_LIST error", error);
    throw error;
  }
});

messageRouter.registerHandler("ABBREVIATION_EXPAND", async (payload: any) => {
  logger.info("Handler", "ABBREVIATION_EXPAND", payload);
  try {
    const result = await abbreviationStorage.expandAbbreviation(payload.shortcut);
    logger.info("Handler", "ABBREVIATION_EXPAND success", {
      shortcut: payload.shortcut,
      expansion: result.expansion
    });
    return { success: true, data: result };
  } catch (error) {
    logger.error("Handler", "ABBREVIATION_EXPAND error", error);
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
export { lifecycle, messageRouter, logger, performanceMonitor };
