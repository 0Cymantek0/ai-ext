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
 import { contentCapture } from "./content-capture.js";
 import { selectionPreviewUI } from "./selection-preview-ui.js";
 import { buildSnippetCapturePayload, type SnippetOptions } from "./snippet-utils.js";
 import { initializeDevInstrumentation } from "../devtools/instrumentation.js";
 import "./content-logging-setup.js";

 const documentRef = typeof document !== "undefined" ? document : null;
 const contentDevtools = initializeDevInstrumentation("content", {
   domTarget: documentRef,
  rootElement: documentRef?.body ?? null,
 });

 interface ContentScriptState {
   initialized: boolean;
   pageUrl: string;

  initTime: number;
}

class ContentScriptManager {
  private state: ContentScriptState = {
    initialized: false,
    pageUrl: window.location.href,
    pageTitle: document.title,
    initTime: Date.now(),
  };
  private readonly devtools = contentDevtools;

  private recordEvent(event: string, detail?: any): void {
    if (import.meta.env?.VITE_DEBUG_RECORDER && this.devtools) {
      this.devtools.recordEvent(event, detail);
    }
  }

  private captureSnapshot(key: string, snapshot: any): void {
    if (import.meta.env?.VITE_DEBUG_RECORDER && this.devtools) {
      this.devtools.recordSnapshot(key, snapshot);
    }
  }

  private getCaptureTextLength(result: any): number | undefined {
    if (!result) {
      return undefined;
    }

    const textNode = (result?.content?.text ?? result?.content) as any;

    if (!textNode) {
      return undefined;
    }

    if (typeof textNode === "string") {
      return textNode.length;
    }

    if (typeof textNode?.characterCount === "number") {
      return textNode.characterCount;
    }

    if (typeof textNode?.content === "string") {
      return textNode.content.length;
    }

    if (Array.isArray(textNode)) {
      return textNode.join("").length;
    }

    if (typeof textNode?.length === "number") {
      return textNode.length;
    }

    return undefined;
  }

  private recordCaptureSuccess(mode: string, result: any, detail: Record<string, any> = {}): void {
    const summary: Record<string, any> = {
      mode,
      timestamp: Date.now(),
      ...detail,
    };

    const textLength = this.getCaptureTextLength(result);
    if (typeof textLength === "number") {
      summary.textLength = textLength;
    }

    const entryCount = Array.isArray(result?.entries) ? result.entries.length : undefined;
    if (typeof entryCount === "number") {
      summary.entryCount = entryCount;
    }

    this.recordEvent("capture:success", summary);
    this.captureSnapshot("capture:last", summary);
  }

  private recordCaptureError(mode: string, error: unknown): void {
    this.recordEvent("capture:error", {
      mode,
      error,
    });
  }

  /**
   * Initialize the content script
   * Requirements: 2.1, 2.7
   */
  async initialize(): Promise<void> {
    const startTime = performance.now();

    try {
      console.info("[ContentScript] Initializing on", this.state.pageUrl);

      this.recordEvent("initialize:start", { url: this.state.pageUrl });
      this.captureSnapshot("contentScriptState", this.state);

      // Initialize message listener
      initializeMessageListener();

      // Register message handlers
      this.registerMessageHandlers();

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
      this.recordEvent("initialize:complete", { initTime });
    } catch (error) {
      console.error("[ContentScript] Initialization failed", error);
      this.recordEvent("initialize:error", { error });
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
      this.recordEvent("message:CAPTURE_REQUEST:received", {
        mode: payload?.mode,
        showPreview: payload?.showPreview !== false,
        pocketId: payload?.pocketId,
      });

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

        this.recordCaptureSuccess(payload?.mode ?? "unknown", result, {
          pocketId: payload?.pocketId,
          mode: payload?.mode,
        });

        return {
          status: "success",
          result,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("[ContentScript] Capture failed", error);
        this.recordCaptureError(payload?.mode ?? "unknown", error);
        return {
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    // Handler for multi-selection capture
    messageHandler.on("CAPTURE_MULTI_SELECTION", async (payload) => {
      console.debug("[ContentScript] Received CAPTURE_MULTI_SELECTION", payload);
      this.recordEvent("message:CAPTURE_MULTI_SELECTION:received", {
        pocketId: payload?.pocketId,
      });

      try {
        const result = await contentCapture.captureMultipleSelections(true);

        this.recordCaptureSuccess("multi-selection", result, {
          selectionCount: Array.isArray(result?.items) ? result.items.length : undefined,
        });

        return {
          status: "success",
          result,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("[ContentScript] Multi-selection capture failed", error);
        this.recordCaptureError("multi-selection", error);
        return {
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    // Handler for AI processing updates
    messageHandler.on("AI_PROCESS_UPDATE", async (payload) => {
      console.debug("[ContentScript] Received AI_PROCESS_UPDATE", payload);
      this.recordEvent("message:AI_PROCESS_UPDATE", {
        status: payload?.status,
        stage: payload?.stage,
      });
      // Will be implemented in AI processing tasks
      return { acknowledged: true };
    });

    // Handler for PING (health check)
    messageHandler.on("PING", async () => {
      this.recordEvent("message:PING", {
        timestamp: Date.now(),
      });
      return { status: "ready", timestamp: Date.now() };
    });

    // Handler for capturing image data
    messageHandler.on("CAPTURE_IMAGE_DATA", async (payload) => {
      console.debug("[ContentScript] Received CAPTURE_IMAGE_DATA", payload);
      this.recordEvent("message:CAPTURE_IMAGE_DATA:received", {
        srcUrl: payload?.srcUrl,
        pageUrl: payload?.pageUrl,
      });

      try {
        const srcUrl = payload?.srcUrl as string | undefined;
        const pageUrl = payload?.pageUrl as string | undefined;

        if (!srcUrl) {
          this.recordEvent("capture:image:error", {
            reason: "missing_src",
            pageUrl,
          });
          return {
            status: "error",
            error: "No image source URL provided",
            timestamp: Date.now(),
          };
        }

        const images = Array.from(document.querySelectorAll("img"));
        const targetImage = images.find((img) => img.src === srcUrl || img.currentSrc === srcUrl);

        if (!targetImage) {
          this.recordEvent("capture:image:error", {
            reason: "not_found",
            srcUrl,
          });
          return {
            status: "error",
            error: "Image element not found on page",
            timestamp: Date.now(),
          };
        }

        const imageData = {
          src: targetImage.src || targetImage.currentSrc,
          alt: targetImage.alt || "",
          title: targetImage.title || "",
          width: targetImage.naturalWidth || targetImage.width,
          height: targetImage.naturalHeight || targetImage.height,
        };

        console.info("[ContentScript] Captured image data", {
          src: imageData.src.substring(0, 100),
          dimensions: `${imageData.width}x${imageData.height}`,
        });

        this.recordEvent("capture:image:success", {
          srcPreview: imageData.src?.substring(0, 80),
          altPresent: Boolean(imageData.alt),
          width: imageData.width,
          height: imageData.height,
        });

        return {
          status: "success",
          imageData,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("[ContentScript] CAPTURE_IMAGE_DATA failed", error);
        this.recordEvent("capture:image:error", { error });
        return {
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        };
      }
    });

    // Handler for capturing selection snippet without UI
    messageHandler.on("CAPTURE_SELECTION_SNIPPET", async (payload) => {
      console.debug("[ContentScript] Received CAPTURE_SELECTION_SNIPPET", payload);
      this.recordEvent("message:CAPTURE_SELECTION_SNIPPET:received", {
        providedText: Boolean(payload?.selectionText),
        sourceUrl: payload?.sourceUrl,
      });

      try {
        const providedText = payload?.selectionText as string | undefined;
        const sourceUrl = payload?.sourceUrl as string | undefined;
        const providedTitle = payload?.title as string | undefined;

        let selectionText = providedText?.trim();
        if (!selectionText) {
          selectionText = window.getSelection()?.toString().trim();
        }

        if (!selectionText) {
          console.error("[ContentScript] No text selected for snippet capture");
          this.recordEvent("capture:snippet:error", {
            reason: "no_selection",
            sourceUrl: sourceUrl || window.location.href,
          });
          return {
            status: "error",
            error: "No text was selected",
            timestamp: Date.now(),
          };
        }

        let captureResult: Awaited<ReturnType<typeof contentCapture.capture>> | null = null;
        try {
          captureResult = await contentCapture.capture({
            mode: "selection",
            pocketId: payload?.pocketId || "context-menu",
            sanitize: true,
          });
        } catch (error) {
          console.warn("[ContentScript] Selection capture failed, falling back to basic snippet", error);
          this.recordEvent("capture:snippet:fallback", {
            reason: error instanceof Error ? error.message : String(error ?? "unknown"),
          });
        }

        let sanitizedText = selectionText;
        let contextInfo: { before?: string; after?: string } | undefined;
        let htmlContent: string | undefined;
        let sanitizationInfo: {
          detectedPII: number;
          redactionCount: number;
          piiTypes: string[];
        } | null = null;
        let captureTimestamp = captureResult?.metadata?.timestamp;

        if (captureResult?.content) {
          const textContent = captureResult.content.text || captureResult.content;
          if (typeof textContent?.content === "string" && textContent.content.trim()) {
            sanitizedText = textContent.content;
          }

          const context = captureResult.content.context || textContent?.context;
          if (context) {
            contextInfo = {
              before: context.before || "",
              after: context.after || "",
            };
          }

          const sanitization = captureResult.content.sanitization || textContent?.sanitization;
          if (sanitization) {
            sanitizationInfo = {
              detectedPII: sanitization.detectedPII || 0,
              redactionCount: sanitization.redactionCount || 0,
              piiTypes: sanitization.piiTypes || [],
            };
          }
        } else {
          const detailedSelection = domAnalyzer.extractDetailedSelection?.(160);
          if (detailedSelection) {
            contextInfo = {
              before: detailedSelection.beforeContext || "",
              after: detailedSelection.afterContext || "",
            };
            htmlContent = detailedSelection.htmlContent || "";
          }
        }

        const snippetOptions: SnippetOptions = {
          sourceUrl: sourceUrl || window.location.href,
          title: providedTitle || document.title,
          ...(contextInfo ? { context: contextInfo } : {}),
          ...(htmlContent ? { htmlContent } : {}),
        };

        if (typeof captureTimestamp === "number") {
          snippetOptions.timestamp = captureTimestamp;
        }

        const snippet = buildSnippetCapturePayload(sanitizedText, snippetOptions);

        if (sanitizationInfo) {
          snippet.content.sanitization = sanitizationInfo;
        }

        console.info("[ContentScript] Returning captured snippet", {
          length: snippet.content.text.characterCount,
          wordCount: snippet.content.text.wordCount,
        });

        this.recordCaptureSuccess("selection-snippet", snippet, {
          sanitized: Boolean(sanitizationInfo),
          contextIncluded: Boolean(contextInfo),
        });

        return {
          status: "success",
          snippet,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("[ContentScript] CAPTURE_SELECTION_SNIPPET failed", error);
        this.recordEvent("capture:snippet:error", { error });
        return {
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
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
