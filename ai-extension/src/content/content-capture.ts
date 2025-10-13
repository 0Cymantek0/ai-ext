/**
 * Content Capture Coordinator
 * Handles different capture modes and coordinates content extraction
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { domAnalyzer, type ExtractedText, type PageMetadata } from "./dom-analyzer.js";
import { contentSanitizer } from "./content-sanitizer.js";
import { elementSelector, type SelectedElement } from "./element-selector.js";

export type CaptureMode = "full-page" | "selection" | "element" | "note";

export interface CaptureResult {
  mode: CaptureMode;
  content: any;
  metadata: PageMetadata;
  timestamp: number;
  preview?: string;
}

export interface CaptureOptions {
  mode: CaptureMode;
  pocketId: string;
  sanitize?: boolean;
}

export class ContentCapture {
  /**
   * Capture content based on mode
   */
  async capture(options: CaptureOptions): Promise<CaptureResult> {
    const { mode, sanitize = true } = options;

    console.info("[ContentCapture] Starting capture", { mode });

    const metadata = domAnalyzer.extractMetadata();
    const timestamp = Date.now();

    let content: any;
    let preview: string | undefined;

    switch (mode) {
      case "full-page":
        content = await this.captureFullPage(sanitize);
        preview = this.generatePreview(content.text.content);
        break;

      case "selection":
        content = await this.captureSelection(sanitize);
        preview = this.generatePreview(content.text.content);
        break;

      case "element":
        content = await this.captureElements(sanitize);
        preview = this.generateElementPreview(content.elements);
        break;

      case "note":
        content = await this.captureNote();
        preview = this.generatePreview(content.text);
        break;

      default:
        throw new Error(`Unsupported capture mode: ${mode}`);
    }

    const result: CaptureResult = {
      mode,
      content,
      metadata,
      timestamp,
      preview,
    };

    console.info("[ContentCapture] Capture completed", {
      mode,
      hasContent: !!content,
      previewLength: preview?.length,
    });

    return result;
  }

  /**
   * Capture full page content
   * Requirements: 2.1, 2.2, 2.5, 3.4
   */
  private async captureFullPage(sanitize: boolean): Promise<any> {
    console.info("[ContentCapture] Starting full page capture");

    // Extract all content
    const extractedText = domAnalyzer.extractText();
    const structuredData = domAnalyzer.extractStructuredData();
    const readability = domAnalyzer.analyzeReadability();

    // Format content with structure
    const formattedContent = domAnalyzer.formatExtractedContent(extractedText);

    let processedContent = extractedText.content;
    let formattedProcessedContent = formattedContent;
    let sanitizationInfo: any = null;

    if (sanitize) {
      const sanitized = contentSanitizer.sanitize(extractedText.content);
      processedContent = sanitized.sanitizedContent;

      // Also sanitize formatted content
      const sanitizedFormatted = contentSanitizer.sanitize(formattedContent);
      formattedProcessedContent = sanitizedFormatted.sanitizedContent;

      sanitizationInfo = {
        detectedPII: sanitized.detectedPII.length,
        redactionCount: sanitized.redactionCount,
        piiTypes: sanitized.detectedPII.map((pii) => pii.type),
      };
    }

    // Capture screenshot
    const screenshot = await this.captureScreenshot();

    console.info("[ContentCapture] Full page capture completed", {
      textLength: processedContent.length,
      headings: extractedText.headings.length,
      lists: extractedText.lists.length,
      tables: extractedText.tables.length,
      images: extractedText.images.length,
      links: extractedText.links.length,
      hasScreenshot: !!screenshot,
    });

    return {
      text: {
        ...extractedText,
        content: processedContent,
        formattedContent: formattedProcessedContent,
      },
      structuredData,
      readability,
      sanitization: sanitizationInfo,
      screenshot,
      images: extractedText.images,
      links: extractedText.links,
      headings: extractedText.headings,
      lists: extractedText.lists,
      tables: extractedText.tables,
    };
  }

  /**
   * Capture selected text
   */
  private async captureSelection(sanitize: boolean): Promise<any> {
    const selection = domAnalyzer.extractSelection();

    if (!selection) {
      throw new Error("No text selected");
    }

    let processedContent = selection.content;
    let sanitizationInfo: any = null;

    if (sanitize) {
      const sanitized = contentSanitizer.sanitize(selection.content);
      processedContent = sanitized.sanitizedContent;
      sanitizationInfo = {
        detectedPII: sanitized.detectedPII.length,
        redactionCount: sanitized.redactionCount,
        piiTypes: sanitized.detectedPII.map((pii) => pii.type),
      };
    }

    const context = domAnalyzer.getSelectionContext();

    return {
      text: {
        ...selection,
        content: processedContent,
      },
      context,
      sanitization: sanitizationInfo,
    };
  }

  /**
   * Capture specific elements
   */
  private async captureElements(sanitize: boolean): Promise<any> {
    return new Promise((resolve, reject) => {
      elementSelector.enable({
        multiSelect: true,
        onSelect: async (elements: SelectedElement[]) => {
          try {
            const processedElements = await Promise.all(
              elements.map(async (el) => {
                let textContent = el.info.textContent;
                let sanitizationInfo: any = null;

                if (sanitize && textContent) {
                  const sanitized = contentSanitizer.sanitize(textContent);
                  textContent = sanitized.sanitizedContent;
                  sanitizationInfo = {
                    detectedPII: sanitized.detectedPII.length,
                    redactionCount: sanitized.redactionCount,
                    piiTypes: sanitized.detectedPII.map((pii) => pii.type),
                  };
                }

                // Capture element screenshot
                const screenshot = await this.captureElementScreenshot(el.element);

                return {
                  ...el.info,
                  textContent,
                  sanitization: sanitizationInfo,
                  screenshot,
                };
              })
            );

            resolve({
              elements: processedElements,
              count: processedElements.length,
            });
          } catch (error) {
            reject(error);
          }
        },
        onCancel: () => {
          reject(new Error("Element selection cancelled"));
        },
      });
    });
  }

  /**
   * Capture manual note
   */
  private async captureNote(): Promise<any> {
    // For now, return a placeholder
    // This will be enhanced with a proper note editor UI
    return {
      text: "",
      type: "note",
      editable: true,
    };
  }

  /**
   * Capture screenshot of the viewport
   * Requirements: 2.1, 2.5
   */
  private async captureScreenshot(): Promise<string | null> {
    try {
      // Request screenshot from background script
      // Content scripts cannot directly call chrome.tabs.captureVisibleTab
      const response = await chrome.runtime.sendMessage({
        kind: "CAPTURE_SCREENSHOT",
        payload: {},
      });

      if (response && response.screenshot) {
        return response.screenshot;
      }

      return null;
    } catch (error) {
      console.warn("[ContentCapture] Screenshot capture failed", error);
      return null;
    }
  }

  /**
   * Capture screenshot of a specific element
   */
  private async captureElementScreenshot(element: HTMLElement): Promise<string | null> {
    try {
      // Create a canvas to draw the element
      const rect = element.getBoundingClientRect();
      const canvas = document.createElement("canvas");
      canvas.width = rect.width;
      canvas.height = rect.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // Draw element (simplified - in production, use html2canvas or similar)
      ctx.fillStyle = window.getComputedStyle(element).backgroundColor || "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      return canvas.toDataURL("image/png");
    } catch (error) {
      console.warn("[ContentCapture] Element screenshot failed", error);
      return null;
    }
  }

  /**
   * Generate text preview
   */
  private generatePreview(text: string, maxLength: number = 200): string {
    if (!text) return "";

    const cleaned = text.trim().replace(/\s+/g, " ");

    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    return cleaned.substring(0, maxLength) + "...";
  }

  /**
   * Generate element preview
   */
  private generateElementPreview(elements: any[]): string {
    if (!elements || elements.length === 0) return "";

    const summaries = elements.map((el) => {
      const tag = el.tagName.toLowerCase();
      const text = this.generatePreview(el.textContent, 50);
      return `<${tag}>: ${text}`;
    });

    return summaries.join(" | ");
  }

  /**
   * Detect media type from element
   */
  detectMediaType(element: HTMLElement): "image" | "video" | "audio" | null {
    const tagName = element.tagName.toLowerCase();

    if (tagName === "img") return "image";
    if (tagName === "video") return "video";
    if (tagName === "audio") return "audio";

    // Check for background images
    const style = window.getComputedStyle(element);
    if (style.backgroundImage && style.backgroundImage !== "none") {
      return "image";
    }

    return null;
  }

  /**
   * Extract media content
   */
  async extractMedia(element: HTMLElement): Promise<any> {
    const mediaType = this.detectMediaType(element);

    if (!mediaType) {
      throw new Error("Element is not a media element");
    }

    switch (mediaType) {
      case "image":
        return this.extractImage(element);
      case "video":
        return this.extractVideo(element);
      case "audio":
        return this.extractAudio(element);
      default:
        throw new Error(`Unsupported media type: ${mediaType}`);
    }
  }

  /**
   * Extract image data
   */
  private async extractImage(element: HTMLElement): Promise<any> {
    const img = element as HTMLImageElement;

    return {
      type: "image",
      src: img.src,
      alt: img.alt || "",
      width: img.naturalWidth,
      height: img.naturalHeight,
      title: img.title,
    };
  }

  /**
   * Extract video data
   */
  private async extractVideo(element: HTMLElement): Promise<any> {
    const video = element as HTMLVideoElement;

    return {
      type: "video",
      src: video.src || video.currentSrc,
      poster: video.poster,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  }

  /**
   * Extract audio data
   */
  private async extractAudio(element: HTMLElement): Promise<any> {
    const audio = element as HTMLAudioElement;

    return {
      type: "audio",
      src: audio.src || audio.currentSrc,
      duration: audio.duration,
    };
  }
}

// Export singleton instance
export const contentCapture = new ContentCapture();
