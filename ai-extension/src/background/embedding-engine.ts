/**
 * Embedding Engine
 * 
 * Manages embedding generation with Nano-first approach, batching, and rate limiting.
 * Falls back to cloud when Nano is unavailable.
 * 
 * Requirements: 7.2 (Embedding generation for semantic search)
 */

import { logger } from "./monitoring.js";
import { AIManager } from "./ai-manager.js";
import { CloudAIManager } from "./cloud-ai-manager.js";
import { localEmbeddingEngine } from "./local-embedding-engine.js";

export interface EmbeddingOptions {
  preferNano?: boolean;
  batchSize?: number;
  maxRetries?: number;
}

export class EmbeddingEngine {
  private aiManager: AIManager;
  private cloudAIManager: CloudAIManager;
  private embeddingCache = new Map<string, number[]>();
  private readonly MAX_CACHE_SIZE = 500;
  private readonly EMBEDDING_SYSTEM_PROMPT = `You are an embedding generation system. Your task is to understand the semantic meaning of text and represent it as a vector. Focus on extracting key concepts, themes, and meaningful information.`;
  
  // Rate limiting
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly MAX_REQUESTS_PER_WINDOW = 100;
  
  // Nano session management
  private nanoSessionId: string | null = null;
  private nanoAvailable: boolean | null = null;

  constructor(aiManager?: AIManager, cloudAIManager?: CloudAIManager) {
    this.aiManager = aiManager || new AIManager();
    this.cloudAIManager = cloudAIManager || new CloudAIManager();
  }

  /**
   * Check if Gemini Nano is available for embeddings
   */
  private async checkNanoAvailability(): Promise<boolean> {
    if (this.nanoAvailable !== null) {
      return this.nanoAvailable;
    }

    try {
      const availability = await this.aiManager.checkModelAvailability();
      this.nanoAvailable = availability === "readily";
      
      logger.info("EmbeddingEngine", "Nano availability checked", {
        available: this.nanoAvailable,
      });
      
      return this.nanoAvailable;
    } catch (error) {
      logger.warn("EmbeddingEngine", "Failed to check Nano availability", { error });
      this.nanoAvailable = false;
      return false;
    }
  }

  /**
   * Get or create Nano session for embeddings
   */
  private async getNanoSession(): Promise<string> {
    if (this.nanoSessionId) {
      return this.nanoSessionId;
    }

    try {
      this.nanoSessionId = await this.aiManager.createSession();
      
      logger.info("EmbeddingEngine", "Nano embedding session created", {
        sessionId: this.nanoSessionId,
      });
      
      return this.nanoSessionId;
    } catch (error) {
      logger.error("EmbeddingEngine", "Failed to create Nano session", { error });
      throw error;
    }
  }

  /**
   * Check and enforce rate limiting
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Reset window if needed
    if (now - this.windowStart > this.RATE_LIMIT_WINDOW) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    // Check if rate limit exceeded
    if (this.requestCount >= this.MAX_REQUESTS_PER_WINDOW) {
      const waitTime = this.RATE_LIMIT_WINDOW - (now - this.windowStart);
      
      logger.warn("EmbeddingEngine", "Rate limit reached, waiting", {
        waitTime,
        requestCount: this.requestCount,
      });
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Reset after waiting
      this.requestCount = 0;
      this.windowStart = Date.now();
    }

    this.requestCount++;
  }

  /**
   * Generate embedding using Nano (attempted via JSON prompt)
   * Note: Gemini Nano doesn't have a native embedding API, so we try to coax
   * embeddings via structured JSON output. This is experimental and may not
   * produce high-quality semantic embeddings.
   */
  private async generateWithNano(text: string): Promise<number[]> {
    try {
      const sessionId = await this.getNanoSession();
      
      // Attempt to get structured embedding via JSON prompt
      const prompt = `Generate a semantic embedding vector for the following text. Return ONLY a JSON object with this exact structure: {"embedding": [array of 768 numbers between -1 and 1]}. The vector should be normalized (unit length). Text: "${text.slice(0, 500)}"`;
      
      const response = await this.aiManager.processPrompt(sessionId, prompt);
      
      // Try to parse JSON response
      const jsonMatch = response.match(/\{[^}]*"embedding"[^}]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.embedding) && parsed.embedding.length === 768) {
          // Normalize the vector
          const magnitude = Math.sqrt(parsed.embedding.reduce((sum: number, val: number) => sum + val * val, 0));
          if (magnitude > 0) {
            return parsed.embedding.map((val: number) => val / magnitude);
          }
        }
      }
      
      // If JSON parsing fails, fall back to hash-based
      throw new Error("Failed to extract valid embedding from Nano response");
    } catch (error) {
      logger.warn("EmbeddingEngine", "Nano embedding extraction failed", { error });
      throw error;
    }
  }

  /**
   * Generate embedding using cloud API (fallback)
   */
  private async generateWithCloud(text: string): Promise<number[]> {
    if (!this.cloudAIManager.isAvailable()) {
      throw new Error("Cloud AI not available for embedding generation");
    }

    return await this.cloudAIManager.generateEmbedding(text);
  }

  /**
   * Generate a single embedding with LOCAL-FIRST approach
   * Uses TensorFlow.js Universal Sentence Encoder for 100% on-device embeddings
   * Falls back to cloud only if local fails, then hash as last resort
   */
  async generateEmbedding(
    text: string,
    options: EmbeddingOptions = {}
  ): Promise<number[]> {
    const { preferNano = true } = options; // Default to local for privacy

    // Check cache first
    if (this.embeddingCache.has(text)) {
      logger.debug("EmbeddingEngine", "Cache hit", {
        textLength: text.length,
      });
      return this.embeddingCache.get(text)!;
    }

    // Check rate limit
    await this.checkRateLimit();

    let embedding: number[];

    try {
      // LOCAL-FIRST: Try TensorFlow.js Universal Sentence Encoder (100% on-device)
      try {
        embedding = await localEmbeddingEngine.generateEmbedding(text);
        
        logger.debug("EmbeddingEngine", "Generated with local TF.js USE", {
          textLength: text.length,
          embeddingDim: embedding.length,
        });
      } catch (localError) {
        logger.warn("EmbeddingEngine", "Local embedding failed, trying fallbacks", {
          error: localError,
        });
        
        // Fallback 1: Try cloud if available and not preferring local-only
        if (!preferNano && this.cloudAIManager.isAvailable()) {
          try {
            embedding = await this.generateWithCloud(text);
            
            logger.debug("EmbeddingEngine", "Generated with cloud fallback", {
              textLength: text.length,
              embeddingDim: embedding.length,
            });
          } catch (cloudError) {
            logger.warn("EmbeddingEngine", "Cloud fallback failed, using hash", {
              error: cloudError,
            });
            embedding = this.generateHashEmbedding(text);
          }
        } else {
          // Fallback 2: Hash-based embedding (last resort)
          logger.warn("EmbeddingEngine", "Using hash-based fallback embedding");
          embedding = this.generateHashEmbedding(text);
        }
      }

      // Validate embedding (512 for USE, 768 for cloud, 768 for hash)
      const validDimensions = [512, 768];
      if (!embedding || !validDimensions.includes(embedding.length)) {
        throw new Error(`Invalid embedding dimension: ${embedding?.length}, expected ${validDimensions.join(' or ')}`);
      }

      // Cache the result
      this.embeddingCache.set(text, embedding);
      
      // Limit cache size
      if (this.embeddingCache.size > this.MAX_CACHE_SIZE) {
        const firstKey = this.embeddingCache.keys().next().value;
        this.embeddingCache.delete(firstKey);
      }

      return embedding;
    } catch (error) {
      logger.error("EmbeddingEngine", "All embedding methods failed", {
        error,
        textLength: text.length,
      });
      
      // Last resort: hash-based embedding
      logger.warn("EmbeddingEngine", "Using hash-based embedding as last resort");
      return this.generateHashEmbedding(text);
    }
  }

  /**
   * Generate embeddings in batch (more efficient)
   * Uses local engine's batch processing for better performance
   */
  async generateEmbeddingsBatch(
    texts: string[],
    options: EmbeddingOptions = {}
  ): Promise<number[][]> {
    const { batchSize = 32, preferNano = true } = options;

    try {
      // LOCAL-FIRST: Use TensorFlow.js batch processing (most efficient)
      const embeddings = await localEmbeddingEngine.generateEmbeddingsBatch(texts, {
        batchSize,
      });
      
      logger.info("EmbeddingEngine", "Batch generated with local TF.js", {
        count: embeddings.length,
      });
      
      return embeddings;
    } catch (localError) {
      logger.warn("EmbeddingEngine", "Local batch failed, falling back to individual", {
        error: localError,
      });
      
      // Fallback: Process individually
      const embeddings: number[][] = [];
      
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        
        logger.info("EmbeddingEngine", "Processing fallback batch", {
          batchIndex: Math.floor(i / batchSize),
          batchSize: batch.length,
          totalTexts: texts.length,
        });

        // Generate embeddings for batch
        const batchEmbeddings = await Promise.all(
          batch.map(text => this.generateEmbedding(text, options))
        );

        embeddings.push(...batchEmbeddings);
      }

      return embeddings;
    }
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
    logger.info("EmbeddingEngine", "Cache cleared");
  }

  /**
   * Destroy Nano session (cleanup)
   */
  async destroy(): Promise<void> {
    if (this.nanoSessionId) {
      try {
        await this.aiManager.destroySession(this.nanoSessionId);
        this.nanoSessionId = null;
        
        logger.info("EmbeddingEngine", "Nano session destroyed");
      } catch (error) {
        logger.warn("EmbeddingEngine", "Failed to destroy Nano session", { error });
      }
    }
  }

  /**
   * Generate hash-based embedding as fallback
   * Uses character n-grams to create a deterministic vector representation
   * This is NOT a semantic embedding but provides basic similarity matching
   */
  private generateHashEmbedding(text: string): number[] {
    const vector: number[] = new Array(768).fill(0);
    const normalizedText = text.toLowerCase().trim();
    
    // Use character trigrams for better semantic approximation
    for (let i = 0; i < normalizedText.length - 2; i++) {
      const trigram = normalizedText.slice(i, i + 3);
      let hash = 0;
      for (let j = 0; j < trigram.length; j++) {
        hash = ((hash << 5) - hash) + trigram.charCodeAt(j);
        hash = hash & hash; // Convert to 32-bit integer
      }
      const index = Math.abs(hash) % 768;
      vector[index] = (vector[index] || 0) + 1;
    }

    // Apply TF normalization
    const maxFreq = Math.max(...vector);
    if (maxFreq > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] = (vector[i] || 0) / maxFreq;
      }
    }

    // L2 normalize
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
  }
}

export const embeddingEngine = new EmbeddingEngine();
