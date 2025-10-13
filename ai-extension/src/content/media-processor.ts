/**
 * Media Processor
 * Handles compression, optimization, and format conversion for media files
 * Requirements: 2.1, 3.6, 3.7
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1 for JPEG/WebP
  format?: "jpeg" | "png" | "webp";
  maintainAspectRatio?: boolean;
}

export interface AudioCompressionOptions {
  bitrate?: number;
  sampleRate?: number;
  channels?: 1 | 2;
  format?: "mp3" | "ogg" | "webm";
}

export interface VideoCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  bitrate?: number;
  frameRate?: number;
  format?: "mp4" | "webm";
}

export interface ProcessingResult {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  dataUrl: string;
  blob: Blob;
  format: string;
}

export class MediaProcessor {
  /**
   * Compress and optimize an image
   * Requirements: 2.1, 3.6
   */
  async compressImage(
    img: HTMLImageElement,
    options: CompressionOptions = {}
  ): Promise<ProcessingResult> {
    const {
      maxWidth = 1920,
      maxHeight = 1080,
      quality = 0.85,
      format = "jpeg",
      maintainAspectRatio = true,
    } = options;

    // Create canvas for image processing
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Could not get canvas context");
    }

    // Calculate dimensions
    let width = img.naturalWidth;
    let height = img.naturalHeight;

    if (maintainAspectRatio) {
      const aspectRatio = width / height;

      if (width > maxWidth) {
        width = maxWidth;
        height = width / aspectRatio;
      }

      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
      }
    } else {
      width = Math.min(width, maxWidth);
      height = Math.min(height, maxHeight);
    }

    // Set canvas dimensions
    canvas.width = width;
    canvas.height = height;

    // Draw image on canvas
    ctx.drawImage(img, 0, 0, width, height);

    // Convert to blob
    const mimeType = this.getMimeType(format);
    const blob = await this.canvasToBlob(canvas, mimeType, quality);
    const dataUrl = await this.blobToDataUrl(blob);

    // Estimate original size
    const originalSize = await this.estimateImageSize(img.src);

    return {
      originalSize,
      compressedSize: blob.size,
      compressionRatio: originalSize > 0 ? blob.size / originalSize : 1,
      dataUrl,
      blob,
      format,
    };
  }

  /**
   * Compress image from data URL or blob
   * Requirements: 2.1, 3.6
   */
  async compressImageFromData(
    dataUrl: string,
    options: CompressionOptions = {}
  ): Promise<ProcessingResult> {
    const img = await this.loadImageFromDataUrl(dataUrl);
    return this.compressImage(img, options);
  }

  /**
   * Generate thumbnail from image
   * Requirements: 2.1, 3.6
   */
  async generateImageThumbnail(
    img: HTMLImageElement,
    size: number = 200
  ): Promise<ProcessingResult> {
    return this.compressImage(img, {
      maxWidth: size,
      maxHeight: size,
      quality: 0.8,
      format: "jpeg",
      maintainAspectRatio: true,
    });
  }

  /**
   * Generate thumbnail from video
   * Requirements: 2.1, 3.7
   */
  async generateVideoThumbnail(
    video: HTMLVideoElement,
    timeInSeconds: number = 0,
    options: CompressionOptions = {}
  ): Promise<ProcessingResult> {
    const {
      maxWidth = 640,
      maxHeight = 360,
      quality = 0.85,
      format = "jpeg",
    } = options;

    // Seek to specified time
    video.currentTime = timeInSeconds;

    // Wait for seek to complete
    await new Promise<void>((resolve) => {
      video.addEventListener("seeked", () => resolve(), { once: true });
    });

    // Create canvas
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Could not get canvas context");
    }

    // Calculate dimensions maintaining aspect ratio
    const aspectRatio = video.videoWidth / video.videoHeight;
    let width = video.videoWidth;
    let height = video.videoHeight;

    if (width > maxWidth) {
      width = maxWidth;
      height = width / aspectRatio;
    }

    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }

    canvas.width = width;
    canvas.height = height;

    // Draw video frame
    ctx.drawImage(video, 0, 0, width, height);

    // Convert to blob
    const mimeType = this.getMimeType(format);
    const blob = await this.canvasToBlob(canvas, mimeType, quality);
    const dataUrl = await this.blobToDataUrl(blob);

    return {
      originalSize: 0, // Unknown for video frames
      compressedSize: blob.size,
      compressionRatio: 1,
      dataUrl,
      blob,
      format,
    };
  }

  /**
   * Extract audio waveform data for visualization
   * Requirements: 3.7
   */
  async extractAudioWaveform(
    audio: HTMLAudioElement,
    samples: number = 100
  ): Promise<number[]> {
    // This would use Web Audio API to extract waveform data
    // For now, return empty array as placeholder
    console.warn("[MediaProcessor] Audio waveform extraction not yet implemented");
    return new Array(samples).fill(0);
  }

  /**
   * Convert canvas to blob
   */
  private canvasToBlob(
    canvas: HTMLCanvasElement,
    mimeType: string,
    quality: number
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to convert canvas to blob"));
          }
        },
        mimeType,
        quality
      );
    });
  }

  /**
   * Convert blob to data URL
   */
  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to convert blob to data URL"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Load image from data URL
   */
  private loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  /**
   * Get MIME type for format
   */
  private getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      jpeg: "image/jpeg",
      jpg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
    };

    return mimeTypes[format] || "image/jpeg";
  }

  /**
   * Estimate image size from URL
   */
  private async estimateImageSize(url: string): Promise<number> {
    try {
      const response = await fetch(url, { method: "HEAD" });
      const contentLength = response.headers.get("content-length");
      
      if (contentLength) {
        return parseInt(contentLength, 10);
      }
    } catch (error) {
      // Silently fail
    }

    return 0;
  }

  /**
   * Optimize image for storage
   * Requirements: 2.1, 3.6
   */
  async optimizeForStorage(
    img: HTMLImageElement
  ): Promise<ProcessingResult> {
    // Determine optimal settings based on image characteristics
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const pixels = width * height;

    let maxWidth = 1920;
    let maxHeight = 1080;
    let quality = 0.85;

    // Adjust settings for very large images
    if (pixels > 4000000) {
      // > 4MP
      maxWidth = 1600;
      maxHeight = 900;
      quality = 0.8;
    }

    // Use WebP for better compression if supported
    const format = this.isWebPSupported() ? "webp" : "jpeg";

    return this.compressImage(img, {
      maxWidth,
      maxHeight,
      quality,
      format,
      maintainAspectRatio: true,
    });
  }

  /**
   * Check if WebP is supported
   */
  private isWebPSupported(): boolean {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    
    return canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
  }

  /**
   * Batch process multiple images
   * Requirements: 2.1, 3.6
   */
  async batchProcessImages(
    images: HTMLImageElement[],
    options: CompressionOptions = {}
  ): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];

    for (const img of images) {
      try {
        const result = await this.compressImage(img, options);
        results.push(result);
      } catch (error) {
        console.error("[MediaProcessor] Failed to process image", error);
      }
    }

    return results;
  }

  /**
   * Convert image to different format
   * Requirements: 3.6
   */
  async convertImageFormat(
    img: HTMLImageElement,
    targetFormat: "jpeg" | "png" | "webp"
  ): Promise<ProcessingResult> {
    return this.compressImage(img, {
      format: targetFormat,
      quality: 0.95, // High quality for format conversion
      maintainAspectRatio: true,
    });
  }
}

// Export singleton instance
export const mediaProcessor = new MediaProcessor();
