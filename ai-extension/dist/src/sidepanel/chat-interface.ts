/**
 * Chat Interface
 * 
 * Implements the chat UI with streaming response display and cancellation support.
 * Requirements: 8.1, 8.2, 8.3, 8.7, 8.9, 11.2
 */

import type {
  AiStreamRequestPayload,
  AiStreamChunkPayload,
  AiStreamEndPayload,
  AiStreamErrorPayload,
  AiCancelRequestPayload,
  BaseMessage
} from '../shared/types/index.d';
import { MessageDisplay, type Message } from './message-display';

/**
 * Chat Interface class
 * Manages the chat UI and streaming responses
 */
export class ChatInterface {
  private messageDisplay: MessageDisplay;
  private currentStreamingMessageId: string | null = null;
  private currentRequestId: string | null = null;
  private conversationId: string;

  // DOM elements
  private container: HTMLElement;
  private inputField!: HTMLTextAreaElement;
  private sendButton!: HTMLButtonElement;
  private cancelButton!: HTMLButtonElement;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element with id "${containerId}" not found`);
    }

    this.container = container;
    this.conversationId = crypto.randomUUID();

    // Initialize UI
    this.initializeUI();

    // Initialize message display with virtual scrolling
    const messageListContainer = this.container.querySelector('.message-list-container');
    if (!messageListContainer) {
      throw new Error('Message list container not found');
    }
    this.messageDisplay = new MessageDisplay(messageListContainer.id);

    // Set up message listener
    this.setupMessageListener();

    // Set up keyboard shortcuts
    this.setupKeyboardShortcuts();
  }

  /**
   * Initialize the chat UI
   * Requirement 8.1: Clean chat interface with message history
   */
  private initializeUI(): void {
    this.container.innerHTML = `
      <div class="chat-container">
        <div class="chat-header">
          <h2>AI Pocket Assistant</h2>
          <div class="chat-status" id="chat-status"></div>
        </div>
        
        <div class="message-list-container" id="message-list-container">
          <div class="welcome-message">
            <p>👋 Welcome to AI Pocket!</p>
            <p>Ask me anything about your saved content or start a conversation.</p>
          </div>
        </div>
        
        <div class="chat-input-container">
          <div class="typing-indicator" id="typing-indicator" style="display: none;" aria-live="polite">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="typing-text">AI is thinking...</span>
          </div>
          
          <div class="input-wrapper">
            <textarea 
              id="chat-input" 
              class="chat-input" 
              placeholder="Type your message..." 
              rows="1"
              aria-label="Chat message input"
            ></textarea>
            
            <div class="button-group">
              <button 
                id="cancel-button" 
                class="cancel-button" 
                style="display: none;"
                aria-label="Cancel current request"
                title="Cancel (Esc)"
              >
                ✕ Cancel
              </button>
              
              <button 
                id="send-button" 
                class="send-button"
                aria-label="Send message"
                title="Send (Ctrl+Enter)"
              >
                ➤ Send
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Get DOM references
    this.inputField = document.getElementById('chat-input') as HTMLTextAreaElement;
    this.sendButton = document.getElementById('send-button') as HTMLButtonElement;
    this.cancelButton = document.getElementById('cancel-button') as HTMLButtonElement;

    // Set up event listeners
    this.sendButton.addEventListener('click', () => this.handleSend());
    this.cancelButton.addEventListener('click', () => this.handleCancel());
    this.inputField.addEventListener('input', () => this.handleInputChange());
  }

  /**
   * Set up keyboard shortcuts
   * Requirement 11.2: Handle keyboard shortcuts
   */
  private setupKeyboardShortcuts(): void {
    this.inputField.addEventListener('keydown', (event) => {
      // Ctrl+Enter or Cmd+Enter to send
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        this.handleSend();
      }

      // Escape to cancel
      if (event.key === 'Escape' && this.currentRequestId) {
        event.preventDefault();
        this.handleCancel();
      }
    });
  }

  /**
   * Handle input field changes (auto-resize)
   */
  private handleInputChange(): void {
    // Auto-resize textarea
    this.inputField.style.height = 'auto';
    this.inputField.style.height = Math.min(this.inputField.scrollHeight, 150) + 'px';
  }

  /**
   * Handle send button click
   * Requirement 8.2: User can type and send messages
   */
  private async handleSend(): Promise<void> {
    const message = this.inputField.value.trim();

    if (!message || this.currentRequestId) {
      return;
    }

    // Hide welcome message if it exists
    this.hideWelcomeMessage();

    // Add user message to UI
    this.addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: Date.now()
    });

    // Clear input
    this.inputField.value = '';
    this.handleInputChange();

    // Show typing indicator
    this.showTypingIndicator();

    // Send streaming request
    try {
      const payload: AiStreamRequestPayload = {
        prompt: message,
        conversationId: this.conversationId,
        preferLocal: true
      };

      const response = await this.sendMessage({
        kind: 'AI_PROCESS_STREAM_START',
        requestId: crypto.randomUUID(),
        payload
      });

      if (response.success && response.data) {
        this.currentRequestId = response.data.requestId;
        this.showCancelButton();
      } else {
        this.hideTypingIndicator();
        this.showError('Failed to start AI processing');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      this.hideTypingIndicator();
      this.showError('Failed to send message');
    }
  }

  /**
   * Handle cancel button click
   * Requirement 8.3: Add cancellation support
   */
  private async handleCancel(): Promise<void> {
    if (!this.currentRequestId) {
      return;
    }

    try {
      const payload: AiCancelRequestPayload = {
        requestId: this.currentRequestId
      };

      await this.sendMessage({
        kind: 'AI_PROCESS_CANCEL',
        requestId: crypto.randomUUID(),
        payload
      });

      // Clean up current streaming message
      if (this.currentStreamingMessageId) {
        const messages = this.messageDisplay.getMessages();
        const message = messages.find(m => m.id === this.currentStreamingMessageId);
        if (message) {
          this.messageDisplay.updateMessage(this.currentStreamingMessageId, {
            isStreaming: false,
            content: message.content + '\n\n[Cancelled by user]'
          });
        }
      }

      this.currentRequestId = null;
      this.currentStreamingMessageId = null;
      this.hideTypingIndicator();
      this.hideCancelButton();
    } catch (error) {
      console.error('Error cancelling request:', error);
    }
  }

  /**
   * Set up message listener for streaming responses
   * Requirement 8.3: Stream responses in real-time
   */
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message: BaseMessage<any, any>) => {
      switch (message.kind) {
        case 'AI_PROCESS_STREAM_START':
          this.handleStreamStart(message.payload);
          break;

        case 'AI_PROCESS_STREAM_CHUNK':
          this.handleStreamChunk(message.payload);
          break;

        case 'AI_PROCESS_STREAM_END':
          this.handleStreamEnd(message.payload);
          break;

        case 'AI_PROCESS_STREAM_ERROR':
          this.handleStreamError(message.payload);
          break;
      }
    });
  }

  /**
   * Handle stream start
   */
  private handleStreamStart(payload: any): void {
    console.log('Stream started:', payload);

    // Create new assistant message
    const messageId = crypto.randomUUID();
    this.currentStreamingMessageId = messageId;

    this.addMessage({
      id: messageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true
    });

    this.hideTypingIndicator();
  }

  /**
   * Handle stream chunk
   * Requirement 8.3: Implement progressive UI updates
   */
  private handleStreamChunk(payload: AiStreamChunkPayload): void {
    if (!this.currentStreamingMessageId) {
      return;
    }

    const messages = this.messageDisplay.getMessages();
    const message = messages.find(m => m.id === this.currentStreamingMessageId);
    if (message) {
      this.messageDisplay.updateMessage(this.currentStreamingMessageId, {
        content: message.content + payload.chunk
      });
    }
  }

  /**
   * Handle stream end
   */
  private handleStreamEnd(payload: AiStreamEndPayload): void {
    if (!this.currentStreamingMessageId) {
      return;
    }

    this.messageDisplay.updateMessage(this.currentStreamingMessageId, {
      isStreaming: false,
      source: payload.source,
      processingTime: payload.processingTime,
      tokensUsed: payload.totalTokens
    });

    this.currentRequestId = null;
    this.currentStreamingMessageId = null;
    this.hideCancelButton();

    console.log('Stream completed:', payload);
  }

  /**
   * Handle stream error
   */
  private handleStreamError(payload: AiStreamErrorPayload): void {
    console.error('Stream error:', payload);

    if (this.currentStreamingMessageId) {
      const messages = this.messageDisplay.getMessages();
      const message = messages.find(m => m.id === this.currentStreamingMessageId);
      if (message) {
        this.messageDisplay.updateMessage(this.currentStreamingMessageId, {
          isStreaming: false,
          content: message.content + `\n\n❌ Error: ${payload.error}`
        });
      }
    } else {
      this.showError(payload.error);
    }

    this.currentRequestId = null;
    this.currentStreamingMessageId = null;
    this.hideTypingIndicator();
    this.hideCancelButton();
  }

  /**
   * Add message to the chat
   * Requirement 8.1: Display message history
   */
  private addMessage(message: Message): void {
    this.messageDisplay.addMessage(message);
  }
  
  /**
   * Hide welcome message
   */
  private hideWelcomeMessage(): void {
    const welcomeMessage = this.container.querySelector('.welcome-message');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }
  }

  /**
   * Show typing indicator
   * Requirement 8.9: Display typing indicator during processing
   */
  private showTypingIndicator(): void {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
      indicator.style.display = 'flex';
    }
  }

  /**
   * Hide typing indicator
   */
  private hideTypingIndicator(): void {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  /**
   * Show cancel button
   */
  private showCancelButton(): void {
    this.cancelButton.style.display = 'block';
    this.sendButton.style.display = 'none';
  }

  /**
   * Hide cancel button
   */
  private hideCancelButton(): void {
    this.cancelButton.style.display = 'none';
    this.sendButton.style.display = 'block';
  }

  /**
   * Show error message
   */
  private showError(error: string): void {
    this.hideWelcomeMessage();
    this.addMessage({
      id: crypto.randomUUID(),
      role: 'system',
      content: `❌ ${error}`,
      timestamp: Date.now()
    });
  }

  /**
   * Send message to service worker
   */
  private async sendMessage(message: BaseMessage<any, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Clear conversation
   */
  clearConversation(): void {
    this.messageDisplay.clearMessages();
    
    // Show welcome message again
    const container = this.container.querySelector('.message-list-container');
    if (container) {
      const welcomeMessage = document.createElement('div');
      welcomeMessage.className = 'welcome-message';
      welcomeMessage.innerHTML = `
        <p>👋 Welcome to AI Pocket!</p>
        <p>Ask me anything about your saved content or start a conversation.</p>
      `;
      container.appendChild(welcomeMessage);
    }
    
    this.conversationId = crypto.randomUUID();
  }

  /**
   * Get conversation history
   */
  getMessages(): Message[] {
    return this.messageDisplay.getMessages();
  }
  
  /**
   * Get message display instance
   */
  getMessageDisplay(): MessageDisplay {
    return this.messageDisplay;
  }
}
