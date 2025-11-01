/**
 * Media Metadata Extractor
 * Extracts comprehensive metadata from images, audio, and video elements
 * Requirements: 2.1, 3.6, 3.7
 */

export interface ImageMetadata {
  src: string;
  alt: string;
  title?: string;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  aspectRatio: number;
  fileSize?: number;
  format?: string;
  loading?: "lazy" | "eager";
  srcset?: string;
  sizes?: string;
  isBackgroundImage?: boolean;
  backgroundImageUrl?: string;
}

export interface AudioMetadata {
  src: string;
  duration: number;
  currentTime: number;
  volume: number;
  muted: boolean;
  paused: boolean;
  format?: string;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  title?: string;
  artist?: string;
  album?: string;
}

export interface VideoMetadata {
  src: string;
  poster?: string;
  duration: number;
  currentTime: number;
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
  aspectRatio: number;
  volume: number;
  muted: boolean;
  paused: boolean;
  format?: string;
  codec?: string;
  bitrate?: number;
  frameRate?: number;
  title?: string;
}

export interface MediaDetectionResult {
  images: HTMLImageElement[];
  videos: HTMLVideoElement[];
  audios: HTMLAudioElement[];
  backgroundImages: Array<{ element: HTMLElement; url: string }>;
}

export class MediaMetadataExtractor {
  /**
   * Detect all media elements on the page
   * Requirements: 2.1
   */
  detectMediaElements(): MediaDetectionResult {
    const images = Array.from(
      document.querySelectorAll("img"),
    ) as HTMLImageElement[];
    const videos = Array.from(
      document.querySelectorAll("video"),
    ) as HTMLVideoElement[];
    const audios = Array.from(
      document.querySelectorAll("audio"),
    ) as HTMLAudioElement[];

    // Detect background images
    const backgroundImages = this.detectBackgroundImages();

    console.info("[MediaMetadata] Detected media elements", {
      images: images.length,
      videos: videos.length,
      audios: audios.length,
      backgroundImages: backgroundImages.length,
    });

    return { images, videos, audios, backgroundImages };
  }

  /**
   * Extract comprehensive image metadata
   * Requirements: 2.1, 3.6
   */
  async extractImageMetadata(img: HTMLImageElement): Promise<ImageMetadata> {
    // Wait for image to load if not already loaded
    if (!img.complete) {
      await this.waitForImageLoad(img);
    }

    const metadata: ImageMetadata = {
      src: img.src,
      alt: img.alt || "",
      width: img.width,
      height: img.height,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      aspectRatio: img.naturalWidth / img.naturalHeight,
      isBackgroundImage: false,
    };

    // Add optional properties only if they have values
    if (img.title) metadata.title = img.title;
    if (img.loading) metadata.loading = img.loading as "lazy" | "eager";
    if (img.srcset) metadata.srcset = img.srcset;
    if (img.sizes) metadata.sizes = img.sizes;

    const format = this.getImageFormat(img.src);
    if (format) metadata.format = format;

    // Try to estimate file size (if possible)
    try {
      const estimatedSize = await this.estimateImageSize(img.src);
      if (estimatedSize !== undefined) {
        metadata.fileSize = estimatedSize;
      }
    } catch (error) {
      console.warn("[MediaMetadata] Could not estimate image size", error);
    }

    return metadata;
  }

  /**
   * Extract background image metadata
   * Requirements: 2.1, 3.6
   */
  extractBackgroundImageMetadata(
    element: HTMLElement,
    url: string,
  ): ImageMetadata {
    const computedStyle = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    const metadata: ImageMetadata = {
      src: url,
      alt:
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        "",
      width: rect.width,
      height: rect.height,
      naturalWidth: 0, // Unknown for background images
      naturalHeight: 0,
      aspectRatio: rect.width / rect.height,
      isBackgroundImage: true,
      backgroundImageUrl: url,
    };

    const format = this.getImageFormat(url);
    if (format) metadata.format = format;

    return metadata;
  }

  /**
   * Extract audio metadata
   * Requirements: 2.1, 3.7
   */
  async extractAudioMetadata(audio: HTMLAudioElement): Promise<AudioMetadata> {
    // Wait for metadata to load
    if (audio.readyState < 1) {
      await this.waitForMediaMetadata(audio);
    }

    const metadata: AudioMetadata = {
      src: audio.src || audio.currentSrc,
      duration: audio.duration,
      currentTime: audio.currentTime,
      volume: audio.volume,
      muted: audio.muted,
      paused: audio.paused,
    };

    // Add optional properties only if they have values
    if (audio.title) metadata.title = audio.title;

    const format = this.getAudioFormat(audio.src || audio.currentSrc);
    if (format) metadata.format = format;

    // Try to extract additional metadata from MediaElement
    try {
      const additionalMetadata = await this.extractMediaElementMetadata(audio);
      Object.assign(metadata, additionalMetadata);
    } catch (error) {
      console.warn(
        "[MediaMetadata] Could not extract additional audio metadata",
        error,
      );
    }

    return metadata;
  }

  /**
   * Extract video metadata
   * Requirements: 2.1, 3.7
   */
  async extractVideoMetadata(video: HTMLVideoElement): Promise<VideoMetadata> {
    // Wait for metadata to load
    if (video.readyState < 1) {
      await this.waitForMediaMetadata(video);
    }

    const metadata: VideoMetadata = {
      src: video.src || video.currentSrc,
      duration: video.duration,
      currentTime: video.currentTime,
      width: video.width,
      height: video.height,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      aspectRatio: video.videoWidth / video.videoHeight,
      volume: video.volume,
      muted: video.muted,
      paused: video.paused,
    };

    // Add optional properties only if they have values
    if (video.poster) metadata.poster = video.poster;
    if (video.title) metadata.title = video.title;

    const format = this.getVideoFormat(video.src || video.currentSrc);
    if (format) metadata.format = format;

    // Try to extract codec information
    try {
      const codecInfo = await this.extractVideoCodecInfo(video);
      Object.assign(metadata, codecInfo);
    } catch (error) {
      console.warn("[MediaMetadata] Could not extract codec info", error);
    }

    return metadata;
  }

  /**
   * Detect background images in the page
   * Requirements: 2.1
   */
  private detectBackgroundImages(): Array<{
    element: HTMLElement;
    url: string;
  }> {
    const backgroundImages: Array<{ element: HTMLElement; url: string }> = [];
    const elements = document.querySelectorAll("*");

    elements.forEach((element) => {
      const style = window.getComputedStyle(element);
      const backgroundImage = style.backgroundImage;

      if (backgroundImage && backgroundImage !== "none") {
        // Extract URL from background-image CSS property
        const urlMatch = backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
        if (urlMatch && urlMatch[1]) {
          backgroundImages.push({
            element: element as HTMLElement,
            url: urlMatch[1],
          });
        }
      }
    });

    return backgroundImages;
  }

  /**
   * Wait for image to load
   */
  private waitForImageLoad(img: HTMLImageElement): Promise<void> {
    return new Promise((resolve, reject) => {
      if (img.complete) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("Image load timeout"));
      }, 5000);

      img.addEventListener("load", () => {
        clearTimeout(timeout);
        resolve();
      });

      img.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Image load failed"));
      });
    });
  }

  /**
   * Wait for media metadata to load
   */
  private waitForMediaMetadata(media: HTMLMediaElement): Promise<void> {
    return new Promise((resolve, reject) => {
      if (media.readyState >= 1) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("Media metadata load timeout"));
      }, 5000);

      media.addEventListener("loadedmetadata", () => {
        clearTimeout(timeout);
        resolve();
      });

      media.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Media metadata load failed"));
      });
    });
  }

  /**
   * Get image format from URL
   */
  private getImageFormat(url: string): string | undefined {
    const extension = url.split(".").pop()?.split("?")[0]?.toLowerCase();
    const imageFormats = [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "svg",
      "bmp",
      "ico",
    ];

    if (extension && imageFormats.includes(extension)) {
      return extension;
    }

    return undefined;
  }

  /**
   * Get audio format from URL
   */
  private getAudioFormat(url: string): string | undefined {
    const extension = url.split(".").pop()?.split("?")[0]?.toLowerCase();
    const audioFormats = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "wma"];

    if (extension && audioFormats.includes(extension)) {
      return extension;
    }

    return undefined;
  }

  /**
   * Get video format from URL
   */
  private getVideoFormat(url: string): string | undefined {
    const extension = url.split(".").pop()?.split("?")[0]?.toLowerCase();
    const videoFormats = ["mp4", "webm", "ogg", "mov", "avi", "mkv", "flv"];

    if (extension && videoFormats.includes(extension)) {
      return extension;
    }

    return undefined;
  }

  /**
   * Estimate image file size
   */
  private async estimateImageSize(url: string): Promise<number | undefined> {
    try {
      const response = await fetch(url, { method: "HEAD" });
      const contentLength = response.headers.get("content-length");

      if (contentLength) {
        return parseInt(contentLength, 10);
      }
    } catch (error) {
      // Silently fail - size estimation is optional
    }

    return undefined;
  }

  /**
   * Extract additional metadata from media element
   */
  private async extractMediaElementMetadata(
    media: HTMLMediaElement,
  ): Promise<Partial<AudioMetadata>> {
    // This would use Web Audio API or similar to extract detailed metadata
    // For now, return empty object as this requires more complex implementation
    return {};
  }

  /**
   * Extract video codec information
   */
  private async extractVideoCodecInfo(
    video: HTMLVideoElement,
  ): Promise<Partial<VideoMetadata>> {
    // This would use MediaSource API or similar to extract codec info
    // For now, return empty object as this requires more complex implementation
    return {};
  }
}

// Export singleton instance
export const mediaMetadataExtractor = new MediaMetadataExtractor();
