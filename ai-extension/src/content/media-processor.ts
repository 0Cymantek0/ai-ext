/**
 * Media Processor
 *
 * Combines image/video compression utilities with enhanced audio waveform
 * extraction, analysis, and thumbnail/segment generation.
 * Requirements: 2.1, 3.6, 3.7
 */

// ============================================================================
// Image/Video Processing Types
// ============================================================================

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

// ============================================================================
// Audio Waveform Types
// ============================================================================

export type WaveformZoomLevel = "overview" | "medium" | "detailed";

export interface AudioPeak {
  index: number;
  time: number;
  amplitude: number;
  isMaximum: boolean;
}

export interface WaveformChannel {
  data: number[];
  rms: number;
  peakAmplitude: number;
  peaks: AudioPeak[];
}

export interface StereoWaveformData {
  left: WaveformChannel;
  right: WaveformChannel | null;
  isStereo: boolean;
  zoomLevel: WaveformZoomLevel;
  totalSamples: number;
  duration: number;
  sampleRate: number;
}

export interface AmplitudeAnalysis {
  rms: number;
  peakAmplitude: number;
  dynamicRange: number;
  averageAmplitude: number;
  crestFactor: number;
}

export interface WaveformThumbnail {
  data: number[];
  width: number;
  height: number;
  imageDataUrl?: string;
}

export interface AudioSegment {
  startTime: number;
  endTime: number;
  duration: number;
  waveform: StereoWaveformData;
  analysis: AmplitudeAnalysis;
}

export interface AudioWaveformExtractionOptions {
  zoomLevel?: WaveformZoomLevel;
  detectPeaks?: boolean;
  peakThreshold?: number;
  generateThumbnail?: boolean;
  thumbnailSize?: { width: number; height: number };
}

// ============================================================================
// Media Processor Class (merged)
// ============================================================================

export class MediaProcessor {
  private audioContext: AudioContext | null = null;

  // -------- Image/Video Processing --------

  async compressImage(
    img: HTMLImageElement,
    options: CompressionOptions = {},
  ): Promise<ProcessingResult> {
    const {
      maxWidth = 1920,
      maxHeight = 1080,
      quality = 0.85,
      format = "jpeg",
      maintainAspectRatio = true,
    } = options;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get canvas context");
    }

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

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    const mimeType = this.getMimeType(format);
    const blob = await this.canvasToBlob(canvas, mimeType, quality);
    const dataUrl = await this.blobToDataUrl(blob);
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

  async compressImageFromData(
    dataUrl: string,
    options: CompressionOptions = {},
  ): Promise<ProcessingResult> {
    const img = await this.loadImageFromDataUrl(dataUrl);
    return this.compressImage(img, options);
  }

  async generateImageThumbnail(
    img: HTMLImageElement,
    size: number = 200,
  ): Promise<ProcessingResult> {
    return this.compressImage(img, {
      maxWidth: size,
      maxHeight: size,
      quality: 0.8,
      format: "jpeg",
      maintainAspectRatio: true,
    });
  }

  async generateVideoThumbnail(
    video: HTMLVideoElement,
    timeInSeconds: number = 0,
    options: CompressionOptions = {},
  ): Promise<ProcessingResult> {
    const {
      maxWidth = 640,
      maxHeight = 360,
      quality = 0.85,
      format = "jpeg",
    } = options;

    video.currentTime = timeInSeconds;
    await new Promise<void>((resolve) => {
      video.addEventListener("seeked", () => resolve(), { once: true });
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get canvas context");
    }

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
    ctx.drawImage(video, 0, 0, width, height);

    const mimeType = this.getMimeType(format);
    const blob = await this.canvasToBlob(canvas, mimeType, quality);
    const dataUrl = await this.blobToDataUrl(blob);

    return {
      originalSize: 0,
      compressedSize: blob.size,
      compressionRatio: 1,
      dataUrl,
      blob,
      format,
    };
  }

  async optimizeForStorage(img: HTMLImageElement): Promise<ProcessingResult> {
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const pixels = width * height;

    let maxWidth = 1920;
    let maxHeight = 1080;
    let quality = 0.85;

    if (pixels > 4000000) {
      maxWidth = 1600;
      maxHeight = 900;
      quality = 0.8;
    }

    const format = this.isWebPSupported() ? "webp" : "jpeg";
    return this.compressImage(img, {
      maxWidth,
      maxHeight,
      quality,
      format,
      maintainAspectRatio: true,
    });
  }

  private isWebPSupported(): boolean {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
  }

  async batchProcessImages(
    images: HTMLImageElement[],
    options: CompressionOptions = {},
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

  async convertImageFormat(
    img: HTMLImageElement,
    targetFormat: "jpeg" | "png" | "webp",
  ): Promise<ProcessingResult> {
    return this.compressImage(img, {
      format: targetFormat,
      quality: 0.95,
      maintainAspectRatio: true,
    });
  }

  // -------- Audio Waveform Processing --------

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  async extractAudioWaveform(
    audio: HTMLAudioElement,
    options: AudioWaveformExtractionOptions = {},
  ): Promise<StereoWaveformData> {
    const {
      zoomLevel = "overview",
      detectPeaks = true,
      peakThreshold = 0.5,
    } = options;

    const audioContext = this.getAudioContext();
    const response = await fetch(audio.src);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const sampleCount = this.getSampleCountForZoomLevel(zoomLevel);

    const leftChannelData = audioBuffer.getChannelData(0);
    const leftWaveform = this.downsampleChannel(leftChannelData, sampleCount);
    const leftAnalysis = this.analyzeAmplitude(leftWaveform);
    const leftPeaks = detectPeaks
      ? this.detectPeaks(leftWaveform, peakThreshold, audioBuffer.duration)
      : [];
    const left: WaveformChannel = {
      data: leftWaveform,
      rms: leftAnalysis.rms,
      peakAmplitude: leftAnalysis.peakAmplitude,
      peaks: leftPeaks,
    };

    let right: WaveformChannel | null = null;
    const isStereo = audioBuffer.numberOfChannels > 1;
    if (isStereo) {
      const rightChannelData = audioBuffer.getChannelData(1);
      const rightWaveform = this.downsampleChannel(
        rightChannelData,
        sampleCount,
      );
      const rightAnalysis = this.analyzeAmplitude(rightWaveform);
      const rightPeaks = detectPeaks
        ? this.detectPeaks(rightWaveform, peakThreshold, audioBuffer.duration)
        : [];
      right = {
        data: rightWaveform,
        rms: rightAnalysis.rms,
        peakAmplitude: rightAnalysis.peakAmplitude,
        peaks: rightPeaks,
      };
    }

    return {
      left,
      right,
      isStereo,
      zoomLevel,
      totalSamples: audioBuffer.length,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
    };
  }

  async generateWaveformThumbnail(
    audio: HTMLAudioElement,
    options: { width?: number; height?: number } = {},
  ): Promise<WaveformThumbnail> {
    const { width = 200, height = 60 } = options;

    const audioContext = this.getAudioContext();
    const response = await fetch(audio.src);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const channelData = audioBuffer.getChannelData(0);
    const thumbnailData = this.downsampleChannel(channelData, 100);
    return { data: thumbnailData, width, height };
  }

  async extractAudioSegment(
    audio: HTMLAudioElement,
    startTime: number,
    endTime: number,
    options: AudioWaveformExtractionOptions = {},
  ): Promise<AudioSegment> {
    const audioContext = this.getAudioContext();
    const response = await fetch(audio.src);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const duration =
      Math.min(endTime, audioBuffer.duration) - Math.max(startTime, 0);
    if (duration <= 0) {
      throw new Error("Invalid time range for audio segment");
    }

    const startSample = Math.floor(startTime * audioBuffer.sampleRate);
    const endSample = Math.floor(endTime * audioBuffer.sampleRate);

    const leftChannelData = audioBuffer.getChannelData(0);
    const leftSegmentData = leftChannelData.slice(startSample, endSample);
    const sampleCount = this.getSampleCountForZoomLevel(
      options.zoomLevel || "overview",
    );
    const leftWaveform = this.downsampleChannel(leftSegmentData, sampleCount);
    const leftAnalysis = this.analyzeAmplitude(leftWaveform);
    const leftPeaks = options.detectPeaks
      ? this.detectPeaks(leftWaveform, options.peakThreshold || 0.5, duration)
      : [];
    const left: WaveformChannel = {
      data: leftWaveform,
      rms: leftAnalysis.rms,
      peakAmplitude: leftAnalysis.peakAmplitude,
      peaks: leftPeaks,
    };

    let right: WaveformChannel | null = null;
    const isStereo = audioBuffer.numberOfChannels > 1;
    if (isStereo) {
      const rightChannelData = audioBuffer.getChannelData(1);
      const rightSegmentData = rightChannelData.slice(startSample, endSample);
      const rightWaveform = this.downsampleChannel(
        rightSegmentData,
        sampleCount,
      );
      const rightAnalysis = this.analyzeAmplitude(rightWaveform);
      const rightPeaks = options.detectPeaks
        ? this.detectPeaks(
            rightWaveform,
            options.peakThreshold || 0.5,
            duration,
          )
        : [];
      right = {
        data: rightWaveform,
        rms: rightAnalysis.rms,
        peakAmplitude: rightAnalysis.peakAmplitude,
        peaks: rightPeaks,
      };
    }

    const waveform: StereoWaveformData = {
      left,
      right,
      isStereo,
      zoomLevel: options.zoomLevel || "overview",
      totalSamples: endSample - startSample,
      duration,
      sampleRate: audioBuffer.sampleRate,
    };

    const analysis = this.calculateSegmentAnalysis(
      leftAnalysis,
      isStereo ? this.analyzeAmplitude(right!.data) : null,
    );

    return { startTime, endTime, duration, waveform, analysis };
  }

  // -------- Private Helpers (Audio) --------

  private getSampleCountForZoomLevel(zoomLevel: WaveformZoomLevel): number {
    switch (zoomLevel) {
      case "overview":
        return 500;
      case "medium":
        return 2000;
      case "detailed":
        return 5000;
      default:
        return 500;
    }
  }

  private downsampleChannel(
    channelData: Float32Array,
    targetSamples: number,
  ): number[] {
    const blockSize = Math.floor(channelData.length / targetSamples);
    const waveform: number[] = [];
    for (let i = 0; i < targetSamples; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, channelData.length);
      let sum = 0;
      for (let j = start; j < end; j++) {
        const sample = channelData[j];
        if (sample !== undefined) {
          sum += Math.abs(sample);
        }
      }
      waveform.push(sum / (end - start || 1));
    }
    return waveform;
  }

  private analyzeAmplitude(waveform: number[]): AmplitudeAnalysis {
    let sumSquares = 0;
    let sumAbsolute = 0;
    let peakAmplitude = 0;
    for (const sample of waveform) {
      const absSample = Math.abs(sample);
      sumSquares += sample * sample;
      sumAbsolute += absSample;
      peakAmplitude = Math.max(peakAmplitude, absSample);
    }
    const rms = Math.sqrt(sumSquares / (waveform.length || 1));
    const averageAmplitude = sumAbsolute / (waveform.length || 1);
    const crestFactor = peakAmplitude / (rms || 0.0001);
    const nonZero = waveform.map((v) => Math.abs(v)).filter((v) => v > 0);
    const minAmplitude = nonZero.length ? Math.min(...nonZero) : 0.0001;
    const dynamicRange = 20 * Math.log10(peakAmplitude / minAmplitude);
    return {
      rms,
      peakAmplitude,
      dynamicRange: isFinite(dynamicRange) ? dynamicRange : 0,
      averageAmplitude,
      crestFactor: isFinite(crestFactor) ? crestFactor : 0,
    };
  }

  private detectPeaks(
    waveform: number[],
    threshold: number,
    duration: number,
  ): AudioPeak[] {
    const peaks: AudioPeak[] = [];
    const windowSize = 5;
    for (let i = windowSize; i < waveform.length - windowSize; i++) {
      const current = waveform[i];
      if (current === undefined) continue;
      const absCurrent = Math.abs(current);
      if (absCurrent < threshold) continue;
      let isLocalMax = true;
      let isLocalMin = true;
      for (let j = i - windowSize; j <= i + windowSize; j++) {
        if (j === i) continue;
        const sample = waveform[j];
        if (sample === undefined) continue;
        if (current < sample) isLocalMax = false;
        if (current > sample) isLocalMin = false;
      }
      if (isLocalMax || isLocalMin) {
        peaks.push({
          index: i,
          time: (i / waveform.length) * duration,
          amplitude: current,
          isMaximum: isLocalMax,
        });
      }
    }
    return peaks;
  }

  private calculateSegmentAnalysis(
    leftAnalysis: AmplitudeAnalysis,
    rightAnalysis: AmplitudeAnalysis | null,
  ): AmplitudeAnalysis {
    if (!rightAnalysis) {
      return leftAnalysis;
    }
    return {
      rms: (leftAnalysis.rms + rightAnalysis.rms) / 2,
      peakAmplitude: Math.max(
        leftAnalysis.peakAmplitude,
        rightAnalysis.peakAmplitude,
      ),
      dynamicRange:
        (leftAnalysis.dynamicRange + rightAnalysis.dynamicRange) / 2,
      averageAmplitude:
        (leftAnalysis.averageAmplitude + rightAnalysis.averageAmplitude) / 2,
      crestFactor: (leftAnalysis.crestFactor + rightAnalysis.crestFactor) / 2,
    };
  }

  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  // -------- Private Helpers (Canvas/Image) --------

  private canvasToBlob(
    canvas: HTMLCanvasElement,
    mimeType: string,
    quality: number,
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
        quality,
      );
    });
  }

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

  private loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

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

  private async estimateImageSize(url: string): Promise<number> {
    try {
      const response = await fetch(url, { method: "HEAD" });
      const contentLength = response.headers.get("content-length");
      if (contentLength) {
        return parseInt(contentLength, 10);
      }
    } catch (error) {
      // ignore
    }
    return 0;
  }
}

// Export singleton instance
export const mediaProcessor = new MediaProcessor();
