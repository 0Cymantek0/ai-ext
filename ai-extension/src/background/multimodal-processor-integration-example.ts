/**
 * Multimodal Processor Integration Example
 * 
 * This file demonstrates how to integrate and use the MultimodalProcessor
 * in the AI Pocket extension for image analysis and alt-text generation.
 */

import { MultimodalProcessor } from './multimodal-processor';
import { aiManager } from './ai-manager';
import { CloudAIManager } from './cloud-ai-manager';

/**
 * Example 1: Generate alt-text for a captured image
 */
async function generateAltTextForCapturedImage(imageBlob: Blob): Promise<string> {
  const processor = new MultimodalProcessor(aiManager, new CloudAIManager());

  try {
    // Generate accessibility-compliant alt-text
    const altText = await processor.generateAltText(imageBlob, {
      maxLength: 125,
      purpose: 'informative',
      context: 'User-captured web content'
    });

    console.log('Generated alt-text:', altText);
    return altText;
  } catch (error) {
    console.error('Failed to generate alt-text:', error);
    return 'Image'; // Fallback
  }
}

/**
 * Example 2: Comprehensive image analysis
 */
async function analyzeImageComprehensively(imageUrl: string) {
  const processor = new MultimodalProcessor(aiManager, new CloudAIManager());

  try {
    // Perform full image analysis
    const analysis = await processor.analyzeImage(imageUrl, {
      preferLocal: true,
      includeObjects: true,
      includeColors: true,
      extractText: true,
      detailedDescription: true
    });

    console.log('Image Analysis Results:');
    console.log('Description:', analysis.description);
    console.log('Alt-text:', analysis.altText);
    console.log('Objects:', analysis.objects);
    console.log('Colors:', analysis.colors);
    console.log('Extracted text:', analysis.text);
    console.log('Processing time:', analysis.processingTime, 'ms');
    console.log('Source:', analysis.source);

    return analysis;
  } catch (error) {
    console.error('Failed to analyze image:', error);
    throw error;
  }
}

/**
 * Example 3: Extract text from screenshot
 */
async function extractTextFromScreenshot(screenshotBlob: Blob): Promise<string> {
  const processor = new MultimodalProcessor(aiManager, new CloudAIManager());

  try {
    // Extract text using OCR
    const extractedText = await processor.extractTextFromImage(screenshotBlob);

    console.log('Extracted text:', extractedText);
    return extractedText;
  } catch (error) {
    console.error('Failed to extract text:', error);
    return '';
  }
}

/**
 * Example 4: Get image metadata
 */
async function getImageInfo(imageBlob: Blob) {
  const processor = new MultimodalProcessor(aiManager, new CloudAIManager());

  try {
    const metadata = await processor.getImageMetadata(imageBlob);

    console.log('Image Metadata:');
    console.log('Dimensions:', `${metadata.width}x${metadata.height}`);
    console.log('Format:', metadata.format);
    console.log('Size:', `${(metadata.size / 1024).toFixed(2)} KB`);

    return metadata;
  } catch (error) {
    console.error('Failed to get image metadata:', error);
    throw error;
  }
}

/**
 * Example 5: Process image with cancellation support
 */
async function processImageWithCancellation(imageBlob: Blob) {
  const processor = new MultimodalProcessor(aiManager, new CloudAIManager());
  const abortController = new AbortController();

  // Set timeout for cancellation
  setTimeout(() => {
    console.log('Cancelling image processing...');
    abortController.abort();
  }, 5000); // Cancel after 5 seconds

  try {
    const altText = await processor.generateAltText(imageBlob, {
      signal: abortController.signal,
      maxLength: 100
    });

    console.log('Alt-text generated:', altText);
    return altText;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('Image processing was cancelled');
    } else {
      console.error('Failed to process image:', error);
    }
    throw error;
  }
}

/**
 * Example 6: Generate purpose-specific alt-text
 */
async function generatePurposeSpecificAltText(imageBlob: Blob, purpose: 'decorative' | 'informative' | 'functional') {
  const processor = new MultimodalProcessor(aiManager, new CloudAIManager());

  try {
    const altText = await processor.generateAltText(imageBlob, {
      purpose,
      maxLength: 125
    });

    console.log(`Alt-text (${purpose}):`, altText);
    return altText;
  } catch (error) {
    console.error('Failed to generate alt-text:', error);
    throw error;
  }
}

/**
 * Example 7: Integration with content capture system
 */
async function processImageFromCapture(capturedContent: {
  type: 'image';
  content: Blob;
  metadata: { url: string; title?: string };
}) {
  const processor = new MultimodalProcessor(aiManager, new CloudAIManager());

  try {
    // Get metadata first
    const imageMetadata = await processor.getImageMetadata(capturedContent.content);

    // Generate alt-text with context
    const altText = await processor.generateAltText(capturedContent.content, {
      context: `Image from ${capturedContent.metadata.url}${
        capturedContent.metadata.title ? ` - ${capturedContent.metadata.title}` : ''
      }`,
      purpose: 'informative',
      maxLength: 125
    });

    // Perform full analysis
    const analysis = await processor.analyzeImage(capturedContent.content, {
      includeObjects: true,
      includeColors: true,
      extractText: true
    });

    return {
      altText,
      analysis,
      metadata: imageMetadata
    };
  } catch (error) {
    console.error('Failed to process captured image:', error);
    throw error;
  }
}

/**
 * Example 8: Batch processing multiple images
 */
async function batchProcessImages(images: Blob[]): Promise<string[]> {
  const processor = new MultimodalProcessor(aiManager, new CloudAIManager());
  const altTexts: string[] = [];

  for (const image of images) {
    try {
      const altText = await processor.generateAltText(image, {
        maxLength: 125,
        purpose: 'informative'
      });
      altTexts.push(altText);
    } catch (error) {
      console.error('Failed to process image in batch:', error);
      altTexts.push('Image'); // Fallback
    }
  }

  return altTexts;
}

// Export examples for use in other modules
export {
  generateAltTextForCapturedImage,
  analyzeImageComprehensively,
  extractTextFromScreenshot,
  getImageInfo,
  processImageWithCancellation,
  generatePurposeSpecificAltText,
  processImageFromCapture,
  batchProcessImages
};
