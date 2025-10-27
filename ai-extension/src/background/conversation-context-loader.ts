/**
 * Conversation Context Loader
 *
 * Handles conversation history retrieval from IndexedDB and formats it for AI context.
 * Implements context window management to prevent token limit exceeded errors.
 *
 * Requirements: 8.1.1, 8.1.2, 8.1.3, 8.1.4, 8.1.5, 8.1.7
 */

import {
  indexedDBManager,
  type Message,
  type Conversation,
} from "./indexeddb-manager.js";
import { logger } from "./monitoring.js";

/**
 * Configuration for context window management
 */
interface ContextWindowConfig {
  maxTokens: number;
  targetTokens: number;
  systemMessagePriority: boolean;
  recentMessageCount: number;
}

/**
 * Formatted conversation context ready for AI
 */
export interface ConversationContext {
  messages: FormattedMessage[];
  totalTokens: number;
  truncated: boolean;
  conversationId: string;
}

/**
 * Message formatted for AI context
 */
export interface FormattedMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Prioritized message with metadata
 */
interface PrioritizedMessage extends Message {
  priority: number;
  estimatedTokens: number;
}

/**
 * Default context window configuration
 */
const DEFAULT_CONFIG: ContextWindowConfig = {
  maxTokens: 8000,
  targetTokens: 6000,
  systemMessagePriority: true,
  recentMessageCount: 6, // Last 3 exchanges (user + assistant)
};

/**
 * Conversation Context Loader
 *
 * Loads conversation history from IndexedDB and formats it for AI processing.
 * Implements intelligent context window management to stay within token limits.
 */
export class ConversationContextLoader {
  private config: ContextWindowConfig;
  private retryAttempts: number = 3;
  private retryDelay: number = 1000; // ms

  constructor(config: Partial<ContextWindowConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Load conversation history from IndexedDB
   * Requirement 8.1.1: Load complete conversation history
   *
   * @param conversationId - ID of the conversation to load
   * @returns Conversation object or null if not found
   */
  async loadConversationHistory(
    conversationId: string,
  ): Promise<Conversation | null> {
    let lastError: Error | null = null;

    // Retry logic for robustness
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        logger.info(
          "ConversationContextLoader",
          "Loading conversation history",
          {
            conversationId,
            attempt,
          },
        );

        await indexedDBManager.init();
        const conversation =
          await indexedDBManager.getConversation(conversationId);

        if (!conversation) {
          logger.warn("ConversationContextLoader", "Conversation not found", {
            conversationId,
          });
          return null;
        }

        logger.info(
          "ConversationContextLoader",
          "Conversation loaded successfully",
          {
            conversationId,
            messageCount: conversation.messages.length,
            tokensUsed: conversation.tokensUsed,
          },
        );

        return conversation;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.error(
          "ConversationContextLoader",
          `Load attempt ${attempt} failed`,
          {
            conversationId,
            error: lastError.message,
          },
        );

        // Wait before retrying (exponential backoff)
        if (attempt < this.retryAttempts) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    throw new Error(
      `Failed to load conversation after ${this.retryAttempts} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Format messages for AI context
   * Requirement 8.1.2: Format messages in role:content format
   *
   * @param messages - Array of messages to format
   * @returns Array of formatted messages
   */
  formatMessagesForAI(messages: Message[]): FormattedMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Estimate token count for text
   * Uses rough approximation: 1 token ≈ 4 characters
   *
   * @param text - Text to estimate tokens for
   * @returns Estimated token count
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate tokens for a message
   *
   * @param message - Message to estimate
   * @returns Estimated token count
   */
  private estimateMessageTokens(message: Message): number {
    // Account for role prefix and formatting
    const roleOverhead = 10; // "user: ", "assistant: ", etc.
    return this.estimateTokens(message.content) + roleOverhead;
  }

  /**
   * Prioritize messages for context window
   * Requirement 8.1.5: Prioritize relevant historical messages
   *
   * @param messages - Messages to prioritize
   * @returns Prioritized messages with metadata
   */
  private prioritizeMessages(messages: Message[]): PrioritizedMessage[] {
    return messages.map((msg, index) => {
      let priority = 0;

      // System messages get highest priority
      if (msg.role === "system" && this.config.systemMessagePriority) {
        priority = 1000;
      }
      // Recent messages get high priority
      else if (index >= messages.length - this.config.recentMessageCount) {
        priority =
          500 + (index - (messages.length - this.config.recentMessageCount));
      }
      // Older messages get lower priority
      else {
        priority = index;
      }

      return {
        ...msg,
        priority,
        estimatedTokens: this.estimateMessageTokens(msg),
      };
    });
  }

  /**
   * Fit messages within context window
   * Requirement 8.1.4: Manage context window for long conversations
   *
   * @param messages - Prioritized messages
   * @returns Messages that fit within token budget
   */
  private fitInContextWindow(messages: PrioritizedMessage[]): {
    messages: Message[];
    totalTokens: number;
    truncated: boolean;
  } {
    // Sort by priority (descending)
    const sorted = [...messages].sort((a, b) => b.priority - a.priority);

    const selected: PrioritizedMessage[] = [];
    let totalTokens = 0;

    // Select messages until we hit the target token limit
    for (const msg of sorted) {
      const newTotal = totalTokens + msg.estimatedTokens;

      if (newTotal <= this.config.targetTokens) {
        selected.push(msg);
        totalTokens = newTotal;
      } else if (totalTokens < this.config.maxTokens) {
        // Try to fit if we're under max tokens
        if (newTotal <= this.config.maxTokens) {
          selected.push(msg);
          totalTokens = newTotal;
        }
      }
    }

    // Sort selected messages back to chronological order
    const chronological = selected.sort((a, b) => {
      const aIndex = messages.findIndex((m) => m.id === a.id);
      const bIndex = messages.findIndex((m) => m.id === b.id);
      return aIndex - bIndex;
    });

    // Remove priority and estimatedTokens fields
    const finalMessages: Message[] = chronological.map(
      ({ priority, estimatedTokens, ...msg }) => msg,
    );

    const truncated = finalMessages.length < messages.length;

    logger.info("ConversationContextLoader", "Context window fitted", {
      originalCount: messages.length,
      selectedCount: finalMessages.length,
      totalTokens,
      truncated,
    });

    return {
      messages: finalMessages,
      totalTokens,
      truncated,
    };
  }

  /**
   * Build conversation context for AI
   * Requirement 8.1.3: Initialize AI session with conversation history
   *
   * @param conversationId - ID of the conversation
   * @returns Formatted conversation context
   */
  async buildConversationContext(
    conversationId: string,
  ): Promise<ConversationContext> {
    try {
      // Load conversation history
      const conversation = await this.loadConversationHistory(conversationId);

      if (!conversation || conversation.messages.length === 0) {
        logger.info(
          "ConversationContextLoader",
          "No conversation history found",
          {
            conversationId,
          },
        );

        return {
          messages: [],
          totalTokens: 0,
          truncated: false,
          conversationId,
        };
      }

      // Prioritize messages
      const prioritized = this.prioritizeMessages(conversation.messages);

      // Fit within context window
      const { messages, totalTokens, truncated } =
        this.fitInContextWindow(prioritized);

      // Format for AI
      const formattedMessages = this.formatMessagesForAI(messages);

      logger.info("ConversationContextLoader", "Context built successfully", {
        conversationId,
        messageCount: formattedMessages.length,
        totalTokens,
        truncated,
      });

      return {
        messages: formattedMessages,
        totalTokens,
        truncated,
        conversationId,
      };
    } catch (error) {
      logger.error("ConversationContextLoader", "Failed to build context", {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Format context as a single string for AI prompt
   *
   * @param context - Conversation context
   * @returns Formatted context string
   */
  formatContextAsString(context: ConversationContext): string {
    if (context.messages.length === 0) {
      return "";
    }

    const lines = context.messages.map((msg) => `${msg.role}: ${msg.content}`);

    if (context.truncated) {
      lines.unshift("[Earlier messages truncated to fit context window]");
    }

    return lines.join("\n");
  }

  /**
   * Update configuration
   *
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<ContextWindowConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info(
      "ConversationContextLoader",
      "Configuration updated",
      this.config,
    );
  }

  /**
   * Get current configuration
   *
   * @returns Current configuration
   */
  getConfig(): ContextWindowConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const conversationContextLoader = new ConversationContextLoader();
