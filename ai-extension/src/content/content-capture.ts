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

// Export singleton instance
export const fullPageCapture = new FullPageCapture();
