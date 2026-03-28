/**
 * Media Capture System
 * Comprehensive media capture with detection, extraction, metadata, and optimization
 * Requirements: 2.1, 3.6, 3.7
 */

import {
  mediaMetadataExtractor,
  type ImageMetadata,
  type AudioMetadata,
  type VideoMetadata,
  type MediaDetectionResult,
} from "./media-metadata.js";
import {
  mediaProcessor,
  type CompressionOptions,
  type ProcessingResult,
  type StereoWaveformData,
} from "./media-processor.js";
import { sendMessage } from "../shared/message-client.js";
import type { AudioTranscribeResponsePayload } from "../shared/types/index.d.ts";

export interface CapturedImage {
  metadata: ImageMetadata;
  dataUrl: string;
  thumbnail?: string;
  compressed?: ProcessingResult;
  capturedAt: number;
}

export interface CapturedAudio {
  metadata: AudioMetadata;
  dataUrl?: string;
  transcription?: string;
  waveform?: StereoWaveformData;
  capturedAt: number;
}

export interface CapturedVideo {
  metadata: VideoMetadata;
  thumbnail?: string;
  thumbnailDataUrl?: string;
  capturedAt: number;
}

export interface MediaCaptureOptions {
  compressImages?: boolean;
  generateThumbnails?: boolean;
  transcribeAudio?: boolean;
  compressionOptions?: CompressionOptions;
  thumbnailSize?: number;
}

export interface MediaCaptureResult {
  images: CapturedImage[];
  audios: CapturedAudio[];
  videos: CapturedVideo[];
  totalSize: number;
  capturedAt: number;
}

export class MediaCapture {
  /**
   * Detect and capture all media on the page
   * Requirements: 2.1, 3.6, 3.7
   */
  async captureAllMedia(
    options: MediaCaptureOptions = {},
  ): Promise<MediaCaptureResult> {
    const {
      compressImages = true,
      generateThumbnails = true,
      transcribeAudio = false,
      compressionOptions = {},
      thumbnailSize = 200,
    } = options;

    console.info("[MediaCapture] Starting media capture", options);

    // Detect all media elements
    const detected = mediaMetadataExtractor.detectMediaElements();

    // Capture images
    const images = await this.captureImages(
      detected.images,
      compressImages,
      generateThumbnails,
      compressionOptions,
      thumbnailSize,
    );

    // Capture background images
    const backgroundImages = await this.captureBackgroundImages(
      detected.backgroundImages,
      compressImages,
      generateThumbnails,
      compressionOptions,
      thumbnailSize,
    );

    // Combine all images
    const allImages = [...images, ...backgroundImages];

    // Capture audio
    const audios = await this.captureAudios(detected.audios, transcribeAudio);

    // Capture videos
    const videos = await this.captureVideos(
      detected.videos,
      generateThumbnails,
      thumbnailSize,
    );

    // Calculate total size
    const totalSize = this.calculateTotalSize(allImages, audios, videos);

    console.info("[MediaCapture] Media capture completed", {
      images: allImages.length,
      audios: audios.length,
      videos: videos.length,
      totalSize,
    });

    return {
      images: allImages,
      audios,
      videos,
      totalSize,
      capturedAt: Date.now(),
    };
  }

  /**
   * Capture a specific image element
   * Requirements: 2.1, 3.6
   */
  async captureImage(
    img: HTMLImageElement,
    options: MediaCaptureOptions = {},
  ): Promise<CapturedImage> {
    const {
      compressImages = true,
      generateThumbnails = true,
      compressionOptions = {},
      thumbnailSize = 200,
    } = options;

    // Extract metadata
    const metadata = await mediaMetadataExtractor.extractImageMetadata(img);

    // Get original data URL
    const dataUrl = await this.imageToDataUrl(img);

    const captured: CapturedImage = {
      metadata,
      dataUrl,
      capturedAt: Date.now(),
    };

    // Compress if requested
    if (compressImages) {
      try {
        captured.compressed = await mediaProcessor.compressImage(
          img,
          compressionOptions,
        );
      } catch (error) {
        console.warn("[MediaCapture] Image compression failed", error);
      }
    }

    // Generate thumbnail if requested
    if (generateThumbnails) {
      try {
        const thumbnailResult = await mediaProcessor.generateImageThumbnail(
          img,
          thumbnailSize,
        );
        captured.thumbnail = thumbnailResult.dataUrl;
      } catch (error) {
        console.warn("[MediaCapture] Thumbnail generation failed", error);
      }
    }

    return captured;
  }

  /**
   * Capture a specific audio element
   * Requirements: 2.1, 3.7
   */
  async captureAudio(
    audio: HTMLAudioElement,
    transcribe: boolean = false,
  ): Promise<CapturedAudio> {
    // Extract metadata
    const metadata = await mediaMetadataExtractor.extractAudioMetadata(audio);

    const captured: CapturedAudio = {
      metadata,
      capturedAt: Date.now(),
    };

    // Extract waveform for visualization
    try {
      captured.waveform = await mediaProcessor.extractAudioWaveform(audio);
    } catch (error) {
      console.warn("[MediaCapture] Waveform extraction failed", error);
    }

    // Transcribe if requested (would use Gemini Nano or cloud API)
    if (transcribe) {
      try {
        captured.transcription = await this.transcribeAudio(audio);
      } catch (error) {
        console.warn("[MediaCapture] Audio transcription failed", error);
      }
    }

    return captured;
  }

  /**
   * Capture a specific video element
   * Requirements: 2.1, 3.7
   */
  async captureVideo(
    video: HTMLVideoElement,
    generateThumbnail: boolean = true,
    thumbnailSize: number = 200,
  ): Promise<CapturedVideo> {
    // Extract metadata
    const metadata = await mediaMetadataExtractor.extractVideoMetadata(video);

    const captured: CapturedVideo = {
      metadata,
      capturedAt: Date.now(),
    };

    // Generate thumbnail if requested
    if (generateThumbnail) {
      try {
        const thumbnailResult = await mediaProcessor.generateVideoThumbnail(
          video,
          0, // Capture at start
          { maxWidth: thumbnailSize, maxHeight: thumbnailSize },
        );
        captured.thumbnailDataUrl = thumbnailResult.dataUrl;
        captured.thumbnail = thumbnailResult.dataUrl;
      } catch (error) {
        console.warn("[MediaCapture] Video thumbnail generation failed", error);
      }
    }

    return captured;
  }

  /**
   * Capture images from page
   */
  private async captureImages(
    images: HTMLImageElement[],
    compress: boolean,
    generateThumbnails: boolean,
    compressionOptions: CompressionOptions,
    thumbnailSize: number,
  ): Promise<CapturedImage[]> {
    const captured: CapturedImage[] = [];

    for (const img of images) {
      try {
        const result = await this.captureImage(img, {
          compressImages: compress,
          generateThumbnails,
          compressionOptions,
          thumbnailSize,
        });
        captured.push(result);
      } catch (error) {
        console.error("[MediaCapture] Failed to capture image", error);
      }
    }

    return captured;
  }

  /**
   * Capture background images
   */
  private async captureBackgroundImages(
    backgroundImages: Array<{ element: HTMLElement; url: string }>,
    compress: boolean,
    generateThumbnails: boolean,
    compressionOptions: CompressionOptions,
    thumbnailSize: number,
  ): Promise<CapturedImage[]> {
    const captured: CapturedImage[] = [];

    for (const { element, url } of backgroundImages) {
      try {
        // Extract metadata
        const metadata = mediaMetadataExtractor.extractBackgroundImageMetadata(
          element,
          url,
        );

        // Load image to process it
        const img = await this.loadImage(url);

        // Get data URL
        const dataUrl = await this.imageToDataUrl(img);

        const result: CapturedImage = {
          metadata,
          dataUrl,
          capturedAt: Date.now(),
        };

        // Compress if requested
        if (compress) {
          try {
            result.compressed = await mediaProcessor.compressImage(
              img,
              compressionOptions,
            );
          } catch (error) {
            console.warn(
              "[MediaCapture] Background image compression failed",
              error,
            );
          }
        }

        // Generate thumbnail if requested
        if (generateThumbnails) {
          try {
            const thumbnailResult = await mediaProcessor.generateImageThumbnail(
              img,
              thumbnailSize,
            );
            result.thumbnail = thumbnailResult.dataUrl;
          } catch (error) {
            console.warn(
              "[MediaCapture] Background image thumbnail failed",
              error,
            );
          }
        }

        captured.push(result);
      } catch (error) {
        console.error(
          "[MediaCapture] Failed to capture background image",
          error,
        );
      }
    }

    return captured;
  }

  /**
   * Capture audios from page
   */
  private async captureAudios(
    audios: HTMLAudioElement[],
    transcribe: boolean,
  ): Promise<CapturedAudio[]> {
    const captured: CapturedAudio[] = [];

    for (const audio of audios) {
      try {
        const result = await this.captureAudio(audio, transcribe);
        captured.push(result);
      } catch (error) {
        console.error("[MediaCapture] Failed to capture audio", error);
      }
    }

    return captured;
  }

  /**
   * Capture videos from page
   */
  private async captureVideos(
    videos: HTMLVideoElement[],
    generateThumbnails: boolean,
    thumbnailSize: number,
  ): Promise<CapturedVideo[]> {
    const captured: CapturedVideo[] = [];

    for (const video of videos) {
      try {
        const result = await this.captureVideo(
          video,
          generateThumbnails,
          thumbnailSize,
        );
        captured.push(result);
      } catch (error) {
        console.error("[MediaCapture] Failed to capture video", error);
      }
    }

    return captured;
  }

  /**
   * Convert image element to data URL
   */
  private async imageToDataUrl(img: HTMLImageElement): Promise<string> {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get canvas context");
    }

    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  }

  /**
   * Load image from URL
   */
  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // Try to load with CORS
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * Transcribe audio via the background STT executor
   * Requirements: 3.7
   */
  private async transcribeAudio(audio: HTMLAudioElement): Promise<string> {
    const sourceUrl = audio.currentSrc || audio.src;
    const audioBlob = await this.loadAudioBlob(audio);
    const mimeType = audioBlob.type || "audio/webm";
    const audioBase64 = await this.blobToBase64(audioBlob);
    const response = await sendMessage<AudioTranscribeResponsePayload>(
      "AUDIO_TRANSCRIBE_REQUEST",
      {
        audioBase64,
        mimeType,
        fileName: "captured-audio.webm",
        ...(Number.isFinite(audio.duration)
          ? { durationMs: Math.round(audio.duration * 1000) }
          : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
      },
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || "Audio transcription failed");
    }

    if (!response.data.success || !response.data.text) {
      throw new Error(response.data.error || "Audio transcription failed");
    }

    return response.data.text;
  }

  private async loadAudioBlob(audio: HTMLAudioElement): Promise<Blob> {
    const sourceUrl = audio.currentSrc || audio.src;

    if (!sourceUrl) {
      throw new Error("Audio source URL is not available");
    }

    const response = await fetch(sourceUrl);
    return await response.blob();
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Failed to serialize audio blob"));
          return;
        }

        resolve(result.split(",")[1] || "");
      };
      reader.onerror = () => {
        reject(reader.error || new Error("Failed to serialize audio blob"));
      };
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Calculate total size of captured media
   */
  private calculateTotalSize(
    images: CapturedImage[],
    audios: CapturedAudio[],
    videos: CapturedVideo[],
  ): number {
    let total = 0;

    // Sum image sizes
    for (const img of images) {
      if (img.compressed) {
        total += img.compressed.compressedSize;
      } else {
        // Estimate from data URL
        total += this.estimateDataUrlSize(img.dataUrl);
      }
    }

    // Audio and video sizes would need to be calculated differently
    // For now, just count them
    total += audios.length * 1000; // Placeholder
    total += videos.length * 1000; // Placeholder

    return total;
  }

  /**
   * Estimate size from data URL
   */
  private estimateDataUrlSize(dataUrl: string): number {
    // Data URL format: data:[<mediatype>][;base64],<data>
    const base64Data = dataUrl.split(",")[1] || "";
    // Base64 encoding increases size by ~33%
    return (base64Data.length * 3) / 4;
  }

  /**
   * Filter media by type
   * Requirements: 2.1
   */
  filterMediaByType(
    result: MediaCaptureResult,
    type: "image" | "audio" | "video",
  ): CapturedImage[] | CapturedAudio[] | CapturedVideo[] {
    switch (type) {
      case "image":
        return result.images;
      case "audio":
        return result.audios;
      case "video":
        return result.videos;
      default:
        return [];
    }
  }

  /**
   * Get media statistics
   * Requirements: 2.1
   */
  getMediaStatistics(result: MediaCaptureResult): {
    totalImages: number;
    totalAudios: number;
    totalVideos: number;
    totalSize: number;
    averageImageSize: number;
    largestImage: CapturedImage | undefined;
  } {
    const stats: {
      totalImages: number;
      totalAudios: number;
      totalVideos: number;
      totalSize: number;
      averageImageSize: number;
      largestImage: CapturedImage | undefined;
    } = {
      totalImages: result.images.length,
      totalAudios: result.audios.length,
      totalVideos: result.videos.length,
      totalSize: result.totalSize,
      averageImageSize: 0,
      largestImage: undefined,
    };

    if (result.images.length > 0) {
      let totalImageSize = 0;
      let largestSize = 0;

      for (const img of result.images) {
        const size =
          img.compressed?.compressedSize ||
          this.estimateDataUrlSize(img.dataUrl);
        totalImageSize += size;

        if (size > largestSize) {
          largestSize = size;
          stats.largestImage = img;
        }
      }

      stats.averageImageSize = totalImageSize / result.images.length;
    }

    return stats;
  }
}

// Export singleton instance
export const mediaCapture = new MediaCapture();
