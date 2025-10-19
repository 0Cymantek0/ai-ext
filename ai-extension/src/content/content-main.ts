/**
 * Content Script Main Entry Point
 * Handles initialization and communication with service worker
 * Requirements: 2.1, 2.7
 */

import {
  initializeMessageListener,
  messageHandler,
  sendMessage,
} from "../shared/message-client.js";
import { domAnalyzer } from "./dom-analyzer.js";
import { contentSanitizer } from "./content-sanitizer.js";
import { contentCapture } from "./content-capture.js";
import { selectionPreviewUI } from "./selection-preview-ui.js";
import { contextMenuCaptureHandler } from "./context-menu-capture.js";
import { PocketSelector } from "./pocket-selector.js";

interface ContentScriptState {
  initialized: boolean;
  pageUrl: string;
  pageTitle: string;
  initTime: number;
}

class ContentScriptManager {
  private state: ContentScriptState = {
    initialized: false,
    pageUrl: window.location.href,
    pageTitle: document.title,
    initTime: Date.now(),
  };

  /**
   * Initialize the content script
   * Requirements: 2.1, 2.7
   */
  async initialize(): Promise<void> {
    const startTime = performance.now();

    try {
      console.info("[ContentScript] Initializing on", this.state.pageUrl);

      // Initialize message listener
      initializeMessageListener();

      // Register message handlers
      this.registerMessageHandlers();

      // Initialize context menu capture handler
      contextMenuCaptureHandler.initialize();

      // Set up page lifecycle listeners
      this.setupLifecycleListeners();

      // Notify service worker that content script is ready
      await this.notifyReady();

      this.state.initialized = true;

      const initTime = performance.now() - startTime;
      console.info("[ContentScript] Initialized successfully", {
        url: this.state.pageUrl,
        title: this.state.pageTitle,
        initTime: `${initTime.toFixed(2)}ms`,
      });
    } catch (error) {
      console.error("[ContentScript] Initialization failed", error);
      throw error;
    }
  }

  /**
   * Register handlers for messages from service worker
   */
  private registerMessageHandlers(): void {
    // Handler for capture requests from service worker
    messageHandler.on("CAPTURE_REQUEST", async (payload) => {
      console.debug("[ContentScript] Received CAPTURE_REQUEST", payload);

      try {
        // For selection mode, show preview UI if requested
        if (payload.mode === "selection" && payload.showPreview !== false) {
          return await this.handleSelectionCaptureWithPreview(payload);
        }

        // Use content capture coordinator to handle all capture modes
        const result = await contentCapture.capture({
          mode: payload.mode,
          pocketId: payload.pocketId,
          sanitize: true,
        });

        return {
          status: "success",
          result,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("[ContentScript] Capture failed", error);
        return {
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    // Handler for multi-selection capture
    messageHandler.on("CAPTURE_MULTI_SELECTION", async (payload) => {
      console.debug("[ContentScript] Received CAPTURE_MULTI_SELECTION", payload);

      try {
        const result = await contentCapture.captureMultipleSelections(true);

        return {
          status: "success",
          result,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("[ContentScript] Multi-selection capture failed", error);
        return {
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    // Handler for AI processing updates
    messageHandler.on("AI_PROCESS_UPDATE", async (payload) => {
      console.debug("[ContentScript] Received AI_PROCESS_UPDATE", payload);
      // Will be implemented in AI processing tasks
      return { acknowledged: true };
    });

    // Handler for PING (health check)
    messageHandler.on("PING", async () => {
      return { status: "ready", timestamp: Date.now() };
    });

    // Handler for showing pocket selector
    messageHandler.on("SHOW_POCKET_SELECTOR", async (payload) => {
      console.debug("[ContentScript] Received SHOW_POCKET_SELECTOR", payload);

      try {
        const { pockets, selectionText, sourceUrl } = payload;

        // Show pocket selector UI
        const pocketSelector = new PocketSelector();
        const selectedPocketId = await pocketSelector.show(pockets);

        if (!selectedPocketId) {
          // User cancelled
          return {
            status: "cancelled",
            timestamp: Date.now(),
          };
        }

        // User selected a pocket, now capture and save
        const result = await contentCapture.capture({
          mode: "selection",
          pocketId: selectedPocketId,
          sanitize: true,
        });

        // Send the captured content to service worker to save
        const saveResponse = await sendMessage("CAPTURE_REQUEST", {
          mode: "selection",
          pocketId: selectedPocketId,
          content: result.content,
          metadata: result.metadata,
        });

        if (saveResponse.success) {
          return {
            status: "success",
            pocketId: selectedPocketId,
            contentId: saveResponse.data?.contentId,
            timestamp: Date.now(),
          };
        } else {
          throw new Error(saveResponse.error?.message || "Failed to save");
        }
      } catch (error) {
        console.error("[ContentScript] Pocket selector failed", error);
        return {
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    console.debug("[ContentScript] Message handlers registered");
  }

  /**
   * Handle selection capture with preview UI
   * Requirements: 2.1, 2.2, 2.3
   */
  private async handleSelectionCaptureWithPreview(payload: any): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        // Capture selection with preview
        const { result, editablePreview, validation } = 
          await contentCapture.captureWithPreview({
            mode: "selection",
            pocketId: payload.pocketId,
            sanitize: true,
          });

        if (!editablePreview) {
          // No preview available, return result directly
          resolve({
            status: "success",
            result,
            timestamp: Date.now(),
          });
          return;
        }

        // Show preview UI
        selectionPreviewUI.show(editablePreview, validation, {
          onSave: (editedText: string) => {
            // Update result with edited text
            result.content.text = editedText;
            
            resolve({
              status: "success",
              result,
              edited: true,
              timestamp: Date.now(),
            });
          },
          onCancel: () => {
            reject(new Error("Capture cancelled by user"));
          },
          onEdit: (text: string) => {
            console.debug("[ContentScript] Text edited", { length: text.length });
          },
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Set up page lifecycle listeners
   */
  private setupLifecycleListeners(): void {
    // Listen for page unload to cleanup
    window.addEventListener("beforeunload", () => {
      this.cleanup();
    });

    // Listen for visibility changes
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        console.debug("[ContentScript] Page hidden");
      } else {
        console.debug("[ContentScript] Page visible");
      }
    });

    // Listen for URL changes (for SPAs)
    let lastUrl = window.location.href;
    const urlObserver = new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        this.state.pageUrl = currentUrl;
        console.debug("[ContentScript] URL changed", { url: currentUrl });
      }
    });

    urlObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    console.debug("[ContentScript] Lifecycle listeners set up");
  }

  /**
   * Notify service worker that content script is ready
   */
  private async notifyReady(): Promise<void> {
    try {
      const response = await sendMessage("CAPTURE_RESULT", {
        status: "ready",
        url: this.state.pageUrl,
        title: this.state.pageTitle,
        timestamp: Date.now(),
      });

      if (!response.success) {
        // Silently log - this is not critical for text enhancer functionality
        console.debug(
          "[ContentScript] Service worker notification skipped",
          response.error
        );
      }
    } catch (error) {
      // Non-critical error - content scripts can work independently
      console.debug("[ContentScript] Service worker not responding (non-critical)", error);
    }
  }

  /**
   * Send message to service worker
   */
  async sendToServiceWorker<T = any>(
    kind: any,
    payload: any,
  ): Promise<T | null> {
    try {
      const response = await sendMessage<T>(kind, payload);

      if (!response.success) {
        console.error(
          "[ContentScript] Service worker returned error",
          response.error,
        );
        return null;
      }

      return response.data || null;
    } catch (error) {
      console.error("[ContentScript] Failed to send message", error);
      return null;
    }
  }

  /**
   * Get current page information
   */
  getPageInfo(): {
    url: string;
    title: string;
    domain: string;
  } {
    return {
      url: this.state.pageUrl,
      title: this.state.pageTitle,
      domain: new URL(this.state.pageUrl).hostname,
    };
  }

  /**
   * Get DOM analyzer instance
   */
  getDOMAnalyzer() {
    return domAnalyzer;
  }

  /**
   * Check if content script is initialized
   */
  isInitialized(): boolean {
    return this.state.initialized;
  }

  /**
   * Cleanup on page unload
   */
  private cleanup(): void {
    console.debug("[ContentScript] Cleaning up");
    // Cleanup will be expanded in future tasks
  }
}

// Create singleton instance
const contentScriptManager = new ContentScriptManager();

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    contentScriptManager.initialize().catch((error) => {
      console.error("[ContentScript] Failed to initialize", error);
    });
  });
} else {
  // DOM already loaded
  contentScriptManager.initialize().catch((error) => {
    console.error("[ContentScript] Failed to initialize", error);
  });
}

// Export for use by other content scripts
export { contentScriptManager };
