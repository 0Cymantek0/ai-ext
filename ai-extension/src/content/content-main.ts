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
import { fullPageCapture, textCapture } from "./content-capture.js";
import { elementSelector } from "./element-selector.js";

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

      // Set up page lifecycle listeners
      this.setupLifecycleListeners();

      // Set up element selector event listeners
      this.setupElementSelectorListeners();

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
        // Use content capture module to extract content based on mode
        let capturedContent;
        
        switch (payload.mode) {
          case "full-page":
            // Use the new full page capture implementation
            capturedContent = await fullPageCapture.captureFullPage({
              includeScreenshot: true,
              sanitizeContent: true,
              includeReadability: true,
              includeStructuredData: true,
            });
            break;
            
          case "selection":
            // Use the new text capture implementation
            capturedContent = await textCapture.captureSelection({
              sanitizeContent: true,
            });
            break;
            
          case "element":
            // Enable element selector mode
            elementSelector.enableSelectionMode();
            // Return immediately - actual capture happens when user confirms
            return {
              status: "element-selection-active",
              message: "Element selection mode enabled. Select elements and click Capture.",
            };
            
          default:
            // Will be implemented in future content capture tasks
            capturedContent = {
              status: "received",
              url: this.state.pageUrl,
              title: this.state.pageTitle,
            };
        }
        
        return {
          status: "success",
          content: capturedContent,
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

    // Handler for AI processing updates
    messageHandler.on("AI_PROCESS_UPDATE", async (payload) => {
      console.debug("[ContentScript] Received AI_PROCESS_UPDATE", payload);
      // Will be implemented in AI processing tasks
      return { acknowledged: true };
    });

    // Handler for enabling element selector
    messageHandler.on("ENABLE_ELEMENT_SELECTOR", async () => {
      console.debug("[ContentScript] Received ENABLE_ELEMENT_SELECTOR");
      
      try {
        elementSelector.enableSelectionMode();
        return {
          status: "success",
          message: "Element selection mode enabled",
        };
      } catch (error) {
        console.error("[ContentScript] Failed to enable element selector", error);
        return {
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    // Handler for disabling element selector
    messageHandler.on("DISABLE_ELEMENT_SELECTOR", async () => {
      console.debug("[ContentScript] Received DISABLE_ELEMENT_SELECTOR");
      
      try {
        elementSelector.disableSelectionMode();
        return {
          status: "success",
          message: "Element selection mode disabled",
        };
      } catch (error) {
        console.error("[ContentScript] Failed to disable element selector", error);
        return {
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    console.debug("[ContentScript] Message handlers registered");
  }

  /**
   * Set up element selector event listeners
   */
  private setupElementSelectorListeners(): void {
    // Listen for element capture completion
    window.addEventListener("ai-pocket-elements-captured", async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { elements, count, timestamp } = customEvent.detail;

      console.info("[ContentScript] Elements captured", { count, timestamp });

      try {
        // Send captured elements to service worker
        const response = await sendMessage("CAPTURE_RESULT", {
          status: "success",
          content: elements,
          mode: "element",
          count,
          timestamp,
        });

        if (!response.success) {
          console.error("[ContentScript] Failed to send captured elements", response.error);
        }
      } catch (error) {
        console.error("[ContentScript] Error sending captured elements", error);
      }
    });

    console.debug("[ContentScript] Element selector listeners set up");
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
        console.warn(
          "[ContentScript] Failed to notify service worker",
          response.error
        );
      }
    } catch (error) {
      console.error("[ContentScript] Error notifying service worker", error);
    }
  }

  /**
   * Send message to service worker
   */
  async sendToServiceWorker<T = any>(
    kind: any,
    payload: any
  ): Promise<T | null> {
    try {
      const response = await sendMessage<T>(kind, payload);

      if (!response.success) {
        console.error(
          "[ContentScript] Service worker returned error",
          response.error
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
