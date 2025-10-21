/**
 * Content Extractor
 * Extracts LLM-friendly content from CapturedContent
 * Handles PDFs with metadata, images, and other content types
 */

import { logger } from './monitoring.js';
import { ContentType, type CapturedContent } from './indexeddb-manager.js';
import { pdfProcessor } from './pdf-processor.js';

/**
 * Extract LLM-readable content from CapturedContent
 * For PDFs with metadata, returns the extracted text and structure
 * For other content types, returns the raw content
 */
export function extractLLMContent(content: CapturedContent): string {
  try {
    // Handle PDF with metadata
    if (content.type === ContentType.PDF && content.pdfMetadata) {
      logger.info('ContentExtractor', 'Extracting PDF metadata for LLM', {
        contentId: content.id,
        pageCount: content.pdfMetadata.pageCount,
        tokenCount: content.pdfMetadata.tokenCount,
      });

      // Generate LLM-friendly summary from metadata
      return pdfProcessor.generateLLMSummary(content.pdfMetadata);
    }

    // Handle regular content
    if (typeof content.content === 'string') {
      try {
        const parsed = JSON.parse(content.content);
        
        // Extract text from different content types
        if (parsed.text) {
          return typeof parsed.text === 'string' ? parsed.text : parsed.text.content || '';
        }
        
        if (parsed.formattedContent) {
          return parsed.formattedContent;
        }

        // For files without metadata, return filename and type info
        if (parsed.fileName) {
          return `File: ${parsed.fileName} (${parsed.fileType || 'unknown type'})`;
        }

        return JSON.stringify(parsed);
      } catch {
        // Not JSON, return as-is
        return content.content;
      }
    }

    // Handle ArrayBuffer (shouldn't happen for LLM processing)
    logger.warn('ContentExtractor', 'Attempted to extract LLM content from ArrayBuffer', {
      contentId: content.id,
      type: content.type,
    });
    return `[Binary content: ${content.type}]`;
  } catch (error) {
    logger.error('ContentExtractor', 'Failed to extract LLM content', error);
    return '[Content extraction failed]';
  }
}

/**
 * Get images from content for multimodal AI processing
 * Extracts images from PDFs or image content types
 */
export function extractImages(content: CapturedContent): Array<{ data: string; description: string }> {
  const images: Array<{ data: string; description: string }> = [];

  try {
    // Extract images from PDF metadata
    if (content.type === ContentType.PDF && content.pdfMetadata) {
      for (const img of content.pdfMetadata.images) {
        images.push({
          data: img.data,
          description: `Image from page ${img.pageNumber} (${img.width}x${img.height})`,
        });
      }
    }

    // Extract image content
    if (content.type === ContentType.IMAGE && typeof content.content === 'string') {
      try {
        const parsed = JSON.parse(content.content);
        if (parsed.data || parsed.src) {
          images.push({
            data: parsed.data || parsed.src,
            description: parsed.alt || parsed.title || 'Image',
          });
        }
      } catch {
        // Assume content is base64 image data
        images.push({
          data: content.content,
          description: 'Image',
        });
      }
    }
  } catch (error) {
    logger.error('ContentExtractor', 'Failed to extract images', error);
  }

  return images;
}

/**
 * Check if content has extractable images
 */
export function hasImages(content: CapturedContent): boolean {
  if (content.type === ContentType.PDF && content.pdfMetadata) {
    return content.pdfMetadata.images.length > 0;
  }
  
  if (content.type === ContentType.IMAGE) {
    return true;
  }

  return false;
}

/**
 * Get content preview for display purposes
 * Returns a short preview of the content
 */
export function getContentPreview(content: CapturedContent, maxLength: number = 200): string {
  const fullContent = extractLLMContent(content);
  
  if (fullContent.length <= maxLength) {
    return fullContent;
  }

  return fullContent.substring(0, maxLength) + '...';
}
