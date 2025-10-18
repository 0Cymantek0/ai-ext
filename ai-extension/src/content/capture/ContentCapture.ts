/*
 * ContentCapture with mode routing and previews
 * Coordinates DOM, element, and media subsystems with optional sanitization.
 */

import { domAnalyzer, type PageMetadata, type ExtractedText, type DetailedSelection } from "../dom-analyzer.js";
import { contentSanitizer } from "../content-sanitizer.js";
import { mediaCapture, type MediaCaptureOptions, type MediaCaptureResult } from "../media-capture.js";
import { reliableSelectionCapture } from "../selection-reliability.js";

// Interfaces and enums
export type CaptureMode = "full-page" | "selection" | "element" | "note" | "media";

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
  constructor(type: CaptureErrorType, message: string, details?: any) {
    super(message);
    this.name = "CaptureError";
    this.type = type;
    this.details = details;
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
  sanitize(content: string): { sanitizedContent: string; redactionCount: number; detectedPII: Array<{ type: string }> };
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

export type ContentCaptureDeps = {
  domAnalyzer: IDOMAnalyzer;
  sanitizer: IContentSanitizer;
  media: IMediaCapture;
  selection: IReliableSelectionCapture;
  processor?: IContentProcessor; // optional for unit tests
  messenger?: BackgroundMessenger; // for screenshot capture
};

function defaultMessenger(): BackgroundMessenger {
  return {
    async captureScreenshot(): Promise<string | null> {
      try {
        const response: any = await chrome.runtime.sendMessage({ kind: "CAPTURE_SCREENSHOT", payload: {} });
        if (response && response.screenshot) return response.screenshot as string;
        return null;
      } catch {
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

  async capture(options: CaptureOptions): Promise<CaptureResult> {
    const { mode, sanitize = false } = options;

    // Always extract metadata first
    let metadata: PageMetadata;
    try {
      metadata = this.deps.domAnalyzer.extractMetadata();
    } catch (err) {
      throw new CaptureError(CaptureErrorType.DOM_ACCESS, "Failed to extract page metadata", err);
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
          throw new CaptureError(CaptureErrorType.UNKNOWN, `Unsupported capture mode: ${mode}`);
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
          throw new CaptureError(CaptureErrorType.STORAGE, "Failed to store captured content", err);
        }
      }

      return { mode, content, metadata, timestamp, preview };
    } catch (err: any) {
      if (err instanceof CaptureError) throw err;
      // Map common errors
      const message = typeof err?.message === "string" ? err.message : "Unknown error";
      if (/selection/i.test(message) && /empty|no/i.test(message)) {
        throw new CaptureError(CaptureErrorType.SELECTION_EMPTY, "No text selected", err);
      }
      throw new CaptureError(CaptureErrorType.UNKNOWN, message, err);
    }
  }

  async captureWithPreview(options: CaptureOptions): Promise<{ result: CaptureResult; editablePreview: EditablePreview | null }> {
    const result = await this.capture(options);

    // Editable preview for selection/element/note
    let editablePreview: EditablePreview | null = null;
    if (options.mode === "selection") {
      editablePreview = this.toEditablePreviewFromSelection(result.content);
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

    } else if (options.mode === "element") {
      const first = result.content?.elements?.[0];
      if (first) {
        const text = first.textContent || "";
        const previewObj: EditablePreview = {
          id: `preview-${Date.now()}`,
          text,
          sourceLocation: { url: result.metadata.url, elementPath: first.selector },
          timestamp: result.timestamp,
          editable: true,
          preview: this.truncate(text),
        };
        if (first.innerHTML) {
          previewObj.htmlContent = first.innerHTML;
        }
        editablePreview = previewObj;
      }
    }

    return { result, editablePreview };
  }

  // Mode handlers
  private async captureFullPage(sanitize: boolean): Promise<any> {
    const text = this.deps.domAnalyzer.extractText();
    const formatted = this.tryFormatText(text);
    const structured = this.deps.domAnalyzer.extractStructuredData ? this.deps.domAnalyzer.extractStructuredData() : [];
    const readability = this.deps.domAnalyzer.analyzeReadability ? this.deps.domAnalyzer.analyzeReadability() : undefined;

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
          piiTypes: s1.detectedPII.map(p => p.type),
        };
      } catch (err) {
        throw new CaptureError(CaptureErrorType.SANITIZATION, "Sanitization failed", err);
      }
    }

    const screenshot = await this.deps.messenger!.captureScreenshot();

    return {
      text: { ...text, content: processedText, formattedContent: formattedProcessed },
      structuredData: structured,
      readability,
      screenshot,
      sanitization: sanitizationInfo,
    };
  }

  private async captureSelection(sanitize: boolean): Promise<any> {
    const op = async () => {
      const detailed = this.deps.domAnalyzer.extractDetailedSelection?.(200);
      if (detailed) return this.processDetailedSelection(detailed, sanitize);

      const basic = this.deps.domAnalyzer.extractSelection();
      if (!basic || !basic.content || basic.content.trim().length === 0) {
        throw new CaptureError(CaptureErrorType.SELECTION_EMPTY, "No text selected");
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
            piiTypes: s.detectedPII.map(p => p.type),
          };
        } catch (err) {
          throw new CaptureError(CaptureErrorType.SANITIZATION, "Sanitization failed", err);
        }
      }

      const context = this.deps.domAnalyzer.getSelectionContext?.(200, 200) || null;
      return { text: { ...basic, content: processed }, context, sanitization: sanitizationInfo };
    };

    return await this.deps.selection.captureWithReliability(op, { checkStability: true, enableRetry: true, monitorPerformance: true });
  }

  private async processDetailedSelection(sel: DetailedSelection, sanitize: boolean): Promise<any> {
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
          piiTypes: sText.detectedPII.map(p => p.type),
        };
      } catch (err) {
        throw new CaptureError(CaptureErrorType.SANITIZATION, "Sanitization failed", err);
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
    // Integrates with ElementSelector UI in production. For unit tests, we return empty by default.
    return { elements: [], count: 0 };
  }

  private async captureNote(text: string, sanitize: boolean): Promise<any> {
    let processed = text;
    let sanitizationInfo: any = null;
    if (sanitize && text) {
      try {
        const s = this.deps.sanitizer.sanitize(text);
        processed = s.sanitizedContent;
        sanitizationInfo = {
          detectedPII: s.detectedPII.length,
          redactionCount: s.redactionCount,
          piiTypes: s.detectedPII.map(p => p.type),
        };
      } catch (err) {
        throw new CaptureError(CaptureErrorType.SANITIZATION, "Sanitization failed", err);
      }
    }
    return { text: processed, sanitization: sanitizationInfo, type: "note" };
  }

  private async captureMedia(options?: MediaCaptureOptions): Promise<MediaCaptureResult> {
    try {
      const result = await this.deps.media.captureAllMedia({
        compressImages: true,
        generateThumbnails: true,
        transcribeAudio: false,
        thumbnailSize: 200,
        ...(options || {}),
      });
      return result;
    } catch (err) {
      throw new CaptureError(CaptureErrorType.MEDIA_LOAD, "Failed to capture media", err);
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
    const main = typeof selection.text === "string" ? selection.text : selection.text?.content || "";
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
        const tag = (el.tagName || el?.info?.tagName || "element").toLowerCase?.() || String(el.tagName || el?.info?.tagName || "element");
        const text = this.truncate(el.textContent || el?.info?.textContent || "", 50);
        return `<${tag}>: ${text}`;
      })
      .join(" | ");
  }

  private mediaPreview(media: MediaCaptureResult): string {
    const parts: string[] = [];
    if (media.images?.length) parts.push(`${media.images.length} image(s)`);
    if (media.audios?.length) parts.push(`${media.audios.length} audio file(s)`);
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
    const text = typeof selection.text === "string" ? selection.text : selection.text?.content || "";
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
}
