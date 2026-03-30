/**
 * Cloud AI Manager - Google Gemini Cloud Integration
 *
 * This module provides integration with Google's cloud-based Gemini models
 * (Gemini 2.5 Flash and Gemini 2.5 Pro) through the Google Generative AI SDK.
 * It handles:
 * - API key management and validation
 * - Model selection (Flash vs Pro)
 * - Content sanitization (PII removal)
 * - Request/response handling
 * - Token usage tracking
 * - Performance monitoring
 * - Error handling and retry logic
 *
 * Requirements: 4.3, 4.5, 4.6, 13.1, 16.2
 */

import {
  GoogleGenerativeAI,
  GenerativeModel,
  type GenerateContentResult,
} from "@google/generative-ai";
import type { AIResponse } from "./ai-manager";
import {
  aiPerformanceMonitor,
  AIModel,
  AIOperation,
} from "./ai-performance-monitor";

/**
 * Gemini model types
 */
export enum GeminiModel {
  FLASH = "gemini-2.5-flash",
  PRO = "gemini-2.5-pro",
  FLASH_LITE = "gemini-2.5-flash-lite",
  FLASH_IMAGE = "gemini-2.5-flash-image",
}

/**
 * Cloud processing options
 */
export interface CloudProcessingOptions {
  model?: GeminiModel;
  temperature?: number;
  topK?: number;
  topP?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  stream?: boolean;
}

/**
 * PII patterns for sanitization
 */
const PII_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
  ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  url: /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
};

/**
 * Cloud AI Manager class
 */
export class CloudAIManager {
  private genAI: GoogleGenerativeAI | null = null;
  private apiKey: string | null = null;
  private initialized: boolean = false;

  /**
   * Initialize the Cloud AI Manager with API key
   *
   * @param apiKey Google Gemini API key
   */
  constructor(apiKey?: string) {
    this.apiKey = apiKey || this.getApiKeyFromEnv();

    if (this.apiKey) {
      this.initialize();
    }
  }

  /**
   * Get API key from environment variables
   */
  private getApiKeyFromEnv(): string | null {
    // In Vite, environment variables are accessed via import.meta.env
    try {
      return import.meta.env.VITE_GEMINI_API_KEY || null;
    } catch {
      // Fallback for non-Vite environments
      return null;
    }
  }

  /**
   * Initialize the Google Generative AI client
   */
  private initialize(): void {
    if (!this.apiKey) {
      console.warn(
        "Gemini API key not provided. Cloud AI features will be unavailable.",
      );
      return;
    }

    try {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.initialized = true;
      console.log("Cloud AI Manager initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Cloud AI Manager:", error);
      this.initialized = false;
    }
  }

  /**
   * Check if Cloud AI is available
   */
  isAvailable(): boolean {
    return this.initialized && this.genAI !== null;
  }

  /**
   * Set API key and reinitialize
   *
   * @param apiKey Google Gemini API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.initialize();
  }

  /**
   * Sanitize content by removing PII
   * Requirement 4.3: Content shall be sanitized before transmission
   *
   * @param content Content to sanitize
   * @returns Sanitized content
   */
  sanitizeContent(content: string): string {
    let sanitized = content;

    // Remove email addresses
    sanitized = sanitized.replace(PII_PATTERNS.email, "[EMAIL_REDACTED]");

    // Remove phone numbers
    sanitized = sanitized.replace(PII_PATTERNS.phone, "[PHONE_REDACTED]");

    // Remove SSN
    sanitized = sanitized.replace(PII_PATTERNS.ssn, "[SSN_REDACTED]");

    // Remove credit card numbers
    sanitized = sanitized.replace(PII_PATTERNS.creditCard, "[CARD_REDACTED]");

    // Remove IP addresses
    sanitized = sanitized.replace(PII_PATTERNS.ipAddress, "[IP_REDACTED]");

    // Optionally remove URLs (commented out by default as URLs might be needed)
    // sanitized = sanitized.replace(PII_PATTERNS.url, '[URL_REDACTED]');

    return sanitized;
  }

  /**
   * Get a generative model instance
   *
   * @param modelType Model type to use
   * @returns Generative model instance
   */
  private getModel(modelType: GeminiModel): GenerativeModel {
    if (!this.genAI) {
      throw new Error(
        "Cloud AI Manager not initialized. Please provide a valid API key.",
      );
    }

    return this.genAI.getGenerativeModel({ model: modelType });
  }

  /**
   * Process content with Gemini 2.5 Flash
   * Requirement 4.5: Use Gemini 2.5 Flash for large documents (> 5000 tokens)
   *
   * @param prompt Prompt to process
   * @param options Processing options
   * @returns AI response
   */
  async processWithFlash(
    prompt: string,
    options?: CloudProcessingOptions,
  ): Promise<AIResponse> {
    return this.processWithModel(GeminiModel.FLASH, prompt, options);
  }

  /**
   * Process content with Gemini 2.5 Pro
   * Requirement 4.6: Use Gemini 2.5 Pro for complex reasoning or code analysis
   *
   * @param prompt Prompt to process
   * @param options Processing options
   * @returns AI response
   */
  async processWithPro(
    prompt: string,
    options?: CloudProcessingOptions,
  ): Promise<AIResponse> {
    return this.processWithModel(GeminiModel.PRO, prompt, options);
  }

  /**
   * Process content with Gemini 2.5 Flash-Lite
   * For simple, high-volume tasks
   *
   * @param prompt Prompt to process
   * @param options Processing options
   * @returns AI response
   */
  async processWithFlashLite(
    prompt: string,
    options?: CloudProcessingOptions,
  ): Promise<AIResponse> {
    return this.processWithModel(GeminiModel.FLASH_LITE, prompt, options);
  }

  /**
   * Process content with specified model
   * Requirement 13.1: Track response times
   * Requirement 16.2: Monitor token usage
   *
   * @param modelType Model to use
   * @param prompt Prompt to process
   * @param options Processing options
   * @returns AI response
   */
  private async processWithModel(
    modelType: GeminiModel,
    prompt: string,
    options?: CloudProcessingOptions & { operation?: AIOperation },
  ): Promise<AIResponse> {
    const aiModel = this.mapGeminiModelToAIModel(modelType);
    const operation = options?.operation || AIOperation.GENERAL;

    // Use performance monitor to track the operation
    return aiPerformanceMonitor.measureOperation(
      aiModel,
      operation,
      async () => {
        const startTime = performance.now();

        if (!this.isAvailable()) {
          throw new Error(
            "Cloud AI not available. Please check API key configuration.",
          );
        }

        try {
          // Sanitize content before sending
          const sanitizedPrompt = this.sanitizeContent(prompt);

          // Get the model
          const model = this.getModel(options?.model || modelType);

          // Prepare generation config
          const generationConfig: any = {};
          if (options?.temperature !== undefined)
            generationConfig.temperature = options.temperature;
          if (options?.topK !== undefined) generationConfig.topK = options.topK;
          if (options?.topP !== undefined) generationConfig.topP = options.topP;
          if (options?.maxOutputTokens !== undefined)
            generationConfig.maxOutputTokens = options.maxOutputTokens;

          // Generate content
          const result: GenerateContentResult = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: sanitizedPrompt }] }],
            generationConfig:
              Object.keys(generationConfig).length > 0
                ? generationConfig
                : undefined,
          });

          const response = result.response;
          const text = response.text();

          // Calculate processing time
          const processingTime = performance.now() - startTime;

          // Extract token usage if available
          const tokensUsed = this.extractTokenUsage(result);

          // Map model type to source
          const source = this.mapModelToSource(modelType);

          return {
            result: text,
            source,
            confidence: 0.95, // Cloud models generally have high confidence
            processingTime,
            tokensUsed,
          };
        } catch (error) {
          console.error(`Error processing with ${modelType}:`, error);

          // Handle specific error types
          if (error instanceof Error) {
            if (error.message.includes("API key")) {
              throw new Error(
                "Invalid API key. Please check your Gemini API key configuration.",
              );
            } else if (error.message.includes("quota")) {
              throw new Error(
                "API quota exceeded. Please check your usage limits.",
              );
            } else if (error.message.includes("rate limit")) {
              throw new Error("Rate limit exceeded. Please try again later.");
            }
          }

          throw new Error(`Cloud AI processing failed: ${error}`);
        }
      },
    );
  }

  /**
   * Map GeminiModel to AIModel for monitoring
   */
  private mapGeminiModelToAIModel(modelType: GeminiModel): AIModel {
    switch (modelType) {
      case GeminiModel.FLASH:
        return AIModel.GEMINI_FLASH;
      case GeminiModel.FLASH_LITE:
        return AIModel.GEMINI_FLASH_LITE;
      case GeminiModel.PRO:
        return AIModel.GEMINI_PRO;
      default:
        return AIModel.GEMINI_FLASH;
    }
  }

  /**
   * Process content with streaming response
   * Requirement 13.1: Track response times for streaming operations
   *
   * @param modelType Model to use
   * @param prompt Prompt to process
   * @param options Processing options
   * @returns Async generator of response chunks
   */
  async *processWithModelStreaming(
    modelType: GeminiModel,
    prompt: string,
    options?: CloudProcessingOptions & { operation?: AIOperation },
  ): AsyncGenerator<string, void, unknown> {
    const startTime = performance.now();
    const aiModel = this.mapGeminiModelToAIModel(modelType);
    const operation = options?.operation || AIOperation.GENERAL;
    let totalTokens = 0;

    if (!this.isAvailable()) {
      throw new Error(
        "Cloud AI not available. Please check API key configuration.",
      );
    }

    try {
      // Sanitize content before sending
      const sanitizedPrompt = this.sanitizeContent(prompt);

      // Get the model
      const model = this.getModel(options?.model || modelType);

      // Prepare generation config
      const generationConfig: any = {};
      if (options?.temperature !== undefined)
        generationConfig.temperature = options.temperature;
      if (options?.topK !== undefined) generationConfig.topK = options.topK;
      if (options?.topP !== undefined) generationConfig.topP = options.topP;
      if (options?.maxOutputTokens !== undefined)
        generationConfig.maxOutputTokens = options.maxOutputTokens;

      // Generate content stream
      const result = await model.generateContentStream({
        contents: [{ role: "user", parts: [{ text: sanitizedPrompt }] }],
        generationConfig:
          Object.keys(generationConfig).length > 0
            ? generationConfig
            : undefined,
      });

      // Stream the response
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        yield chunkText;
      }

      // After streaming completes, get final token usage
      const finalResponse = await result.response;
      totalTokens = this.extractTokenUsage({
        response: finalResponse,
      } as GenerateContentResult);

      // Record successful operation
      const processingTime = performance.now() - startTime;
      aiPerformanceMonitor.recordOperation({
        success: true,
        model: aiModel,
        operation,
        responseTime: processingTime,
        tokensUsed: totalTokens,
        timestamp: Date.now(),
      });
    } catch (error) {
      // Record failed operation
      const processingTime = performance.now() - startTime;
      aiPerformanceMonitor.recordOperation({
        success: false,
        model: aiModel,
        operation,
        responseTime: processingTime,
        tokensUsed: totalTokens,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      });

      console.error(`Error streaming with ${modelType}:`, error);
      throw new Error(`Cloud AI streaming failed: ${error}`);
    }
  }

  /**
   * Process with Flash streaming
   */
  async *processWithFlashStreaming(
    prompt: string,
    options?: CloudProcessingOptions,
  ): AsyncGenerator<string, void, unknown> {
    yield* this.processWithModelStreaming(GeminiModel.FLASH, prompt, options);
  }

  /**
   * Process with Pro streaming
   */
  async *processWithProStreaming(
    prompt: string,
    options?: CloudProcessingOptions,
  ): AsyncGenerator<string, void, unknown> {
    yield* this.processWithModelStreaming(GeminiModel.PRO, prompt, options);
  }

  /**
   * Extract token usage from result
   *
   * @param result Generation result
   * @returns Token count
   */
  private extractTokenUsage(result: GenerateContentResult): number {
    try {
      // The usageMetadata contains token information
      const usage = result.response.usageMetadata;
      if (usage) {
        // Return total tokens (prompt + completion)
        return (
          (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0)
        );
      }
    } catch (error) {
      console.warn("Could not extract token usage:", error);
    }
    return 0;
  }

  /**
   * Map model type to AIResponse source
   */
  private mapModelToSource(
    modelType: GeminiModel,
  ): "gemini-flash" | "gemini-pro" | "gemini-nano" {
    switch (modelType) {
      case GeminiModel.FLASH:
      case GeminiModel.FLASH_LITE:
        return "gemini-flash";
      case GeminiModel.PRO:
        return "gemini-pro";
      default:
        return "gemini-flash";
    }
  }

  /**
   * Retry a function with exponential backoff
   *
   * @param fn Function to retry
   * @param maxRetries Maximum number of retries
   * @param baseDelay Base delay in milliseconds
   * @returns Result of the function
   */
  async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain errors
        if (error instanceof Error) {
          if (
            error.message.includes("API key") ||
            error.message.includes("Invalid")
          ) {
            throw error;
          }
        }

        // If this was the last attempt, throw the error
        if (attempt === maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(
          `Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`,
        );

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  /**
   * Process with automatic retry
   *
   * @param modelType Model to use
   * @param prompt Prompt to process
   * @param options Processing options
   * @returns AI response
   */
  async processWithRetry(
    modelType: GeminiModel,
    prompt: string,
    options?: CloudProcessingOptions,
  ): Promise<AIResponse> {
    return this.retryWithBackoff(
      () => this.processWithModel(modelType, prompt, options),
      3,
      1000,
    );
  }

  /**
   * Generate embedding for text using Gemini embedding model
   * Requirement 7.2: Generate embeddings for semantic search
   *
   * @param text Text to generate embedding for
   * @returns Embedding vector
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isAvailable()) {
      throw new Error(
        "Cloud AI not available. Please check API key configuration.",
      );
    }

    try {
      // Sanitize content before sending
      const sanitizedText = this.sanitizeContent(text);

      // Truncate text if too long (embedding models have token limits)
      const truncatedText = sanitizedText.slice(0, 10000);

      // Get embedding model
      const model = this.genAI!.getGenerativeModel({
        model: "text-embedding-004",
      });

      // Generate embedding
      const result = await model.embedContent(truncatedText);
      const embedding = result.embedding;

      if (!embedding || !embedding.values) {
        throw new Error("Failed to generate embedding: no values returned");
      }

      return embedding.values;
    } catch (error) {
      console.error("Error generating embedding:", error);
      throw new Error(`Embedding generation failed: ${error}`);
    }
  }

  /**
   * Generate image using Gemini 2.5 Flash Image model
   *
   * @param prompt Text prompt for image generation
   * @param options Processing options including aspect ratio
   * @returns Base64 encoded image data URL
   */
  async generateImage(
    prompt: string,
    options?: CloudProcessingOptions & { aspectRatio?: string },
  ): Promise<string | null> {
    if (!this.isAvailable()) {
      throw new Error("Cloud AI Manager not initialized");
    }

    const startTime = Date.now();

    try {
      const model = this.getModel(GeminiModel.FLASH_IMAGE);

      const config: any = {
        temperature: options?.temperature ?? 0.9,
        maxOutputTokens: options?.maxOutputTokens ?? 1000,
      };

      // Add aspect ratio if specified
      if (options?.aspectRatio) {
        config.imageConfig = {
          aspectRatio: options.aspectRatio,
        };
      }

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: config,
      });

      const response = result.response;

      // Extract image data from response
      for (const candidate of response.candidates || []) {
        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            const imageData = part.inlineData.data;
            const mimeType = part.inlineData.mimeType || "image/png";
            const dataUrl = `data:${mimeType};base64,${imageData}`;

            // Record operation
            aiPerformanceMonitor.recordOperation({
              timestamp: Date.now(),
              success: true,
              model: AIModel.GEMINI_FLASH,
              operation: AIOperation.GENERATE_IMAGE,
              responseTime: Date.now() - startTime,
              tokensUsed: 1290, // Fixed token count for image generation
            });

            return dataUrl;
          }
        }
      }

      // Record failed operation
      aiPerformanceMonitor.recordOperation({
        timestamp: Date.now(),
        success: false,
        model: AIModel.GEMINI_FLASH,
        operation: AIOperation.GENERATE_IMAGE,
        responseTime: Date.now() - startTime,
        tokensUsed: 0,
      });

      return null;
    } catch (error) {
      // Record failed operation
      aiPerformanceMonitor.recordOperation({
        timestamp: Date.now(),
        success: false,
        model: AIModel.GEMINI_FLASH,
        operation: AIOperation.GENERATE_IMAGE,
        responseTime: Date.now() - startTime,
        tokensUsed: 0,
      });

      console.error("Image generation failed:", error);
      throw error;
    }
  }
}

// Export singleton instance
const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
export const cloudAIManager = new CloudAIManager(geminiApiKey);
