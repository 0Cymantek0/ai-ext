/**
 * Local Embedding Engine
 * 
 * Provides 100% local, on-device semantic embeddings using TensorFlow.js
 * Universal Sentence Encoder. No cloud API required.
 * 
 * Requirements: 7.2 (Local-first embedding generation)
 */

import { logger } from "./monitoring.js";
import * as tf from '@tensorflow/tfjs';
import * as use from '@tensorflow-models/universal-sentence-encoder';

export interface LocalEmbeddingOptions {
  batchSize?: number;
  maxRetries?: number;
}

export class LocalEmbeddingEngine {
  private model: use.UniversalSentenceEncoder | null = null;
  private modelLoading: Promise<use.UniversalSentenceEncoder> | null = null;
  private embeddingCache = new Map<string, number[]>();
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly EMBEDDING_DIM = 512; // USE outputs 512-dim vectors

  /**
   * Load the Universal Sentence Encoder model
   * Model is ~50MB and loads on-demand
   */
  private async loadModel(): Promise<use.UniversalSentenceEncoder> {
    // Return existing model if already loaded
    if (this.model) {
      return this.model;
    }

    // Return existing loading promise if already loading
    if (this.modelLoading) {
      return this.modelLoading;
    }

    // Start loading the model
    this.modelLoading = (async () => {
      try {
        logger.info("LocalEmbeddingEngine", "Loading Universal Sentence Encoder model...");
        
        // Set TensorFlow.js backend to WebGL for GPU acceleration
        await tf.setBackend('webgl');
        await tf.ready();
        
        // Load the Universal Sentence Encoder model
        const loadedModel = await use.load();
        
        this.model = loadedModel;
        this.modelLoading = null;
        
        logger.info("LocalEmbeddingEngine", "Model loaded successfully", {
          backend: tf.getBackend(),
          embeddingDim: this.EMBEDDING_DIM,
        });
        
        return loadedModel;
      } catch (error) {
        this.modelLoading = null;
        logger.error("LocalEmbeddingEngine", "Failed to load model", { error });
        throw error;
      }
    })();

    return this.modelLoading;
  }

  /**
   * Generate embedding for a single text using Universal Sentence Encoder
   */
  async generateEmbedding(text: string, options: LocalEmbeddingOptions = {}): Promise<number[]> {
    // Check cache first
    if (this.embeddingCache.has(text)) {
      logger.debug("LocalEmbeddingEngine", "Cache hit", {
        textLength: text.length,
      });
      return this.embeddingCache.get(text)!;
    }

    try {
      // Load model if not already loaded
      const model = await this.loadModel();
      
      // Generate embedding
      const embeddings = await model.embed([text]);
      const embeddingArray = await embeddings.array();
      
      // Extract the embedding vector
      const embedding = embeddingArray[0] as number[];
      
      // Clean up tensor to prevent memory leaks
      embeddings.dispose();
      
      // Validate embedding
      if (!embedding || embedding.length !== this.EMBEDDING_DIM) {
        throw new Error(`Invalid embedding dimension: ${embedding?.length}, expected ${this.EMBEDDING_DIM}`);
      }
      
      // Cache the result
      this.embeddingCache.set(text, embedding);
      
      // Limit cache size (LRU eviction)
      if (this.embeddingCache.size > this.MAX_CACHE_SIZE) {
        const firstKey = this.embeddingCache.keys().next().value;
        this.embeddingCache.delete(firstKey);
      }
      
      logger.debug("LocalEmbeddingEngine", "Generated embedding", {
        textLength: text.length,
        embeddingDim: embedding.length,
      });
      
      return embedding;
    } catch (error) {
      logger.error("LocalEmbeddingEngine", "Failed to generate embedding", {
        error,
        textLength: text.length,
      });
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch (more efficient)
   */
  async generateEmbeddingsBatch(
    texts: string[],
    options: LocalEmbeddingOptions = {}
  ): Promise<number[][]> {
    const { batchSize = 32 } = options;
    const embeddings: number[][] = [];

    try {
      // Load model if not already loaded
      const model = await this.loadModel();
      
      // Process in batches to avoid memory issues
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        
        // Check cache for each text
        const uncachedTexts: string[] = [];
        const uncachedIndices: number[] = [];
        const batchEmbeddings: (number[] | null)[] = new Array(batch.length).fill(null);
        
        batch.forEach((text, idx) => {
          if (this.embeddingCache.has(text)) {
            batchEmbeddings[idx] = this.embeddingCache.get(text)!;
          } else {
            uncachedTexts.push(text);
            uncachedIndices.push(idx);
          }
        });
        
        // Generate embeddings for uncached texts
        if (uncachedTexts.length > 0) {
          const embeddingsTensor = await model.embed(uncachedTexts);
          const embeddingsArray = await embeddingsTensor.array();
          
          // Clean up tensor
          embeddingsTensor.dispose();
          
          // Store in cache and batch results
          uncachedIndices.forEach((idx, arrayIdx) => {
            const embedding = embeddingsArray[arrayIdx] as number[];
            const text = uncachedTexts[arrayIdx]!;
            
            // Cache the embedding
            this.embeddingCache.set(text, embedding);
            batchEmbeddings[idx] = embedding;
          });
        }
        
        // Add batch results to final embeddings
        embeddings.push(...(batchEmbeddings as number[][]));
        
        logger.info("LocalEmbeddingEngine", "Batch processed", {
          batchIndex: Math.floor(i / batchSize),
          batchSize: batch.length,
          cached: batch.length - uncachedTexts.length,
          generated: uncachedTexts.length,
          totalTexts: texts.length,
        });
      }
      
      // Limit cache size
      while (this.embeddingCache.size > this.MAX_CACHE_SIZE) {
        const firstKey = this.embeddingCache.keys().next().value;
        this.embeddingCache.delete(firstKey);
      }
      
      return embeddings;
    } catch (error) {
      logger.error("LocalEmbeddingEngine", "Batch embedding failed", {
        error,
        textsCount: texts.length,
      });
      throw error;
    }
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
    logger.info("LocalEmbeddingEngine", "Cache cleared");
  }

  /**
   * Unload the model to free memory
   */
  async unloadModel(): Promise<void> {
    if (this.model) {
      // TensorFlow.js models don't have explicit dispose, but we can clear the reference
      this.model = null;
      this.modelLoading = null;
      
      // Dispose all tensors
      tf.disposeVariables();
      
      logger.info("LocalEmbeddingEngine", "Model unloaded");
    }
  }

  /**
   * Get model status
   */
  isModelLoaded(): boolean {
    return this.model !== null;
  }

  /**
   * Get embedding dimension
   */
  getEmbeddingDimension(): number {
    return this.EMBEDDING_DIM;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.embeddingCache.size,
      maxSize: this.MAX_CACHE_SIZE,
      hitRate: 0, // Would need to track hits/misses for accurate rate
    };
  }
}

export const localEmbeddingEngine = new LocalEmbeddingEngine();
