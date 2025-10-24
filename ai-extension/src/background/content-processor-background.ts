import { logger } from "./monitoring.js";
import { GeminiNanoFormatter } from "./gemini-nano-formatter.js";
import { indexedDBManager } from "./indexeddb-manager.js";
import { vectorIndexingQueue, IndexingOperation } from "./vector-indexing-queue.js";

export class ContentProcessorBackground {
  private formatter: GeminiNanoFormatter;
  private isProcessing = false;
  private processingInterval: number | null = null;

  constructor(formatter: GeminiNanoFormatter) {
    this.formatter = formatter;
  }

  /**
   * Start background processing on extension startup
   */
  async start(): Promise<void> {
    logger.info("ContentProcessorBackground", "Starting background processor");
    
    // Process immediately on startup
    await this.processUnprocessedContent();
    
    // Set up periodic processing (every 5 minutes)
    this.processingInterval = setInterval(() => {
      this.processUnprocessedContent();
    }, 5 * 60 * 1000) as unknown as number;
  }

  /**
   * Stop background processing
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    logger.info("ContentProcessorBackground", "Stopped background processor");
  }

  /**
   * Process all unprocessed content items
   */
  async processUnprocessedContent(): Promise<void> {
    if (this.isProcessing) {
      logger.info("ContentProcessorBackground", "Already processing, skipping");
      return;
    }

    this.isProcessing = true;
    logger.info("ContentProcessorBackground", "Starting batch processing");

    try {
      // Get unprocessed content IDs
      const unprocessedIds = await this.formatter.getUnprocessedContentIds();
      
      if (unprocessedIds.length === 0) {
        logger.info("ContentProcessorBackground", "No unprocessed content found");
        return;
      }

      logger.info("ContentProcessorBackground", `Found ${unprocessedIds.length} unprocessed items`);

      // Process each item one by one
      for (const contentId of unprocessedIds) {
        try {
          await this.processContentItem(contentId);
          
          // Add small delay between items to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.error("ContentProcessorBackground", `Failed to process ${contentId}`, error);
          // Continue with next item
        }
      }

      logger.info("ContentProcessorBackground", "Batch processing complete");
    } catch (error) {
      logger.error("ContentProcessorBackground", "Batch processing error", error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single content item
   */
  private async processContentItem(contentId: string): Promise<void> {
    logger.info("ContentProcessorBackground", "Processing", { contentId });

    try {
      // Initialize DB
      await indexedDBManager.init();

      // Get content from DB
      const content = await indexedDBManager.getContent(contentId);
      
      if (!content) {
        logger.warn("ContentProcessorBackground", "Content not found", { contentId });
        return;
      }

      // Only process CAPTURED text (selection and page), NOT notes or other types
      if (!["selection", "page"].includes(content.type)) {
        logger.info("ContentProcessorBackground", "Skipping non-captured content", { contentId, type: content.type });
        return;
      }

      // Check if already has a title (might have been manually edited)
      if (content.metadata?.title && content.metadata.title !== "Untitled Note") {
        logger.info("ContentProcessorBackground", "Content already has title, skipping", { contentId });
        return;
      }

      // Format content and generate title
      const contentText = typeof content.content === "string" ? content.content : "";
      const result = await this.formatter.formatCapturedText(
        contentText,
        contentId
      );

      if (result.success) {
        // Update content in DB
        await indexedDBManager.updateContent(contentId, {
          content: result.formattedContent,
          metadata: {
            ...content.metadata,
            title: result.generatedTitle,
            ...(result.usedAI !== undefined && { usedAI: result.usedAI })
          } as any
        });

        // Enqueue vector indexing UPDATE job (non-blocking)
        vectorIndexingQueue.enqueueContent(contentId, IndexingOperation.UPDATE).catch((error) => {
          logger.error("ContentProcessorBackground", "Failed to enqueue vector update job", { contentId, error });
        });

        logger.info("ContentProcessorBackground", "Successfully processed", {
          contentId,
          usedAI: result.usedAI,
          title: result.generatedTitle
        });

        // Notify UI of update
        chrome.runtime.sendMessage({
          kind: "CONTENT_UPDATED",
          payload: {
            contentId,
            content: await indexedDBManager.getContent(contentId)
          }
        }).catch(() => {
          // Ignore errors if no listeners
        });
      }
    } catch (error) {
      logger.error("ContentProcessorBackground", "Processing failed", error);
      throw error;
    }
  }

  /**
   * Process a newly captured content item immediately
   */
  async processNewCapture(contentId: string, content: string): Promise<void> {
    logger.info("ContentProcessorBackground", "Processing new capture", { contentId });

    try {
      // Mark as unprocessed first
      await this.formatter.markAsUnprocessed(contentId);

      // Format and generate title
      const result = await this.formatter.formatCapturedText(content, contentId);

      if (result.success) {
        // Update content in DB
        await indexedDBManager.init();
        await indexedDBManager.updateContent(contentId, {
          content: result.formattedContent,
          metadata: {
            title: result.generatedTitle,
            ...(result.usedAI !== undefined && { usedAI: result.usedAI })
          } as any
        });

        // Enqueue vector indexing UPDATE job (non-blocking)
        vectorIndexingQueue.enqueueContent(contentId, IndexingOperation.UPDATE).catch((error) => {
          logger.error("ContentProcessorBackground", "Failed to enqueue vector update job", { contentId, error });
        });

        logger.info("ContentProcessorBackground", "Successfully processed new capture", {
          contentId,
          usedAI: result.usedAI,
          title: result.generatedTitle
        });

        // Notify UI
        chrome.runtime.sendMessage({
          kind: "CONTENT_UPDATED",
          payload: {
            contentId,
            content: await indexedDBManager.getContent(contentId)
          }
        }).catch(() => {
          // Ignore errors if no listeners
        });
      }
    } catch (error) {
      logger.error("ContentProcessorBackground", "Failed to process new capture", error);
    }
  }
}
