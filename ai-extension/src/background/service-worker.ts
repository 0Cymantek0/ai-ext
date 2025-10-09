/**
 * Service Worker Lifecycle Management
 * Handles initialization, state persistence, and termination/restart
 * Requirements: 1.7, 15.4
 */

import { logger, performanceMonitor } from "./monitoring.js";
import { getQuotaManager } from "./quota-manager.js";
import { AIManager } from './ai-manager.js';
import { CloudAIManager } from './cloud-ai-manager.js';
import { getStreamingHandler } from './streaming-handler.js';

interface ServiceWorkerState {
  initialized: boolean;
  lastActive: number;
  activeRequests: Map<string, any>;
  sessionData: Record<string, any>;
}

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
        () => this.restoreState()
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
        "ms"
      );

      logger.info("ServiceWorker", "Initialized successfully", {
        timestamp: new Date().toISOString(),
        initTime: `${initTime.toFixed(2)}ms`,
      });

      // Check if initialization meets performance target (Requirement 13.1)
      if (initTime > 100) {
        logger.warn(
          "ServiceWorker",
          "Initialization exceeded 100ms target",
          { initTime: `${initTime.toFixed(2)}ms` }
        );
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
        "count"
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
      "count"
    );
  }

  /**
   * Complete tracked request
   */
  completeRequest(requestId: string): void {
    const request = this.state.activeRequests.get(requestId);
    if (request) {
      const duration = Date.now() - request.startTime;
      performanceMonitor.recordMetric(
        "request-duration",
        duration,
        "ms",
        { requestId, kind: request.kind }
      );

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
      "count"
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

interface MessageHandler<T = any, R = any> {
  (payload: T, sender: chrome.runtime.MessageSender): Promise<R>;
}

interface MessageResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

class MessageRouter {
  private handlers: Map<MessageKind, MessageHandler> = new Map();

  /**
   * Register a message handler for a specific message kind
   */
  registerHandler<T, R>(kind: MessageKind, handler: MessageHandler<T, R>): void {
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
  private validateMessage(message: any): message is BaseMessage<MessageKind, any> {
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
    sender: chrome.runtime.MessageSender
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
        { requestId }
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
    message: BaseMessage<MessageKind, any>
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
          message: error instanceof Error ? error.message : "Failed to send message",
        },
      };
    }
  }

  /**
   * Send message to side panel
   */
  async sendToSidePanel<T>(
    message: BaseMessage<MessageKind, any>
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
          message: error instanceof Error ? error.message : "Failed to send message",
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
            logger.debug("MessageRouter", `Failed to broadcast to tab ${tab.id}`, error);
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

// Register default handlers
messageRouter.registerHandler("CAPTURE_REQUEST", async (payload) => {
  logger.info("Handler", "CAPTURE_REQUEST", payload);
  // Placeholder - will be implemented in content capture tasks
  return { status: "queued", contentId: crypto.randomUUID() };
});

messageRouter.registerHandler("AI_PROCESS_REQUEST", async (payload) => {
  logger.info("Handler", "AI_PROCESS_REQUEST", payload);
  // Placeholder - will be implemented in AI processing tasks
  return { status: "processing", taskId: crypto.randomUUID() };
});

messageRouter.registerHandler("POCKET_CREATE", async (payload) => {
  logger.info("Handler", "POCKET_CREATE", payload);
  // Placeholder - will be implemented in storage tasks
  return { pocketId: crypto.randomUUID() };
});

messageRouter.registerHandler("POCKET_UPDATE", async (payload) => {
  logger.info("Handler", "POCKET_UPDATE", payload);
  // Placeholder - will be implemented in storage tasks
  return { success: true };
});

messageRouter.registerHandler("POCKET_LIST", async (payload) => {
  logger.info("Handler", "POCKET_LIST", payload);
  // Placeholder - will be implemented in storage tasks
  return { pockets: [] };
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

// Register streaming handlers
messageRouter.registerHandler("AI_PROCESS_STREAM_START", async (payload, sender) => {
  logger.info("Handler", "AI_PROCESS_STREAM_START", payload);
  return await streamingHandler.startStreaming(payload as any, sender);
});

messageRouter.registerHandler("AI_PROCESS_CANCEL", async (payload) => {
  logger.info("Handler", "AI_PROCESS_CANCEL", payload);
  return await streamingHandler.cancelStreaming(payload as any);
});

// Register conversation handlers (Requirement 8.8, 7.6)
messageRouter.registerHandler("CONVERSATION_LIST", async (payload) => {
  logger.info("Handler", "CONVERSATION_LIST", payload);
  try {
    const { indexedDBManager } = await import('./indexeddb-manager.js');
    await indexedDBManager.init(); // Ensure DB is initialized
    const conversations = await indexedDBManager.listConversations();
    logger.info("Handler", "CONVERSATION_LIST result", { count: conversations.length });
    return { conversations };
  } catch (error) {
    logger.error("Handler", "CONVERSATION_LIST error", error);
    throw error;
  }
});

messageRouter.registerHandler("CONVERSATION_GET", async (payload: any) => {
  logger.info("Handler", "CONVERSATION_GET", payload);
  try {
    const { indexedDBManager } = await import('./indexeddb-manager.js');
    await indexedDBManager.init();
    const conversation = await indexedDBManager.getConversation(payload.conversationId);
    logger.info("Handler", "CONVERSATION_GET result", { found: !!conversation });
    return { conversation };
  } catch (error) {
    logger.error("Handler", "CONVERSATION_GET error", error);
    throw error;
  }
});

messageRouter.registerHandler("CONVERSATION_CREATE", async (payload: any) => {
  logger.info("Handler", "CONVERSATION_CREATE", payload);
  try {
    const { indexedDBManager } = await import('./indexeddb-manager.js');
    await indexedDBManager.init();
    logger.info("Handler", "Creating conversation", { messageCount: payload.messages?.length || 0 });
    const conversationId = await indexedDBManager.saveConversation({
      pocketId: payload.pocketId,
      messages: payload.messages || [],
      model: payload.model || 'gemini-nano',
      tokensUsed: 0
    }, payload.conversationId);
    const conversation = await indexedDBManager.getConversation(conversationId);
    logger.info("Handler", "CONVERSATION_CREATE result", { id: conversationId });
    return { conversation };
  } catch (error) {
    logger.error("Handler", "CONVERSATION_CREATE error", error);
    throw error;
  }
});

messageRouter.registerHandler("CONVERSATION_UPDATE", async (payload: any) => {
  logger.info("Handler", "CONVERSATION_UPDATE", payload);
  try {
    const { indexedDBManager } = await import('./indexeddb-manager.js');
    await indexedDBManager.init();
    await indexedDBManager.updateConversation(payload.conversationId, payload.message);
    logger.info("Handler", "CONVERSATION_UPDATE success");
    return { success: true };
  } catch (error) {
    logger.error("Handler", "CONVERSATION_UPDATE error", error);
    throw error;
  }
});

messageRouter.registerHandler("CONVERSATION_DELETE", async (payload: any) => {
  logger.info("Handler", "CONVERSATION_DELETE", payload);
  try {
    const { indexedDBManager } = await import('./indexeddb-manager.js');
    await indexedDBManager.init();
    await indexedDBManager.deleteConversation(payload.conversationId);
    logger.info("Handler", "CONVERSATION_DELETE success");
    return { success: true };
  } catch (error) {
    logger.error("Handler", "CONVERSATION_DELETE error", error);
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
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: "Storage Almost Full",
      message: "AI Pocket is running low on storage. Some old data has been cleaned up automatically.",
    }).catch((error) => {
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
      logger.info("ServiceWorker", "Triggering quota cleanup due to high memory usage");
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
