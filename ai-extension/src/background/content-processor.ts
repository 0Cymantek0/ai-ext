/**
 * Content Processor
 * Validates, sanitizes, and prepares content for storage
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { logger } from "./monitoring.js";
import {
  indexedDBManager,
  ContentType,
  ProcessingStatus,
  type CapturedContent,
  type ContentMetadata,
} from "./indexeddb-manager.js";

export interface ProcessContentOptions {
  pocketId: string;
  mode: "full-page" | "selection" | "element" | "note" | "file";
  content: any;
  metadata: any;
  sourceUrl: string;
  sanitize?: boolean;
}

export interface ProcessedContent {
  contentId: string;
  type: ContentType;
  preview: string;
  status: ProcessingStatus;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class ContentProcessor {
  /**
   * Process and store captured content
   */
  async processContent(options: ProcessContentOptions): Promise<ProcessedContent> {
    const { pocketId, mode, content, metadata, sourceUrl, sanitize = true } = options;

    logger.info("ContentProcessor", "Processing content", {
      pocketId,
      mode,
      sourceUrl,
    });

    try {
      // Validate content
      const validation = this.validateContent(content, mode);
      if (!validation.valid) {
        throw new Error(`Content validation failed: ${validation.errors.join(", ")}`);
      }

      // Log warnings if any
      if (validation.warnings.length > 0) {
        logger.warn("ContentProcessor", "Validation warnings", {
          warnings: validation.warnings,
        });
      }

      // Detect content type
      const contentType = this.detectContentType(content, mode);

      // Prepare content for storage
      const preparedContent = this.prepareContent(content, contentType, mode);

      // Create content metadata
      const contentMetadata = this.createContentMetadata(metadata, content, mode);

      // Save to IndexedDB
      await indexedDBManager.init();
      const contentId = await indexedDBManager.saveContent({
        pocketId,
        type: contentType,
        content: preparedContent,
        metadata: contentMetadata,
        sourceUrl,
        processingStatus: ProcessingStatus.COMPLETED,
      });

      // Generate preview
      const preview = this.generatePreview(content, contentType, mode);

      logger.info("ContentProcessor", "Content processed successfully", {
        contentId,
        type: contentType,
        previewLength: preview.length,
      });

      return {
        contentId,
        type: contentType,
        preview,
        status: ProcessingStatus.COMPLETED,
      };
    } catch (error) {
      logger.error("ContentProcessor", "Content processing failed", error);
      throw error;
    }
  }

  /**
   * Validate content before processing
   */
  private validateContent(content: any, mode: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if content exists
    if (!content) {
      errors.push("Content is null or undefined");
      return { valid: false, errors, warnings };
    }

    // Mode-specific validation
    switch (mode) {
      case "full-page":
        if (!content.text || !content.text.content) {
          errors.push("Full page capture missing text content");
        }
        if (content.text && content.text.content.length === 0) {
          warnings.push("Full page capture has empty text content");
        }
        if (content.text && content.text.wordCount < 10) {
          warnings.push("Full page capture has very little text content");
        }
        break;

      case "selection":
        if (!content.text || !content.text.content) {
          errors.push("Selection capture missing text content");
        }
        if (content.text && content.text.content.length === 0) {
          errors.push("Selection capture has empty text content");
        }
        break;

      case "element":
        if (!content.elements || !Array.isArray(content.elements)) {
          errors.push("Element capture missing elements array");
        }
        if (content.elements && content.elements.length === 0) {
          errors.push("Element capture has no elements");
        }
        break;

      case "note":
        if (!content.text && content.text !== "") {
          errors.push("Note capture missing text content");
        }
        break;

      case "file":
        if (!content.fileData) {
          errors.push("File upload missing file data");
        }
        if (!content.fileName) {
          errors.push("File upload missing file name");
        }
        if (content.fileSize && content.fileSize > 50 * 1024 * 1024) {
          warnings.push("File size exceeds 50MB, may cause performance issues");
        }
        break;

      default:
        errors.push(`Unknown capture mode: ${mode}`);
    }

    // Check for sanitization info if present
    if (content.sanitization) {
      if (content.sanitization.detectedPII > 0) {
        warnings.push(
          `Detected ${content.sanitization.detectedPII} PII instances (${content.sanitization.piiTypes?.join(", ")})`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Detect content type from captured content
   */
  private detectContentType(content: any, mode: string): ContentType {
    // Check for explicit media types
    if (content.type) {
      switch (content.type) {
        case "image":
          return ContentType.IMAGE;
        case "video":
          return ContentType.VIDEO;
        case "audio":
          return ContentType.AUDIO;
        case "note":
          return ContentType.NOTE;
      }
    }

    // Detect based on mode
    switch (mode) {
      case "full-page":
        return ContentType.PAGE;

      case "selection":
        return ContentType.TEXT;

      case "element":
        // Check if elements contain media
        if (content.elements && content.elements.length > 0) {
          const firstElement = content.elements[0];
          if (firstElement.tagName === "IMG") return ContentType.IMAGE;
          if (firstElement.tagName === "VIDEO") return ContentType.VIDEO;
          if (firstElement.tagName === "AUDIO") return ContentType.AUDIO;
        }
        return ContentType.ELEMENT;

      case "note":
        return ContentType.NOTE;

      case "file":
        // Detect file type based on extension
        const fileExtension = content.fileExtension?.toLowerCase();
        if (fileExtension === "pdf") return ContentType.PDF;
        if (["doc", "docx"].includes(fileExtension)) return ContentType.DOCUMENT;
        if (["xls", "xlsx"].includes(fileExtension)) return ContentType.SPREADSHEET;
        return ContentType.FILE;

      default:
        return ContentType.TEXT;
    }
  }

  /**
   * Prepare content for storage
   * Requirements: 2.1, 2.2, 2.5
   */
  private prepareContent(content: any, type: ContentType, mode: string): string {
    switch (type) {
      case ContentType.PAGE:
      case ContentType.TEXT:
        return JSON.stringify({
          text: content.text?.content || "",
          formattedContent: content.text?.formattedContent || "",
          wordCount: content.text?.wordCount || 0,
          characterCount: content.text?.characterCount || 0,
          headings: content.text?.headings || [],
          links: content.text?.links || [],
          images: content.text?.images || [],
          lists: content.text?.lists || content.lists || [],
          tables: content.text?.tables || content.tables || [],
          context: content.context,
          sanitization: content.sanitization,
          readability: content.readability,
          structuredData: content.structuredData,
          screenshot: content.screenshot,
        });

      case ContentType.ELEMENT:
        return JSON.stringify({
          elements: content.elements || [],
          count: content.count || 0,
        });

      case ContentType.NOTE:
        return content.text || "";

      case ContentType.PDF:
      case ContentType.DOCUMENT:
      case ContentType.SPREADSHEET:
      case ContentType.FILE:
        return JSON.stringify({
          fileData: content.fileData,
          fileName: content.fileName,
          fileType: content.fileType,
          fileSize: content.fileSize,
          fileExtension: content.fileExtension,
        });

      case ContentType.IMAGE:
      case ContentType.VIDEO:
      case ContentType.AUDIO:
        return JSON.stringify(content);

      default:
        return JSON.stringify(content);
    }
  }

  /**
   * Create content metadata
   */
  private createContentMetadata(
    pageMetadata: any,
    content: any,
    mode: string
  ): ContentMetadata {
    const metadata: ContentMetadata = {
      title: pageMetadata.title,
      author: pageMetadata.author,
      publishedDate: pageMetadata.publishedDate,
      domain: pageMetadata.domain,
    };

    // Add tags if present
    if (pageMetadata.tags && Array.isArray(pageMetadata.tags)) {
      metadata.tags = pageMetadata.tags;
    }

    // Add category if present
    if (pageMetadata.category) {
      metadata.category = pageMetadata.category;
    }

    // Add updatedAt if present (for note updates)
    if (pageMetadata.updatedAt) {
      metadata.updatedAt = pageMetadata.updatedAt;
    }

    // Add mode-specific metadata
    if (mode === "selection" && content.context) {
      metadata.selectionContext = content.context;
    }

    if (mode === "element" && content.elements && content.elements.length > 0) {
      metadata.elementSelector = content.elements[0].selector;
    }

    // Add dimensions for media content
    if (content.width && content.height) {
      metadata.dimensions = {
        width: content.width,
        height: content.height,
      };
    }

    // Add file metadata for file uploads
    if (mode === "file") {
      metadata.fileSize = pageMetadata.fileSize || content.fileSize;
      metadata.fileType = pageMetadata.fileType || content.fileType;
      metadata.fileExtension = pageMetadata.fileExtension || content.fileExtension;
    }

    return metadata;
  }

  /**
   * Generate content preview
   */
  private generatePreview(content: any, type: ContentType, mode: string): string {
    const maxLength = 200;

    switch (type) {
      case ContentType.PAGE:
      case ContentType.TEXT:
        const text = content.text?.content || "";
        return this.truncateText(text, maxLength);

      case ContentType.ELEMENT:
        if (content.elements && content.elements.length > 0) {
          const summaries = content.elements.map((el: any) => {
            const tag = el.tagName?.toLowerCase() || "element";
            const text = this.truncateText(el.textContent || "", 50);
            return `<${tag}>: ${text}`;
          });
          return summaries.join(" | ");
        }
        return "Element capture";

      case ContentType.NOTE:
        return this.truncateText(content.text || "", maxLength);

      case ContentType.PDF:
        return `PDF: ${content.fileName || "Untitled"} (${this.formatFileSize(content.fileSize)})`;

      case ContentType.DOCUMENT:
        return `Document: ${content.fileName || "Untitled"} (${this.formatFileSize(content.fileSize)})`;

      case ContentType.SPREADSHEET:
        return `Spreadsheet: ${content.fileName || "Untitled"} (${this.formatFileSize(content.fileSize)})`;

      case ContentType.FILE:
        return `File: ${content.fileName || "Untitled"} (${this.formatFileSize(content.fileSize)})`;

      case ContentType.IMAGE:
        return `Image: ${content.alt || content.src || "Untitled"}`;

      case ContentType.VIDEO:
        return `Video: ${content.src || "Untitled"} (${this.formatDuration(content.duration)})`;

      case ContentType.AUDIO:
        return `Audio: ${content.src || "Untitled"} (${this.formatDuration(content.duration)})`;

      default:
        return "Captured content";
    }
  }

  /**
   * Truncate text to max length
   */
  private truncateText(text: string, maxLength: number): string {
    if (!text) return "";

    const cleaned = text.trim().replace(/\s+/g, " ");

    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    return cleaned.substring(0, maxLength) + "...";
  }

  /**
   * Format duration in seconds to readable string
   */
  private formatDuration(seconds: number | undefined): string {
    if (!seconds || isNaN(seconds)) return "Unknown duration";

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }

    return `${secs}s`;
  }

  /**
   * Format file size in bytes to readable string
   */
  private formatFileSize(bytes: number | undefined): string {
    if (!bytes || isNaN(bytes)) return "Unknown size";

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }

    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  }

  /**
   * Get content by ID
   */
  async getContent(contentId: string): Promise<CapturedContent | null> {
    try {
      await indexedDBManager.init();
      return await indexedDBManager.getContent(contentId);
    } catch (error) {
      logger.error("ContentProcessor", "Failed to get content", error);
      return null;
    }
  }

  /**
   * Update content processing status
   */
  async updateProcessingStatus(
    contentId: string,
    status: ProcessingStatus
  ): Promise<void> {
    try {
      await indexedDBManager.init();
      await indexedDBManager.updateContent(contentId, {
        processingStatus: status,
      });

      logger.info("ContentProcessor", "Processing status updated", {
        contentId,
        status,
      });
    } catch (error) {
      logger.error("ContentProcessor", "Failed to update processing status", error);
      throw error;
    }
  }

  /**
   * Delete content
   */
  async deleteContent(contentId: string): Promise<void> {
    try {
      await indexedDBManager.init();
      await indexedDBManager.deleteContent(contentId);

      logger.info("ContentProcessor", "Content deleted", { contentId });
    } catch (error) {
      logger.error("ContentProcessor", "Failed to delete content", error);
      throw error;
    }
  }

  /**
   * Generate AI summary for captured content
   * Requirements: 2.5, 3.4
   */
  async generateSummary(
    contentId: string,
    options: { preferLocal?: boolean; maxLength?: number } = {}
  ): Promise<string> {
    const { preferLocal = true, maxLength = 500 } = options;

    try {
      logger.info("ContentProcessor", "Generating summary", {
        contentId,
        preferLocal,
        maxLength,
      });

      // Get content from storage
      await indexedDBManager.init();
      const content = await indexedDBManager.getContent(contentId);

      if (!content) {
        throw new Error(`Content ${contentId} not found`);
      }

      // Extract text content
      let textContent = "";
      try {
        const parsedContent = JSON.parse(content.content as string);
        textContent = parsedContent.text || parsedContent.content || "";
      } catch {
        textContent = content.content as string;
      }

      if (!textContent || textContent.length === 0) {
        throw new Error("No text content to summarize");
      }

      // Truncate if too long (to fit in context window)
      const maxInputLength = 10000;
      if (textContent.length > maxInputLength) {
        textContent = textContent.substring(0, maxInputLength) + "...";
        logger.info("ContentProcessor", "Text truncated for summarization", {
          originalLength: textContent.length,
          truncatedLength: maxInputLength,
        });
      }

      // Create summarization prompt
      const prompt = `Please provide a concise summary of the following content in approximately ${maxLength} characters. Focus on the main points and key information:\n\n${textContent}`;

      // Import AI manager dynamically to avoid circular dependencies
      const { AIManager } = await import("./ai-manager.js");
      const aiManager = new AIManager();

      // Create a session for summarization
      const sessionId = await aiManager.createSession({
        temperature: 0.7,
        topK: 40,
      });

      try {
        // Generate summary using AI
        const response = await aiManager.processPrompt(sessionId, prompt);

        logger.info("ContentProcessor", "Summary generated successfully", {
          contentId,
          summaryLength: response.length,
        });

        return response;
      } finally {
        // Clean up session
        await aiManager.destroySession(sessionId);
      }
    } catch (error) {
      logger.error("ContentProcessor", "Failed to generate summary", error);
      throw error;
    }
  }

  /**
   * Process full page capture with AI enhancements
   * Requirements: 2.1, 2.2, 2.5, 3.4
   */
  async processFullPageCapture(options: ProcessContentOptions): Promise<ProcessedContent> {
    logger.info("ContentProcessor", "Processing full page capture with AI enhancements");

    // First, process and store the content normally
    const result = await this.processContent(options);

    // Generate summary in the background (don't wait for it)
    this.generateSummary(result.contentId, { preferLocal: true, maxLength: 500 })
      .then((summary) => {
        logger.info("ContentProcessor", "Summary generated for full page", {
          contentId: result.contentId,
          summaryLength: summary.length,
        });

        // Store summary in content metadata or as a separate field
        // For now, we'll log it. In production, you might want to store it
        // in a separate field or in the content metadata
      })
      .catch((error) => {
        logger.warn("ContentProcessor", "Failed to generate summary (non-critical)", error);
      });

    return result;
  }
}

// Export singleton instance
export const contentProcessor = new ContentProcessor();
