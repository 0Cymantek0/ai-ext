/**
 * AI Manager - Gemini Nano Integration
 *
 * This module provides integration with Chrome's built-in Gemini Nano AI model
 * through the Prompt API. It handles:
 * - Availability detection
 * - Session initialization and lifecycle management
 * - Prompt processing (streaming and non-streaming)
 * - Token usage tracking
 * - Performance monitoring
 *
 * Requirements: 3.1, 3.2, 3.3, 13.1, 16.2
 */

import {
  aiPerformanceMonitor,
  AIModel,
  AIOperation,
} from "./ai-performance-monitor";

// Type definitions for Chrome's Prompt API
declare global {
  interface Window {
    ai?: {
      languageModel?: LanguageModelFactory;
    };
  }

  interface LanguageModelFactory {
    availability(): Promise<AIModelAvailability>;
    params(): Promise<AIModelParams>;
    create(options?: AISessionOptions): Promise<AISession>;
  }

  interface AIModelAvailability {
    available: "readily" | "after-download" | "no";
  }

  interface AIModelParams {
    defaultTopK: number;
    maxTopK: number;
    defaultTemperature: number;
    maxTemperature: number;
  }

  interface AISessionOptions {
    topK?: number;
    temperature?: number;
    signal?: AbortSignal;
    initialPrompts?: AIPrompt[];
    monitor?: (monitor: AIDownloadMonitor) => void;
  }

  interface AIPrompt {
    role: "system" | "user" | "assistant";
    content: string;
  }

  interface AIDownloadMonitor {
    addEventListener(
      type: "downloadprogress",
      listener: (event: AIDownloadProgressEvent) => void,
    ): void;
    removeEventListener(
      type: "downloadprogress",
      listener: (event: AIDownloadProgressEvent) => void,
    ): void;
    dispatchEvent(event: Event): boolean;
  }

  interface AIDownloadProgressEvent extends Event {
    loaded: number;
    total: number;
  }

  interface AISession {
    prompt(input: string, options?: AIPromptOptions): Promise<string>;
    promptStreaming(
      input: string,
      options?: AIPromptOptions,
    ): ReadableStream<string>;
    clone(options?: { signal?: AbortSignal }): Promise<AISession>;
    destroy(): void;
    inputUsage: number;
    inputQuota: number;
  }

  interface AIPromptOptions {
    signal?: AbortSignal;
  }

  const LanguageModel: LanguageModelFactory;
}

/**
 * Availability status for Gemini Nano
 */
export type ModelAvailability = "readily" | "after-download" | "no";

/**
 * Processing location for AI tasks
 */
export type ProcessingLocation = "gemini-nano" | "cloud";

/**
 * AI session configuration
 */
export interface SessionConfig {
  topK?: number;
  temperature?: number;
  initialPrompts?: AIPrompt[];
  signal?: AbortSignal;
}

/**
 * AI response with metadata
 */
export interface AIResponse {
  result: string;
  source: "gemini-nano" | "gemini-flash" | "gemini-pro";
  confidence: number;
  processingTime: number;
  tokensUsed: number;
}

/**
 * Processing options for AI tasks
 */
export interface ProcessingOptions {
  preferLocal: boolean;
  taskType: "summarize" | "embed" | "translate" | "alt-text" | "general";
  priority: "low" | "normal" | "high";
  maxTokens?: number;
  signal?: AbortSignal;
}

/**
 * Session usage information
 */
export interface SessionUsage {
  used: number;
  quota: number;
  percentage: number;
}

/**
 * Download progress information
 */
export interface DownloadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

/**
 * AI Manager class for Gemini Nano integration
 */
export class AIManager {
  private sessions: Map<string, AISession> = new Map();
  private modelParams: AIModelParams | null = null;
  private availability: ModelAvailability | null = null;

  /**
   * Check if Gemini Nano is available on the device
   * Requirement 3.1: Check for Gemini Nano availability on initialization
   */
  async checkModelAvailability(): Promise<ModelAvailability> {
    try {
      // Check if the Prompt API is available
      if (!("LanguageModel" in globalThis)) {
        console.warn("Prompt API not available in this browser");
        this.availability = "no";
        return "no";
      }

      const result = await LanguageModel.availability();

      // Map the API response to our type
      if (result.available === "readily") {
        this.availability = "readily";
        return "readily";
      } else if (result.available === "after-download") {
        this.availability = "after-download";
        return "after-download";
      } else {
        this.availability = "no";
        return "no";
      }
    } catch (error) {
      console.error("Error checking model availability:", error);
      this.availability = "no";
      return "no";
    }
  }

  /**
   * Get model parameters (topK, temperature limits)
   */
  async getModelParams(): Promise<AIModelParams> {
    if (this.modelParams) {
      return this.modelParams;
    }

    try {
      if (!("LanguageModel" in globalThis)) {
        throw new Error("Prompt API not available");
      }

      this.modelParams = await LanguageModel.params();
      return this.modelParams;
    } catch (error) {
      console.error("Error getting model params:", error);
      throw new Error("Failed to get model parameters");
    }
  }

  /**
   * Initialize Gemini Nano and create a session
   * Requirement 3.2: Initialize Gemini Nano if available
   *
   * @param config Session configuration options
   * @param onDownloadProgress Optional callback for download progress
   * @returns Session ID
   */
  async initializeGeminiNano(
    config?: SessionConfig,
    onDownloadProgress?: (progress: DownloadProgress) => void,
  ): Promise<string> {
    const startTime = performance.now();

    try {
      // Check availability first
      const availability = await this.checkModelAvailability();

      if (availability === "no") {
        throw new Error("Gemini Nano is not available on this device");
      }

      // Get model parameters
      const params = await this.getModelParams();

      // Prepare session options
      const options: AISessionOptions = {
        topK: config?.topK ?? params.defaultTopK,
        temperature: config?.temperature ?? params.defaultTemperature,
        ...(config?.signal && { signal: config.signal }),
        ...(config?.initialPrompts && {
          initialPrompts: config.initialPrompts,
        }),
      };

      // Add download monitor if callback provided
      if (onDownloadProgress) {
        options.monitor = (monitor: AIDownloadMonitor) => {
          monitor.addEventListener("downloadprogress", (event) => {
            onDownloadProgress({
              loaded: event.loaded,
              total: event.total,
              percentage: event.loaded * 100,
            });
          });
        };
      }

      // Create the session
      const session = await LanguageModel.create(options);

      // Generate session ID
      const sessionId = this.generateSessionId();
      this.sessions.set(sessionId, session);

      const initTime = performance.now() - startTime;
      console.log(
        `Gemini Nano session initialized in ${initTime.toFixed(2)}ms`,
      );

      return sessionId;
    } catch (error) {
      console.error("Error initializing Gemini Nano:", error);
      throw new Error(`Failed to initialize Gemini Nano: ${error}`);
    }
  }

  /**
   * Create a new session with custom configuration
   *
   * @param config Session configuration
   * @returns Session ID
   */
  async createSession(config?: SessionConfig): Promise<string> {
    return this.initializeGeminiNano(config);
  }

  /**
   * Process a prompt with Gemini Nano (non-streaming)
   * Requirement 3.3: Process content locally
   * Requirement 13.1: Track response times
   * Requirement 16.2: Monitor token usage
   *
   * @param sessionId Session ID
   * @param prompt The prompt text
   * @param options Processing options
   * @returns AI response
   */
  async processPrompt(
    sessionId: string,
    prompt: string,
    options?: { signal?: AbortSignal; operation?: AIOperation },
  ): Promise<string> {
    const operation = options?.operation || AIOperation.GENERAL;

    // Use performance monitor to track the operation
    return aiPerformanceMonitor.measureOperation(
      AIModel.GEMINI_NANO,
      operation,
      async () => {
        const startTime = performance.now();

        try {
          const session = this.sessions.get(sessionId);
          if (!session) {
            throw new Error(`Session ${sessionId} not found`);
          }

          // Process the prompt
          const result = await session.prompt(prompt, options);

          const processingTime = performance.now() - startTime;

          // Requirement 3.9: Response time should be under 500ms for simple tasks
          if (processingTime > 500) {
            console.warn(
              `Processing took ${processingTime.toFixed(2)}ms (>500ms threshold)`,
            );
          }

          // Get token usage
          const usage = this.getSessionUsage(sessionId);

          // Return result with token info for monitoring
          return result;
        } catch (error) {
          console.error("Error processing prompt:", error);
          throw new Error(`Failed to process prompt: ${error}`);
        }
      },
    );
  }

  /**
   * Process a prompt with streaming response
   * Requirement 13.1: Track response times for streaming operations
   *
   * @param sessionId Session ID
   * @param prompt The prompt text
   * @param options Processing options
   * @returns ReadableStream of response chunks
   */
  async processPromptStreaming(
    sessionId: string,
    prompt: string,
    options?: { signal?: AbortSignal; operation?: AIOperation },
  ): Promise<ReadableStream<string>> {
    const startTime = performance.now();
    const operation = options?.operation || AIOperation.GENERAL;

    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const stream = session.promptStreaming(prompt, options);

      // Wrap the stream to track completion time and tokens
      const transformedStream = new ReadableStream<string>({
        async start(controller) {
          const reader = stream.getReader();
          let totalChunks = 0;

          try {
            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                // Stream completed - record metrics
                const processingTime = performance.now() - startTime;
                const usage = session.inputUsage || 0;

                aiPerformanceMonitor.recordOperation({
                  success: true,
                  model: AIModel.GEMINI_NANO,
                  operation,
                  responseTime: processingTime,
                  tokensUsed: usage,
                  timestamp: Date.now(),
                });

                controller.close();
                break;
              }

              totalChunks++;
              controller.enqueue(value);
            }
          } catch (error) {
            // Stream failed - record error
            const processingTime = performance.now() - startTime;

            aiPerformanceMonitor.recordOperation({
              success: false,
              model: AIModel.GEMINI_NANO,
              operation,
              responseTime: processingTime,
              tokensUsed: 0,
              error: error instanceof Error ? error.message : "Unknown error",
              timestamp: Date.now(),
            });

            controller.error(error);
          } finally {
            reader.releaseLock();
          }
        },
      });

      return transformedStream;
    } catch (error) {
      console.error("Error processing streaming prompt:", error);

      // Record failed operation
      aiPerformanceMonitor.recordOperation({
        success: false,
        model: AIModel.GEMINI_NANO,
        operation,
        responseTime: performance.now() - startTime,
        tokensUsed: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      });

      throw new Error(`Failed to process streaming prompt: ${error}`);
    }
  }

  /**
   * Clone an existing session
   * Preserves initial prompts but resets conversation context
   *
   * @param sessionId Source session ID
   * @param signal Optional abort signal
   * @returns New session ID
   */
  async cloneSession(sessionId: string, signal?: AbortSignal): Promise<string> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const clonedSession = await session.clone(
        signal ? { signal } : undefined,
      );
      const newSessionId = this.generateSessionId();
      this.sessions.set(newSessionId, clonedSession);

      console.log(`Session ${sessionId} cloned to ${newSessionId}`);
      return newSessionId;
    } catch (error) {
      console.error("Error cloning session:", error);
      throw new Error(`Failed to clone session: ${error}`);
    }
  }

  /**
   * Destroy a session and free resources
   *
   * @param sessionId Session ID to destroy
   */
  destroySession(sessionId: string): void {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        console.warn(`Session ${sessionId} not found`);
        return;
      }

      session.destroy();
      this.sessions.delete(sessionId);
      console.log(`Session ${sessionId} destroyed`);
    } catch (error) {
      console.error("Error destroying session:", error);
    }
  }

  /**
   * Get session usage information
   *
   * @param sessionId Session ID
   * @returns Usage information
   */
  getSessionUsage(sessionId: string): SessionUsage {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return {
      used: session.inputUsage,
      quota: session.inputQuota,
      percentage: (session.inputUsage / session.inputQuota) * 100,
    };
  }

  /**
   * Check if a session exists
   *
   * @param sessionId Session ID
   * @returns True if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get all active session IDs
   *
   * @returns Array of session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Destroy all sessions
   */
  destroyAllSessions(): void {
    for (const sessionId of this.sessions.keys()) {
      this.destroySession(sessionId);
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const aiManager = new AIManager();
