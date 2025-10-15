/**
 * Media Processor
 * 
 * Handles media capture, processing, and analysis including:
 * - Enhanced audio waveform extraction with stereo support
 * - Multiple zoom levels for detailed inspection
 * - Peak detection and amplitude analysis
 * - Waveform thumbnail generation
 * - Audio segment selection capabilities
 */

// ============================================================================
// Type Definitions
// ============================================================================

export type WaveformZoomLevel = 'overview' | 'medium' | 'detailed';

export interface WaveformChannel {
  /** Waveform data points (normalized -1 to 1) */
  data: number[];
  /** RMS (Root Mean Square) amplitude */
  rms: number;
  /** Peak amplitude (absolute max value) */
  peakAmplitude: number;
  /** Detected peaks in the waveform */
  peaks: AudioPeak[];
}

export interface StereoWaveformData {
  /** Left channel waveform */
  left: WaveformChannel;
  /** Right channel waveform (null for mono audio) */
  right: WaveformChannel | null;
  /** Whether the audio is stereo */
  isStereo: boolean;
  /** Zoom level of this waveform data */
  zoomLevel: WaveformZoomLevel;
  /** Number of samples in original audio */
  totalSamples: number;
  /** Duration in seconds */
  duration: number;
  /** Sample rate of the audio */
  sampleRate: number;
}

export interface AudioPeak {
  /** Sample index of the peak */
  index: number;
  /** Time position in seconds */
  time: number;
  /** Amplitude value */
  amplitude: number;
  /** Whether this is a maximum (true) or minimum (false) */
  isMaximum: boolean;
}

export interface AmplitudeAnalysis {
  /** Root Mean Square amplitude */
  rms: number;
  /** Peak amplitude (absolute maximum) */
  peakAmplitude: number;
  /** Dynamic range in dB */
  dynamicRange: number;
  /** Average amplitude */
  averageAmplitude: number;
  /** Crest factor (peak to RMS ratio) */
  crestFactor: number;
}

export interface WaveformThumbnail {
  /** Thumbnail waveform data (100 samples) */
  data: number[];
  /** Width in pixels for rendering */
  width: number;
  /** Height in pixels for rendering */
  height: number;
  /** Data URL for thumbnail image (optional) */
  imageDataUrl?: string;
}

export interface AudioSegment {
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Duration in seconds */
  duration: number;
  /** Waveform data for this segment */
  waveform: StereoWaveformData;
  /** Amplitude analysis for this segment */
  analysis: AmplitudeAnalysis;
}

export interface AudioWaveformExtractionOptions {
  /** Zoom level for waveform extraction */
  zoomLevel?: WaveformZoomLevel;
  /** Whether to detect peaks */
  detectPeaks?: boolean;
  /** Minimum peak threshold (0-1) */
  peakThreshold?: number;
  /** Whether to generate thumbnail */
  generateThumbnail?: boolean;
  /** Thumbnail dimensions */
  thumbnailSize?: { width: number; height: number };
}

// ============================================================================
// Media Processor Class
// ============================================================================

export class MediaProcessor {
  private audioContext: AudioContext | null = null;

  /**
   * Get or create AudioContext instance
   */
  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  /**
   * Extract enhanced audio waveform with stereo support, zoom levels, and analysis
   */
  async extractAudioWaveform(
    audio: HTMLAudioElement,
    options: AudioWaveformExtractionOptions = {}
  ): Promise<StereoWaveformData> {
    const {
      zoomLevel = 'overview',
      detectPeaks = true,
      peakThreshold = 0.5,
    } = options;

    try {
      const audioContext = this.getAudioContext();
      
      // Fetch and decode audio data
      const response = await fetch(audio.src);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Determine sample count based on zoom level
      const sampleCount = this.getSampleCountForZoomLevel(zoomLevel);
      
      // Extract left channel
      const leftChannelData = audioBuffer.getChannelData(0);
      const leftWaveform = this.downsampleChannel(leftChannelData, sampleCount);
      const leftAnalysis = this.analyzeAmplitude(leftWaveform);
      const leftPeaks = detectPeaks 
        ? this.detectPeaks(leftWaveform, peakThreshold, audioBuffer.duration)
        : [];

      const leftChannel: WaveformChannel = {
        data: leftWaveform,
        rms: leftAnalysis.rms,
        peakAmplitude: leftAnalysis.peakAmplitude,
        peaks: leftPeaks,
      };

      // Extract right channel if stereo
      let rightChannel: WaveformChannel | null = null;
      const isStereo = audioBuffer.numberOfChannels > 1;

      if (isStereo) {
        const rightChannelData = audioBuffer.getChannelData(1);
        const rightWaveform = this.downsampleChannel(rightChannelData, sampleCount);
        const rightAnalysis = this.analyzeAmplitude(rightWaveform);
        const rightPeaks = detectPeaks
          ? this.detectPeaks(rightWaveform, peakThreshold, audioBuffer.duration)
          : [];

        rightChannel = {
          data: rightWaveform,
          rms: rightAnalysis.rms,
          peakAmplitude: rightAnalysis.peakAmplitude,
          peaks: rightPeaks,
        };
      }

      return {
        left: leftChannel,
        right: rightChannel,
        isStereo,
        zoomLevel,
        totalSamples: audioBuffer.length,
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
      };
    } catch (error) {
      console.error('[MediaProcessor] Failed to extract audio waveform:', error);
      throw new Error(`Audio waveform extraction failed: ${error.message}`);
    }
  }

  /**
   * Generate waveform thumbnail for listings
   */
  async generateWaveformThumbnail(
    audio: HTMLAudioElement,
    options: { width?: number; height?: number } = {}
  ): Promise<WaveformThumbnail> {
    const { width = 200, height = 60 } = options;

    try {
      const audioContext = this.getAudioContext();
      
      // Fetch and decode audio data
      const response = await fetch(audio.src);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Extract mono waveform with 100 samples for thumbnail
      const channelData = audioBuffer.getChannelData(0);
      const thumbnailData = this.downsampleChannel(channelData, 100);

      return {
        data: thumbnailData,
        width,
        height,
      };
    } catch (error) {
      console.error('[MediaProcessor] Failed to generate waveform thumbnail:', error);
      throw new Error(`Waveform thumbnail generation failed: ${error.message}`);
    }
  }

  /**
   * Extract audio segment with waveform and analysis
   */
  async extractAudioSegment(
    audio: HTMLAudioElement,
    startTime: number,
    endTime: number,
    options: AudioWaveformExtractionOptions = {}
  ): Promise<AudioSegment> {
    try {
      const audioContext = this.getAudioContext();
      
      // Fetch and decode audio data
      const response = await fetch(audio.src);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Validate time range
      const duration = Math.min(endTime, audioBuffer.duration) - Math.max(startTime, 0);
      if (duration <= 0) {
        throw new Error('Invalid time range for audio segment');
      }

      // Calculate sample indices
      const startSample = Math.floor(startTime * audioBuffer.sampleRate);
      const endSample = Math.floor(endTime * audioBuffer.sampleRate);
      
      // Extract segment from left channel
      const leftChannelData = audioBuffer.getChannelData(0);
      const leftSegmentData = leftChannelData.slice(startSample, endSample);
      
      // Downsample segment
      const sampleCount = this.getSampleCountForZoomLevel(options.zoomLevel || 'overview');
      const leftWaveform = this.downsampleChannel(leftSegmentData, sampleCount);
      const leftAnalysis = this.analyzeAmplitude(leftWaveform);
      const leftPeaks = options.detectPeaks
        ? this.detectPeaks(leftWaveform, options.peakThreshold || 0.5, duration)
        : [];

      const leftChannel: WaveformChannel = {
        data: leftWaveform,
        rms: leftAnalysis.rms,
        peakAmplitude: leftAnalysis.peakAmplitude,
        peaks: leftPeaks,
      };

      // Extract right channel if stereo
      let rightChannel: WaveformChannel | null = null;
      const isStereo = audioBuffer.numberOfChannels > 1;

      if (isStereo) {
        const rightChannelData = audioBuffer.getChannelData(1);
        const rightSegmentData = rightChannelData.slice(startSample, endSample);
        const rightWaveform = this.downsampleChannel(rightSegmentData, sampleCount);
        const rightAnalysis = this.analyzeAmplitude(rightWaveform);
        const rightPeaks = options.detectPeaks
          ? this.detectPeaks(rightWaveform, options.peakThreshold || 0.5, duration)
          : [];

        rightChannel = {
          data: rightWaveform,
          rms: rightAnalysis.rms,
          peakAmplitude: rightAnalysis.peakAmplitude,
          peaks: rightPeaks,
        };
      }

      const waveform: StereoWaveformData = {
        left: leftChannel,
        right: rightChannel,
        isStereo,
        zoomLevel: options.zoomLevel || 'overview',
        totalSamples: endSample - startSample,
        duration,
        sampleRate: audioBuffer.sampleRate,
      };

      // Calculate overall analysis (average of channels)
      const analysis = this.calculateSegmentAnalysis(leftAnalysis, isStereo ? this.analyzeAmplitude(rightChannel!.data) : null);

      return {
        startTime,
        endTime,
        duration,
        waveform,
        analysis,
      };
    } catch (error) {
      console.error('[MediaProcessor] Failed to extract audio segment:', error);
      throw new Error(`Audio segment extraction failed: ${error.message}`);
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Get sample count based on zoom level
   */
  private getSampleCountForZoomLevel(zoomLevel: WaveformZoomLevel): number {
    switch (zoomLevel) {
      case 'overview':
        return 500;
      case 'medium':
        return 2000;
      case 'detailed':
        return 5000;
      default:
        return 500;
    }
  }

  /**
   * Downsample audio channel data to target sample count
   */
  private downsampleChannel(channelData: Float32Array, targetSamples: number): number[] {
    const blockSize = Math.floor(channelData.length / targetSamples);
    const waveform: number[] = [];

    for (let i = 0; i < targetSamples; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, channelData.length);
      let sum = 0;

      // Calculate average absolute amplitude for this block
      for (let j = start; j < end; j++) {
        const sample = channelData[j];
        if (sample !== undefined) {
          sum += Math.abs(sample);
        }
      }

      waveform.push(sum / (end - start));
    }

    return waveform;
  }

  /**
   * Analyze amplitude characteristics of waveform
   */
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

    const rms = Math.sqrt(sumSquares / waveform.length);
    const averageAmplitude = sumAbsolute / waveform.length;
    const crestFactor = peakAmplitude / (rms || 0.0001); // Avoid division by zero
    
    // Calculate dynamic range in dB
    const minAmplitude = Math.min(...waveform.map(Math.abs).filter(v => v > 0)) || 0.0001;
    const dynamicRange = 20 * Math.log10(peakAmplitude / minAmplitude);

    return {
      rms,
      peakAmplitude,
      dynamicRange: isFinite(dynamicRange) ? dynamicRange : 0,
      averageAmplitude,
      crestFactor: isFinite(crestFactor) ? crestFactor : 0,
    };
  }

  /**
   * Detect peaks in waveform data
   */
  private detectPeaks(
    waveform: number[],
    threshold: number,
    duration: number
  ): AudioPeak[] {
    const peaks: AudioPeak[] = [];
    const windowSize = 5; // Look at 5 samples around each point

    for (let i = windowSize; i < waveform.length - windowSize; i++) {
      const current = waveform[i];
      if (current === undefined) continue;
      
      const absCurrent = Math.abs(current);

      // Check if this is above threshold
      if (absCurrent < threshold) continue;

      // Check if this is a local maximum
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

  /**
   * Calculate overall segment analysis from channel analyses
   */
  private calculateSegmentAnalysis(
    leftAnalysis: AmplitudeAnalysis,
    rightAnalysis: AmplitudeAnalysis | null
  ): AmplitudeAnalysis {
    if (!rightAnalysis) {
      return leftAnalysis;
    }

    // Average the analyses for stereo
    return {
      rms: (leftAnalysis.rms + rightAnalysis.rms) / 2,
      peakAmplitude: Math.max(leftAnalysis.peakAmplitude, rightAnalysis.peakAmplitude),
      dynamicRange: (leftAnalysis.dynamicRange + rightAnalysis.dynamicRange) / 2,
      averageAmplitude: (leftAnalysis.averageAmplitude + rightAnalysis.averageAmplitude) / 2,
      crestFactor: (leftAnalysis.crestFactor + rightAnalysis.crestFactor) / 2,
    };
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// Export singleton instance
export const mediaProcessor = new MediaProcessor();
