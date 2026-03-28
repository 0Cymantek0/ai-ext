/**
 * Streaming Handler
 *
 * Handles AI response streaming with progressive UI updates and cancellation support.
 * Requirements: 8.3, 8.9, 13.2
 */

import { AIManager } from "./ai-manager";
import { CloudAIManager } from "./cloud-ai-manager";
import { HybridAIEngine } from "./hybrid-ai-engine";
import { logger } from "./monitoring";
import { conversationContextLoader } from "./conversation-context-loader";
import { routeQuery, type RoutingDecision, type RouteQueryInput } from "./query-router";
import {
  getModeAwareProcessor,
  ModeAwareProcessor,
  type ModeAwareRequest,
} from "./mode-aware-processor";
import type {
  AiStreamRequestPayload,
  AiStreamChunkPayload,
  AiStreamStartPayload,
  AiStreamEndPayload,
  AiStreamErrorPayload,
  AiCancelRequestPayload,
  BaseMessage,
  ProviderExecutionMetadata,
} from "../shared/types/index.d";

type ResolvedModel = "nano" | "flash" | "pro";

interface RoutingSessionDecision
  extends Omit<RoutingDecision, "preferLocal"> {
  mode: "ask" | "ai-pocket";
  preferLocal: boolean;
}

interface ConversationRoutingMetadata {
  messageCount?: number;
  totalTokens?: number;
  truncated?: boolean;
}

/**
 * Active streaming session
 */
interface StreamingSession {
  requestId: string;
  abortController: AbortController;
  startTime: number;
  totalChunks: number;
  conversationId?: string | undefined;
  messageId?: string; // ID of the assistant message being created
  resolvedModel?: ResolvedModel;
  routingDecision?: RoutingSessionDecision;
  providerExecution?: ProviderExecutionMetadata;
}

/**
 * Streaming Handler class
 * Manages AI response streaming with cancellation support
 */
export class StreamingHandler {
  private aiManager: AIManager;
  private cloudAIManager: CloudAIManager;
  private hybridEngine: HybridAIEngine;
  private modeAwareProcessor: ModeAwareProcessor;
  private activeSessions: Map<string, StreamingSession> = new Map();

  constructor(aiManager: AIManager, cloudAIManager: CloudAIManager) {
    this.aiManager = aiManager;
    this.cloudAIManager = cloudAIManager;
    this.hybridEngine = new HybridAIEngine(aiManager, cloudAIManager);
    this.modeAwareProcessor = getModeAwareProcessor(aiManager, cloudAIManager);
  }

  /**
   * Validate and detect mode from payload
   *
   * Requirement 8.2.6: Mode validation and error handling
   * Requirement 8.2.7: Fallback to Ask mode on detection failure
   *
   * @param payload Stream request payload
   * @returns Validated mode
   */
  private validateAndDetectMode(
    payload: AiStreamRequestPayload,
  ): "ask" | "ai-pocket" {
    // Check if mode is explicitly provided
    if (payload.mode) {
      // Validate mode value
      if (payload.mode !== "ask" && payload.mode !== "ai-pocket") {
        logger.warn(
          "StreamingHandler",
          "Invalid mode provided, defaulting to 'ask'",
          {
            providedMode: payload.mode,
          },
        );
        return "ask";
      }

      // Validate AI Pocket mode requirements
      if (payload.mode === "ai-pocket") {
        // AI Pocket mode should ideally have a pocketId, but it's optional
        // The mode-aware processor will handle missing pocketId gracefully
        if (!payload.pocketId) {
          logger.info(
            "StreamingHandler",
            "AI Pocket mode without pocketId - will search all pockets",
          );
        }
      }

      return payload.mode;
    }

    // Default to "ask" mode if not specified
    // Requirement 8.2.7: Fallback to Ask mode on detection failure
    logger.info("StreamingHandler", "Mode not specified, defaulting to 'ask'");
    return "ask";
  }

  private async collectConversationMetadata(
    conversationId?: string,
  ): Promise<ConversationRoutingMetadata | undefined> {
    if (!conversationId) {
      return undefined;
    }

    try {
      const context =
        await conversationContextLoader.buildConversationContext(conversationId);
      return {
        messageCount: context.messages.length,
        totalTokens: context.totalTokens,
        truncated: context.truncated,
      };
    } catch (error) {
      logger.warn(
        "StreamingHandler",
        "Failed to load conversation metadata for routing",
        {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return undefined;
    }
  }

  /**
   * Start streaming AI response
   * Requirement 8.3: Stream responses in real-time for immediate feedback
   * Requirement 8.9: Display typing indicator during processing
   *
   * @param payload Stream request payload
   * @param sender Message sender
   */
  async startStreaming(
    payload: AiStreamRequestPayload,
    sender: chrome.runtime.MessageSender,
  ): Promise<{ requestId: string }> {
    const requestId = crypto.randomUUID();
    const abortController = new AbortController();

    // Create streaming session
    const session: StreamingSession = {
      requestId,
      abortController,
      startTime: performance.now(),
      totalChunks: 0,
      conversationId: payload.conversationId ?? undefined,
    };

    const userSpecifiedModel =
      payload.model && payload.model !== "auto" ? payload.model : undefined;

    if (userSpecifiedModel) {
      session.resolvedModel = userSpecifiedModel;
      logger.info("StreamingHandler", "Using user-selected model", {
        requestId,
        conversationId: payload.conversationId,
        model: userSpecifiedModel,
      });
    } else {
      const mode = this.validateAndDetectMode(payload);
      const conversationMetadata = await this.collectConversationMetadata(
        payload.conversationId,
      );

      try {
        const routeInput: RouteQueryInput = {
          prompt: payload.prompt,
          mode,
          context: {
            autoContext: payload.autoContext ?? true,
            ...(payload.pocketId !== undefined
              ? { pocketId: payload.pocketId }
              : {}),
          },
        };

        if (payload.conversationId !== undefined || conversationMetadata) {
          routeInput.conversation = {};
          if (payload.conversationId !== undefined) {
            routeInput.conversation.id = payload.conversationId;
          }
          if (conversationMetadata) {
            routeInput.conversation.metadata = conversationMetadata;
          }
        }

        const decision = await routeQuery(routeInput);

        const preferLocal =
          decision.preferLocal ?? decision.targetModel === "nano";

        session.routingDecision = {
          mode,
          targetModel: decision.targetModel,
          reason: decision.reason,
          confidence: decision.confidence,
          preferLocal,
          ...(decision.metadata ? { metadata: decision.metadata } : {}),
        };
        session.resolvedModel = decision.targetModel;

        logger.info("StreamingHandler", "Routing decision resolved", {
          requestId,
          mode,
          targetModel: decision.targetModel,
          preferLocal,
          reason: decision.reason,
          confidence: decision.confidence,
        });
      } catch (error) {
        logger.error("StreamingHandler", "Failed to route query", {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.activeSessions.set(requestId, session);

    const loggedPreferLocal =
      userSpecifiedModel !== undefined
        ? userSpecifiedModel === "nano"
        : session.routingDecision?.preferLocal ?? payload.preferLocal ?? true;

    if (!session.resolvedModel) {
      session.resolvedModel = loggedPreferLocal ? "nano" : "flash";
    }

    logger.info("StreamingHandler", "Starting stream", {
      requestId,
      conversationId: payload.conversationId,
      preferLocal: loggedPreferLocal,
      resolvedModel: session.resolvedModel ?? userSpecifiedModel,
    });

    // Generate message ID for the assistant response
    const messageId = crypto.randomUUID();
    session.messageId = messageId;

    // Start streaming in background (don't await)
    this.processStream(payload, session, sender).catch((error) => {
      logger.error("StreamingHandler", "Stream processing failed", error);
      this.sendStreamError(
        requestId,
        error instanceof Error ? error.message : String(error),
        payload.conversationId,
      );
      this.activeSessions.delete(requestId);
    });

    return { requestId };
  }

  /**
   * Process streaming request with mode-aware routing
   *
   * Requirement 8.2.1, 8.2.2, 8.2.3: Mode detection and routing
   */
  private async processStream(
    payload: AiStreamRequestPayload,
    session: StreamingSession,
    sender: chrome.runtime.MessageSender,
  ): Promise<void> {
    try {
      // Detect mode from payload
      // Requirement 8.2.1: Create mode detection logic according to UI
      const mode = this.validateAndDetectMode(payload);

      const sessionDecision = session.routingDecision;
      const manualModel =
        payload.model && payload.model !== "auto" ? payload.model : undefined;

      let preferLocal = payload.preferLocal;

      if (sessionDecision) {
        preferLocal = sessionDecision.preferLocal;
      }

      if (manualModel) {
        preferLocal = manualModel === "nano";
      }

      if (preferLocal === undefined) {
        preferLocal = true;
      }

      const targetModel = manualModel ?? sessionDecision?.targetModel;

      const routingMetadata = sessionDecision
        ? {
            reason: sessionDecision.reason,
            confidence: sessionDecision.confidence,
            ...(sessionDecision.metadata
              ? { telemetry: sessionDecision.metadata }
              : {}),
          }
        : undefined;

      const effectiveResolvedModel =
        targetModel ?? (preferLocal ? "nano" : "flash");

      if (!session.resolvedModel) {
        session.resolvedModel = effectiveResolvedModel;
      }

      logger.info("StreamingHandler", "Processing with mode-aware routing", {
        mode,
        conversationId: payload.conversationId,
        pocketId: payload.pocketId,
        autoContext: payload.autoContext,
        targetModel,
        preferLocal,
        routingReason: sessionDecision?.reason,
        routingConfidence: sessionDecision?.confidence,
        modelSource: manualModel
          ? "manual"
          : sessionDecision
            ? "router"
            : "default",
      });

      // Build mode-aware request
      const modeAwareRequest: ModeAwareRequest = {
        prompt: payload.prompt,
        mode,
        conversationId: payload.conversationId,
        pocketId: payload.pocketId,
        preferLocal,
        model: manualModel,
        autoContext: payload.autoContext ?? true, // Default to true
        ...(targetModel && { targetModel }),
        ...(routingMetadata && { routingMetadata }),
      };

      // Process with mode-aware processor
      // Requirement 8.2.3: Implement message routing based on AI mode
      // Requirement 8.2.4: Add "Ask" mode pipeline for general conversation
      // Requirement 8.2.5: Add "AI Pocket" mode pipeline for RAG processing
      const streamGenerator = this.modeAwareProcessor.processRequest(
        modeAwareRequest,
        session.abortController.signal,
      );

      let fullResponse = "";
      let source: "gemini-nano" | "gemini-flash" | "gemini-pro" = "gemini-nano";
      let contextUsed: string[] = [];
      let startPayloadSent = false;

      const sendStartPayload = () => {
        if (startPayloadSent) {
          return;
        }

        const startPayload: AiStreamStartPayload = {
          requestId: session.requestId,
          ...(payload.conversationId
            ? { conversationId: payload.conversationId }
            : {}),
          ...(session.messageId ? { messageId: session.messageId } : {}),
          ...(session.resolvedModel
            ? { resolvedModel: session.resolvedModel }
            : {}),
          ...this.toProviderExecutionPayload(session.providerExecution),
        };

        this.sendToSidePanel({
          kind: "AI_PROCESS_STREAM_START",
          requestId: session.requestId,
          payload: startPayload,
        });

        startPayloadSent = true;
      };

      // Stream chunks
      for await (const chunk of streamGenerator) {
        if (
          typeof chunk === "object" &&
          "type" in chunk &&
          chunk.type === "provider-execution"
        ) {
          session.providerExecution = chunk.metadata;
          sendStartPayload();
          continue;
        }

        sendStartPayload();

        // Check if cancelled
        if (session.abortController.signal.aborted) {
          logger.info("StreamingHandler", "Stream cancelled", {
            requestId: session.requestId,
          });
          break;
        }

        // Check if this is the final response object
        if (typeof chunk === "object" && "content" in chunk) {
          // This is the final ModeAwareResponse
          const response = chunk as any;
          source = response.source;
          contextUsed = response.contextUsed || [];
          session.providerExecution = response.providerExecution;
          if (typeof response.content === "string" && response.content.length) {
            fullResponse = response.content;
          }
          break;
        }

        // Regular chunk
        if (typeof chunk === "string") {
          fullResponse += chunk;
          session.totalChunks++;

          // Send chunk to side panel
          this.sendStreamChunk(session.requestId, chunk, payload.conversationId);

          // Requirement 13.2: Ensure UI remains responsive
          // Add small delay to prevent overwhelming the UI
          if (session.totalChunks % 10 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
      }

      sendStartPayload();

      // Calculate metrics
      const processingTime = performance.now() - session.startTime;
      const totalTokens = this.estimateTokens(fullResponse);

      // Determine source based on decision
      if (!source) {
        source = payload.preferLocal ? "gemini-nano" : "gemini-flash";
      }

      logger.info("StreamingHandler", "Stream completed", {
        requestId: session.requestId,
        mode,
        totalChunks: session.totalChunks,
        processingTime: `${processingTime.toFixed(2)}ms`,
        totalTokens,
        source,
        contextUsed,
        resolvedModel: session.resolvedModel ?? targetModel,
        routingReason: session.routingDecision?.reason,
        routingConfidence: session.routingDecision?.confidence,
      });

      // Send stream end message
      this.sendStreamEnd(
        session.requestId,
        payload.conversationId,
        totalTokens,
        processingTime,
        source,
        mode,
        contextUsed,
        session.providerExecution,
      );

      // Persist final assistant message to conversation history if available
      try {
        if (payload.conversationId && session.messageId) {
          const { indexedDBManager } = await import("./indexeddb-manager.js");
          await indexedDBManager.init();
          const message = {
            id: session.messageId, // Use the same ID that was sent to the UI
            role: "assistant" as const,
            content: fullResponse,
            timestamp: Date.now(),
            source,
            metadata: {
              tokensUsed: totalTokens,
              processingTime,
              mode,
              contextUsed,
              ...(session.providerExecution
                ? { providerExecution: session.providerExecution }
                : {}),
            },
          };
          await indexedDBManager.updateConversation(
            payload.conversationId,
            message,
          );
        }
      } catch (persistError) {
        logger.error(
          "StreamingHandler",
          "Failed to persist assistant message",
          persistError,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.info("StreamingHandler", "Stream aborted", {
          requestId: session.requestId,
        });
      } else {
        // Requirement 8.2.7: Add fallback to "Ask" mode on mode detection failure
        const mode = this.validateAndDetectMode(payload);
        logger.error("StreamingHandler", "Stream processing failed", {
          error: error instanceof Error ? error.message : String(error),
          mode,
          conversationId: payload.conversationId,
          pocketId: payload.pocketId,
        });

        // Provide mode-specific error messages
        let errorMessage =
          error instanceof Error ? error.message : String(error);
        if (mode === "ai-pocket") {
          errorMessage = `AI Pocket mode error: ${errorMessage}. The mode-aware processor will attempt fallback to Ask mode.`;
        }

        // Send error to UI
        this.sendStreamError(
          session.requestId,
          errorMessage,
          payload.conversationId,
        );

        // If we were in AI Pocket mode, the mode-aware processor already handles fallback
        // Just re-throw the error for general error handling
        throw error;
      }
    } finally {
      this.activeSessions.delete(session.requestId);
    }
  }

  /**
   * Cancel active streaming session
   * Requirement 8.3: Add cancellation support
   *
   * @param payload Cancel request payload
   */
  async cancelStreaming(
    payload: AiCancelRequestPayload,
  ): Promise<{ success: boolean }> {
    const session = this.activeSessions.get(payload.requestId);

    if (!session) {
      logger.warn("StreamingHandler", "No active session to cancel", {
        requestId: payload.requestId,
      });
      return { success: false };
    }

    logger.info("StreamingHandler", "Cancelling stream", {
      requestId: payload.requestId,
    });

    // Abort the request
    session.abortController.abort();

    // Clean up session
    this.activeSessions.delete(payload.requestId);

    return { success: true };
  }

  /**
   * Send stream chunk to side panel
   */
  private sendStreamChunk(
    requestId: string,
    chunk: string,
    conversationId?: string,
  ): void {
    const payload: AiStreamChunkPayload = {
      requestId,
      chunk,
      ...(conversationId && { conversationId }),
    };

    this.sendToSidePanel({
      kind: "AI_PROCESS_STREAM_CHUNK",
      requestId,
      payload,
    });
  }

  /**
   * Send stream end message
   */
  private sendStreamEnd(
    requestId: string,
    conversationId: string | undefined,
    totalTokens: number,
    processingTime: number,
    source: "gemini-nano" | "gemini-flash" | "gemini-pro",
    mode?: "ask" | "ai-pocket",
    contextUsed?: string[],
    providerExecution?: ProviderExecutionMetadata,
  ): void {
    const payload: AiStreamEndPayload = {
      requestId,
      totalTokens,
      processingTime,
      source,
      ...(conversationId && { conversationId }),
      ...(mode && { mode }),
      ...(contextUsed && { contextUsed }),
      ...this.toProviderExecutionPayload(providerExecution),
    };

    this.sendToSidePanel({
      kind: "AI_PROCESS_STREAM_END",
      requestId,
      payload,
    });
  }

  private toProviderExecutionPayload(
    providerExecution?: ProviderExecutionMetadata,
  ): Partial<AiStreamStartPayload & AiStreamEndPayload> {
    if (!providerExecution) {
      return {};
    }

    return {
      providerId: providerExecution.providerId,
      providerType: providerExecution.providerType,
      modelId: providerExecution.modelId,
      attemptedProviderIds: providerExecution.attemptedProviderIds,
      fallbackOccurred: providerExecution.fallbackOccurred,
      ...(providerExecution.fallbackFromProviderId
        ? { fallbackFromProviderId: providerExecution.fallbackFromProviderId }
        : {}),
    };
  }

  /**
   * Send stream error message
   */
  private sendStreamError(
    requestId: string,
    error: string,
    conversationId?: string,
  ): void {
    const payload: AiStreamErrorPayload = {
      requestId,
      error,
      ...(conversationId && { conversationId }),
    };

    this.sendToSidePanel({
      kind: "AI_PROCESS_STREAM_ERROR",
      requestId,
      payload,
    });
  }

  /**
   * Send message to side panel
   */
  private sendToSidePanel(message: BaseMessage<any, any>): void {
    chrome.runtime.sendMessage(message).catch((error) => {
      logger.error("StreamingHandler", "Failed to send to side panel", error);
    });
  }

  /**
   * Estimate token count from text
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Clean up all active sessions
   */
  cleanup(): void {
    logger.info("StreamingHandler", "Cleaning up all sessions", {
      count: this.activeSessions.size,
    });

    for (const [requestId, session] of this.activeSessions) {
      session.abortController.abort();
    }

    this.activeSessions.clear();
  }
}

// Export singleton factory
let streamingHandlerInstance: StreamingHandler | null = null;

export function getStreamingHandler(
  aiManager: AIManager,
  cloudAIManager: CloudAIManager,
): StreamingHandler {
  if (!streamingHandlerInstance) {
    streamingHandlerInstance = new StreamingHandler(aiManager, cloudAIManager);
  }
  return streamingHandlerInstance;
}
