/**
 * Metadata Queue Manager
 *
 * Manages background generation of conversation metadata.
 * Ensures metadata is generated automatically and efficiently.
 */

import { AIManager } from "./ai-manager.js";
import { ConversationMetadataGenerator } from "./conversation-metadata-generator.js";
import { logger } from "./monitoring.js";
import type { Conversation } from "./indexeddb-manager.js";

interface MetadataJob {
  conversationId: string;
  priority: "high" | "normal" | "low";
  retries: number;
}

export class MetadataQueueManager {
  private aiManager: AIManager;
  private generator: ConversationMetadataGenerator;
  private queue: MetadataJob[] = [];
  private isProcessing: boolean = false;
  private maxRetries: number = 3;
  private processingInterval: number = 2000; // 2 seconds between jobs
  private scanInterval: number = 5 * 60 * 1000; // 5 minutes
  private scanTimer: number | null = null;

  constructor(aiManager: AIManager) {
    if (!aiManager) {
      throw new Error("AIManager is required for MetadataQueueManager");
    }
    this.aiManager = aiManager;
    this.generator = new ConversationMetadataGenerator(aiManager);
  }

  /**
   * Start the background metadata generation system
   */
  start() {
    try {
      logger.info("MetadataQueue", "Starting background metadata generation");

      // Initial scan for missing metadata
      this.scanForMissingMetadata().catch((error) => {
        logger.error("MetadataQueue", "Initial scan failed", { error });
      });

      // Set up periodic scanning
      this.scanTimer = setInterval(() => {
        this.scanForMissingMetadata().catch((error) => {
          logger.error("MetadataQueue", "Periodic scan failed", { error });
        });
      }, this.scanInterval) as unknown as number;

      logger.info(
        "MetadataQueue",
        "Background metadata generation started successfully",
      );
    } catch (error) {
      logger.error(
        "MetadataQueue",
        "Failed to start background metadata generation",
        { error },
      );
      throw error;
    }
  }

  /**
   * Stop the background system
   */
  stop() {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    logger.info("MetadataQueue", "Stopped background metadata generation");
  }

  /**
   * Add a conversation to the metadata generation queue
   */
  async enqueueConversation(
    conversationId: string,
    priority: "high" | "normal" | "low" = "normal",
  ) {
    // Check if already in queue
    const exists = this.queue.some(
      (job) => job.conversationId === conversationId,
    );
    if (exists) {
      logger.debug("MetadataQueue", "Conversation already in queue", {
        conversationId,
      });
      return;
    }

    this.queue.push({
      conversationId,
      priority,
      retries: 0,
    });

    // Sort queue by priority
    this.queue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    logger.info("MetadataQueue", "Added conversation to queue", {
      conversationId,
      priority,
      queueLength: this.queue.length,
    });

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process the metadata generation queue
   */
  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;

      try {
        await this.generateMetadataForConversation(job.conversationId);
        logger.info("MetadataQueue", "Successfully generated metadata", {
          conversationId: job.conversationId,
        });
      } catch (error) {
        logger.error("MetadataQueue", "Failed to generate metadata", {
          conversationId: job.conversationId,
          error,
        });

        // Retry if under max retries
        if (job.retries < this.maxRetries) {
          job.retries++;
          job.priority = "low"; // Lower priority for retries
          this.queue.push(job);
          logger.info("MetadataQueue", "Retrying metadata generation", {
            conversationId: job.conversationId,
            retries: job.retries,
          });
        }
      }

      // Wait between jobs to avoid overwhelming the system
      if (this.queue.length > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.processingInterval),
        );
      }
    }

    this.isProcessing = false;
  }

  /**
   * Generate metadata for a specific conversation
   */
  private async generateMetadataForConversation(conversationId: string) {
    const { indexedDBManager } = await import("./indexeddb-manager.js");
    await indexedDBManager.init();

    // Get conversation
    const conversation = await indexedDBManager.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Check if metadata needs regeneration
    // Regenerate if:
    // 1. No metadata exists, OR
    // 2. Metadata is older than conversation update (conversation was modified), OR
    // 3. Metadata is older than 1 day
    if (conversation.metadata) {
      const metadataAge = Date.now() - conversation.metadata.generatedAt;
      const oneDayMs = 24 * 60 * 60 * 1000;

      // If metadata is newer than last update and less than 1 day old, skip
      if (
        conversation.metadata.generatedAt > conversation.updatedAt &&
        metadataAge < oneDayMs
      ) {
        logger.debug("MetadataQueue", "Metadata is up-to-date", {
          conversationId,
          metadataAge: Math.round(metadataAge / 1000 / 60) + " minutes",
        });
        return;
      }

      logger.info("MetadataQueue", "Regenerating outdated metadata", {
        conversationId,
        reason:
          conversation.metadata.generatedAt <= conversation.updatedAt
            ? "conversation updated"
            : "metadata expired",
      });
    }

    // Generate metadata
    const metadata = await this.generator.generateMetadata(
      conversation.messages,
    );
    if (!metadata) {
      throw new Error("Failed to generate metadata");
    }

    // Update conversation with metadata
    await indexedDBManager.updateConversationMetadata(conversationId, metadata);

    logger.info("MetadataQueue", "Metadata generated and saved", {
      conversationId,
      keywords: metadata.keywords.length,
      topics: metadata.topics.length,
    });
  }

  /**
   * Scan for conversations without metadata
   */
  private async scanForMissingMetadata() {
    try {
      logger.info(
        "MetadataQueue",
        "Scanning for conversations without metadata",
      );

      const { indexedDBManager } = await import("./indexeddb-manager.js");
      await indexedDBManager.init();

      const conversations = await indexedDBManager.listConversations();
      let missingCount = 0;

      for (const conversation of conversations) {
        // Skip if metadata exists and is recent
        if (conversation.metadata) {
          const age = Date.now() - conversation.metadata.generatedAt;
          const oneDayMs = 24 * 60 * 60 * 1000;
          if (age < oneDayMs) {
            continue;
          }
        }

        // Skip if conversation has no messages
        if (!conversation.messages || conversation.messages.length === 0) {
          continue;
        }

        // Add to queue with low priority (background task)
        await this.enqueueConversation(conversation.id, "low");
        missingCount++;
      }

      logger.info("MetadataQueue", "Scan complete", {
        totalConversations: conversations.length,
        missingMetadata: missingCount,
      });
    } catch (error) {
      logger.error("MetadataQueue", "Scan failed", { error });
    }
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
    };
  }
}
