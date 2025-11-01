import { logger } from "./monitoring.js";
import { AIManager } from "./ai-manager.js";
import { ChromeLocalStorage } from "./storage-wrapper.js";

export interface FormattingResult {
  formattedContent: string;
  generatedTitle: string;
  success: boolean;
  usedAI: boolean;
  error?: string;
}

export interface ProcessingStatus {
  contentId: string;
  status: "unprocessed" | "processing" | "processed" | "failed";
  lastAttempt?: number;
  error?: string;
}

export class GeminiNanoFormatter {
  private aiManager: AIManager;
  private storageWrapper: ChromeLocalStorage;
  private processingQueue: Set<string> = new Set();
  private readonly STORAGE_KEY = "gemini_nano_processing_status";
  private readonly MAX_RETRIES = 3;

  constructor(aiManager: AIManager, storageWrapper: ChromeLocalStorage) {
    this.aiManager = aiManager;
    this.storageWrapper = storageWrapper;
  }

  /**
   * Format captured text and generate a title using Gemini Nano
   */
  async formatCapturedText(
    content: string,
    contentId: string,
  ): Promise<FormattingResult> {
    logger.info("GeminiNanoFormatter", "Starting format", {
      contentId,
      contentLength: content.length,
    });

    // Check if already processing
    if (this.processingQueue.has(contentId)) {
      logger.warn("GeminiNanoFormatter", "Already processing", { contentId });
      return {
        formattedContent: content,
        generatedTitle: this.extractFallbackTitle(content),
        success: false,
        usedAI: false,
        error: "Already processing",
      };
    }

    // Mark as processing
    this.processingQueue.add(contentId);
    await this.updateProcessingStatus(contentId, "processing");

    try {
      // Check Gemini Nano availability
      const availability = await this.aiManager.checkModelAvailability();

      if (availability === "no") {
        logger.warn("GeminiNanoFormatter", "Gemini Nano not available");
        return await this.fallbackFormatting(content, contentId);
      }

      // Initialize Gemini Nano session
      const sessionId = await this.aiManager.initializeGeminiNano({
        temperature: 0.2,
        topK: 32,
        initialPrompts: [
          {
            role: "system",
            content:
              "You are an expert content formatter specializing in creating beautifully structured, highly readable markdown documents. Transform raw captured text into professional, well-organized content with rich formatting. Output JSON only.",
          },
        ],
      });

      try {
        // Create prompt for formatting and title generation
        const prompt = `Transform the following captured text into a beautifully formatted, highly readable markdown document. Apply these formatting rules:

**Structure & Organization:**
- Add a clear hierarchy with markdown headings (##, ###, ####) to organize content logically
- Break content into well-defined sections with descriptive headings
- Use horizontal rules (---) to separate major sections when appropriate

**Paragraphs & Readability:**
- Break long paragraphs into shorter, digestible chunks (3-5 sentences max)
- Add proper spacing between paragraphs and sections
- Fix awkward line breaks and improve flow

**Lists & Emphasis:**
- Convert any list-like content into proper markdown lists (- for bullets, 1. for numbered)
- Use **bold** for key terms, important concepts, and emphasis
- Use *italics* for subtle emphasis, foreign words, or technical terms
- Use \`inline code\` for technical terms, commands, or specific values

**Rich Formatting:**
- Add > blockquotes for important quotes or key takeaways
- Use tables (| Header | Header |) if data is tabular
- Add code blocks with \`\`\` for any code snippets
- Use nested lists for hierarchical information

**Quality:**
- Preserve all factual information and details
- Fix any typos or obvious errors
- Improve clarity without changing meaning
- Make it scannable and easy to read

Also generate a concise, descriptive title (max 60 characters) that captures the essence of the content.

CAPTURED TEXT:
${content}

Return ONLY valid JSON in this exact format (escape newlines properly):
{"title": "Generated Title", "formattedContent": "## Main Heading\\n\\nWell-formatted content with **bold**, *italics*, and proper structure..."}`;

        const aiResult = await this.aiManager.processPrompt(sessionId, prompt);

        // Parse AI response
        const result = this.parseAIResponse(aiResult, content);

        if (result.success) {
          await this.updateProcessingStatus(contentId, "processed");
          logger.info("GeminiNanoFormatter", "Success", {
            contentId,
            usedAI: true,
          });
          return result;
        } else {
          throw new Error("Failed to parse AI response");
        }
      } finally {
        // Clean up session
        this.aiManager.destroySession(sessionId);
      }
    } catch (error) {
      logger.error("GeminiNanoFormatter", "Error", error);
      await this.updateProcessingStatus(contentId, "failed", String(error));
      return await this.fallbackFormatting(content, contentId);
    } finally {
      this.processingQueue.delete(contentId);
    }
  }

  /**
   * Parse AI response and extract title and formatted content
   */
  private parseAIResponse(
    aiResult: string,
    originalContent: string,
  ): FormattingResult {
    try {
      // Try to extract JSON from response
      let jsonStr = aiResult.trim();

      // Remove markdown code blocks if present
      const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)```/i);
      if (jsonMatch && jsonMatch[1]) {
        jsonStr = jsonMatch[1].trim();
      }

      // Parse JSON
      const parsed = JSON.parse(jsonStr);

      if (parsed.title && parsed.formattedContent) {
        return {
          formattedContent: parsed.formattedContent.trim(),
          generatedTitle: parsed.title.trim().substring(0, 60),
          success: true,
          usedAI: true,
        };
      }
    } catch (error) {
      logger.warn("GeminiNanoFormatter", "Failed to parse JSON", error);
    }

    // Fallback: try to extract title and format content manually
    return {
      formattedContent: this.basicFormat(originalContent),
      generatedTitle: this.extractFallbackTitle(originalContent),
      success: false,
      usedAI: false,
    };
  }

  /**
   * Fallback formatting when AI is not available
   */
  private async fallbackFormatting(
    content: string,
    contentId: string,
  ): Promise<FormattingResult> {
    await this.updateProcessingStatus(contentId, "processed");

    return {
      formattedContent: this.basicFormat(content),
      generatedTitle: this.extractFallbackTitle(content),
      success: true,
      usedAI: false,
    };
  }

  /**
   * Basic text formatting
   */
  private basicFormat(text: string): string {
    return text
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Extract a title from content (fallback method)
   */
  private extractFallbackTitle(content: string): string {
    // Try to find first heading
    const headingMatch = content.match(/^#+\s+(.+)$/m);
    if (headingMatch && headingMatch[1]) {
      return headingMatch[1].trim().substring(0, 60);
    }

    // Try first line
    const firstLine = content.split("\n")[0]?.trim();
    if (firstLine && firstLine.length > 0) {
      return firstLine.substring(0, 60);
    }

    // Try first sentence
    const firstSentence = content.match(/^[^.!?]+[.!?]/);
    if (firstSentence && firstSentence[0]) {
      return firstSentence[0].trim().substring(0, 60);
    }

    // Default
    return "Captured Text";
  }

  /**
   * Update processing status in storage
   */
  private async updateProcessingStatus(
    contentId: string,
    status: ProcessingStatus["status"],
    error?: string,
  ): Promise<void> {
    try {
      const statusMap = await this.getProcessingStatusMap();
      statusMap[contentId] = {
        contentId,
        status,
        lastAttempt: Date.now(),
        ...(error && { error }),
      };
      const dataToStore: Record<string, any> = {};
      dataToStore[this.STORAGE_KEY] = statusMap;
      await this.storageWrapper.set(dataToStore);
    } catch (err) {
      logger.error("GeminiNanoFormatter", "Failed to update status", err);
    }
  }

  /**
   * Get processing status for a content item
   */
  async getProcessingStatus(
    contentId: string,
  ): Promise<ProcessingStatus | null> {
    try {
      const statusMap = await this.getProcessingStatusMap();
      return statusMap[contentId] || null;
    } catch (err) {
      logger.error("GeminiNanoFormatter", "Failed to get status", err);
      return null;
    }
  }

  /**
   * Get all processing statuses
   */
  private async getProcessingStatusMap(): Promise<
    Record<string, ProcessingStatus>
  > {
    try {
      const result = await this.storageWrapper.get([this.STORAGE_KEY]);
      const data = result as any;
      return data?.[this.STORAGE_KEY] || {};
    } catch (err) {
      logger.error("GeminiNanoFormatter", "Failed to get status map", err);
      return {};
    }
  }

  /**
   * Get all unprocessed content IDs
   */
  async getUnprocessedContentIds(): Promise<string[]> {
    try {
      const statusMap = await this.getProcessingStatusMap();
      return Object.values(statusMap)
        .filter(
          (status) =>
            status.status === "unprocessed" || status.status === "failed",
        )
        .map((status) => status.contentId);
    } catch (err) {
      logger.error("GeminiNanoFormatter", "Failed to get unprocessed IDs", err);
      return [];
    }
  }

  /**
   * Mark content as unprocessed (for new captures)
   */
  async markAsUnprocessed(contentId: string): Promise<void> {
    await this.updateProcessingStatus(contentId, "unprocessed");
  }

  /**
   * Check if content needs processing
   */
  async needsProcessing(contentId: string): Promise<boolean> {
    const status = await this.getProcessingStatus(contentId);
    if (!status) return true;

    // Retry failed items after 5 minutes
    if (status.status === "failed") {
      const timeSinceLastAttempt = Date.now() - (status.lastAttempt || 0);
      return timeSinceLastAttempt > 5 * 60 * 1000;
    }

    return status.status === "unprocessed";
  }
}
