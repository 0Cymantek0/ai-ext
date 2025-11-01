/*
 * ContentCapture with mode routing and previews
 * Coordinates DOM, element, and media subsystems with optional sanitization.
 */

import {
  domAnalyzer,
  type PageMetadata,
  type ExtractedText,
  type DetailedSelection,
} from "../dom-analyzer.js";
import { contentSanitizer } from "../content-sanitizer.js";
import {
  mediaCapture,
  type MediaCaptureOptions,
  type MediaCaptureResult,
} from "../media-capture.js";
import { reliableSelectionCapture } from "../selection-reliability.js";

// Interfaces and enums
export type CaptureMode =
  | "full-page"
  | "selection"
  | "element"
  | "note"
  | "media";

export enum CaptureErrorType {
  SELECTION_EMPTY = "SELECTION_EMPTY",
  DOM_ACCESS = "DOM_ACCESS",
  MEDIA_LOAD = "MEDIA_LOAD",
  STORAGE = "STORAGE",
  SANITIZATION = "SANITIZATION",
  UNKNOWN = "UNKNOWN",
}

export class CaptureError extends Error {
  readonly type: CaptureErrorType;
  readonly details?: any;
  readonly userMessage: string;
  constructor(type: CaptureErrorType, message: string, details?: any) {
    super(message);
    this.name = "CaptureError";
    this.type = type;
    this.details = details;
    this.userMessage = mapCaptureErrorToUserMessage(type);
  }
}

/**
 * Map CaptureErrorType to user-friendly messages
 */
function mapCaptureErrorToUserMessage(type: CaptureErrorType): string {
  switch (type) {
    case CaptureErrorType.SELECTION_EMPTY:
      return "No text selected. Please select text and try again.";
    case CaptureErrorType.DOM_ACCESS:
      return "Couldn't access page content. The page may be restricted.";
    case CaptureErrorType.SANITIZATION:
      return "Sanitization failed. Try again without sanitization.";
    case CaptureErrorType.STORAGE:
      return "Couldn't save content. Check storage or try again.";
    case CaptureErrorType.MEDIA_LOAD:
      return "Some media couldn't be captured; continue or retry.";
    case CaptureErrorType.UNKNOWN:
    default:
      return "An unexpected error occurred. Please try again.";
  }
}

export interface CaptureOptions {
  mode: CaptureMode;
  pocketId: string;
  sanitize?: boolean;
  // Optional inputs for specific modes
  noteText?: string;
  media?: MediaCaptureOptions;
}

export interface CaptureResult {
  mode: CaptureMode;
  content: any;
  metadata: PageMetadata;
  timestamp: number;
  preview?: string | null;
}

export interface EditablePreview {
  id: string;
  text: string;
  htmlContent?: string;
  context?: { before?: string; after?: string; full?: string };
  sourceLocation?: {
    url?: string;
    elementPath?: string;
    containerTag?: string;
    position?: { top: number; left: number; width: number; height: number };
  };
  timestamp: number;
  editable: boolean;
  preview: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Lightweight dependency interfaces for testability
export interface IDOMAnalyzer {
  extractMetadata(): PageMetadata;
  extractText(): ExtractedText;
  extractStructuredData?(): any;
  analyzeReadability?(): any;
  extractSelection(): ExtractedText | null;
  extractDetailedSelection?(contextChars?: number): DetailedSelection | null;
  getSelectionContext?(before: number, after: number): string | null;
}

export interface IContentSanitizer {
  sanitize(content: string): {
    sanitizedContent: string;
    redactionCount: number;
    detectedPII: Array<{ type: string }>;
  };
}

export interface IMediaCapture {
  captureAllMedia(options?: MediaCaptureOptions): Promise<MediaCaptureResult>;
}

export interface IReliableSelectionCapture {
  captureWithReliability<T>(op: () => Promise<T>, opts?: any): Promise<T>;
}

export interface IContentProcessor {
  processContent(options: {
    pocketId: string;
    mode: CaptureMode;
    content: any;
    metadata: any;
    sourceUrl: string;
    sanitize?: boolean;
  }): Promise<any>;
}

export interface BackgroundMessenger {
  captureScreenshot(): Promise<string | null>;
}

import type { SelectedElement } from "../element-selector.js";

export type ContentCaptureDeps = {
  domAnalyzer: IDOMAnalyzer;
  sanitizer: IContentSanitizer;
  media: IMediaCapture;
  selection: IReliableSelectionCapture;
  processor?: IContentProcessor; // optional for unit tests
  messenger?: BackgroundMessenger; // for screenshot capture
  elementProvider?: () => Promise<SelectedElement[]>; // optional hook for element mode
};

function defaultMessenger(): BackgroundMessenger {
  return {
    async captureScreenshot(): Promise<string | null> {
      try {
        const response: any = await chrome.runtime.sendMessage({
          kind: "CAPTURE_SCREENSHOT",
          payload: {},
        });
        if (response && response.screenshot) {
          return response.screenshot as string;
        }
        console.warn(
          "[ContentCapture] Screenshot capture returned no data (non-blocking)",
        );
        return null;
      } catch (err) {
        console.warn(
          "[ContentCapture] Screenshot capture failed (non-blocking)",
          err,
        );
        return null;
      }
    },
  };
}

export class ContentCapture {
  private deps: ContentCaptureDeps;

  constructor(deps?: Partial<ContentCaptureDeps>) {
    this.deps = {
      domAnalyzer,
      sanitizer: contentSanitizer,
      media: mediaCapture,
      selection: reliableSelectionCapture,
      messenger: defaultMessenger(),
      ...deps,
    } as ContentCaptureDeps;
  }

  /**
   * Lightweight logger with [ContentCapture] prefix
   */
  private log = {
    start: (mode: CaptureMode, sanitize: boolean, pocketId: string) => {
      console.info("[ContentCapture] Capture started", {
        mode,
        sanitize,
        pocketId: this.maskPocketId(pocketId),
        timestamp: new Date().toISOString(),
      });
    },
    completion: (
      mode: CaptureMode,
      duration: number,
      summary: any,
      warnings: string[],
    ) => {
      console.info("[ContentCapture] Capture completed", {
        mode,
        durationMs: Math.round(duration),
        summary,
        warnings: warnings.length > 0 ? warnings : undefined,
      });
    },
    error: (mode: CaptureMode, duration: number, error: CaptureError) => {
      console.error("[ContentCapture] Capture failed", {
        mode,
        durationMs: Math.round(duration),
        errorType: error.type,
        message: error.message,
        userMessage: error.userMessage,
      });
    },
  };

  /**
   * Mask pocket ID for privacy in logs (show first 8 chars)
   */
  private maskPocketId(pocketId: string): string {
    if (!pocketId || pocketId.length <= 8) return pocketId;
    return pocketId.slice(0, 8) + "...";
  }

  async capture(options: CaptureOptions): Promise<CaptureResult> {
    const { mode, sanitize = false, pocketId } = options;
    const startTime = performance.now();

    // Log capture start
    this.log.start(mode, sanitize, pocketId);

    // Always extract metadata first
    let metadata: PageMetadata;
    try {
      metadata = this.deps.domAnalyzer.extractMetadata();
    } catch (err) {
      const duration = performance.now() - startTime;
      const captureError = new CaptureError(
        CaptureErrorType.DOM_ACCESS,
        "Failed to extract page metadata",
        err,
      );
      this.log.error(mode, duration, captureError);
      throw captureError;
    }

    const timestamp = Date.now();

    try {
      let content: any;
      let preview: string | null = null;

      switch (mode) {
        case "full-page":
          content = await this.captureFullPage(sanitize);
          preview = this.truncate((content?.text?.content as string) || "");
          break;
        case "selection":
          content = await this.captureSelection(sanitize);
          preview = this.selectionPreview(content);
          break;
        case "element":
          content = await this.captureElements(sanitize);
          preview = this.elementPreview(content);
          break;
        case "note":
          content = await this.captureNote(options.noteText || "", sanitize);
          preview = this.truncate(content.text || "");
          break;
        case "media":
          content = await this.captureMedia(options.media);
          preview = this.mediaPreview(content);
          break;
        default:
          const unknownError = new CaptureError(
            CaptureErrorType.UNKNOWN,
            `Unsupported capture mode: ${mode}`,
          );
          const duration = performance.now() - startTime;
          this.log.error(mode, duration, unknownError);
          throw unknownError;
      }

      // Store content via processor if available
      if (this.deps.processor) {
        try {
          await this.deps.processor.processContent({
            pocketId: options.pocketId,
            mode,
            content,
            metadata,
            sourceUrl: metadata.url,
            sanitize,
          });
        } catch (err) {
          const duration = performance.now() - startTime;
          const storageError = new CaptureError(
            CaptureErrorType.STORAGE,
            "Failed to store captured content",
            err,
          );
          this.log.error(mode, duration, storageError);
          throw storageError;
        }
      }

      // Generate summary and warnings for completion log
      const summary = this.generateCaptureSummary(mode, content);
      const warnings = this.extractWarnings(content);
      const duration = performance.now() - startTime;
      this.log.completion(mode, duration, summary, warnings);

      return { mode, content, metadata, timestamp, preview };
    } catch (err: any) {
      const duration = performance.now() - startTime;

      if (err instanceof CaptureError) {
        // Already logged in specific handlers, but log again if not
        if (
          !err.message.includes("Failed to extract page metadata") &&
          !err.message.includes("Unsupported capture mode") &&
          !err.message.includes("Failed to store captured content")
        ) {
          this.log.error(mode, duration, err);
        }
        throw err;
      }

      // Map common errors
      const message =
        typeof err?.message === "string" ? err.message : "Unknown error";
      let captureError: CaptureError;

      if (/selection/i.test(message) && /empty|no/i.test(message)) {
        captureError = new CaptureError(
          CaptureErrorType.SELECTION_EMPTY,
          "No text selected",
          err,
        );
      } else {
        captureError = new CaptureError(CaptureErrorType.UNKNOWN, message, err);
      }

      this.log.error(mode, duration, captureError);
      throw captureError;
    }
  }

  /**
   * Generate capture summary for logging
   */
  private generateCaptureSummary(mode: CaptureMode, content: any): any {
    switch (mode) {
      case "full-page":
        return {
          textLength: content?.text?.content?.length || 0,
          wordCount: content?.text?.wordCount || 0,
          hasScreenshot: !!content?.screenshot,
          structuredDataCount: content?.structuredData?.length || 0,
        };
      case "selection":
        const text =
          typeof content.text === "string"
            ? content.text
            : content.text?.content || "";
        return {
          textLength: text.length,
          hasContext: !!(content.context?.before || content.context?.after),
          hasHtml: !!content.htmlContent,
        };
      case "element":
        return {
          elementCount: content?.elements?.length || 0,
          hasPreview: content?.elements?.some((e: any) => e.preview),
          hasSnippets: content?.elements?.some((e: any) => e.snippets),
        };
      case "note":
        return {
          textLength: content?.text?.length || 0,
        };
      case "media":
        return {
          imageCount: content?.images?.length || 0,
          audioCount: content?.audios?.length || 0,
          videoCount: content?.videos?.length || 0,
          totalSize: content?.totalSize || 0,
        };
      default:
        return {};
    }
  }

  /**
   * Extract warnings from captured content
   */
  private extractWarnings(content: any): string[] {
    const warnings: string[] = [];

    // Check for sanitization warnings
    if (content?.sanitization?.redactionCount > 0) {
      warnings.push(
        `${content.sanitization.redactionCount} PII item(s) redacted`,
      );
    }

    // Check for element-specific warnings
    if (content?.elements) {
      const emptyElements = content.elements.filter(
        (e: any) => !e.textContent?.trim(),
      );
      if (emptyElements.length > 0) {
        warnings.push(
          `${emptyElements.length} element(s) have no text content`,
        );
      }
    }

    // Check for large content warnings
    if (content?.text) {
      const text =
        typeof content.text === "string"
          ? content.text
          : content.text?.content || "";
      if (text.length > 50000) {
        warnings.push("Content is very large (>50,000 characters)");
      }
    }

    return warnings;
  }

  async captureWithPreview(options: CaptureOptions): Promise<{
    result: CaptureResult;
    editablePreview: EditablePreview | null;
    validation: ValidationResult;
  }> {
    const result = await this.capture(options);

    // Editable preview for selection/element/note
    let editablePreview: EditablePreview | null = null;
    let validation: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (options.mode === "selection") {
      editablePreview = this.toEditablePreviewFromSelection(result.content);
      validation = this.validateSelection(result.content);
    } else if (options.mode === "note") {
      const text = (result.content?.text as string) || "";
      editablePreview = {
        id: `preview-${Date.now()}`,
        text,
        sourceLocation: { url: result.metadata.url },
        timestamp: result.timestamp,
        editable: true,
        preview: this.truncate(text),
      };
      validation = this.validateNote(text);
    } else if (options.mode === "element") {
      const first = result.content?.elements?.[0];
      if (first) {
        const text = first.textContent || "";
        const previewObj: EditablePreview = {
          id: `preview-${Date.now()}`,
          text,
          sourceLocation: {
            url: result.metadata.url,
            elementPath: first.selector,
          },
          timestamp: result.timestamp,
          editable: true,
          preview: this.truncate(text),
        };
        if (first.innerHTML) {
          previewObj.htmlContent = first.innerHTML;
        }
        editablePreview = previewObj;
      }
      validation = this.validateElements(result.content);
    }

    return { result, editablePreview, validation };
  }

  /**
   * Capture multiple selections with batch processing
   * Requirements: 2.1, 2.2, 2.3, 15.1, 17.1, 17.2
   */
  async captureMultipleSelections(sanitize: boolean = true): Promise<any> {
    return await this.deps.selection.captureWithReliability(
      async () => {
        // Try to get multiple detailed selections if the analyzer supports it
        const anyAnalyzer = this.deps.domAnalyzer as any;
        if (typeof anyAnalyzer.extractMultipleSelections === "function") {
          const selections = anyAnalyzer.extractMultipleSelections(200);

          if (selections.length === 0) {
            throw new CaptureError(
              CaptureErrorType.SELECTION_EMPTY,
              "No text selected",
            );
          }

          console.info("[ContentCapture] Processing multiple selections", {
            count: selections.length,
          });

          const processedSelections = await Promise.all(
            selections.map((selection: any) =>
              this.processDetailedSelection(selection, sanitize),
            ),
          );

          return {
            selections: processedSelections,
            count: processedSelections.length,
            batchTimestamp: Date.now(),
          };
        }

        // Fallback: capture single selection
        const selection = this.deps.domAnalyzer.extractSelection();
        if (
          !selection ||
          !selection.content ||
          selection.content.trim().length === 0
        ) {
          throw new CaptureError(
            CaptureErrorType.SELECTION_EMPTY,
            "No text selected",
          );
        }

        let processed = selection.content;
        let sanitizationInfo: any = null;
        if (sanitize) {
          const s = this.deps.sanitizer.sanitize(processed);
          processed = s.sanitizedContent;
          sanitizationInfo = {
            detectedPII: s.detectedPII.length,
            redactionCount: s.redactionCount,
            piiTypes: s.detectedPII.map((p) => p.type),
          };
        }

        return {
          selections: [
            {
              text: { ...selection, content: processed },
              sanitization: sanitizationInfo,
            },
          ],
          count: 1,
          batchTimestamp: Date.now(),
        };
      },
      {
        checkStability: true,
        enableRetry: true,
        monitorPerformance: true,
      },
    );
  }

  // Mode handlers
  private async captureFullPage(sanitize: boolean): Promise<any> {
    const startTime = performance.now();
    console.info("[ContentCapture] Full-page extraction started");

    const text = this.deps.domAnalyzer.extractText();
    const formatted = this.tryFormatText(text);
    const structured = this.deps.domAnalyzer.extractStructuredData
      ? this.deps.domAnalyzer.extractStructuredData()
      : [];
    const readability = this.deps.domAnalyzer.analyzeReadability
      ? this.deps.domAnalyzer.analyzeReadability()
      : undefined;

    let processedText = text.content;
    let formattedProcessed = formatted;
    let sanitizationInfo: any = null;

    if (sanitize) {
      try {
        const s1 = this.deps.sanitizer.sanitize(processedText);
        processedText = s1.sanitizedContent;
        const s2 = this.deps.sanitizer.sanitize(formattedProcessed);
        formattedProcessed = s2.sanitizedContent;
        sanitizationInfo = {
          detectedPII: s1.detectedPII.length,
          redactionCount: s1.redactionCount,
          piiTypes: s1.detectedPII.map((p) => p.type),
        };
        console.info("[ContentCapture] Sanitization applied", {
          redactionCount: s1.redactionCount,
          piiTypes: sanitizationInfo.piiTypes,
        });
      } catch (err) {
        console.error(
          "[ContentCapture] Sanitization failed in full-page mode",
          err,
        );
        throw new CaptureError(
          CaptureErrorType.SANITIZATION,
          "Sanitization failed",
          err,
        );
      }
    }

    const screenshot = await this.deps.messenger!.captureScreenshot();

    const duration = performance.now() - startTime;
    console.info("[ContentCapture] Full-page extraction completed", {
      durationMs: Math.round(duration),
      wordCount: text.wordCount,
      hasScreenshot: !!screenshot,
    });

    return {
      text: {
        ...text,
        content: processedText,
        formattedContent: formattedProcessed,
      },
      structuredData: structured,
      readability,
      screenshot,
      sanitization: sanitizationInfo,
    };
  }

  private async captureSelection(sanitize: boolean): Promise<any> {
    console.info("[ContentCapture] Selection extraction started");

    const op = async () => {
      const detailed = this.deps.domAnalyzer.extractDetailedSelection?.(200);
      if (detailed) return this.processDetailedSelection(detailed, sanitize);

      const basic = this.deps.domAnalyzer.extractSelection();
      if (!basic || !basic.content || basic.content.trim().length === 0) {
        throw new CaptureError(
          CaptureErrorType.SELECTION_EMPTY,
          "No text selected",
        );
      }

      let processed = basic.content;
      let sanitizationInfo: any = null;
      if (sanitize) {
        try {
          const s = this.deps.sanitizer.sanitize(processed);
          processed = s.sanitizedContent;
          sanitizationInfo = {
            detectedPII: s.detectedPII.length,
            redactionCount: s.redactionCount,
            piiTypes: s.detectedPII.map((p) => p.type),
          };
          console.info("[ContentCapture] Sanitization applied to selection", {
            redactionCount: s.redactionCount,
          });
        } catch (err) {
          console.error(
            "[ContentCapture] Sanitization failed in selection mode",
            err,
          );
          throw new CaptureError(
            CaptureErrorType.SANITIZATION,
            "Sanitization failed",
            err,
          );
        }
      }

      const context =
        this.deps.domAnalyzer.getSelectionContext?.(200, 200) || null;
      return {
        text: { ...basic, content: processed },
        context,
        sanitization: sanitizationInfo,
      };
    };

    const result = await this.deps.selection.captureWithReliability(op, {
      checkStability: true,
      enableRetry: true,
      monitorPerformance: true,
    });
    console.info("[ContentCapture] Selection extraction completed");
    return result;
  }

  private async processDetailedSelection(
    sel: DetailedSelection,
    sanitize: boolean,
  ): Promise<any> {
    let text = sel.text;
    let before = sel.beforeContext;
    let after = sel.afterContext;
    let html = sel.htmlContent;
    let sanitizationInfo: any = null;

    if (sanitize) {
      try {
        const sText = this.deps.sanitizer.sanitize(text);
        text = sText.sanitizedContent;
        const sBefore = this.deps.sanitizer.sanitize(before);
        before = sBefore.sanitizedContent;
        const sAfter = this.deps.sanitizer.sanitize(after);
        after = sAfter.sanitizedContent;
        sanitizationInfo = {
          detectedPII: sText.detectedPII.length,
          redactionCount: sText.redactionCount,
          piiTypes: sText.detectedPII.map((p) => p.type),
        };
        console.info(
          "[ContentCapture] Sanitization applied to detailed selection",
          {
            redactionCount: sText.redactionCount,
          },
        );
      } catch (err) {
        console.error(
          "[ContentCapture] Sanitization failed in detailed selection",
          err,
        );
        throw new CaptureError(
          CaptureErrorType.SANITIZATION,
          "Sanitization failed",
          err,
        );
      }
    }

    return {
      text,
      htmlContent: html,
      context: { before, after, full: `${before} [${text}] ${after}` },
      sourceLocation: {
        url: sel.url,
        elementPath: sel.elementPath,
        containerTag: sel.containerTag,
        position: sel.position,
      },
      timestamp: sel.timestamp,
      sanitization: sanitizationInfo,
    };
  }

  private async captureElements(sanitize: boolean): Promise<any> {
    console.info("[ContentCapture] Element extraction started");

    // Prefer a provided element provider (for tests or pre-selected elements)
    let selected: any[] = [];

    // If a dependency provided a hook, use it
    const anyDeps: any = this.deps as any;
    if (typeof anyDeps.elementProvider === "function") {
      selected = await anyDeps.elementProvider();
    } else {
      // Try to use the runtime element selector if available
      try {
        const mod: any = await import("../element-selector.js");
        if (mod?.elementSelector?.getSelectedElements) {
          selected = await mod.elementSelector.getSelectedElements();
        }
      } catch {
        // No selector available in this environment
        selected = [];
      }
    }

    console.info("[ContentCapture] Processing elements", {
      count: selected.length,
    });

    const processed = await Promise.all(
      (selected as any[]).map(async (el: any) => {
        // Accept several shapes: { info, enhancedInfo, element } from ElementSelector
        // or a plain object with tagName/textContent/selector fields from tests
        const info = el.info || el;
        const enhancedInfo = el.enhancedInfo || {};
        let textContent: string =
          typeof el.textContent === "string"
            ? el.textContent
            : enhancedInfo.textContent || info.textContent || "";

        let sanitizationInfo: any = null;
        if (sanitize && textContent) {
          try {
            const s = this.deps.sanitizer.sanitize(textContent);
            textContent = s.sanitizedContent;
            sanitizationInfo = {
              detectedPII: s.detectedPII.length,
              redactionCount: s.redactionCount,
              piiTypes: s.detectedPII.map((p: any) => p.type),
            };
          } catch (err) {
            console.error(
              "[ContentCapture] Sanitization failed for element",
              err,
            );
            throw new CaptureError(
              CaptureErrorType.SANITIZATION,
              "Sanitization failed",
              err,
            );
          }
        }

        return {
          ...info,
          enhancedInfo,
          textContent,
          preview: el.preview,
          snippets: el.snippets,
          sanitization: sanitizationInfo,
        };
      }),
    );

    console.info("[ContentCapture] Element extraction completed", {
      count: processed.length,
    });
    return { elements: processed, count: processed.length };
  }

  private async captureNote(text: string, sanitize: boolean): Promise<any> {
    console.info("[ContentCapture] Note capture started", {
      textLength: text.length,
    });

    let processed = text;
    let sanitizationInfo: any = null;
    if (sanitize && text) {
      try {
        const s = this.deps.sanitizer.sanitize(text);
        processed = s.sanitizedContent;
        sanitizationInfo = {
          detectedPII: s.detectedPII.length,
          redactionCount: s.redactionCount,
          piiTypes: s.detectedPII.map((p) => p.type),
        };
        console.info("[ContentCapture] Sanitization applied to note", {
          redactionCount: s.redactionCount,
        });
      } catch (err) {
        console.error("[ContentCapture] Sanitization failed in note mode", err);
        throw new CaptureError(
          CaptureErrorType.SANITIZATION,
          "Sanitization failed",
          err,
        );
      }
    }

    console.info("[ContentCapture] Note capture completed");
    return { text: processed, sanitization: sanitizationInfo, type: "note" };
  }

  private async captureMedia(
    options?: MediaCaptureOptions,
  ): Promise<MediaCaptureResult> {
    console.info("[ContentCapture] Media capture started");

    try {
      const result = await this.deps.media.captureAllMedia({
        compressImages: true,
        generateThumbnails: true,
        transcribeAudio: false,
        thumbnailSize: 200,
        ...(options || {}),
      });

      console.info("[ContentCapture] Media capture completed", {
        imageCount: result.images?.length || 0,
        audioCount: result.audios?.length || 0,
        videoCount: result.videos?.length || 0,
        totalSize: result.totalSize || 0,
      });

      return result;
    } catch (err) {
      console.error("[ContentCapture] Media capture failed", err);
      throw new CaptureError(
        CaptureErrorType.MEDIA_LOAD,
        "Failed to capture media",
        err,
      );
    }
  }

  // Preview helpers
  private truncate(text: string, max: number = 200): string {
    if (!text) return "";
    const cleaned = text.trim().replace(/\s+/g, " ");
    return cleaned.length <= max ? cleaned : cleaned.slice(0, max) + "...";
  }

  private selectionPreview(selection: any): string {
    if (!selection) return "";
    // Support both detailed and basic shapes
    const main =
      typeof selection.text === "string"
        ? selection.text
        : selection.text?.content || "";
    const before = selection.context?.before || "";
    const after = selection.context?.after || "";
    const parts = [] as string[];
    if (before) parts.push("..." + this.truncate(before, 50));
    parts.push("**" + this.truncate(main, 100) + "**");
    if (after) parts.push(this.truncate(after, 50) + "...");
    return parts.join(" ");
  }

  private elementPreview(content: any): string {
    const elements = content?.elements || [];
    if (!elements.length) return "";
    return elements
      .map((el: any) => {
        const tag =
          (el.tagName || el?.info?.tagName || "element").toLowerCase?.() ||
          String(el.tagName || el?.info?.tagName || "element");
        const text = this.truncate(
          el.textContent || el?.info?.textContent || "",
          50,
        );
        return `<${tag}>: ${text}`;
      })
      .join(" | ");
  }

  private mediaPreview(media: MediaCaptureResult): string {
    const parts: string[] = [];
    if (media.images?.length) parts.push(`${media.images.length} image(s)`);
    if (media.audios?.length)
      parts.push(`${media.audios.length} audio file(s)`);
    if (media.videos?.length) parts.push(`${media.videos.length} video(s)`);
    return parts.length ? parts.join(", ") : "No media found";
  }

  private tryFormatText(extracted: ExtractedText): string {
    try {
      // Use DOMAnalyzer.formatExtractedContent if available in runtime bundle
      const anyAnalyzer = this.deps.domAnalyzer as any;
      if (typeof anyAnalyzer.formatExtractedContent === "function") {
        return anyAnalyzer.formatExtractedContent(extracted);
      }
    } catch {}
    return extracted.content;
  }

  private toEditablePreviewFromSelection(selection: any): EditablePreview {
    const text =
      typeof selection.text === "string"
        ? selection.text
        : selection.text?.content || "";
    return {
      id: `preview-${Date.now()}`,
      text,
      htmlContent: selection.htmlContent,
      context: selection.context,
      sourceLocation: selection.sourceLocation,
      timestamp: selection.timestamp || Date.now(),
      editable: true,
      preview: this.selectionPreview(selection),
    };
  }

  // Validation methods
  private validateSelection(selection: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const text =
      typeof selection.text === "string"
        ? selection.text
        : selection.text?.content || "";

    // Check if text is empty
    if (!text || text.trim().length === 0) {
      errors.push("Selection text is empty");
    }

    // Check text length
    if (text && text.length > 50000) {
      warnings.push("Selection is very large (>50,000 characters)");
    }

    // Check if source location is available
    if (!selection.sourceLocation?.url) {
      warnings.push("Source URL is missing");
    }

    // Check if context is available
    if (!selection.context?.before && !selection.context?.after) {
      warnings.push("No surrounding context available");
    }

    // Check for sanitization warnings
    if (selection.sanitization && selection.sanitization.redactionCount > 0) {
      warnings.push(
        `${selection.sanitization.redactionCount} PII item(s) were redacted`,
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateNote(text: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if text is empty
    if (!text || text.trim().length === 0) {
      errors.push("Note text is empty");
    }

    // Check text length
    if (text && text.length > 100000) {
      warnings.push("Note is very large (>100,000 characters)");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateElements(content: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const elements = content?.elements || [];

    // Check if elements array is empty
    if (elements.length === 0) {
      errors.push("No elements were selected");
    }

    // Check for elements without text content
    const emptyElements = elements.filter(
      (el: any) => !el.textContent || el.textContent.trim().length === 0,
    );
    if (emptyElements.length > 0) {
      warnings.push(`${emptyElements.length} element(s) have no text content`);
    }

    // Check for sanitization warnings
    const sanitizedElements = elements.filter(
      (el: any) => el.sanitization && el.sanitization.redactionCount > 0,
    );
    if (sanitizedElements.length > 0) {
      const totalRedactions = sanitizedElements.reduce(
        (sum: number, el: any) => sum + el.sanitization.redactionCount,
        0,
      );
      warnings.push(
        `${totalRedactions} PII item(s) were redacted across ${sanitizedElements.length} element(s)`,
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
