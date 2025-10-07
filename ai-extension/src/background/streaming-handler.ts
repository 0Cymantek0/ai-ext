/**
 * Streaming Handler
 * 
 * Handles AI response streaming with progressive UI updates and cancellation support.
 * Requirements: 8.3, 8.9, 13.2
 */

import { AIManager } from './ai-manager';
import { CloudAIManager } from './cloud-ai-manager';
import { HybridAIEngine, TaskOperation } from './hybrid-ai-engine';
import type { Task, Content } from './hybrid-ai-engine';
import { logger } from './monitoring';
import type { 
  AiStreamRequestPayload, 
  AiStreamChunkPayload, 
  AiStreamEndPayload,
  AiStreamErrorPayload,
  AiCancelRequestPayload,
  BaseMessage
} from '../shared/types/index.d';

/**
 * Active streaming session
 */
interface StreamingSession {
  requestId: string;
  abortController: AbortController;
  startTime: number;
  totalChunks: number;
  conversationId?: string | undefined;
}

/**
 * Streaming Handler class
 * Manages AI response streaming with cancellation support
 */
export class StreamingHandler {
  private aiManager: AIManager;
  private cloudAIManager: CloudAIManager;
  private hybridEngine: HybridAIEngine;
  private activeSessions: Map<string, StreamingSession> = new Map();

  constructor(aiManager: AIManager, cloudAIManager: CloudAIManager) {
    this.aiManager = aiManager;
    this.cloudAIManager = cloudAIManager;
    this.hybridEngine = new HybridAIEngine(aiManager, cloudAIManager);
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
    sender: chrome.runtime.MessageSender
  ): Promise<{ requestId: string }> {
    const requestId = crypto.randomUUID();
    const abortController = new AbortController();

    // Create streaming session
    const session: StreamingSession = {
      requestId,
      abortController,
      startTime: performance.now(),
      totalChunks: 0,
      conversationId: payload.conversationId ?? undefined
    };

    this.activeSessions.set(requestId, session);

    logger.info('StreamingHandler', 'Starting stream', {
      requestId,
      conversationId: payload.conversationId,
      preferLocal: payload.preferLocal
    });

    // Send stream start message
    this.sendToSidePanel({
      kind: 'AI_PROCESS_STREAM_START',
      requestId,
      payload: {
        requestId,
        conversationId: payload.conversationId
      }
    });

    // Start streaming in background (don't await)
    this.processStream(payload, session, sender).catch((error) => {
      logger.error('StreamingHandler', 'Stream processing failed', error);
      this.sendStreamError(requestId, error.message, payload.conversationId);
      this.activeSessions.delete(requestId);
    });

    return { requestId };
  }

  /**
   * Process streaming request
   */
  private async processStream(
    payload: AiStreamRequestPayload,
    session: StreamingSession,
    sender: chrome.runtime.MessageSender
  ): Promise<void> {
    try {
      // Create task from payload
      const task: Task = {
        content: {
          text: payload.prompt
        } as Content,
        operation: TaskOperation.GENERAL,
        ...(payload.conversationId && { context: `Conversation: ${payload.conversationId}` })
      };

      // Process with streaming
      const streamGenerator = this.hybridEngine.processContentStreaming(
        task,
        {
          preferLocal: payload.preferLocal ?? true,
          taskType: 'general',
          priority: 'normal',
          signal: session.abortController.signal
        },
        async (decision) => {
          // Consent callback - for now, auto-approve
          // In production, this should prompt the user
          logger.info('StreamingHandler', 'Cloud consent required', {
            location: decision.location,
            reason: decision.reason
          });
          return true;
        }
      );

      let fullResponse = '';
      let source: 'gemini-nano' | 'gemini-flash' | 'gemini-pro' = 'gemini-nano';

      // Stream chunks
      for await (const chunk of streamGenerator) {
        // Check if cancelled
        if (session.abortController.signal.aborted) {
          logger.info('StreamingHandler', 'Stream cancelled', { requestId: session.requestId });
          break;
        }

        fullResponse += chunk;
        session.totalChunks++;

        // Send chunk to side panel
        this.sendStreamChunk(session.requestId, chunk, payload.conversationId);

        // Requirement 13.2: Ensure UI remains responsive
        // Add small delay to prevent overwhelming the UI
        if (session.totalChunks % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Calculate metrics
      const processingTime = performance.now() - session.startTime;
      const totalTokens = this.estimateTokens(fullResponse);

      // Determine source based on decision
      // This is a simplification - in production, track the actual source
      source = payload.preferLocal ? 'gemini-nano' : 'gemini-flash';

      logger.info('StreamingHandler', 'Stream completed', {
        requestId: session.requestId,
        totalChunks: session.totalChunks,
        processingTime: `${processingTime.toFixed(2)}ms`,
        totalTokens,
        source
      });

      // Send stream end message
      this.sendStreamEnd(
        session.requestId,
        payload.conversationId,
        totalTokens,
        processingTime,
        source
      );

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info('StreamingHandler', 'Stream aborted', { requestId: session.requestId });
      } else {
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
  async cancelStreaming(payload: AiCancelRequestPayload): Promise<{ success: boolean }> {
    const session = this.activeSessions.get(payload.requestId);

    if (!session) {
      logger.warn('StreamingHandler', 'No active session to cancel', { requestId: payload.requestId });
      return { success: false };
    }

    logger.info('StreamingHandler', 'Cancelling stream', { requestId: payload.requestId });

    // Abort the request
    session.abortController.abort();

    // Clean up session
    this.activeSessions.delete(payload.requestId);

    return { success: true };
  }

  /**
   * Send stream chunk to side panel
   */
  private sendStreamChunk(requestId: string, chunk: string, conversationId?: string): void {
    const payload: AiStreamChunkPayload = {
      requestId,
      chunk,
      ...(conversationId && { conversationId })
    };

    this.sendToSidePanel({
      kind: 'AI_PROCESS_STREAM_CHUNK',
      requestId,
      payload
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
    source: 'gemini-nano' | 'gemini-flash' | 'gemini-pro'
  ): void {
    const payload: AiStreamEndPayload = {
      requestId,
      totalTokens,
      processingTime,
      source,
      ...(conversationId && { conversationId })
    };

    this.sendToSidePanel({
      kind: 'AI_PROCESS_STREAM_END',
      requestId,
      payload
    });
  }

  /**
   * Send stream error message
   */
  private sendStreamError(requestId: string, error: string, conversationId?: string): void {
    const payload: AiStreamErrorPayload = {
      requestId,
      error,
      ...(conversationId && { conversationId })
    };

    this.sendToSidePanel({
      kind: 'AI_PROCESS_STREAM_ERROR',
      requestId,
      payload
    });
  }

  /**
   * Send message to side panel
   */
  private sendToSidePanel(message: BaseMessage<any, any>): void {
    chrome.runtime.sendMessage(message).catch((error) => {
      logger.error('StreamingHandler', 'Failed to send to side panel', error);
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
    logger.info('StreamingHandler', 'Cleaning up all sessions', {
      count: this.activeSessions.size
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
  cloudAIManager: CloudAIManager
): StreamingHandler {
  if (!streamingHandlerInstance) {
    streamingHandlerInstance = new StreamingHandler(aiManager, cloudAIManager);
  }
  return streamingHandlerInstance;
}
