/**
 * Content Preprocessor - Clean and normalize captured content
 * 
 * This module provides content preprocessing capabilities including:
 * - Text cleaning and normalization
 * - HTML content extraction
 * - Summary generation using Gemini Nano
 * - Token estimation
 * 
 * Requirements: 2.5, 3.4
 */

import { aiManager, AIManager } from './ai-manager';
import { AIOperation } from './ai-performance-monitor';

/**
 * Processed content result
 */
export interface ProcessedContent {
  cleanedText: string;
  summary?: string;
  wordCount: number;
  estimatedTokens: number;
  language?: string;
  processingMetadata: {
    cleanedAt: number;
    summarizedAt?: number;
    processingTime: number;
  };
}

/**
 * Preprocessing options
 */
export interface PreprocessingOptions {
  generateSummary?: boolean;
  summaryLength?: 'short' | 'medium' | 'long';
  preserveFormatting?: boolean;
  extractMetadata?: boolean;
  maxTokensForSummary?: number;
}

/**
 * Content type for preprocessing
 */
export type ContentType = 'text' | 'html' | 'markdown';

/**
 * Content Preprocessor class
 */
export class ContentPreprocessor {
  private aiManager: AIManager;
  private readonly DEFAULT_MAX_TOKENS = 5000;

  constructor(aiManagerInstance: AIManager = aiManager) {
    this.aiManager = aiManagerInstance;
  }

  /**
   * Main preprocessing entry point
   * Requirement 2.5: Process content in background to extract text and structural information
   * 
   * @param rawContent Raw content string
   * @param contentType Type of content (text, html, markdown)
   * @param options Preprocessing options
   * @returns Processed content with metadata
   */
  async preprocessContent(
    rawContent: string,
    contentType: ContentType = 'text',
    options: PreprocessingOptions = {}
  ): Promise<ProcessedContent> {
    const startTime = performance.now();

    try {
      // Step 1: Clean and normalize content
      let cleanedText: string;

      if (contentType === 'html') {
        cleanedText = this.extractTextFromHtml(rawContent);
      } else {
        cleanedText = this.cleanText(rawContent);
      }

      // Step 2: Calculate metrics
      const wordCount = this.countWords(cleanedText);
      const estimatedTokens = this.estimateTokens(cleanedText);

      // Step 3: Generate summary if requested and content is suitable
      let summary: string | undefined;
      let summarizedAt: number | undefined;

      const maxTokens = options.maxTokensForSummary || this.DEFAULT_MAX_TOKENS;
      const shouldSummarize = options.generateSummary && estimatedTokens < maxTokens;

      if (shouldSummarize) {
        try {
          summary = await this.generateSummary(cleanedText, options.summaryLength);
          summarizedAt = Date.now();
        } catch (error) {
          console.warn('Summary generation failed:', error);
          // Continue without summary - non-critical failure
        }
      }

      const processingTime = performance.now() - startTime;

      const result: ProcessedContent = {
        cleanedText,
        wordCount,
        estimatedTokens,
        processingMetadata: {
          cleanedAt: Date.now(),
          processingTime,
        },
      };

      if (summary !== undefined) {
        result.summary = summary;
      }

      if (summarizedAt !== undefined) {
        result.processingMetadata.summarizedAt = summarizedAt;
      }

      return result;
    } catch (error) {
      console.error('Content preprocessing failed:', error);
      throw new Error(`Failed to preprocess content: ${error}`);
    }
  }

  /**
   * Clean and normalize text content
   * - Normalize Unicode characters
   * - Remove zero-width characters
   * - Collapse multiple whitespaces
   * - Trim leading/trailing whitespace
   * 
   * @param text Raw text
   * @returns Cleaned text
   */
  cleanText(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    let cleaned = text;

    // Normalize Unicode (NFC - Canonical Composition)
    cleaned = cleaned.normalize('NFC');

    // Remove zero-width characters
    cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');

    // Remove control characters except newlines and tabs
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Normalize line endings to \n
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Collapse multiple spaces (but preserve single newlines)
    cleaned = cleaned.replace(/ +/g, ' ');

    // Collapse multiple newlines (max 2 consecutive)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Trim leading/trailing whitespace
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Extract text from HTML content
   * - Remove script/style tags and content
   * - Strip HTML tags
   * - Decode HTML entities
   * - Preserve meaningful line breaks
   * 
   * @param html HTML content
   * @returns Extracted text
   */
  extractTextFromHtml(html: string): string {
    if (!html || typeof html !== 'string') {
      return '';
    }

    let text = html;

    // Remove script and style tags with their content
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Add line breaks for block elements
    const blockElements = ['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr'];
    blockElements.forEach(tag => {
      const regex = new RegExp(`</${tag}>`, 'gi');
      text = text.replace(regex, `</${tag}>\n`);
    });

    // Remove all HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode common HTML entities
    text = this.decodeHtmlEntities(text);

    // Clean the extracted text
    return this.cleanText(text);
  }

  /**
   * Decode common HTML entities
   * 
   * @param text Text with HTML entities
   * @returns Decoded text
   */
  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
      '&#39;': "'",
      '&nbsp;': ' ',
      '&mdash;': '—',
      '&ndash;': '–',
      '&hellip;': '…',
      '&copy;': '©',
      '&reg;': '®',
      '&trade;': '™',
    };

    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
      decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }

    // Decode numeric entities (&#123; or &#xAB;)
    decoded = decoded.replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 10))
    );
    decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    );

    return decoded;
  }

  /**
   * Estimate token count for text
   * Rough estimate: ~4 characters per token
   * 
   * @param text Text to estimate
   * @returns Estimated token count
   */
  estimateTokens(text: string): number {
    if (!text) return 0;

    // Rough approximation: 1 token ≈ 4 characters
    // This is a conservative estimate for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Count words in text
   * 
   * @param text Text to count
   * @returns Word count
   */
  countWords(text: string): number {
    if (!text) return 0;

    // Split by whitespace and filter empty strings
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    return words.length;
  }

  /**
   * Generate summary using Gemini Nano
   * Requirement 3.4: Summarize short content (< 5000 tokens) using Gemini Nano
   * 
   * @param content Content to summarize
   * @param length Desired summary length
   * @returns Generated summary
   */
  async generateSummary(
    content: string,
    length: 'short' | 'medium' | 'long' = 'medium'
  ): Promise<string> {
    try {
      // Check if content is too short to summarize
      const wordCount = this.countWords(content);
      if (wordCount < 50) {
        return content; // Content too short, return as-is
      }

      // Check AI availability
      const availability = await this.aiManager.checkModelAvailability();
      if (availability === 'no') {
        throw new Error('Gemini Nano not available for summarization');
      }

      // Create a session for summarization
      const sessionId = await this.aiManager.createSession({
        temperature: 0.3, // Lower temperature for more focused summaries
      });

      try {
        // Build prompt based on desired length
        const prompt = this.buildSummaryPrompt(content, length);

        // Generate summary
        const summary = await this.aiManager.processPrompt(
          sessionId,
          prompt,
          { operation: AIOperation.SUMMARIZE }
        );

        return summary.trim();
      } finally {
        // Clean up session
        this.aiManager.destroySession(sessionId);
      }
    } catch (error) {
      console.error('Summary generation failed:', error);
      throw error;
    }
  }

  /**
   * Build summary prompt based on content and desired length
   * 
   * @param content Content to summarize
   * @param length Desired summary length
   * @returns Prompt for AI
   */
  private buildSummaryPrompt(content: string, length: 'short' | 'medium' | 'long'): string {
    const lengthInstructions = {
      short: 'in 1-2 concise sentences',
      medium: 'in 3-5 sentences',
      long: 'in a detailed paragraph',
    };

    const instruction = lengthInstructions[length];

    return `Summarize the following content ${instruction}. Focus on the main points and key information:\n\n${content}`;
  }

  /**
   * Batch preprocess multiple content items
   * 
   * @param contents Array of raw content strings
   * @param contentType Type of content
   * @param options Preprocessing options
   * @returns Array of processed content
   */
  async batchPreprocess(
    contents: string[],
    contentType: ContentType = 'text',
    options: PreprocessingOptions = {}
  ): Promise<ProcessedContent[]> {
    const results: ProcessedContent[] = [];

    for (const content of contents) {
      try {
        const processed = await this.preprocessContent(content, contentType, options);
        results.push(processed);
      } catch (error) {
        console.error('Failed to preprocess content item:', error);
        // Continue with other items
      }
    }

    return results;
  }
}

// Export singleton instance
export const contentPreprocessor = new ContentPreprocessor();
