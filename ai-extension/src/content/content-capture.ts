/**
 * Content Capture Module
 * Implements various content capture modes for web pages
 * Requirements: 2.1, 2.2, 2.5
 */

import { domAnalyzer, type PageMetadata, type ExtractedText } from "./dom-analyzer.js";
import { contentSanitizer, type SanitizationResult } from "./content-sanitizer.js";
import { sendMessage } from "../shared/message-client.js";

/**
 * Image content structure
 */
export interface ImageContent {
  url: string;
  alt: string;
  title?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  format?: string | undefined;
  size?: number | undefined;
  isDataUrl: boolean;
  sourceElement: string; // 'img' | 'picture' | 'svg' | 'canvas' | 'background'
  selector?: string | undefined;
}

/**
 * Audio content structure
 */
export interface AudioContent {
  url: string;
  duration?: number | undefined;
  format?: string | undefined;
  title?: string | undefined;
  controls: boolean;
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  sources: Array<{ url: string; type?: string | undefined }>;
  selector?: string | undefined;
}

/**
 * Video content structure
 */
export interface VideoContent {
  url: string;
  duration?: number | undefined;
  format?: string | undefined;
  title?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  controls: boolean;
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  poster?: string | undefined;
  sources: Array<{ url: string; type?: string | undefined }>;
  tracks: Array<{ kind: string; label: string; src: string; srclang?: string | undefined }>;
  selector?: string | undefined;
}

/**
 * Media capture result
 */
export interface MediaCaptureResult {
  images: ImageContent[];
  audio: AudioContent[];
  video: VideoContent[];
  totalCount: number;
  capturedAt: number;
}

/**
 * Captured content structure
 */
export interface CapturedContent {
  id: string;
  type: "full-page" | "selection" | "element" | "note" | "media";
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
  media?: MediaCaptureResult | undefined;
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

/**
 * Media Capture class
 * Implements extraction of images, audio, and video from web pages
 * Requirements: 2.1, 3.7
 */
export class MediaCapture {
  /**
   * Capture all media from the page
   * Requirements: 2.1, 3.7
   */
  async captureMedia(): Promise<MediaCaptureResult> {
    const startTime = performance.now();

    try {
      console.info("[MediaCapture] Starting media capture");

      // Extract all media types in parallel
      const [images, audio, video] = await Promise.all([
        this.extractImages(),
        this.extractAudio(),
        this.extractVideo(),
      ]);

      const result: MediaCaptureResult = {
        images,
        audio,
        video,
        totalCount: images.length + audio.length + video.length,
        capturedAt: Date.now(),
      };

      const captureTime = performance.now() - startTime;
      console.info("[MediaCapture] Media capture completed", {
        captureTime: `${captureTime.toFixed(2)}ms`,
        imageCount: images.length,
        audioCount: audio.length,
        videoCount: video.length,
        totalCount: result.totalCount,
      });

      return result;
    } catch (error) {
      console.error("[MediaCapture] Media capture failed", error);
      throw new Error(
        `Failed to capture media: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Extract all images from the page
   * Requirements: 2.1
   */
  async extractImages(): Promise<ImageContent[]> {
    const images: ImageContent[] = [];

    try {
      console.debug("[MediaCapture] Extracting images");

      // Extract <img> elements
      const imgElements = document.querySelectorAll("img");
      for (const img of imgElements) {
        try {
          const imageContent = await this.extractImageElement(img);
          if (imageContent) {
            images.push(imageContent);
          }
        } catch (error) {
          console.warn("[MediaCapture] Failed to extract img element", error);
        }
      }

      // Extract <picture> elements
      const pictureElements = document.querySelectorAll("picture");
      for (const picture of pictureElements) {
        try {
          const imageContent = await this.extractPictureElement(picture);
          if (imageContent) {
            images.push(imageContent);
          }
        } catch (error) {
          console.warn("[MediaCapture] Failed to extract picture element", error);
        }
      }

      // Extract SVG images
      const svgElements = document.querySelectorAll("svg");
      for (const svg of svgElements) {
        try {
          const imageContent = this.extractSVGElement(svg);
          if (imageContent) {
            images.push(imageContent);
          }
        } catch (error) {
          console.warn("[MediaCapture] Failed to extract svg element", error);
        }
      }

      // Extract canvas elements
      const canvasElements = document.querySelectorAll("canvas");
      for (const canvas of canvasElements) {
        try {
          const imageContent = await this.extractCanvasElement(canvas);
          if (imageContent) {
            images.push(imageContent);
          }
        } catch (error) {
          console.warn("[MediaCapture] Failed to extract canvas element", error);
        }
      }

      // Extract background images
      const backgroundImages = this.extractBackgroundImages();
      images.push(...backgroundImages);

      console.debug("[MediaCapture] Images extracted", { count: images.length });
      return images;
    } catch (error) {
      console.error("[MediaCapture] Image extraction failed", error);
      return images; // Return partial results
    }
  }

  /**
   * Extract image from <img> element
   */
  private async extractImageElement(img: HTMLImageElement): Promise<ImageContent | null> {
    const src = img.src || img.currentSrc;
    if (!src || src.length === 0) {
      return null;
    }

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    
    const imageContent: ImageContent = {
      url: src,
      alt: img.alt || "",
      title: img.title ? img.title : undefined,
      width: width ? width : undefined,
      height: height ? height : undefined,
      format: this.getImageFormat(src),
      size: undefined,
      isDataUrl: src.startsWith("data:"),
      sourceElement: "img",
      selector: this.generateSelector(img),
    };

    // Try to get actual size if not a data URL
    if (!imageContent.isDataUrl) {
      try {
        const size = await this.getImageSize(src);
        imageContent.size = size !== undefined ? size : undefined;
      } catch (error) {
        console.debug("[MediaCapture] Could not get image size", src);
      }
    }

    return imageContent;
  }

  /**
   * Extract image from <picture> element
   */
  private async extractPictureElement(picture: HTMLPictureElement): Promise<ImageContent | null> {
    const img = picture.querySelector("img");
    if (!img) {
      return null;
    }

    const imageContent = await this.extractImageElement(img);
    if (imageContent) {
      imageContent.sourceElement = "picture";
      imageContent.selector = this.generateSelector(picture);
    }

    return imageContent;
  }

  /**
   * Extract SVG element as image
   */
  private extractSVGElement(svg: SVGSVGElement): ImageContent | null {
    try {
      // Convert SVG to data URL
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svg);
      const dataUrl = `data:image/svg+xml;base64,${btoa(svgString)}`;

      const viewBox = svg.viewBox.baseVal;
      const width = svg.width.baseVal.value || viewBox.width || undefined;
      const height = svg.height.baseVal.value || viewBox.height || undefined;

      const title = svg.getAttribute("title");
      
      return {
        url: dataUrl,
        alt: svg.getAttribute("aria-label") || svg.getAttribute("title") || "",
        title: title ? title : undefined,
        width: width ? width : undefined,
        height: height ? height : undefined,
        format: "svg",
        size: svgString.length,
        isDataUrl: true,
        sourceElement: "svg",
        selector: this.generateSelector(svg),
      };
    } catch (error) {
      console.warn("[MediaCapture] Failed to serialize SVG", error);
      return null;
    }
  }

  /**
   * Extract canvas element as image
   */
  private async extractCanvasElement(canvas: HTMLCanvasElement): Promise<ImageContent | null> {
    try {
      // Convert canvas to data URL
      const dataUrl = canvas.toDataURL("image/png");

      const title = canvas.getAttribute("title");
      
      return {
        url: dataUrl,
        alt: canvas.getAttribute("aria-label") || "",
        title: title ? title : undefined,
        width: canvas.width,
        height: canvas.height,
        format: "png",
        size: dataUrl.length,
        isDataUrl: true,
        sourceElement: "canvas",
        selector: this.generateSelector(canvas),
      };
    } catch (error) {
      console.warn("[MediaCapture] Failed to convert canvas to data URL", error);
      return null;
    }
  }

  /**
   * Extract background images from CSS
   */
  private extractBackgroundImages(): ImageContent[] {
    const images: ImageContent[] = [];
    const elements = document.querySelectorAll("*");

    for (const element of elements) {
      try {
        const style = window.getComputedStyle(element);
        const backgroundImage = style.backgroundImage;

        if (backgroundImage && backgroundImage !== "none") {
          // Extract URL from CSS url() function
          const urlMatch = backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
          if (urlMatch && urlMatch[1]) {
            const url = urlMatch[1];
            
            // Skip if already captured or is a gradient
            if (url.startsWith("data:") || url.includes("gradient")) {
              continue;
            }

            // Convert relative URL to absolute
            const absoluteUrl = new URL(url, window.location.href).href;

            const title = element.getAttribute("title");
            
            images.push({
              url: absoluteUrl,
              alt: element.getAttribute("aria-label") || "",
              title: title ? title : undefined,
              width: undefined,
              height: undefined,
              format: this.getImageFormat(absoluteUrl),
              size: undefined,
              isDataUrl: false,
              sourceElement: "background",
              selector: this.generateSelector(element),
            });
          }
        }
      } catch (error) {
        // Skip elements that cause errors
        continue;
      }
    }

    return images;
  }

  /**
   * Extract all audio elements from the page
   * Requirements: 2.1, 3.7
   */
  async extractAudio(): Promise<AudioContent[]> {
    const audioList: AudioContent[] = [];

    try {
      console.debug("[MediaCapture] Extracting audio");

      const audioElements = document.querySelectorAll("audio");
      for (const audio of audioElements) {
        try {
          const audioContent = this.extractAudioElement(audio);
          if (audioContent) {
            audioList.push(audioContent);
          }
        } catch (error) {
          console.warn("[MediaCapture] Failed to extract audio element", error);
        }
      }

      console.debug("[MediaCapture] Audio extracted", { count: audioList.length });
      return audioList;
    } catch (error) {
      console.error("[MediaCapture] Audio extraction failed", error);
      return audioList; // Return partial results
    }
  }

  /**
   * Extract audio element information
   */
  private extractAudioElement(audio: HTMLAudioElement): AudioContent | null {
    const src = audio.src || audio.currentSrc;
    
    // Extract all source elements
    const sources: Array<{ url: string; type?: string | undefined }> = [];
    const sourceElements = audio.querySelectorAll("source");
    
    for (const source of sourceElements) {
      if (source.src) {
        const type = source.type;
        sources.push({
          url: source.src,
          type: type ? type : undefined,
        });
      }
    }

    // If no sources found, use main src
    if (sources.length === 0 && src) {
      sources.push({ url: src, type: undefined });
    }

    if (sources.length === 0) {
      return null;
    }

    const duration = audio.duration && isFinite(audio.duration) ? audio.duration : undefined;
    const title = audio.title || audio.getAttribute("aria-label");
    const mainUrl = src || sources[0]!.url;
    
    const audioContent: AudioContent = {
      url: mainUrl,
      duration: duration,
      format: this.getAudioFormat(mainUrl),
      title: title ? title : undefined,
      controls: audio.controls,
      autoplay: audio.autoplay,
      loop: audio.loop,
      muted: audio.muted,
      sources,
      selector: this.generateSelector(audio),
    };

    return audioContent;
  }

  /**
   * Extract all video elements from the page
   * Requirements: 2.1, 3.7
   */
  async extractVideo(): Promise<VideoContent[]> {
    const videoList: VideoContent[] = [];

    try {
      console.debug("[MediaCapture] Extracting video");

      const videoElements = document.querySelectorAll("video");
      for (const video of videoElements) {
        try {
          const videoContent = this.extractVideoElement(video);
          if (videoContent) {
            videoList.push(videoContent);
          }
        } catch (error) {
          console.warn("[MediaCapture] Failed to extract video element", error);
        }
      }

      console.debug("[MediaCapture] Video extracted", { count: videoList.length });
      return videoList;
    } catch (error) {
      console.error("[MediaCapture] Video extraction failed", error);
      return videoList; // Return partial results
    }
  }

  /**
   * Extract video element information
   */
  private extractVideoElement(video: HTMLVideoElement): VideoContent | null {
    const src = video.src || video.currentSrc;
    
    // Extract all source elements
    const sources: Array<{ url: string; type?: string | undefined }> = [];
    const sourceElements = video.querySelectorAll("source");
    
    for (const source of sourceElements) {
      if (source.src) {
        const type = source.type;
        sources.push({
          url: source.src,
          type: type ? type : undefined,
        });
      }
    }

    // If no sources found, use main src
    if (sources.length === 0 && src) {
      sources.push({ url: src, type: undefined });
    }

    if (sources.length === 0) {
      return null;
    }

    // Extract track elements (captions, subtitles)
    const tracks: Array<{ kind: string; label: string; src: string; srclang?: string | undefined }> = [];
    const trackElements = video.querySelectorAll("track");
    
    for (const track of trackElements) {
      if (track.src) {
        const srclang = track.srclang;
        tracks.push({
          kind: track.kind,
          label: track.label,
          src: track.src,
          srclang: srclang ? srclang : undefined,
        });
      }
    }

    const duration = video.duration && isFinite(video.duration) ? video.duration : undefined;
    const title = video.title || video.getAttribute("aria-label");
    const width = video.videoWidth || video.width;
    const height = video.videoHeight || video.height;
    const poster = video.poster;
    const mainUrl = src || sources[0]!.url;

    const videoContent: VideoContent = {
      url: mainUrl,
      duration: duration,
      format: this.getVideoFormat(mainUrl),
      title: title ? title : undefined,
      width: width ? width : undefined,
      height: height ? height : undefined,
      controls: video.controls,
      autoplay: video.autoplay,
      loop: video.loop,
      muted: video.muted,
      poster: poster ? poster : undefined,
      sources,
      tracks,
      selector: this.generateSelector(video),
    };

    return videoContent;
  }

  /**
   * Get image format from URL
   */
  private getImageFormat(url: string): string | undefined {
    if (url.startsWith("data:image/")) {
      const match = url.match(/data:image\/([^;,]+)/);
      return match ? match[1] : undefined;
    }

    const extension = url.split(".").pop()?.split("?")[0]?.toLowerCase();
    return extension;
  }

  /**
   * Get audio format from URL
   */
  private getAudioFormat(url: string): string | undefined {
    if (url.startsWith("data:audio/")) {
      const match = url.match(/data:audio\/([^;,]+)/);
      return match ? match[1] : undefined;
    }

    const extension = url.split(".").pop()?.split("?")[0]?.toLowerCase();
    return extension;
  }

  /**
   * Get video format from URL
   */
  private getVideoFormat(url: string): string | undefined {
    if (url.startsWith("data:video/")) {
      const match = url.match(/data:video\/([^;,]+)/);
      return match ? match[1] : undefined;
    }

    const extension = url.split(".").pop()?.split("?")[0]?.toLowerCase();
    return extension;
  }

  /**
   * Get image size via HEAD request
   */
  private async getImageSize(url: string): Promise<number | undefined> {
    try {
      const response = await fetch(url, { method: "HEAD" });
      const contentLength = response.headers.get("content-length");
      return contentLength ? parseInt(contentLength, 10) : undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Generate a simple CSS selector for an element
   */
  private generateSelector(element: Element): string {
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
   * Get media capture statistics
   */
  getMediaStats(result: MediaCaptureResult): {
    totalImages: number;
    totalAudio: number;
    totalVideo: number;
    totalMedia: number;
    imageFormats: Record<string, number>;
    audioFormats: Record<string, number>;
    videoFormats: Record<string, number>;
  } {
    const imageFormats: Record<string, number> = {};
    const audioFormats: Record<string, number> = {};
    const videoFormats: Record<string, number> = {};

    // Count image formats
    for (const image of result.images) {
      if (image.format) {
        imageFormats[image.format] = (imageFormats[image.format] || 0) + 1;
      }
    }

    // Count audio formats
    for (const audio of result.audio) {
      if (audio.format) {
        audioFormats[audio.format] = (audioFormats[audio.format] || 0) + 1;
      }
    }

    // Count video formats
    for (const video of result.video) {
      if (video.format) {
        videoFormats[video.format] = (videoFormats[video.format] || 0) + 1;
      }
    }

    return {
      totalImages: result.images.length,
      totalAudio: result.audio.length,
      totalVideo: result.video.length,
      totalMedia: result.totalCount,
      imageFormats,
      audioFormats,
      videoFormats,
    };
  }

  /**
   * Validate media capture result
   */
  validateCapture(result: MediaCaptureResult): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!result.capturedAt || result.capturedAt <= 0) {
      errors.push("Invalid capture timestamp");
    }

    if (result.totalCount !== result.images.length + result.audio.length + result.video.length) {
      errors.push("Total count mismatch");
    }

    if (result.totalCount === 0) {
      warnings.push("No media found on page");
    }

    // Validate images
    for (const image of result.images) {
      if (!image.url || image.url.length === 0) {
        errors.push("Image missing URL");
      }
    }

    // Validate audio
    for (const audio of result.audio) {
      if (!audio.url || audio.url.length === 0) {
        errors.push("Audio missing URL");
      }
      if (audio.sources.length === 0) {
        warnings.push("Audio has no sources");
      }
    }

    // Validate video
    for (const video of result.video) {
      if (!video.url || video.url.length === 0) {
        errors.push("Video missing URL");
      }
      if (video.sources.length === 0) {
        warnings.push("Video has no sources");
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

// Export singleton instances
export const fullPageCapture = new FullPageCapture();
export const textCapture = new TextCapture();
export const mediaCapture = new MediaCapture();
