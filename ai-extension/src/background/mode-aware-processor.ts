/**
 * Mode-Aware Processor
 * 
 * Handles AI processing based on mode (Ask vs AI Pocket) with different
 * context management and RAG integration strategies.
 * 
 * Requirements: 8.2.1, 8.2.2, 8.2.3, 8.2.4, 8.2.5, 8.2.6, 8.2.7, 36, 38
 */

import { logger } from "./monitoring.js";
import { HybridAIEngine, TaskOperation, type Task, type Content } from "./hybrid-ai-engine.js";
import { conversationContextLoader, type ConversationContext } from "./conversation-context-loader.js";
import { contextBundleBuilder, serializeContextBundle, type ContextBundle } from "./context-bundle.js";
import type { AIManager } from "./ai-manager.js";
import type { CloudAIManager } from "./cloud-ai-manager.js";

/**
 * AI processing mode
 */
export type AIMode = "ask" | "ai-pocket";

/**
 * Mode-aware request
 */
export interface ModeAwareRequest {
  prompt: string;
  mode: AIMode;
  conversationId?: string | undefined;
  pocketId?: string | undefined;
  preferLocal?: boolean | undefined;
  model?: "nano" | "flash" | "pro" | undefined;
  autoContext?: boolean | undefined;
}

/**
 * Mode-aware response
 */
export interface ModeAwareResponse {
  content: string;
  source: "gemini-nano" | "gemini-flash" | "gemini-pro";
  mode: AIMode;
  contextUsed: string[]; // List of context signals used
  tokensUsed: number;
  processingTime: number;
}

/**
 * Processing pipeline result
 */
interface PipelineResult {
  task: Task;
  contextBundle?: ContextBundle | undefined;
  conversationContext?: ConversationContext | undefined;
}

/**
 * Mode-Aware Processor
 * Routes requests to appropriate processing pipelines based on mode
 */
export class ModeAwareProcessor {
  private hybridEngine: HybridAIEngine;

  constructor(aiManager: AIManager, cloudAIManager: CloudAIManager) {
    this.hybridEngine = new HybridAIEngine(aiManager, cloudAIManager);
  }

  /**
   * Process a request with mode-aware routing
   * 
   * Requirement 8.2.1: Provide general conversational assistance in Ask mode
   * Requirement 8.2.2: Provide content-specific queries in AI Pocket mode
   * Requirement 8.2.3: Route requests to appropriate processing pipeline
   * 
   * @param request Mode-aware request
   * @returns Async generator yielding response chunks
   */
  async *processRequest(
    request: ModeAwareRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<string, ModeAwareResponse, undefined> {
    const startTime = performance.now();
    
    logger.info("ModeAwareProcessor", "Processing request", {
      mode: request.mode,
      conversationId: request.conversationId,
      pocketId: request.pocketId,
      autoContext: request.autoContext,
    });

    try {
      // Route to appropriate pipeline based on mode
      let pipelineResult: PipelineResult;
      
      if (request.mode === "ai-pocket") {
        // Requirement 8.2.4: AI Pocket mode pipeline with RAG processing
        pipelineResult = await this.buildAIPocketPipeline(request);
      } else {
        // Requirement 8.2.5: Ask mode pipeline for general conversation
        pipelineResult = await this.buildAskPipeline(request);
      }

      // Process with hybrid AI engine
      const streamGenerator = this.hybridEngine.processContentStreaming(
        pipelineResult.task,
        {
          preferLocal: request.preferLocal ?? true,
          taskType: "general",
          priority: "normal",
          ...(signal && { signal }),
        },
        async (decision) => {
          // Consent callback - for now, auto-approve
          // In production, this should prompt the user
          logger.info("ModeAwareProcessor", "Cloud consent required", {
            location: decision.location,
            reason: decision.reason,
          });
          return true;
        },
      );

      // Stream response chunks
      let fullResponse = "";
      for await (const chunk of streamGenerator) {
        fullResponse += chunk;
        yield chunk;
      }

      // Calculate metrics
      const processingTime = performance.now() - startTime;
      const tokensUsed = this.estimateTokens(fullResponse);
      const source = request.preferLocal ? "gemini-nano" : "gemini-flash";

      // Build final response
      const response: ModeAwareResponse = {
        content: fullResponse,
        source,
        mode: request.mode,
        contextUsed: pipelineResult.contextBundle?.signals || [],
        tokensUsed,
        processingTime,
      };

      logger.info("ModeAwareProcessor", "Request processed successfully", {
        mode: request.mode,
        tokensUsed,
        processingTime: `${processingTime.toFixed(2)}ms`,
        contextSignals: response.contextUsed,
      });

      return response;
    } catch (error) {
      logger.error("ModeAwareProcessor", "Request processing failed", {
        mode: request.mode,
        error: error instanceof Error ? error.message : String(error),
      });

      // Requirement 8.2.7: Fallback to Ask mode on failure
      if (request.mode === "ai-pocket") {
        logger.info("ModeAwareProcessor", "Falling back to Ask mode");
        
        // Retry with Ask mode
        const fallbackRequest: ModeAwareRequest = {
          ...request,
          mode: "ask",
        };

        yield* this.processRequest(fallbackRequest, signal);
        return {
          content: "",
          source: "gemini-nano",
          mode: "ask",
          contextUsed: ["fallback"],
          tokensUsed: 0,
          processingTime: 0,
        };
      }

      throw error;
    }
  }

  /**
   * Build Ask mode pipeline
   * 
   * Requirement 8.2.5: Ask mode uses conversation history and general context
   * 
   * @param request Mode-aware request
   * @returns Pipeline result with task and context
   */
  private async buildAskPipeline(request: ModeAwareRequest): Promise<PipelineResult> {
    logger.info("ModeAwareProcessor", "Building Ask mode pipeline");

    // Load conversation context if available
    let conversationContext: ConversationContext | null = null;
    let contextString = "";

    if (request.conversationId) {
      try {
        conversationContext = await conversationContextLoader.buildConversationContext(
          request.conversationId
        );
        contextString = conversationContextLoader.formatContextAsString(conversationContext);
        
        logger.info("ModeAwareProcessor", "Loaded conversation context", {
          messageCount: conversationContext.messages.length,
          totalTokens: conversationContext.totalTokens,
        });
      } catch (error) {
        logger.error("ModeAwareProcessor", "Failed to load conversation context", error);
      }
    }

    // Build context bundle if auto-context is enabled
    let contextBundle: ContextBundle | undefined;
    if (request.autoContext) {
      try {
        // Token budget is determined by ContextBundleBuilder based on mode and pocketId
        contextBundle = await contextBundleBuilder.buildContextBundle({
          mode: "ask",
          query: request.prompt,
          conversationId: request.conversationId,
          // maxTokens is omitted - let ContextBundleBuilder decide based on context
        });

        // Serialize context bundle into preamble
        const contextPreamble = serializeContextBundle(contextBundle, "ask");
        contextString = contextPreamble + "\n\n" + contextString;

        logger.info("ModeAwareProcessor", "Built context bundle for Ask mode", {
          signals: contextBundle.signals,
          totalTokens: contextBundle.totalTokens,
          hasPockets:
            !!contextBundle.pockets && contextBundle.pockets.length > 0,
          pocketsCount: contextBundle.pockets?.length || 0,
        });

        // Check if RAG was requested but no content found
        if (
          request.pocketId &&
          (!contextBundle.pockets || contextBundle.pockets.length === 0)
        ) {
          logger.warn(
            "ModeAwareProcessor",
            "No relevant content found in pocket for Ask mode",
            {
              pocketId: request.pocketId,
            },
          );
          // Note: User-facing messages should be handled in the UI layer, not in the AI prompt
        }
      } catch (error) {
        logger.error("ModeAwareProcessor", "Failed to build context bundle", error);
      }
    }

    // Create task with conversation context
    const task: Task = {
      content: {
        text: request.prompt,
      } as Content,
      operation: TaskOperation.GENERAL,
      ...(contextString && {
        context: contextString,
      }),
    };

    return {
      task,
      contextBundle,
      conversationContext: conversationContext || undefined,
    };
  }

  /**
   * Build AI Pocket mode pipeline with RAG
   * 
   * Requirement 8.2.4: AI Pocket mode retrieves relevant content using RAG
   * Requirement 8.3.1, 8.3.2, 8.3.3: Vector similarity search and content retrieval
   * 
   * @param request Mode-aware request
   * @returns Pipeline result with task and context
   */
  private async buildAIPocketPipeline(request: ModeAwareRequest): Promise<PipelineResult> {
    logger.info("ModeAwareProcessor", "Building AI Pocket mode pipeline");

    // Load conversation context if available
    let conversationContext: ConversationContext | null = null;
    let contextString = "";

    if (request.conversationId) {
      try {
        conversationContext = await conversationContextLoader.buildConversationContext(
          request.conversationId
        );
        contextString = conversationContextLoader.formatContextAsString(conversationContext);
        
        logger.info("ModeAwareProcessor", "Loaded conversation context", {
          messageCount: conversationContext.messages.length,
          totalTokens: conversationContext.totalTokens,
        });
      } catch (error) {
        logger.error("ModeAwareProcessor", "Failed to load conversation context", error);
      }
    }

    // Build context bundle with RAG retrieval
    // Requirement 8.3.1: Perform vector similarity search
    // Requirement 8.3.2: Retrieve top 5 most relevant content pieces
    let contextBundle: ContextBundle;
    try {
      // Token budget is determined by ContextBundleBuilder
      contextBundle = await contextBundleBuilder.buildContextBundle({
        mode: "ai-pocket",
        query: request.prompt,
        pocketId: request.pocketId,
        conversationId: request.conversationId,
        // maxTokens is omitted - let ContextBundleBuilder decide based on mode
      });

      // Requirement 8.3.3: Include original content, source URL, and relevance score
      logger.info("ModeAwareProcessor", "Built context bundle with RAG", {
        signals: contextBundle.signals,
        totalTokens: contextBundle.totalTokens,
        pocketsCount: contextBundle.pockets?.length || 0,
      });

      // Requirement 38.1, 38.2: Build mode-specific prompt preamble
      const contextPreamble = serializeContextBundle(contextBundle, "ai-pocket");
      contextString = contextPreamble + "\n\n" + contextString;

      // Requirement 8.3.6: Include relevance scores in context
      if (contextBundle.pockets && contextBundle.pockets.length > 0) {
        logger.info("ModeAwareProcessor", "RAG retrieved content", {
          count: contextBundle.pockets.length,
          avgRelevance: (
            contextBundle.pockets.reduce((sum, p) => sum + p.relevanceScore, 0) /
            contextBundle.pockets.length
          ).toFixed(2),
        });
      } else {
        // Requirement 8.3.5: No relevant content found
        logger.warn(
          "ModeAwareProcessor",
          "No relevant content found in pockets",
        );
        // Note: User-facing messages should be handled in the UI layer, not in the AI prompt
      }
    } catch (error) {
      logger.error("ModeAwareProcessor", "Failed to build RAG context", error);
      
      // Requirement 8.3.8: Fallback to keyword-based search (handled in vector-search-service)
      // If RAG fails completely, create minimal context bundle
      contextBundle = {
        totalTokens: 0,
        truncated: false,
        signals: [],
        timestamp: Date.now(),
      };
    }

    // Create task with RAG-enhanced context
    const task: Task = {
      content: {
        text: request.prompt,
      } as Content,
      operation: TaskOperation.GENERAL,
      ...(contextString && {
        context: contextString,
      }),
    };

    return {
      task,
      contextBundle,
      conversationContext: conversationContext || undefined,
    };
  }

  /**
   * Estimate token count from text
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Detect mode from UI state
   * 
   * Requirement 8.2.6: Mode switching UI integration
   * 
   * @param payload Request payload
   * @returns Detected mode
   */
  static detectMode(payload: any): AIMode {
    // Check explicit mode field
    if (payload.mode === "ai-pocket" || payload.mode === "ask") {
      return payload.mode;
    }

    // Default to Ask mode
    // Requirement 8.2.7: Fallback to Ask mode on detection failure
    logger.info("ModeAwareProcessor", "Mode not specified, defaulting to Ask mode");
    return "ask";
  }
}

// Export singleton factory
let modeAwareProcessorInstance: ModeAwareProcessor | null = null;

export function getModeAwareProcessor(
  aiManager: AIManager,
  cloudAIManager: CloudAIManager,
): ModeAwareProcessor {
  if (!modeAwareProcessorInstance) {
    modeAwareProcessorInstance = new ModeAwareProcessor(aiManager, cloudAIManager);
  }
  return modeAwareProcessorInstance;
}
