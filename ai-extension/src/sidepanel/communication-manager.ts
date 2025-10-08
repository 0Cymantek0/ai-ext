/**
 * Communication Manager
 * Manages communication between side panel and service worker
 * Requirements: 8.2, 14.5, 15.1
 */

import type { MessageKind, BaseMessage } from '../shared/types/index.d';

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
 * Communication Manager class
 */
export class CommunicationManager {
  private messageListeners: Map<MessageKind, Set<(payload: any) => void>> = new Map();
  private isInitialized = false;

  /**
   * Initialize communication with service worker
   * Requirement 8.2: Set up communication on initialization
   */
  initialize(): void {
    if (this.isInitialized) {
      console.warn('[CommunicationManager] Already initialized');
      return;
    }

    // Set up message listener
    chrome.runtime.onMessage.addListener((message: BaseMessage<any, any>) => {
      this.handleIncomingMessage(message);
    });

    // Notify service worker that side panel is ready
    this.sendMessage('SIDE_PANEL_READY', {}).catch((error) => {
      console.warn('[CommunicationManager] Failed to notify service worker:', error);
    });

    this.isInitialized = true;
    console.info('[CommunicationManager] Initialized');
  }

  /**
   * Send message to service worker
   * Requirement 14.5: Message passing for inter-component communication
   */
  async sendMessage<T = any>(
    kind: MessageKind | string,
    payload: any,
    options: { timeout?: number } = {}
  ): Promise<MessageResponse<T>> {
    const { timeout = 30000 } = options;

    const message: BaseMessage<any, any> = {
      kind: kind as MessageKind,
      payload,
      requestId: crypto.randomUUID(),
    };

    try {
      // Create timeout promise
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
      console.error('[CommunicationManager] Failed to send message:', {
        kind,
        error,
      });

      return {
        success: false,
        error: {
          code: 'SEND_FAILED',
          message: error instanceof Error ? error.message : 'Failed to send message',
          details: error,
        },
      };
    }
  }

  /**
   * Send message without waiting for response
   */
  sendMessageAsync(kind: MessageKind | string, payload: any): void {
    const message: BaseMessage<any, any> = {
      kind: kind as MessageKind,
      payload,
      requestId: crypto.randomUUID(),
    };

    chrome.runtime.sendMessage(message).catch((error) => {
      console.error('[CommunicationManager] Failed to send async message:', {
        kind,
        error,
      });
    });
  }

  /**
   * Register message listener
   * Requirement 15.1: Message routing between components
   */
  on(kind: MessageKind, listener: (payload: any) => void): () => void {
    if (!this.messageListeners.has(kind)) {
      this.messageListeners.set(kind, new Set());
    }

    const listeners = this.messageListeners.get(kind)!;
    listeners.add(listener);

    // Return unsubscribe function
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.messageListeners.delete(kind);
      }
    };
  }

  /**
   * Unregister message listener
   */
  off(kind: MessageKind, listener?: (payload: any) => void): void {
    if (!listener) {
      // Remove all listeners for this kind
      this.messageListeners.delete(kind);
      return;
    }

    const listeners = this.messageListeners.get(kind);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.messageListeners.delete(kind);
      }
    }
  }

  /**
   * Handle incoming message from service worker
   */
  private handleIncomingMessage(message: BaseMessage<any, any>): void {
    const { kind, payload } = message;

    const listeners = this.messageListeners.get(kind);
    if (!listeners || listeners.size === 0) {
      return;
    }

    // Notify all listeners
    listeners.forEach(listener => {
      try {
        listener(payload);
      } catch (error) {
        console.error('[CommunicationManager] Error in message listener:', {
          kind,
          error,
        });
      }
    });
  }

  /**
   * Check if service worker is available
   */
  async checkServiceWorker(): Promise<boolean> {
    try {
      const response = await this.sendMessage('PING', {}, { timeout: 5000 });
      return response.success;
    } catch (error) {
      console.error('[CommunicationManager] Service worker check failed:', error);
      return false;
    }
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.messageListeners.clear();
    this.isInitialized = false;
  }
}
