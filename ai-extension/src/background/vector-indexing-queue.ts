/**
 * Vector Indexing Queue Manager
 *
 * Manages background generation of embeddings for content.
 * Handles batch processing, rate limiting, and retries.
 *
 * Requirements: 7.2, 7.3 (Vector search and semantic indexing)
 *
 * TODO: Consider migrating to established libraries like BullMQ for more robust
 * queue management with better concurrency control, persistence, and monitoring.
 */

import { logger } from "./monitoring.js";
import { textChunker, type TextChunk } from "./text-chunker.js";
import { embeddingEngine } from "./embedding-engine.js";
import { vectorStoreService } from "./vector-store-service.js";
import { indexedDBManager, type CapturedContent } from "./indexeddb-manager.js";
import type { VectorChunk, ChunkMetadata } from "./vector-chunk-types.js";

export enum IndexingOperation {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
}

export interface IndexingJob {
  id: string;
  contentId: string;
  operation: IndexingOperation;
  priority: "high" | "normal" | "low";
  retries: number;
  rateLimitRetries?: number; // Separate counter for rate-limit retries
  createdAt: number;
  scheduledFor?: number; // For rate-limit retry delays
  chunksProcessed?: number; // Track chunks for progress reporting
}

export interface IndexingProgress {
  jobId: string;
  contentId: string;
  operation: IndexingOperation;
  chunksTotal: number;
  chunksProcessed: number;
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
}

export interface QueueStats {
  queueLength: number;
  isProcessing: boolean;
  jobsProcessed: number;
  jobsFailed: number;
  averageProcessingTime: number;
}

export class VectorIndexingQueue {
  private queue: IndexingJob[] = [];
  private isProcessing: boolean = false;
  private maxRetries: number = 3;
  private processingInterval: number = 0; // No delay between jobs (was 100ms)
  private batchSize: number = 20; // Process 20 embeddings at a time (optimized from 5)
  private rateLimitDelay: number = 1000; // 1 second delay on rate limit
  private maxRateLimitRetries: number = 5;

  // Stats
  private jobsProcessed: number = 0;
  private jobsFailed: number = 0;
  private processingTimes: number[] = [];

  /**
   * Enqueue content for indexing
   */
  async enqueueContent(
    contentId: string,
    operation: IndexingOperation,
    priority: "high" | "normal" | "low" = "normal",
  ): Promise<string> {
    // Check if already in queue
    const exists = this.queue.find(
      (job) => job.contentId === contentId && job.operation === operation,
    );

    if (exists) {
      logger.debug("VectorIndexingQueue", "Content already in queue", {
        contentId,
        operation,
      });
      return exists.id;
    }

    const job: IndexingJob = {
      id: this.generateJobId(),
      contentId,
      operation,
      priority,
      retries: 0,
      createdAt: Date.now(),
    };

    this.queue.push(job);
    this.sortQueue();

    logger.info("VectorIndexingQueue", "Job enqueued", {
      jobId: job.id,
      contentId,
      operation,
      priority,
      queueLength: this.queue.length,
    });

    // Emit UI event
    this.emitProgressEvent({
      jobId: job.id,
      contentId,
      operation,
      chunksTotal: 0,
      chunksProcessed: 0,
      status: "pending",
    });

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }

    return job.id;
  }

  /**
   * Process the indexing queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      // Get next batch of jobs
      const batch = this.getNextBatch();

      if (batch.length === 0) {
        // Check if we have scheduled jobs
        const hasScheduledJobs = this.queue.some(
          (job) => job.scheduledFor && job.scheduledFor > Date.now(),
        );

        if (hasScheduledJobs) {
          // Wait a bit and continue
          await this.sleep(100);
          continue;
        }

        break;
      }

      // Process batch in parallel
      const results = await Promise.allSettled(
        batch.map((job) => this.processJob(job)),
      );

      // Handle results
      results.forEach((result, index) => {
        const job = batch[index];
        if (!job) return;

        if (result.status === "fulfilled") {
          this.jobsProcessed++;
          logger.info("VectorIndexingQueue", "Job completed", {
            jobId: job.id,
            contentId: job.contentId,
          });
        } else {
          logger.error("VectorIndexingQueue", "Job failed", {
            jobId: job.id,
            contentId: job.contentId,
            error: result.reason,
          });

          // Retry if under max retries
          if (job.retries < this.maxRetries) {
            job.retries++;
            job.priority = "low"; // Lower priority for retries
            this.queue.push(job);
            this.sortQueue();

            logger.info("VectorIndexingQueue", "Job requeued for retry", {
              jobId: job.id,
              retries: job.retries,
            });
          } else {
            this.jobsFailed++;
            this.emitProgressEvent({
              jobId: job.id,
              contentId: job.contentId,
              operation: job.operation,
              chunksTotal: 0,
              chunksProcessed: 0,
              status: "failed",
              error: result.reason?.message || "Unknown error",
            });
          }
        }
      });

      // Wait between batches
      await this.sleep(this.processingInterval);
    }

    this.isProcessing = false;
    logger.info("VectorIndexingQueue", "Queue processing completed");
  }

  /**
   * Get next batch of jobs to process
   */
  private getNextBatch(): IndexingJob[] {
    const batch: IndexingJob[] = [];
    const now = Date.now();

    for (
      let i = 0;
      i < this.queue.length && batch.length < this.batchSize;
      i++
    ) {
      const job = this.queue[i];
      if (!job) continue;

      // Skip if scheduled for later
      if (job.scheduledFor && job.scheduledFor > now) {
        continue;
      }

      // Remove from queue and add to batch
      this.queue.splice(i, 1);
      batch.push(job);
      i--; // Adjust index after removal
    }

    return batch;
  }

  /**
   * Process a single indexing job
   */
  private async processJob(job: IndexingJob): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info("VectorIndexingQueue", "Processing job", {
        jobId: job.id,
        contentId: job.contentId,
        operation: job.operation,
      });

      // Emit processing event
      this.emitProgressEvent({
        jobId: job.id,
        contentId: job.contentId,
        operation: job.operation,
        chunksTotal: 0,
        chunksProcessed: 0,
        status: "processing",
      });

      switch (job.operation) {
        case IndexingOperation.CREATE:
        case IndexingOperation.UPDATE:
          await this.indexContent(job);
          break;
        case IndexingOperation.DELETE:
          await this.deleteContentEmbeddings(job);
          break;
        default:
          throw new Error(`Unknown operation: ${job.operation}`);
      }

      // Emit completion event with accurate chunk counts
      const chunksProcessed = job.chunksProcessed || 0;
      this.emitProgressEvent({
        jobId: job.id,
        contentId: job.contentId,
        operation: job.operation,
        chunksTotal: chunksProcessed,
        chunksProcessed: chunksProcessed,
        status: "completed",
      });

      // Record processing time
      const processingTime = Date.now() - startTime;
      this.processingTimes.push(processingTime);
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift(); // Keep last 100
      }
    } catch (error: any) {
      // Handle rate limiting
      if (this.isRateLimitError(error)) {
        const rateLimitRetries = (job.rateLimitRetries || 0) + 1;

        logger.warn("VectorIndexingQueue", "Rate limit hit, rescheduling", {
          jobId: job.id,
          rateLimitRetries,
        });

        // Reschedule if not exceeded max rate limit retries
        if (rateLimitRetries <= this.maxRateLimitRetries) {
          job.scheduledFor =
            Date.now() + this.rateLimitDelay * rateLimitRetries;
          job.rateLimitRetries = rateLimitRetries;
          this.queue.push(job);
          this.sortQueue();
          return; // Don't throw, job is rescheduled
        }
      }

      throw error;
    }
  }

  /**
   * Index content by generating embeddings for chunks
   */
  private async indexContent(job: IndexingJob): Promise<void> {
    await indexedDBManager.init();

    // Get content
    const content = await indexedDBManager.getContent(job.contentId);
    if (!content) {
      throw new Error(`Content not found: ${job.contentId}`);
    }

    // Extract text
    let text: string;
    if (typeof content.content === "string") {
      try {
        const parsed = JSON.parse(content.content);
        text =
          parsed.text?.content ||
          parsed.text ||
          parsed.formattedContent ||
          content.content;
      } catch {
        text = content.content;
      }
    } else {
      text = content.metadata.title || "";
    }

    if (!text.trim()) {
      logger.warn("VectorIndexingQueue", "No text to index", {
        contentId: job.contentId,
      });
      return;
    }

    // Chunk text with standardized size (700 chars to match search)
    const textChunks = textChunker.chunkText(text, {
      maxChunkSize: 700,
      overlapSize: 100,
      respectSentences: true,
      respectParagraphs: true,
    });

    logger.info("VectorIndexingQueue", "Text chunked", {
      contentId: job.contentId,
      chunksCount: textChunks.length,
    });

    // Track chunks processed for completion event
    job.chunksProcessed = 0;

    // Delete old chunks if this is an update
    if (job.operation === IndexingOperation.UPDATE) {
      await vectorStoreService.deleteChunksByContent(job.contentId);
    }

    // Prepare vector chunks
    const vectorChunks: VectorChunk[] = [];

    // Generate embeddings for all chunks
    const chunkTexts = textChunks.map((c) => c.text);
    const embeddings = await embeddingEngine.generateEmbeddingsBatch(
      chunkTexts,
      {
        batchSize: this.batchSize,
      },
    );

    // Create vector chunks with metadata
    for (let i = 0; i < textChunks.length; i++) {
      const textChunk = textChunks[i]!;
      const embedding = embeddings[i]!;

      const metadata: ChunkMetadata = {
        contentId: content.id,
        pocketId: content.pocketId,
        sourceType: content.type,
        sourceUrl: content.sourceUrl,
        chunkIndex: textChunk.chunkIndex,
        totalChunks: textChunk.totalChunks,
        startOffset: textChunk.startIndex,
        endOffset: textChunk.endIndex,
        capturedAt: content.capturedAt,
        chunkedAt: Date.now(),
        title: content.metadata.title,
        category: content.metadata.category,
        textPreview: textChunk.text.slice(0, 100),
      };

      vectorChunks.push({
        id: textChunk.id,
        text: textChunk.text,
        embedding,
        metadata,
      });

      // Update progress (emit every 5 chunks or on last chunk to reduce overhead)
      job.chunksProcessed = i + 1;
      if ((i + 1) % 5 === 0 || i === textChunks.length - 1) {
        this.emitProgressEvent({
          jobId: job.id,
          contentId: job.contentId,
          operation: job.operation,
          chunksTotal: textChunks.length,
          chunksProcessed: i + 1,
          status: "processing",
        });
      }
    }

    // Store all chunks in batch
    await vectorStoreService.storeChunksBatch(vectorChunks);

    logger.info("VectorIndexingQueue", "Content indexed", {
      contentId: job.contentId,
      chunksStored: vectorChunks.length,
    });
  }

  /**
   * Delete embeddings and vector chunks for content
   */
  private async deleteContentEmbeddings(job: IndexingJob): Promise<void> {
    await indexedDBManager.init();

    try {
      // Delete vector chunks (new storage)
      await vectorStoreService.deleteChunksByContent(job.contentId);

      // Delete old embeddings (legacy storage)
      await indexedDBManager.deleteEmbeddingByContentId(job.contentId);

      logger.info(
        "VectorIndexingQueue",
        "Content vectors and embeddings deleted",
        {
          contentId: job.contentId,
        },
      );
    } catch (error) {
      logger.error("VectorIndexingQueue", "Failed to delete content vectors", {
        contentId: job.contentId,
        error,
      });
      throw error;
    }
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    const message = error?.message?.toLowerCase() || "";
    return (
      message.includes("rate limit") ||
      message.includes("quota") ||
      message.includes("429") ||
      message.includes("too many requests")
    );
  }

  /**
   * Sort queue by priority and creation time
   */
  private sortQueue(): void {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    this.queue.sort((a, b) => {
      // First by priority
      const priorityDiff =
        priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Then by creation time (older first)
      return a.createdAt - b.createdAt;
    });
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Emit progress event to UI
   */
  private emitProgressEvent(progress: IndexingProgress): void {
    // Emit event via chrome runtime messaging
    try {
      chrome.runtime
        .sendMessage({
          kind: "VECTOR_INDEXING_PROGRESS",
          payload: progress,
        })
        .catch((error) => {
          logger.debug("VectorIndexingQueue", "Failed to send progress event", {
            error,
          });
        });
    } catch (error) {
      // Silently fail if chrome runtime is not available (e.g., in tests)
      logger.debug("VectorIndexingQueue", "Runtime not available for event", {
        error,
      });
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const avgTime =
      this.processingTimes.length > 0
        ? this.processingTimes.reduce((a, b) => a + b, 0) /
          this.processingTimes.length
        : 0;

    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      jobsProcessed: this.jobsProcessed,
      jobsFailed: this.jobsFailed,
      averageProcessingTime: avgTime,
    };
  }

  /**
   * Clear the queue (for testing)
   */
  clear(): void {
    this.queue = [];
    this.isProcessing = false;
    this.jobsProcessed = 0;
    this.jobsFailed = 0;
    this.processingTimes = [];
  }

  /**
   * Set batch size (for testing)
   */
  setBatchSize(size: number): void {
    this.batchSize = size;
  }

  /**
   * Set processing interval (for testing)
   */
  setProcessingInterval(interval: number): void {
    this.processingInterval = interval;
  }

  /**
   * Set rate limit delay (for testing)
   */
  setRateLimitDelay(delay: number): void {
    this.rateLimitDelay = delay;
  }
}

export const vectorIndexingQueue = new VectorIndexingQueue();
