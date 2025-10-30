/**
 * Compression Service
 *
 * Provides utilities to compress image assets and generate deterministic text
 * excerpts prior to storage. Designed for service worker and offscreen
 * contexts where DOM APIs may be unavailable, while remaining testable via
 * dependency injection.
 */

export type CompressionProgressStage =
  | "decode"
  | "resize"
  | "encode"
  | "complete"
  | "fallback";

export interface CompressionProgress {
  stage: CompressionProgressStage;
  percent: number;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
}

export type CompressionProgressCallback = (
  progress: CompressionProgress,
) => void;

export interface ImageCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  maxPixels?: number;
  quality?: number;
  format?: string;
  preferLossless?: boolean;
  allowLarger?: boolean;
  onProgress?: CompressionProgressCallback;
}

export interface ImageCompressionDescriptor {
  blob: Blob;
  bytes: number;
  mimeType: string;
  width: number;
  height: number;
}

export interface ImageCompressionResult {
  original: ImageCompressionDescriptor;
  compressed: ImageCompressionDescriptor;
  ratio: number;
  wasResized: boolean;
  wasConverted: boolean;
  fallback: boolean;
  message?: string;
  attemptedFormats?: string[];
}

export interface ThumbnailOptions {
  size?: number;
  quality?: number;
  format?: string;
  preferLossless?: boolean;
  onProgress?: CompressionProgressCallback;
}

export interface ThumbnailResult {
  blob: Blob;
  bytes: number;
  mimeType: string;
  width: number;
  height: number;
  dataUrl: string;
}

export interface ExcerptOptions {
  maxWords?: number;
  maxSentences?: number;
  ellipsis?: boolean;
  normalizeWhitespace?: boolean;
}

export interface ExcerptResult {
  excerpt: string;
  wordCount: number;
  truncated: boolean;
  sentences: number;
  originalWordCount: number;
}

export interface CompressionService {
  compressImage(
    blob: Blob,
    options?: ImageCompressionOptions,
  ): Promise<ImageCompressionResult>;
  createThumbnail(
    blob: Blob,
    options?: ThumbnailOptions,
  ): Promise<ThumbnailResult>;
  createExcerpt(text: string, options?: ExcerptOptions): ExcerptResult;
}

export class CompressionError extends Error {
  readonly cause: unknown;
  readonly code?: string;

  constructor(message: string, cause?: unknown, code?: string) {
    super(message);
    this.name = "CompressionError";
    this.cause = cause;
    this.code = code;
  }
}

interface DecodedImageHandle {
  width: number;
  height: number;
  source: unknown;
  close(): void;
}

interface CanvasHandle {
  width: number;
  height: number;
  draw(image: DecodedImageHandle, targetWidth: number, targetHeight: number): void;
  toBlob(mimeType: string, quality?: number): Promise<Blob>;
}

export interface CompressionRuntimeAdapter {
  decodeImage(blob: Blob): Promise<DecodedImageHandle>;
  createCanvas(width: number, height: number): CanvasHandle | null;
}

interface CompressionDefaults {
  maxWidth: number;
  maxHeight: number;
  maxPixels: number;
  quality: number;
  thumbnailSize: number;
  thumbnailQuality: number;
}

export interface CompressionServiceConfig {
  defaults?: Partial<CompressionDefaults>;
  runtime?: CompressionRuntimeAdapter;
}

const DEFAULTS: CompressionDefaults = {
  maxWidth: 1920,
  maxHeight: 1920,
  maxPixels: 6_000_000, // ~6 MP safeguard (~24MB RGBA)
  quality: 0.72,
  thumbnailSize: 100,
  thumbnailQuality: 0.82,
};

class DefaultCompressionRuntimeAdapter implements CompressionRuntimeAdapter {
  async decodeImage(blob: Blob): Promise<DecodedImageHandle> {
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(blob, {
          imageOrientation: "from-image",
        });
        return {
          width: bitmap.width,
          height: bitmap.height,
          source: bitmap,
          close() {
            bitmap.close?.();
          },
        };
      } catch (error) {
        throw new CompressionError("Unable to decode image", error);
      }
    }

    if (typeof document !== "undefined" && typeof document.createElement === "function") {
      const ImageCtor = (globalThis as typeof globalThis & { Image?: typeof Image }).Image;
      if (!ImageCtor) {
        throw new CompressionError("Image constructor unavailable in current context");
      }
      const globalObject = globalThis as typeof globalThis & { webkitURL?: typeof URL };
      const urlApi = globalObject.URL ?? globalObject.webkitURL;
      if (!urlApi) {
        throw new CompressionError("URL API unavailable for blob decoding");
      }

      return await new Promise<DecodedImageHandle>((resolve, reject) => {
        const objectUrl = urlApi.createObjectURL(blob);
        const image = new ImageCtor();
        image.decoding = "async";
        image.onload = () => {
          const handle: DecodedImageHandle = {
            width: image.naturalWidth || image.width || 1,
            height: image.naturalHeight || image.height || 1,
            source: image,
            close() {
              try {
                image.src = "";
              } catch {
                // ignore cleanup errors
              }
            },
          };
          urlApi.revokeObjectURL(objectUrl);
          resolve(handle);
        };
        image.onerror = (event) => {
          urlApi.revokeObjectURL(objectUrl);
          reject(new CompressionError("Failed to decode image", event));
        };
        image.src = objectUrl;
      });
    }

    throw new CompressionError(
      "Image decoding APIs are unavailable in this environment",
    );
  }

  createCanvas(width: number, height: number): CanvasHandle | null {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d", { desynchronized: true });
      if (!context) {
        return null;
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      return {
        width,
        height,
        draw(image, targetWidth, targetHeight) {
          context.clearRect(0, 0, width, height);
          context.drawImage(
            image.source as CanvasImageSource,
            0,
            0,
            targetWidth,
            targetHeight,
          );
        },
        async toBlob(mimeType, quality) {
          return await canvas.convertToBlob({ type: mimeType, quality });
        },
      };
    }

    if (typeof document !== "undefined" && typeof document.createElement === "function") {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      return {
        width,
        height,
        draw(image, targetWidth, targetHeight) {
          context.clearRect(0, 0, width, height);
          context.drawImage(
            image.source as CanvasImageSource,
            0,
            0,
            targetWidth,
            targetHeight,
          );
        },
        toBlob(mimeType, quality) {
          return new Promise<Blob>((resolve, reject) => {
            if (!canvas.toBlob) {
              reject(new CompressionError("canvas.toBlob is not supported"));
              return;
            }
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(
                    new CompressionError(
                      `Canvas encoding returned an empty blob for ${mimeType}`,
                    ),
                  );
                  return;
                }
                resolve(blob);
              },
              mimeType,
              quality,
            );
          });
        },
      };
    }

    return null;
  }
}

export class DefaultCompressionService implements CompressionService {
  private readonly runtime: CompressionRuntimeAdapter;
  private readonly defaults: CompressionDefaults;

  constructor(config: CompressionServiceConfig = {}) {
    this.runtime = config.runtime ?? new DefaultCompressionRuntimeAdapter();
    this.defaults = { ...DEFAULTS, ...config.defaults };
  }

  /**
   * Compress an image blob targeting ~70% of the original size while respecting
   * dimension limits and format preferences. Falls back to the original blob
   * when compression would increase size or when canvas APIs are unavailable.
   */
  async compressImage(
    blob: Blob,
    options: ImageCompressionOptions = {},
  ): Promise<ImageCompressionResult> {
    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new CompressionError("Invalid image blob provided");
    }

    const progress = options.onProgress;
    progress?.({ stage: "decode", percent: 0 });

    const decoded = await this.runtime
      .decodeImage(blob)
      .catch((error) => {
        throw new CompressionError("Unable to decode image", error);
      });

    const originalWidth = Math.max(1, Math.round(decoded.width));
    const originalHeight = Math.max(1, Math.round(decoded.height));

    progress?.({
      stage: "decode",
      percent: 35,
      width: originalWidth,
      height: originalHeight,
    });

    const resizeConfig = this.constrainDimensions(
      originalWidth,
      originalHeight,
      options.maxWidth ?? this.defaults.maxWidth,
      options.maxHeight ?? this.defaults.maxHeight,
      options.maxPixels ?? this.defaults.maxPixels,
    );

    const canvas = this.runtime.createCanvas(resizeConfig.width, resizeConfig.height);
    if (!canvas) {
      decoded.close();
      progress?.({
        stage: "fallback",
        percent: 100,
        width: originalWidth,
        height: originalHeight,
      });
      return this.buildFallbackResult(
        blob,
        originalWidth,
        originalHeight,
        "Canvas APIs are not available in this context",
      );
    }

    try {
      canvas.draw(decoded, resizeConfig.width, resizeConfig.height);
    } finally {
      decoded.close();
    }

    progress?.({
      stage: "resize",
      percent: resizeConfig.wasResized ? 65 : 55,
      width: resizeConfig.width,
      height: resizeConfig.height,
    });

    const attemptedFormats = this.resolveFormatCandidates(
      blob.type,
      options.format,
      options.preferLossless,
    );
    const quality = clampQuality(options.quality ?? this.defaults.quality);

    let compressedBlob: Blob | null = null;
    let usedFormat = attemptedFormats[0] ?? (blob.type || "image/webp");
    const encodeErrors: unknown[] = [];

    for (const format of attemptedFormats) {
      try {
        const candidate = await canvas.toBlob(format, quality);
        if (candidate && candidate.size > 0) {
          compressedBlob = candidate;
          usedFormat = candidate.type || format;
          break;
        }
      } catch (error) {
        encodeErrors.push(error);
      }
    }

    if (!compressedBlob) {
      progress?.({
        stage: "fallback",
        percent: 100,
        width: originalWidth,
        height: originalHeight,
      });
      return this.buildFallbackResult(
        blob,
        originalWidth,
        originalHeight,
        attemptedFormats.length
          ? `Failed to encode image using available formats (${attemptedFormats.join(", ")}).`
          : "Failed to encode image using canvas APIs.",
        attemptedFormats,
      );
    }

    progress?.({
      stage: "encode",
      percent: 90,
      width: resizeConfig.width,
      height: resizeConfig.height,
      bytes: compressedBlob.size,
      format: usedFormat,
    });

    const ratio = compressedBlob.size / blob.size;
    const allowLarger = options.allowLarger ?? false;
    const shouldFallbackToOriginal = !allowLarger && ratio >= 1 && !resizeConfig.wasResized;

    if (shouldFallbackToOriginal) {
      progress?.({
        stage: "fallback",
        percent: 100,
        width: originalWidth,
        height: originalHeight,
      });
      return this.buildFallbackResult(
        blob,
        originalWidth,
        originalHeight,
        "Compression increased file size; original retained.",
        attemptedFormats,
      );
    }

    progress?.({
      stage: "complete",
      percent: 100,
      width: resizeConfig.width,
      height: resizeConfig.height,
      bytes: compressedBlob.size,
      format: usedFormat,
    });

    const compressedDescriptor: ImageCompressionDescriptor = {
      blob: compressedBlob,
      bytes: compressedBlob.size,
      mimeType: usedFormat,
      width: resizeConfig.width,
      height: resizeConfig.height,
    };

    const originalDescriptor: ImageCompressionDescriptor = {
      blob,
      bytes: blob.size,
      mimeType: blob.type || "application/octet-stream",
      width: originalWidth,
      height: originalHeight,
    };

    return {
      original: originalDescriptor,
      compressed: compressedDescriptor,
      ratio,
      wasResized: resizeConfig.wasResized,
      wasConverted:
        compressedDescriptor.mimeType !== originalDescriptor.mimeType ||
        resizeConfig.wasResized,
      fallback: false,
      attemptedFormats,
    };
  }

  /**
   * Generate a thumbnail for an image blob, returning a base64 encoded data URL
   * suitable for preview surfaces. Orientation metadata is respected when the
   * environment supports it via createImageBitmap.
   */
  async createThumbnail(
    blob: Blob,
    options: ThumbnailOptions = {},
  ): Promise<ThumbnailResult> {
    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new CompressionError("Invalid image blob provided");
    }

    const progress = options.onProgress;
    progress?.({ stage: "decode", percent: 0 });

    const decoded = await this.runtime
      .decodeImage(blob)
      .catch((error) => {
        throw new CompressionError("Unable to decode image", error);
      });

    const originalWidth = Math.max(1, Math.round(decoded.width));
    const originalHeight = Math.max(1, Math.round(decoded.height));

    progress?.({
      stage: "decode",
      percent: 40,
      width: originalWidth,
      height: originalHeight,
    });

    const targetSize = Math.max(1, Math.round(options.size ?? this.defaults.thumbnailSize));
    const { width: targetWidth, height: targetHeight } = constrainToSquare(
      originalWidth,
      originalHeight,
      targetSize,
    );

    const canvas = this.runtime.createCanvas(targetWidth, targetHeight);
    if (!canvas) {
      decoded.close();
      throw new CompressionError(
        "Canvas APIs are not available for thumbnail generation",
      );
    }

    try {
      canvas.draw(decoded, targetWidth, targetHeight);
    } finally {
      decoded.close();
    }

    progress?.({
      stage: "resize",
      percent: 70,
      width: targetWidth,
      height: targetHeight,
    });

    const attemptedFormats = this.resolveFormatCandidates(
      blob.type,
      options.format,
      options.preferLossless,
    );
    const quality = clampQuality(options.quality ?? this.defaults.thumbnailQuality);

    let thumbnailBlob: Blob | null = null;
    let usedFormat = attemptedFormats[0] ?? "image/webp";
    const encodeErrors: unknown[] = [];

    for (const format of attemptedFormats) {
      try {
        const candidate = await canvas.toBlob(format, quality);
        if (candidate && candidate.size > 0) {
          thumbnailBlob = candidate;
          usedFormat = candidate.type || format;
          break;
        }
      } catch (error) {
        encodeErrors.push(error);
      }
    }

    if (!thumbnailBlob) {
      throw new CompressionError(
        attemptedFormats.length
          ? `Failed to encode thumbnail using formats (${attemptedFormats.join(", ")}).`
          : "Failed to encode thumbnail using canvas APIs.",
        encodeErrors.at(-1),
      );
    }

    const dataUrl = await blobToDataUrl(thumbnailBlob);

    progress?.({
      stage: "complete",
      percent: 100,
      width: targetWidth,
      height: targetHeight,
      bytes: thumbnailBlob.size,
      format: usedFormat,
    });

    return {
      blob: thumbnailBlob,
      bytes: thumbnailBlob.size,
      mimeType: usedFormat,
      width: targetWidth,
      height: targetHeight,
      dataUrl,
    };
  }

  /**
   * Create a deterministic excerpt that respects sentence boundaries and word
   * limits, avoiding mid-word truncation. Defaults to 120 words.
   */
  createExcerpt(text: string, options: ExcerptOptions = {}): ExcerptResult {
    const normalize = options.normalizeWhitespace !== false;
    const ellipsisEnabled = options.ellipsis !== false;
    const maxWords = Math.max(1, options.maxWords ?? 120);
    const maxSentences = options.maxSentences && options.maxSentences > 0
      ? Math.floor(options.maxSentences)
      : undefined;

    const normalizedText = normalize ? normalizeWhitespace(text) : text.trim();
    if (!normalizedText) {
      return {
        excerpt: "",
        wordCount: 0,
        truncated: false,
        sentences: 0,
        originalWordCount: 0,
      };
    }

    const sentences = splitIntoSentences(normalizedText);
    const totalWords = countWords(normalizedText);

    const excerptParts: string[] = [];
    let accumulatedWords = 0;
    let usedSentences = 0;
    let truncated = false;
    let ellipsisApplied = false;

    for (const sentence of sentences) {
      const words = sentence.split(/\s+/u).filter(Boolean);
      if (words.length === 0) {
        continue;
      }

      const prospectiveCount = accumulatedWords + words.length;

      if (maxSentences && usedSentences >= maxSentences) {
        truncated = true;
        break;
      }

      if (prospectiveCount <= maxWords) {
        excerptParts.push(sentence);
        accumulatedWords = prospectiveCount;
        usedSentences += 1;

        if (maxSentences && usedSentences >= maxSentences && usedSentences < sentences.length) {
          truncated = true;
          if (ellipsisEnabled && !ellipsisApplied) {
            excerptParts[excerptParts.length - 1] = appendEllipsis(
              excerptParts[excerptParts.length - 1],
            );
            ellipsisApplied = true;
          }
        }
        continue;
      }

      const remaining = maxWords - accumulatedWords;
      if (remaining > 0) {
        const partialSentence = words.slice(0, remaining).join(" ");
        const cleaned = partialSentence.replace(/[\s,;:]+$/u, "");
        excerptParts.push(
          ellipsisEnabled ? appendEllipsis(cleaned) : cleaned,
        );
        accumulatedWords = maxWords;
        truncated = true;
        ellipsisApplied = ellipsisEnabled;
      } else {
        truncated = true;
      }
      break;
    }

    if (!truncated && accumulatedWords < totalWords) {
      truncated = true;
      if (ellipsisEnabled && excerptParts.length > 0 && !ellipsisApplied) {
        excerptParts[excerptParts.length - 1] = appendEllipsis(
          excerptParts[excerptParts.length - 1],
        );
        ellipsisApplied = true;
      }
    }

    const excerpt = normalizeWhitespace(excerptParts.join(" "));

    return {
      excerpt,
      wordCount: accumulatedWords,
      truncated,
      sentences: usedSentences,
      originalWordCount: totalWords,
    };
  }

  private constrainDimensions(
    width: number,
    height: number,
    maxWidth: number,
    maxHeight: number,
    maxPixels: number,
  ): { width: number; height: number; wasResized: boolean } {
    let targetWidth = Math.max(1, width);
    let targetHeight = Math.max(1, height);
    let wasResized = false;

    const widthLimit = maxWidth > 0 ? maxWidth : targetWidth;
    const heightLimit = maxHeight > 0 ? maxHeight : targetHeight;

    const widthScale = widthLimit / targetWidth;
    const heightScale = heightLimit / targetHeight;
    const scale = Math.min(1, widthScale, heightScale);

    if (scale < 1) {
      targetWidth = Math.max(1, Math.round(targetWidth * scale));
      targetHeight = Math.max(1, Math.round(targetHeight * scale));
      wasResized = true;
    }

    const pixelLimit = maxPixels > 0 ? maxPixels : targetWidth * targetHeight;
    const totalPixels = targetWidth * targetHeight;
    if (totalPixels > pixelLimit) {
      const pixelScale = Math.sqrt(pixelLimit / totalPixels);
      targetWidth = Math.max(1, Math.round(targetWidth * pixelScale));
      targetHeight = Math.max(1, Math.round(targetHeight * pixelScale));
      wasResized = true;
    }

    return { width: targetWidth, height: targetHeight, wasResized };
  }

  private resolveFormatCandidates(
    originalType: string | undefined,
    requestedFormat: string | undefined,
    preferLossless?: boolean,
  ): string[] {
    const candidates: string[] = [];
    const normalizedRequested = normalizeFormat(requestedFormat);
    const normalizedOriginal = normalizeFormat(originalType);

    if (normalizedRequested) {
      candidates.push(normalizedRequested);
    }

    if (preferLossless) {
      if (normalizedOriginal && isLosslessMime(normalizedOriginal)) {
        candidates.push(normalizedOriginal);
      }
      candidates.push("image/png");
      if (normalizedOriginal && !isLosslessMime(normalizedOriginal)) {
        candidates.push(normalizedOriginal);
      }
      candidates.push("image/webp");
      candidates.push("image/jpeg");
    } else {
      candidates.push("image/webp");
      if (normalizedOriginal) {
        candidates.push(normalizedOriginal);
      }
      candidates.push("image/jpeg");
      candidates.push("image/png");
    }

    return uniqueFormats(candidates);
  }

  private buildFallbackResult(
    blob: Blob,
    width: number,
    height: number,
    reason: string,
    attemptedFormats?: string[],
  ): ImageCompressionResult {
    const descriptor: ImageCompressionDescriptor = {
      blob,
      bytes: blob.size,
      mimeType: blob.type || "application/octet-stream",
      width,
      height,
    };

    return {
      original: descriptor,
      compressed: descriptor,
      ratio: 1,
      wasResized: false,
      wasConverted: false,
      fallback: true,
      message: reason,
      attemptedFormats: attemptedFormats ? [...attemptedFormats] : [],
    };
  }
}

export const compressionService = new DefaultCompressionService();

function normalizeFormat(format: string | undefined): string | undefined {
  if (!format) {
    return undefined;
  }
  const lower = format.toLowerCase();
  if (lower === "webp" || lower === "image/webp") {
    return "image/webp";
  }
  if (lower === "jpeg" || lower === "jpg" || lower === "image/jpeg") {
    return "image/jpeg";
  }
  if (lower === "png" || lower === "image/png") {
    return "image/png";
  }
  if (lower === "gif" || lower === "image/gif") {
    return "image/gif";
  }
  if (lower === "bmp" || lower === "image/bmp") {
    return "image/bmp";
  }
  return format;
}

function isLosslessMime(mimeType: string): boolean {
  return mimeType === "image/png" || mimeType === "image/gif" || mimeType === "image/bmp";
}

function uniqueFormats(formats: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const format of formats) {
    if (!format || seen.has(format)) {
      continue;
    }
    seen.add(format);
    result.push(format);
  }
  return result;
}

function clampQuality(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.72;
  }
  return Math.min(1, Math.max(0.05, value));
}

function constrainToSquare(
  width: number,
  height: number,
  target: number,
): { width: number; height: number } {
  if (width === height) {
    return { width: target, height: target };
  }
  if (width > height) {
    const scale = target / width;
    return {
      width: target,
      height: Math.max(1, Math.round(height * scale)),
    };
  }
  const scale = target / height;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: target,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const base64 = arrayBufferToBase64(buffer);
    const mimeType = blob.type || "application/octet-stream";
    return `data:${mimeType};base64,${base64}`;
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bufferCtor = (globalThis as typeof globalThis & {
    Buffer?: { from(data: ArrayBuffer | Uint8Array): { toString(encoding: string): string } };
  }).Buffer;
  if (bufferCtor && typeof bufferCtor.from === "function") {
    return bufferCtor.from(buffer).toString("base64");
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  throw new Error("Base64 encoding is not supported in this environment");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function splitIntoSentences(value: string): string[] {
  if (typeof Intl !== "undefined") {
    const segmenterCtor = (Intl as typeof Intl & {
      Segmenter?: IntlSegmenterCtor;
    }).Segmenter;
    if (typeof segmenterCtor === "function") {
      const segmenter = new segmenterCtor(undefined, {
        granularity: "sentence",
      });
      const segments: string[] = [];
      for (const segment of segmenter.segment(value)) {
        const trimmed = segment.segment.trim();
        if (trimmed) {
          segments.push(trimmed);
        }
      }
      if (segments.length > 0) {
        return segments;
      }
    }
  }

  const fallback = value.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/gu);
  if (!fallback) {
    return value ? [value.trim()] : [];
  }
  return fallback.map((segment) => segment.trim());
}

type IntlSegmenterCtor = new (
  locales?: string | string[] | undefined,
  options?: Intl.SegmenterOptions | undefined,
) => Intl.Segmenter;

function countWords(value: string): number {
  const matches = value.match(/\b[\p{L}\p{N}'-]+\b/gu);
  return matches ? matches.length : 0;
}

function appendEllipsis(value: string): string {
  const trimmed = value.trimEnd();
  if (trimmed.endsWith("…")) {
    return trimmed;
  }
  const sanitized = trimmed.replace(/[.!?]+$/u, "");
  return `${sanitized}…`;
}
