/**
 * Embedding Generator
 * 
 * Generates text embeddings for semantic search and RAG implementation.
 * Supports batch processing and stores embeddings in IndexedDB.
 * 
 * Requirements: 2.5, 7.1
 */

import { indexedDBManager, type CapturedContent, type Embedding } from './indexeddb-manager.js';
import { logger } from './monitoring.js';

/**
 * Embedding task types for optimization
 */
export enum EmbeddingTaskType {
  SEMANTIC_SIMILARITY = 'SEMANTIC_SIMILARITY',
  RETRIEVAL_QUERY = 'RETRIEVAL_QUERY',
  RETRIEVAL_DOCUMENT = 'RETRIEVAL_DOCUMENT',
  CLASSIFICATION = 'CLASSIFICATION',
  CLUSTERING = 'CLUSTERING'
}

/**
 * Configuration for embedding generation
 */
export interface EmbeddingConfig {
  taskType?: EmbeddingTaskType;
  model?: string;
  batchSize?: number;
  maxRetries?: number;
}

/**
 * Request for embedding generation
 */
export interface EmbeddingRequest {
  contentId: string;
  text: string;
  taskType?: EmbeddingTaskType;
}

/**
 * Result of embedding generation
 */
export interface EmbeddingResult {
  contentId: string;
  embedding: number[];
  model: string;
  processingTime: number;
}

/**
 * Batch embedding result
 */
export interface BatchEmbeddingResult {
  successful: EmbeddingResult[];
  failed: Array<{ contentId: string; error: string }>;
  totalProcessingTime: number;
}

/**
 * Embedding Generator
 * Handles text embedding generation with batching and storage
 */
export class EmbeddingGenerator {
  private readonly DEFAULT_MODEL = 'gemini-embedding-001';
  private readonly DEFAULT_BATCH_SIZE = 10;
  private readonly DEFAULT_MAX_RETRIES = 3;
  private readonly API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
  
  private apiKey: string | null = null;
  private config: Required<EmbeddingConfig>;
  private processingQueue: EmbeddingRequest[] = [];
  private isProcessing = false;

  constructor(config?: EmbeddingConfig) {
    this.config = {
      taskType: config?.taskType ?? EmbeddingTaskType.RETRIEVAL_DOCUMENT,
      model: config?.model ?? this.DEFAULT_MODEL,
      batchSize: config?.batchSize ?? this.DEFAULT_BATCH_SIZE,
      maxRetries: config?.maxRetries ?? this.DEFAULT_MAX_RETRIES
    };
  }

  /**
   * Initialize the embedding generator with API key
   * 
   * @param apiKey Gemini API key
   */
  async initialize(apiKey: string): Promise<void> {
    this.apiKey = apiKey;
    logger.info('EmbeddingGenerator', 'Initialized', { model: this.config.model });
  }

  /**
   * Check if the generator is initialized
   */
  isInitialized(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Generate embedding for a single text
   * Requirement 7.1: Implement text embedding
   * 
   * @param contentId Content ID to associate with embedding
   * @param text Text to generate embedding for
   * @param taskType Optional task type for optimization
   * @returns Embedding result
   */
  async generateEmbedding(
    contentId: string,
    text: string,
    taskType?: EmbeddingTaskType
  ): Promise<EmbeddingResult> {
    if (!this.isInitialized()) {
      throw new Error('EmbeddingGenerator not initialized. Call initialize() with API key first.');
    }

    const startTime = performance.now();

    try {
      logger.info('EmbeddingGenerator', 'Generating embedding', { contentId, textLength: text.length });

      // Generate embedding via API
      const embedding = await this.callEmbeddingAPI([text], taskType ?? this.config.taskType);

      const processingTime = performance.now() - startTime;

      const embeddingVector = embedding[0];
      if (!embeddingVector) {
        throw new Error('No embedding returned from API');
      }

      const result: EmbeddingResult = {
        contentId,
        embedding: embeddingVector,
        model: this.config.model,
        processingTime
      };

      // Store in IndexedDB
      await this.storeEmbedding(contentId, embeddingVector);

      logger.info('EmbeddingGenerator', 'Embedding generated', {
        contentId,
        vectorSize: embeddingVector.length,
        processingTime: processingTime.toFixed(2)
      });

      return result;
    } catch (error) {
      logger.error('EmbeddingGenerator', 'Failed to generate embedding', { contentId, error });
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * Requirement 7.1: Batch requests for efficiency
   * 
   * @param requests Array of embedding requests
   * @returns Batch embedding result
   */
  async generateEmbeddingsBatch(requests: EmbeddingRequest[]): Promise<BatchEmbeddingResult> {
    if (!this.isInitialized()) {
      throw new Error('EmbeddingGenerator not initialized. Call initialize() with API key first.');
    }

    const startTime = performance.now();
    const successful: EmbeddingResult[] = [];
    const failed: Array<{ contentId: string; error: string }> = [];

    logger.info('EmbeddingGenerator', 'Starting batch embedding generation', {
      totalRequests: requests.length,
      batchSize: this.config.batchSize
    });

    // Process in batches
    for (let i = 0; i < requests.length; i += this.config.batchSize) {
      const batch = requests.slice(i, i + this.config.batchSize);
      
      try {
        const batchResults = await this.processBatch(batch);
        successful.push(...batchResults);
      } catch (error) {
        // If batch fails, try individual items
        logger.warn('EmbeddingGenerator', 'Batch failed, processing individually', { error });
        
        for (const request of batch) {
          try {
            const result = await this.generateEmbedding(
              request.contentId,
              request.text,
              request.taskType ?? this.config.taskType
            );
            successful.push(result);
          } catch (itemError) {
            failed.push({
              contentId: request.contentId,
              error: String(itemError)
            });
          }
        }
      }
    }

    const totalProcessingTime = performance.now() - startTime;

    logger.info('EmbeddingGenerator', 'Batch embedding generation complete', {
      successful: successful.length,
      failed: failed.length,
      totalProcessingTime: totalProcessingTime.toFixed(2)
    });

    return {
      successful,
      failed,
      totalProcessingTime
    };
  }

  /**
   * Process a single batch of embedding requests
   */
  private async processBatch(batch: EmbeddingRequest[]): Promise<EmbeddingResult[]> {
    const batchStartTime = performance.now();
    
    // Extract texts and task type (use first request's task type or default)
    const texts = batch.map(req => req.text);
    const taskType = batch[0]?.taskType ?? this.config.taskType;

    // Generate embeddings for batch
    const embeddings = await this.callEmbeddingAPI(texts, taskType);

    // Create results and store embeddings
    const results: EmbeddingResult[] = [];
    const processingTime = performance.now() - batchStartTime;

    for (let i = 0; i < batch.length; i++) {
      const request = batch[i];
      const embedding = embeddings[i];

      if (!request || !embedding) {
        continue;
      }

      results.push({
        contentId: request.contentId,
        embedding,
        model: this.config.model,
        processingTime: processingTime / batch.length // Distribute time across batch
      });

      // Store in IndexedDB
      await this.storeEmbedding(request.contentId, embedding);
    }

    return results;
  }

  /**
   * Call Gemini Embedding API
   * 
   * @param texts Array of texts to embed
   * @param taskType Task type for optimization
   * @returns Array of embedding vectors
   */
  private async callEmbeddingAPI(
    texts: string[],
    taskType: EmbeddingTaskType
  ): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }

    const url = `${this.API_BASE_URL}/models/${this.config.model}:embedContent?key=${this.apiKey}`;

    // Build request body
    const requestBody = {
      contents: texts.map(text => ({
        parts: [{ text }]
      })),
      embedding_config: {
        task_type: taskType
      }
    };

    let lastError: Error | null = null;

    // Retry logic
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();

        // Extract embeddings from response
        if (!data.embeddings || !Array.isArray(data.embeddings)) {
          throw new Error('Invalid API response: missing embeddings');
        }

        return data.embeddings.map((emb: { values: number[] }) => emb.values);
      } catch (error) {
        lastError = error as Error;
        logger.warn('EmbeddingGenerator', `API call failed (attempt ${attempt + 1}/${this.config.maxRetries})`, {
          error: String(error)
        });

        // Wait before retry (exponential backoff)
        if (attempt < this.config.maxRetries - 1) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw new Error(`Failed to generate embeddings after ${this.config.maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Store embedding in IndexedDB
   * Requirement 7.1: Store in IndexedDB
   * 
   * @param contentId Content ID
   * @param vector Embedding vector
   */
  private async storeEmbedding(contentId: string, vector: number[]): Promise<void> {
    try {
      await indexedDBManager.saveEmbedding({
        contentId,
        vector,
        model: this.config.model
      });

      logger.debug('EmbeddingGenerator', 'Embedding stored', { contentId, vectorSize: vector.length });
    } catch (error) {
      logger.error('EmbeddingGenerator', 'Failed to store embedding', { contentId, error });
      throw error;
    }
  }

  /**
   * Generate embeddings for captured content
   * 
   * @param content Captured content to generate embedding for
   * @returns Embedding result
   */
  async generateEmbeddingForContent(content: CapturedContent): Promise<EmbeddingResult> {
    // Extract text from content
    const text = this.extractTextFromContent(content);

    if (!text || text.trim().length === 0) {
      throw new Error('No text content to generate embedding for');
    }

    // Use RETRIEVAL_DOCUMENT task type for captured content
    return await this.generateEmbedding(
      content.id,
      text,
      EmbeddingTaskType.RETRIEVAL_DOCUMENT
    );
  }

  /**
   * Generate embeddings for multiple captured contents
   * 
   * @param contents Array of captured contents
   * @returns Batch embedding result
   */
  async generateEmbeddingsForContents(contents: CapturedContent[]): Promise<BatchEmbeddingResult> {
    const requests: EmbeddingRequest[] = [];
    
    for (const content of contents) {
      const text = this.extractTextFromContent(content);
      if (text && text.trim().length > 0) {
        requests.push({
          contentId: content.id,
          text,
          taskType: EmbeddingTaskType.RETRIEVAL_DOCUMENT
        });
      }
    }

    return await this.generateEmbeddingsBatch(requests);
  }

  /**
   * Extract text from captured content
   */
  private extractTextFromContent(content: CapturedContent): string {
    if (typeof content.content === 'string') {
      return content.content;
    }

    // For binary content, try to extract text from metadata
    if (content.metadata?.title) {
      return content.metadata.title;
    }

    return '';
  }

  /**
   * Queue embedding generation for later processing
   * 
   * @param request Embedding request to queue
   */
  queueEmbedding(request: EmbeddingRequest): void {
    this.processingQueue.push(request);
    logger.debug('EmbeddingGenerator', 'Embedding queued', {
      contentId: request.contentId,
      queueSize: this.processingQueue.length
    });

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process queued embedding requests
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.processingQueue.length > 0) {
        // Take a batch from the queue
        const batch = this.processingQueue.splice(0, this.config.batchSize);
        
        logger.info('EmbeddingGenerator', 'Processing queued batch', {
          batchSize: batch.length,
          remainingInQueue: this.processingQueue.length
        });

        await this.generateEmbeddingsBatch(batch);
      }
    } catch (error) {
      logger.error('EmbeddingGenerator', 'Error processing queue', { error });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get embedding for content from IndexedDB
   * 
   * @param contentId Content ID
   * @returns Embedding or null if not found
   */
  async getEmbedding(contentId: string): Promise<Embedding | null> {
    try {
      return await indexedDBManager.getEmbeddingByContentId(contentId);
    } catch (error) {
      logger.error('EmbeddingGenerator', 'Failed to get embedding', { contentId, error });
      return null;
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   * 
   * @param embedding1 First embedding vector
   * @param embedding2 Second embedding vector
   * @returns Similarity score (0-1)
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      const val1 = embedding1[i] ?? 0;
      const val2 = embedding2[i] ?? 0;
      dotProduct += val1 * val2;
      norm1 += val1 * val1;
      norm2 += val2 * val2;
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    
    if (magnitude === 0) {
      return 0;
    }

    return dotProduct / magnitude;
  }

  /**
   * Find similar content based on embedding
   * 
   * @param queryEmbedding Query embedding vector
   * @param topK Number of results to return
   * @returns Array of content IDs with similarity scores
   */
  async findSimilarContent(
    queryEmbedding: number[],
    topK: number = 10
  ): Promise<Array<{ contentId: string; similarity: number }>> {
    try {
      // Get all embeddings from IndexedDB
      const allEmbeddings = await indexedDBManager.getAllEmbeddings();

      // Calculate similarities
      const similarities = allEmbeddings.map(emb => ({
        contentId: emb.contentId,
        similarity: this.calculateSimilarity(queryEmbedding, emb.vector)
      }));

      // Sort by similarity (descending) and take top K
      similarities.sort((a, b) => b.similarity - a.similarity);

      return similarities.slice(0, topK);
    } catch (error) {
      logger.error('EmbeddingGenerator', 'Failed to find similar content', { error });
      throw error;
    }
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get queue status
   */
  getQueueStatus(): { queueSize: number; isProcessing: boolean } {
    return {
      queueSize: this.processingQueue.length,
      isProcessing: this.isProcessing
    };
  }

  /**
   * Clear the processing queue
   */
  clearQueue(): void {
    this.processingQueue = [];
    logger.info('EmbeddingGenerator', 'Queue cleared');
  }
}

// Export singleton instance
export const embeddingGenerator = new EmbeddingGenerator();
