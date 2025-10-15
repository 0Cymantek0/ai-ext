/**
 * Media Processor Usage Examples
 * 
 * Demonstrates how to use the enhanced audio waveform extraction features
 */

import { mediaProcessor, type AudioWaveformExtractionOptions } from './media-processor';

/**
 * Example 1: Extract basic waveform with overview zoom level
 */
export async function extractBasicWaveform(audio: HTMLAudioElement) {
  console.log('[Example] Extracting basic waveform...');
  
  const waveform = await mediaProcessor.extractAudioWaveform(audio, {
    zoomLevel: 'overview',
    detectPeaks: false,
  });

  console.log('Waveform extracted:', {
    isStereo: waveform.isStereo,
    duration: waveform.duration,
    sampleRate: waveform.sampleRate,
    leftChannelSamples: waveform.left.data.length,
    rightChannelSamples: waveform.right?.data.length || 0,
  });

  return waveform;
}

/**
 * Example 2: Extract detailed waveform with peak detection
 */
export async function extractDetailedWaveformWithPeaks(audio: HTMLAudioElement) {
  console.log('[Example] Extracting detailed waveform with peaks...');
  
  const waveform = await mediaProcessor.extractAudioWaveform(audio, {
    zoomLevel: 'detailed',
    detectPeaks: true,
    peakThreshold: 0.6, // Only detect peaks above 60% amplitude
  });

  console.log('Detailed waveform with peaks:', {
    leftPeaks: waveform.left.peaks.length,
    rightPeaks: waveform.right?.peaks.length || 0,
    leftRMS: waveform.left.rms,
    leftPeakAmplitude: waveform.left.peakAmplitude,
  });

  // Log first few peaks
  console.log('First 5 peaks:', waveform.left.peaks.slice(0, 5));

  return waveform;
}

/**
 * Example 3: Generate waveform thumbnail for UI listing
 */
export async function generateThumbnailForListing(audio: HTMLAudioElement) {
  console.log('[Example] Generating waveform thumbnail...');
  
  const thumbnail = await mediaProcessor.generateWaveformThumbnail(audio, {
    width: 200,
    height: 60,
  });

  console.log('Thumbnail generated:', {
    dataPoints: thumbnail.data.length,
    dimensions: `${thumbnail.width}x${thumbnail.height}`,
  });

  return thumbnail;
}

/**
 * Example 4: Extract specific audio segment
 */
export async function extractAudioSegment(audio: HTMLAudioElement) {
  console.log('[Example] Extracting audio segment...');
  
  // Extract segment from 10s to 20s
  const segment = await mediaProcessor.extractAudioSegment(
    audio,
    10, // start time
    20, // end time
    {
      zoomLevel: 'medium',
      detectPeaks: true,
      peakThreshold: 0.5,
    }
  );

  console.log('Segment extracted:', {
    duration: segment.duration,
    startTime: segment.startTime,
    endTime: segment.endTime,
    analysis: segment.analysis,
  });

  return segment;
}

/**
 * Example 5: Compare stereo channels
 */
export async function compareStereoChannels(audio: HTMLAudioElement) {
  console.log('[Example] Comparing stereo channels...');
  
  const waveform = await mediaProcessor.extractAudioWaveform(audio, {
    zoomLevel: 'overview',
    detectPeaks: true,
  });

  if (!waveform.isStereo) {
    console.log('Audio is mono, no comparison needed');
    return;
  }

  console.log('Stereo channel comparison:', {
    left: {
      rms: waveform.left.rms,
      peakAmplitude: waveform.left.peakAmplitude,
      peaks: waveform.left.peaks.length,
    },
    right: {
      rms: waveform.right!.rms,
      peakAmplitude: waveform.right!.peakAmplitude,
      peaks: waveform.right!.peaks.length,
    },
  });

  return waveform;
}

/**
 * Example 6: Analyze audio quality
 */
export async function analyzeAudioQuality(audio: HTMLAudioElement) {
  console.log('[Example] Analyzing audio quality...');
  
  const waveform = await mediaProcessor.extractAudioWaveform(audio, {
    zoomLevel: 'medium',
    detectPeaks: true,
  });

  // Calculate quality metrics
  const leftAnalysis = {
    rms: waveform.left.rms,
    peakAmplitude: waveform.left.peakAmplitude,
    dynamicRange: 20 * Math.log10(waveform.left.peakAmplitude / waveform.left.rms),
  };

  console.log('Audio quality analysis:', {
    sampleRate: waveform.sampleRate,
    duration: waveform.duration,
    isStereo: waveform.isStereo,
    leftChannel: leftAnalysis,
    peakCount: waveform.left.peaks.length,
  });

  // Quality assessment
  if (leftAnalysis.dynamicRange > 20) {
    console.log('✓ Good dynamic range');
  } else {
    console.log('⚠ Limited dynamic range (possibly compressed)');
  }

  if (waveform.left.peakAmplitude > 0.95) {
    console.log('⚠ Possible clipping detected');
  } else {
    console.log('✓ No clipping detected');
  }

  return leftAnalysis;
}

/**
 * Example 7: Extract multiple segments for analysis
 */
export async function extractMultipleSegments(audio: HTMLAudioElement) {
  console.log('[Example] Extracting multiple segments...');
  
  const segments: Awaited<ReturnType<typeof mediaProcessor.extractAudioSegment>>[] = [];
  const segmentDuration = 5; // 5 seconds per segment
  
  // Get total duration first
  const fullWaveform = await mediaProcessor.extractAudioWaveform(audio, {
    zoomLevel: 'overview',
  });

  const totalDuration = fullWaveform.duration;
  const segmentCount = Math.floor(totalDuration / segmentDuration);

  console.log(`Extracting ${segmentCount} segments of ${segmentDuration}s each...`);

  for (let i = 0; i < segmentCount; i++) {
    const startTime = i * segmentDuration;
    const endTime = Math.min((i + 1) * segmentDuration, totalDuration);

    const segment = await mediaProcessor.extractAudioSegment(
      audio,
      startTime,
      endTime,
      { zoomLevel: 'overview' }
    );

    segments.push(segment);
    
    console.log(`Segment ${i + 1}:`, {
      time: `${startTime}s - ${endTime}s`,
      rms: segment.analysis.rms,
      peakAmplitude: segment.analysis.peakAmplitude,
    });
  }

  return segments;
}

/**
 * Example 8: Real-time waveform visualization data
 */
export async function prepareVisualizationData(audio: HTMLAudioElement) {
  console.log('[Example] Preparing visualization data...');
  
  // Extract waveform at different zoom levels
  const overview = await mediaProcessor.extractAudioWaveform(audio, {
    zoomLevel: 'overview',
  });

  const medium = await mediaProcessor.extractAudioWaveform(audio, {
    zoomLevel: 'medium',
  });

  const detailed = await mediaProcessor.extractAudioWaveform(audio, {
    zoomLevel: 'detailed',
    detectPeaks: true,
  });

  // Prepare data for visualization component
  const visualizationData = {
    overview: {
      samples: overview.left.data,
      duration: overview.duration,
    },
    medium: {
      samples: medium.left.data,
      duration: medium.duration,
    },
    detailed: {
      samples: detailed.left.data,
      peaks: detailed.left.peaks,
      duration: detailed.duration,
    },
  };

  console.log('Visualization data prepared:', {
    overviewSamples: visualizationData.overview.samples.length,
    mediumSamples: visualizationData.medium.samples.length,
    detailedSamples: visualizationData.detailed.samples.length,
    peakCount: visualizationData.detailed.peaks.length,
  });

  return visualizationData;
}

/**
 * Example usage in content capture flow
 */
export async function captureAudioWithWaveform(audio: HTMLAudioElement) {
  console.log('[Example] Capturing audio with waveform...');
  
  try {
    // Extract overview waveform for storage
    const waveform = await mediaProcessor.extractAudioWaveform(audio, {
      zoomLevel: 'overview',
      detectPeaks: true,
      peakThreshold: 0.5,
    });

    // Generate thumbnail for listing
    const thumbnail = await mediaProcessor.generateWaveformThumbnail(audio);

    // Prepare capture result
    const captureResult = {
      src: audio.src,
      duration: waveform.duration,
      sampleRate: waveform.sampleRate,
      isStereo: waveform.isStereo,
      waveform: {
        left: waveform.left.data,
        right: waveform.right?.data || null,
        peaks: waveform.left.peaks,
      },
      thumbnail: thumbnail.data,
      analysis: {
        rms: waveform.left.rms,
        peakAmplitude: waveform.left.peakAmplitude,
      },
      capturedAt: Date.now(),
    };

    console.log('Audio captured successfully:', {
      duration: captureResult.duration,
      waveformSamples: captureResult.waveform.left.length,
      thumbnailSamples: captureResult.thumbnail.length,
      peaks: captureResult.waveform.peaks.length,
    });

    return captureResult;
  } catch (error) {
    console.error('[Example] Failed to capture audio:', error);
    throw error;
  }
}
