/**
 * Service Worker Lifecycle Management
 * Handles initialization, state persistence, and termination/restart
 * Requirements: 1.7, 15.4
 */

import { logger, performanceMonitor } from "./monitoring.js";
import { getQuotaManager } from "./quota-manager.js";
import { AIManager } from "./ai-manager.js";
import { CloudAIManager } from "./cloud-ai-manager.js";
import { getStreamingHandler } from "./streaming-handler.js";

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
    const { mode, pocketId } = payload as { mode: string; pocketId: string };
    
    // Validate payload
    if (!mode || !pocketId) {
      throw new Error("Missing required fields: mode and pocketId");
    }
    
    // Get the active tab
    const tabId = sender.tab?.id;
    if (!tabId) {
      throw new Error("No active tab found");
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
    const { contentProcessor } = await import("./content-processor.js");
    
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

messageRouter.registerHandler("POCKET_CREATE", async (payload: any) => {
  logger.info("Handler", "POCKET_CREATE", payload);
  try {
    const { indexedDBManager } = await import("./indexeddb-manager.js");
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
    const { indexedDBManager } = await import("./indexeddb-manager.js");
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
    const { indexedDBManager } = await import("./indexeddb-manager.js");
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
    const { indexedDBManager } = await import("./indexeddb-manager.js");
    await indexedDBManager.init();
    await indexedDBManager.deletePocket(payload.id);
    logger.info("Handler", "POCKET_DELETE success", { id: payload.id });
    return { success: true };
  } catch (error) {
    logger.error("Handler", "POCKET_DELETE error", error);
    throw error;
  }
});

// Register content handlers (Requirement 2.6, 7.6)
messageRouter.registerHandler("CONTENT_LIST", async (payload: any) => {
  logger.info("Handler", "CONTENT_LIST", payload);
  try {
    const { indexedDBManager } = await import("./indexeddb-manager.js");
    await indexedDBManager.init();
    const contents = await indexedDBManager.getContentByPocket(payload.pocketId);
    logger.info("Handler", "CONTENT_LIST result", {
      pocketId: payload.pocketId,
      count: contents.length,
    });
    return { contents };
  } catch (error) {
    logger.error("Handler", "CONTENT_LIST error", error);
    throw error;
  }
});

messageRouter.registerHandler("CONTENT_GET", async (payload: any) => {
  logger.info("Handler", "CONTENT_GET", payload);
  try {
    const { indexedDBManager } = await import("./indexeddb-manager.js");
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
    const { vectorSearchService } = await import("./vector-search-service.js");
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
    const { vectorSearchService } = await import("./vector-search-service.js");
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
    const { indexedDBManager } = await import("./indexeddb-manager.js");
    await indexedDBManager.init();
    await indexedDBManager.deleteContent(payload.contentId);
    logger.info("Handler", "CONTENT_DELETE success", { contentId: payload.contentId });
    return { success: true };
  } catch (error) {
    logger.error("Handler", "CONTENT_DELETE error", error);
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

// Register conversation handlers (Requirement 8.8, 7.6)
messageRouter.registerHandler("CONVERSATION_LIST", async (payload) => {
  logger.info("Handler", "CONVERSATION_LIST", payload);
  try {
    const { indexedDBManager } = await import("./indexeddb-manager.js");
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
    const { indexedDBManager } = await import("./indexeddb-manager.js");
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
    const { indexedDBManager } = await import("./indexeddb-manager.js");
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
    return { conversation };
  } catch (error) {
    logger.error("Handler", "CONVERSATION_CREATE error", error);
    throw error;
  }
});

messageRouter.registerHandler("CONVERSATION_UPDATE", async (payload: any) => {
  logger.info("Handler", "CONVERSATION_UPDATE", payload);
  try {
    const { indexedDBManager } = await import("./indexeddb-manager.js");
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

messageRouter.registerHandler("CONVERSATION_DELETE", async (payload: any) => {
  logger.info("Handler", "CONVERSATION_DELETE", payload);
  try {
    const { indexedDBManager } = await import("./indexeddb-manager.js");
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
    const { createAbbreviation } = await import("./abbreviation-storage.js");
    const abbreviation = await createAbbreviation(
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
    const { getAbbreviation } = await import("./abbreviation-storage.js");
    const abbreviation = await getAbbreviation(payload.shortcut);
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
    const { updateAbbreviation } = await import("./abbreviation-storage.js");
    const abbreviation = await updateAbbreviation(payload.shortcut, {
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
    const { deleteAbbreviation } = await import("./abbreviation-storage.js");
    await deleteAbbreviation(payload.shortcut);
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
    const { listAbbreviations } = await import("./abbreviation-storage.js");
    const abbreviations = await listAbbreviations(payload?.category);
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
    const { expandAbbreviation } = await import("./abbreviation-storage.js");
    const result = await expandAbbreviation(payload.shortcut);
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
