/**
 * Message Client for Content Scripts
 * Provides utilities for content scripts to communicate with the service worker
 * Requirements: 14.5, 15.1
 */

import type {
  MessageKind,
  BaseMessage,
} from "./types/index.d.ts";

interface MessageResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Send a message to the service worker and wait for response
 */
export async function sendMessage<T = any>(
  kind: MessageKind,
  payload: any,
  options: { timeout?: number; requestId?: string } = {}
): Promise<MessageResponse<T>> {
  const { timeout = 30000, requestId = generateRequestId() } = options;

  const message: BaseMessage<MessageKind, any> = {
    kind,
    payload,
    requestId,
  };

  try {
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Message timeout after ${timeout}ms`));
      }, timeout);
    });

    // Send message and race with timeout
    const response = await Promise.race([
      chrome.runtime.sendMessage(message),
      timeoutPromise,
    ]);

    return response as MessageResponse<T>;
  } catch (error) {
    console.error("[MessageClient] Failed to send message", {
      kind,
      requestId,
      error,
    });

    return {
      success: false,
      error: {
        code: "SEND_FAILED",
        message: error instanceof Error ? error.message : "Failed to send message",
        details: error,
      },
    };
  }
}

/**
 * Send a message without waiting for response (fire and forget)
 */
export function sendMessageAsync(
  kind: MessageKind,
  payload: any
): void {
  const message: BaseMessage<MessageKind, any> = {
    kind,
    payload,
    requestId: generateRequestId(),
  };

  chrome.runtime.sendMessage(message).catch((error) => {
    console.error("[MessageClient] Failed to send async message", {
      kind,
      error,
    });
  });
}

/**
 * Message listener type for content scripts
 */
export type MessageListener<T = any> = (
  payload: T,
  sender: chrome.runtime.MessageSender
) => Promise<any> | any;

/**
 * Message handler registry for content scripts
 */
class ContentMessageHandler {
  private handlers: Map<MessageKind, MessageListener> = new Map();

  /**
   * Register a message handler
   */
  on<T = any>(kind: MessageKind, handler: MessageListener<T>): void {
    if (this.handlers.has(kind)) {
      console.warn(`[MessageHandler] Overwriting handler for ${kind}`);
    }
    this.handlers.set(kind, handler);
  }

  /**
   * Unregister a message handler
   */
  off(kind: MessageKind): void {
    this.handlers.delete(kind);
  }

  /**
   * Handle incoming message
   */
  async handleMessage(
    message: any,
    sender: chrome.runtime.MessageSender
  ): Promise<MessageResponse> {
    // Validate message structure
    if (!message || typeof message !== "object" || !message.kind) {
      return {
        success: false,
        error: {
          code: "INVALID_MESSAGE",
          message: "Invalid message structure",
        },
      };
    }

    const { kind, payload } = message;
    const handler = this.handlers.get(kind);

    if (!handler) {
      // No handler registered, return success to avoid errors
      return { success: true };
    }

    try {
      const result = await handler(payload, sender);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error(`[MessageHandler] Error handling ${kind}`, error);
      return {
        success: false,
        error: {
          code: "HANDLER_ERROR",
          message: error instanceof Error ? error.message : "Handler error",
          details: error,
        },
      };
    }
  }

  /**
   * Get the message listener function for chrome.runtime.onMessage
   */
  getListener(): (
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ) => boolean {
    return (message, sender, sendResponse) => {
      this.handleMessage(message, sender)
        .then(sendResponse)
        .catch((error) => {
          console.error("[MessageHandler] Unexpected error", error);
          sendResponse({
            success: false,
            error: {
              code: "UNEXPECTED_ERROR",
              message: "Unexpected error handling message",
            },
          });
        });
      return true; // Keep channel open for async response
    };
  }
}

// Create singleton instance
export const messageHandler = new ContentMessageHandler();

/**
 * Initialize message listener for content script
 */
export function initializeMessageListener(): void {
  chrome.runtime.onMessage.addListener(messageHandler.getListener());
  console.debug("[MessageClient] Message listener initialized");
}
