/**
 * Content Capture Module
 * Implements various content capture modes for web pages
 * Requirements: 2.1, 2.2, 2.5
 */

import { domAnalyzer, type PageMetadata, type ExtractedText } from "./dom-analyzer.js";
import { contentSanitizer, type SanitizationResult } from "./content-sanitizer.js";
import { sendMessage } from "../shared/message-client.js";

/**
 * Captured content structure
 */
export interface CapturedContent {
  id: string;
  type: "full-page" | "selection" | "element" | "note";
  url: string;
  title: string;
  capturedAt: number;
  metadata: PageMetadata;
  text: ExtractedText;
  sanitizedText: string;
  sanitizationInfo: {
    detectedPII: number;
    redactionCount: number;
  };
  screenshot?: string | undefined; // Base64 encoded image
  readability?: {
    textLength: number;
    averageWordLength: number;
    averageSentenceLength: number;
    readingTimeMinutes: number;
  } | undefined;
  structuredData?: any[] | undefined;
}

/**
 * Capture options
 */
export interface CaptureOptions {
  includeScreenshot?: boolean;
  sanitizeContent?: boolean;
  includeReadability?: boolean;
  includeStructuredData?: boolean;
}

/**
 * Full Page Capture class
 * Implements complete page content extraction with metadata and screenshots
 * Requirements: 2.1, 2.2, 2.5
 */
export class FullPageCapture {
  private readonly defaultOptions: Required<CaptureOptions> = {
    includeScreenshot: true,
    sanitizeContent: true,
    includeReadability: true,
    includeStructuredData: true,
  };

  /**
   * Capture complete page content
   * Requirements: 2.1, 2.2, 2.5
   */
  async captureFullPage(options: CaptureOptions = {}): Promise<CapturedContent> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = performance.now();

    try {
      console.info("[FullPageCapture] Starting full page capture");

      // Extract metadata
      const metadata = domAnalyzer.extractMetadata();
      console.debug("[FullPageCapture] Metadata extracted", metadata);

      // Extract text content
      const text = domAnalyzer.extractText({
        skipHidden: true,
        skipScripts: true,
        skipStyles: true,
      });
      console.debug("[FullPageCapture] Text extracted", {
        wordCount: text.wordCount,
        characterCount: text.characterCount,
      });

      // Sanitize content if requested
      let sanitizedText = text.content;
      let sanitizationResult: SanitizationResult | null = null;

      if (opts.sanitizeContent) {
        sanitizationResult = contentSanitizer.sanitize(text.content);
        sanitizedText = sanitizationResult.sanitizedContent;
        console.debug("[FullPageCapture] Content sanitized", {
          detectedPII: sanitizationResult.detectedPII.length,
          redactionCount: sanitizationResult.redactionCount,
        });
      }

      // Capture screenshot if requested
      let screenshot: string | undefined;
      if (opts.includeScreenshot) {
        screenshot = await this.captureScreenshot();
        console.debug("[FullPageCapture] Screenshot captured");
      }

      // Analyze readability if requested
      let readability;
      if (opts.includeReadability) {
        readability = domAnalyzer.analyzeReadability();
        console.debug("[FullPageCapture] Readability analyzed", readability);
      }

      // Extract structured data if requested
      let structuredData;
      if (opts.includeStructuredData) {
        structuredData = domAnalyzer.extractStructuredData();
        console.debug("[FullPageCapture] Structured data extracted", {
          count: structuredData.length,
        });
      }

      // Build captured content object
      const capturedContent: CapturedContent = {
        id: this.generateId(),
        type: "full-page",
        url: window.location.href,
        title: document.title,
        capturedAt: Date.now(),
        metadata,
        text,
        sanitizedText,
        sanitizationInfo: {
          detectedPII: sanitizationResult?.detectedPII.length || 0,
          redactionCount: sanitizationResult?.redactionCount || 0,
        },
        screenshot,
        readability,
        structuredData,
      };

      const captureTime = performance.now() - startTime;
      console.info("[FullPageCapture] Capture completed", {
        captureTime: `${captureTime.toFixed(2)}ms`,
        contentSize: sanitizedText.length,
        hasScreenshot: !!screenshot,
      });

      return capturedContent;
    } catch (error) {
      console.error("[FullPageCapture] Capture failed", error);
      throw new Error(
        `Failed to capture page: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Capture screenshot by requesting from service worker
   * Requirements: 2.5
   */
  private async captureScreenshot(): Promise<string | undefined> {
    try {
      // Request screenshot from service worker
      // Service worker has access to chrome.tabs.captureVisibleTab
      const response = await sendMessage<{ screenshot: string }>(
        "SCREENSHOT_REQUEST",
        {
          format: "png",
          quality: 90,
        }
      );

      if (!response.success || !response.data) {
        console.warn("[FullPageCapture] Screenshot capture failed", response.error);
        return undefined;
      }

      return response.data.screenshot;
    } catch (error) {
      console.error("[FullPageCapture] Screenshot request failed", error);
      return undefined;
    }
  }

  /**
   * Generate unique ID for captured content
   */
  private generateId(): string {
    return `capture_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get capture statistics
   */
  getCaptureStats(content: CapturedContent): {
    totalSize: number;
    textSize: number;
    screenshotSize: number;
    piiDetected: number;
    captureTime: number;
  } {
    const textSize = new Blob([content.sanitizedText]).size;
    const screenshotSize = content.screenshot
      ? new Blob([content.screenshot]).size
      : 0;

    return {
      totalSize: textSize + screenshotSize,
      textSize,
      screenshotSize,
      piiDetected: content.sanitizationInfo.detectedPII,
      captureTime: Date.now() - content.capturedAt,
    };
  }

  /**
   * Validate captured content
   */
  validateCapture(content: CapturedContent): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!content.id || content.id.length === 0) {
      errors.push("Missing content ID");
    }

    if (!content.url || content.url.length === 0) {
      errors.push("Missing URL");
    }

    if (!content.metadata) {
      errors.push("Missing metadata");
    }

    if (!content.text || content.text.content.length === 0) {
      errors.push("No text content extracted");
    }

    if (content.sanitizedText.length === 0) {
      errors.push("Sanitized text is empty");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Text Capture class
 * Implements selected text capture with context preservation
 * Requirements: 2.1, 2.2
 */
export class TextCapture {
  private readonly defaultContextChars = 150;

  /**
   * Capture selected text with surrounding context
   * Requirements: 2.1, 2.2
   */
  async captureSelection(options: CaptureOptions = {}): Promise<CapturedContent> {
    const opts = { ...{ sanitizeContent: true }, ...options };
    const startTime = performance.now();

    try {
      console.info("[TextCapture] Starting selection capture");

      // Check if there's a selection
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.toString().trim().length === 0) {
        throw new Error("No text selected");
      }

      // Extract metadata
      const metadata = domAnalyzer.extractMetadata();
      console.debug("[TextCapture] Metadata extracted", metadata);

      // Extract selected text with structure
      const text = domAnalyzer.extractSelection();
      if (!text) {
        throw new Error("Failed to extract selection");
      }
      console.debug("[TextCapture] Selection extracted", {
        wordCount: text.wordCount,
        characterCount: text.characterCount,
      });

      // Get selection context (surrounding text)
      const selectionContext = domAnalyzer.getSelectionContext(
        this.defaultContextChars,
        this.defaultContextChars
      );
      console.debug("[TextCapture] Context extracted", {
        contextLength: selectionContext?.length || 0,
      });

      // Get selection position information
      const range = selection.getRangeAt(0);
      const selectionInfo = this.getSelectionInfo(range);
      console.debug("[TextCapture] Selection info", selectionInfo);

      // Sanitize content if requested
      let sanitizedText = text.content;
      let sanitizationResult: SanitizationResult | null = null;

      if (opts.sanitizeContent) {
        sanitizationResult = contentSanitizer.sanitize(text.content);
        sanitizedText = sanitizationResult.sanitizedContent;
        console.debug("[TextCapture] Content sanitized", {
          detectedPII: sanitizationResult.detectedPII.length,
          redactionCount: sanitizationResult.redactionCount,
        });
      }

      // Build captured content object
      const capturedContent: CapturedContent = {
        id: this.generateId(),
        type: "selection",
        url: window.location.href,
        title: document.title,
        capturedAt: Date.now(),
        metadata: {
          ...metadata,
          // Add selection-specific metadata
          selectionContext,
          selectionInfo,
        } as any,
        text,
        sanitizedText,
        sanitizationInfo: {
          detectedPII: sanitizationResult?.detectedPII.length || 0,
          redactionCount: sanitizationResult?.redactionCount || 0,
        },
      };

      const captureTime = performance.now() - startTime;
      console.info("[TextCapture] Capture completed", {
        captureTime: `${captureTime.toFixed(2)}ms`,
        contentSize: sanitizedText.length,
        hasContext: !!selectionContext,
      });

      return capturedContent;
    } catch (error) {
      console.error("[TextCapture] Capture failed", error);
      throw new Error(
        `Failed to capture selection: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get detailed information about the current selection
   * Requirements: 2.2
   */
  private getSelectionInfo(range: Range): {
    startOffset: number;
    endOffset: number;
    containerTagName: string;
    containerSelector: string;
    selectedText: string;
    boundingRect: {
      top: number;
      left: number;
      width: number;
      height: number;
    };
  } {
    const container = range.commonAncestorContainer;
    const containerElement =
      container.nodeType === Node.ELEMENT_NODE
        ? (container as Element)
        : container.parentElement;

    const rect = range.getBoundingClientRect();

    return {
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      containerTagName: containerElement?.tagName || "UNKNOWN",
      containerSelector: containerElement
        ? this.generateSimpleSelector(containerElement)
        : "unknown",
      selectedText: range.toString(),
      boundingRect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    };
  }

  /**
   * Generate a simple CSS selector for an element
   */
  private generateSimpleSelector(element: Element): string {
    if (element.id) {
      return `#${element.id}`;
    }

    let selector = element.tagName.toLowerCase();

    if (element.className && typeof element.className === "string") {
      const classes = element.className
        .trim()
        .split(/\s+/)
        .filter((c) => c.length > 0)
        .slice(0, 2); // Limit to first 2 classes
      if (classes.length > 0) {
        selector += `.${classes.join(".")}`;
      }
    }

    return selector;
  }

  /**
   * Generate unique ID for captured content
   */
  private generateId(): string {
    return `selection_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Check if there's a valid selection
   */
  hasSelection(): boolean {
    const selection = window.getSelection();
    return !!(
      selection &&
      selection.rangeCount > 0 &&
      selection.toString().trim().length > 0
    );
  }

  /**
   * Get selection text without capturing
   */
  getSelectionText(): string | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }
    return selection.toString().trim() || null;
  }

  /**
   * Validate captured selection content
   */
  validateCapture(content: CapturedContent): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!content.id || content.id.length === 0) {
      errors.push("Missing content ID");
    }

    if (content.type !== "selection") {
      errors.push("Invalid content type for selection capture");
    }

    if (!content.url || content.url.length === 0) {
      errors.push("Missing URL");
    }

    if (!content.text || content.text.content.length === 0) {
      errors.push("No text content extracted");
    }

    if (content.sanitizedText.length === 0) {
      errors.push("Sanitized text is empty");
    }

    if (!content.metadata) {
      errors.push("Missing metadata");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instances
export const fullPageCapture = new FullPageCapture();
export const textCapture = new TextCapture();
