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

/**
 * Message role
 */
type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Message interface
 */
interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  source?: 'gemini-nano' | 'gemini-flash' | 'gemini-pro';
  isStreaming?: boolean;
  processingTime?: number;
  tokensUsed?: number;
}

/**
 * Chat Interface class
 * Manages the chat UI and streaming responses
 */
export class ChatInterface {
  private messages: Message[] = [];
  private currentStreamingMessageId: string | null = null;
  private currentRequestId: string | null = null;
  private conversationId: string;

  // DOM elements
  private container: HTMLElement;
  private messageList!: HTMLElement;
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
        
        <div class="message-list" id="message-list" role="log" aria-live="polite" aria-label="Chat messages">
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
    this.messageList = document.getElementById('message-list')!;
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
        const message = this.messages.find(m => m.id === this.currentStreamingMessageId);
        if (message) {
          message.isStreaming = false;
          message.content += '\n\n[Cancelled by user]';
          this.updateMessageInDOM(message);
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

    const message = this.messages.find(m => m.id === this.currentStreamingMessageId);
    if (message) {
      message.content += payload.chunk;
      this.updateMessageInDOM(message);

      // Auto-scroll to bottom
      this.scrollToBottom();
    }
  }

  /**
   * Handle stream end
   */
  private handleStreamEnd(payload: AiStreamEndPayload): void {
    if (!this.currentStreamingMessageId) {
      return;
    }

    const message = this.messages.find(m => m.id === this.currentStreamingMessageId);
    if (message) {
      message.isStreaming = false;
      message.source = payload.source;
      message.processingTime = payload.processingTime;
      message.tokensUsed = payload.totalTokens;
      this.updateMessageInDOM(message);
    }

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
      const message = this.messages.find(m => m.id === this.currentStreamingMessageId);
      if (message) {
        message.isStreaming = false;
        message.content += `\n\n❌ Error: ${payload.error}`;
        this.updateMessageInDOM(message);
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
   */
  private addMessage(message: Message): void {
    this.messages.push(message);
    this.renderMessage(message);
    this.scrollToBottom();
  }

  /**
   * Render a message in the DOM
   * Requirement 8.1: Display message history
   * Requirement 8.7: Virtual scrolling for long conversations (simplified for MVP)
   */
  private renderMessage(message: Message): void {
    const messageElement = document.createElement('div');
    messageElement.className = `message message-${message.role}`;
    messageElement.id = `message-${message.id}`;
    messageElement.setAttribute('role', 'article');
    messageElement.setAttribute('aria-label', `${message.role} message`);

    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    contentElement.textContent = message.content;

    const metaElement = document.createElement('div');
    metaElement.className = 'message-meta';
    
    const timeString = new Date(message.timestamp).toLocaleTimeString();
    metaElement.textContent = timeString;

    if (message.source) {
      const sourceElement = document.createElement('span');
      sourceElement.className = 'message-source';
      sourceElement.textContent = ` • ${this.formatSource(message.source)}`;
      metaElement.appendChild(sourceElement);
    }

    if (message.isStreaming) {
      const streamingIndicator = document.createElement('span');
      streamingIndicator.className = 'streaming-indicator';
      streamingIndicator.textContent = ' • Streaming...';
      metaElement.appendChild(streamingIndicator);
    }

    messageElement.appendChild(contentElement);
    messageElement.appendChild(metaElement);

    // Remove welcome message if it exists
    const welcomeMessage = this.messageList.querySelector('.welcome-message');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }

    this.messageList.appendChild(messageElement);
  }

  /**
   * Update message in DOM
   */
  private updateMessageInDOM(message: Message): void {
    const messageElement = document.getElementById(`message-${message.id}`);
    if (!messageElement) {
      return;
    }

    const contentElement = messageElement.querySelector('.message-content');
    if (contentElement) {
      contentElement.textContent = message.content;
    }

    const metaElement = messageElement.querySelector('.message-meta');
    if (metaElement) {
      const timeString = new Date(message.timestamp).toLocaleTimeString();
      metaElement.textContent = timeString;

      if (message.source) {
        const sourceElement = document.createElement('span');
        sourceElement.className = 'message-source';
        sourceElement.textContent = ` • ${this.formatSource(message.source)}`;
        metaElement.appendChild(sourceElement);
      }

      if (message.isStreaming) {
        const streamingIndicator = document.createElement('span');
        streamingIndicator.className = 'streaming-indicator';
        streamingIndicator.textContent = ' • Streaming...';
        metaElement.appendChild(streamingIndicator);
      }
    }
  }

  /**
   * Format source name for display
   */
  private formatSource(source: string): string {
    const sourceMap: Record<string, string> = {
      'gemini-nano': 'Gemini Nano (Local)',
      'gemini-flash': 'Gemini Flash (Cloud)',
      'gemini-pro': 'Gemini Pro (Cloud)'
    };
    return sourceMap[source] || source;
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
    this.addMessage({
      id: crypto.randomUUID(),
      role: 'system',
      content: `❌ ${error}`,
      timestamp: Date.now()
    });
  }

  /**
   * Scroll to bottom of message list
   */
  private scrollToBottom(): void {
    this.messageList.scrollTop = this.messageList.scrollHeight;
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
    this.messages = [];
    this.messageList.innerHTML = `
      <div class="welcome-message">
        <p>👋 Welcome to AI Pocket!</p>
        <p>Ask me anything about your saved content or start a conversation.</p>
      </div>
    `;
    this.conversationId = crypto.randomUUID();
  }

  /**
   * Get conversation history
   */
  getMessages(): Message[] {
    return [...this.messages];
  }
}
