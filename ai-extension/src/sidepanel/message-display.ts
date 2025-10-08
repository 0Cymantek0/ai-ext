/**
 * Message Display Component with Virtual Scrolling
 * 
 * Implements efficient message rendering with virtual scrolling for long conversations.
 * Requirements: 8.1, 8.2, 8.7
 */

/**
 * Message interface
 */
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  source?: 'gemini-nano' | 'gemini-flash' | 'gemini-pro';
  isStreaming?: boolean;
  processingTime?: number;
  tokensUsed?: number;
}

/**
 * Message height cache entry
 */
interface MessageHeightCache {
  [messageId: string]: number;
}

/**
 * Visible range for virtual scrolling
 */
interface VisibleRange {
  startIndex: number;
  endIndex: number;
}

/**
 * Message Display Component
 * Implements virtual scrolling for efficient rendering of long message lists
 * Requirement 8.7: Virtual scrolling maintains 60fps performance
 */
export class MessageDisplay {
  private messages: Message[] = [];
  private messageHeights: MessageHeightCache = {};
  private container: HTMLElement;
  private scrollContainer: HTMLElement;
  private contentContainer: HTMLElement;
  private topSpacer: HTMLElement;
  private bottomSpacer: HTMLElement;
  
  // Virtual scrolling configuration
  private readonly ESTIMATED_MESSAGE_HEIGHT = 100; // Initial estimate
  private readonly BUFFER_SIZE = 5; // Number of messages to render outside viewport
  private readonly SCROLL_THROTTLE = 16; // ~60fps
  
  // State
  private visibleRange: VisibleRange = { startIndex: 0, endIndex: 0 };
  private scrollTimeout: number | null = null;
  private resizeObserver!: ResizeObserver;
  private isAutoScrollEnabled = true;
  private lastScrollHeight = 0;
  
  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element with id "${containerId}" not found`);
    }
    
    this.container = container;
    this.scrollContainer = this.createScrollContainer();
    this.contentContainer = this.createContentContainer();
    this.topSpacer = this.createSpacer();
    this.bottomSpacer = this.createSpacer();
    
    this.setupDOM();
    this.setupScrollListener();
    this.setupResizeObserver();
  }
  
  /**
   * Create scroll container
   */
  private createScrollContainer(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'message-list';
    element.setAttribute('role', 'log');
    element.setAttribute('aria-live', 'polite');
    element.setAttribute('aria-label', 'Chat messages');
    return element;
  }
  
  /**
   * Create content container for messages
   */
  private createContentContainer(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'message-list-content';
    element.style.position = 'relative';
    return element;
  }
  
  /**
   * Create spacer element for virtual scrolling
   */
  private createSpacer(): HTMLElement {
    const element = document.createElement('div');
    element.style.height = '0px';
    return element;
  }
  
  /**
   * Set up DOM structure
   */
  private setupDOM(): void {
    this.scrollContainer.appendChild(this.topSpacer);
    this.scrollContainer.appendChild(this.contentContainer);
    this.scrollContainer.appendChild(this.bottomSpacer);
    this.container.appendChild(this.scrollContainer);
  }
  
  /**
   * Set up scroll event listener with throttling
   * Requirement 8.7: Efficient scroll handling
   */
  private setupScrollListener(): void {
    this.scrollContainer.addEventListener('scroll', () => {
      // Disable auto-scroll if user scrolls up
      const isAtBottom = this.isScrolledToBottom();
      this.isAutoScrollEnabled = isAtBottom;
      
      // Throttle scroll updates
      if (this.scrollTimeout !== null) {
        return;
      }
      
      this.scrollTimeout = window.setTimeout(() => {
        this.updateVisibleRange();
        this.render();
        this.scrollTimeout = null;
      }, this.SCROLL_THROTTLE);
    });
  }
  
  /**
   * Set up resize observer to track message heights
   * Requirement 8.7: Dynamic height tracking
   */
  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      let needsUpdate = false;
      
      for (const entry of entries) {
        const messageElement = entry.target as HTMLElement;
        const messageId = messageElement.dataset.messageId;
        
        if (messageId) {
          const newHeight = entry.contentRect.height;
          const oldHeight = this.messageHeights[messageId];
          
          if (oldHeight !== newHeight) {
            this.messageHeights[messageId] = newHeight;
            needsUpdate = true;
          }
        }
      }
      
      if (needsUpdate) {
        this.updateSpacers();
      }
    });
  }
  
  /**
   * Add a message to the display
   * Requirement 8.1: Display message history
   */
  addMessage(message: Message): void {
    this.messages.push(message);
    
    // Initialize height estimate
    if (!this.messageHeights[message.id]) {
      this.messageHeights[message.id] = this.ESTIMATED_MESSAGE_HEIGHT;
    }
    
    // Update visible range and render
    this.updateVisibleRange();
    this.render();
    
    // Auto-scroll to bottom if enabled
    if (this.isAutoScrollEnabled) {
      this.scrollToBottom();
    }
  }
  
  /**
   * Update an existing message
   * Requirement 8.3: Update streaming messages
   */
  updateMessage(messageId: string, updates: Partial<Message>): void {
    const index = this.messages.findIndex(m => m.id === messageId);
    if (index === -1) {
      return;
    }
    
    const currentMessage = this.messages[index];
    if (!currentMessage) {
      return;
    }
    
    // Update message data
    this.messages[index] = { ...currentMessage, ...updates };
    
    // Re-render if message is visible
    if (this.isMessageVisible(index)) {
      const updatedMessage = this.messages[index];
      if (updatedMessage) {
        this.renderMessage(updatedMessage, index);
      }
    }
    
    // Auto-scroll if at bottom
    if (this.isAutoScrollEnabled) {
      this.scrollToBottom();
    }
  }
  
  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = [];
    this.messageHeights = {};
    this.visibleRange = { startIndex: 0, endIndex: 0 };
    this.contentContainer.innerHTML = '';
    this.updateSpacers();
  }
  
  /**
   * Get all messages
   */
  getMessages(): Message[] {
    return [...this.messages];
  }
  
  /**
   * Update visible range based on scroll position
   * Requirement 8.7: Calculate which messages should be rendered
   */
  private updateVisibleRange(): void {
    const scrollTop = this.scrollContainer.scrollTop;
    const viewportHeight = this.scrollContainer.clientHeight;
    
    let currentHeight = 0;
    let startIndex = 0;
    let endIndex = this.messages.length;
    
    // Find start index
    for (let i = 0; i < this.messages.length; i++) {
      const message = this.messages[i];
      if (!message) continue;
      
      const messageHeight = this.getMessageHeight(message.id);
      
      if (currentHeight + messageHeight > scrollTop) {
        startIndex = Math.max(0, i - this.BUFFER_SIZE);
        break;
      }
      
      currentHeight += messageHeight;
    }
    
    // Find end index
    currentHeight = 0;
    for (let i = 0; i < this.messages.length; i++) {
      const message = this.messages[i];
      if (!message) continue;
      
      const messageHeight = this.getMessageHeight(message.id);
      currentHeight += messageHeight;
      
      if (currentHeight > scrollTop + viewportHeight) {
        endIndex = Math.min(this.messages.length, i + this.BUFFER_SIZE + 1);
        break;
      }
    }
    
    this.visibleRange = { startIndex, endIndex };
  }
  
  /**
   * Render visible messages
   * Requirement 8.7: Only render messages in viewport
   */
  private render(): void {
    const { startIndex, endIndex } = this.visibleRange;
    
    // Clear content container
    this.contentContainer.innerHTML = '';
    
    // Render visible messages
    for (let i = startIndex; i < endIndex; i++) {
      const message = this.messages[i];
      if (message) {
        this.renderMessage(message, i);
      }
    }
    
    // Update spacers
    this.updateSpacers();
  }
  
  /**
   * Render a single message
   * Requirement 8.2: Add message rendering
   */
  private renderMessage(message: Message, index: number): void {
    // Check if message element already exists
    let messageElement = this.contentContainer.querySelector(
      `[data-message-id="${message.id}"]`
    ) as HTMLElement;
    
    if (!messageElement) {
      messageElement = this.createMessageElement(message);
      this.contentContainer.appendChild(messageElement);
      
      // Observe for height changes
      this.resizeObserver.observe(messageElement);
    } else {
      // Update existing element
      this.updateMessageElement(messageElement, message);
    }
  }
  
  /**
   * Create message DOM element
   * Requirement 8.1: Message display with proper structure
   */
  private createMessageElement(message: Message): HTMLElement {
    const messageElement = document.createElement('div');
    messageElement.className = `message message-${message.role}`;
    messageElement.dataset.messageId = message.id;
    messageElement.setAttribute('role', 'article');
    messageElement.setAttribute('aria-label', `${message.role} message`);
    
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    contentElement.textContent = message.content;
    
    const metaElement = document.createElement('div');
    metaElement.className = 'message-meta';
    metaElement.innerHTML = this.formatMessageMeta(message);
    
    messageElement.appendChild(contentElement);
    messageElement.appendChild(metaElement);
    
    return messageElement;
  }
  
  /**
   * Update message element content
   */
  private updateMessageElement(element: HTMLElement, message: Message): void {
    const contentElement = element.querySelector('.message-content');
    if (contentElement) {
      contentElement.textContent = message.content;
    }
    
    const metaElement = element.querySelector('.message-meta');
    if (metaElement) {
      metaElement.innerHTML = this.formatMessageMeta(message);
    }
    
    // Update streaming class
    if (message.isStreaming) {
      element.classList.add('streaming');
    } else {
      element.classList.remove('streaming');
    }
  }
  
  /**
   * Format message metadata
   */
  private formatMessageMeta(message: Message): string {
    const timeString = new Date(message.timestamp).toLocaleTimeString();
    let meta = timeString;
    
    if (message.source) {
      meta += ` • ${this.formatSource(message.source)}`;
    }
    
    if (message.isStreaming) {
      meta += ' • <span class="streaming-indicator">Streaming...</span>';
    }
    
    if (message.processingTime) {
      meta += ` • ${message.processingTime}ms`;
    }
    
    if (message.tokensUsed) {
      meta += ` • ${message.tokensUsed} tokens`;
    }
    
    return meta;
  }
  
  /**
   * Format AI source name
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
   * Update spacer heights for virtual scrolling
   * Requirement 8.7: Maintain correct scroll height
   */
  private updateSpacers(): void {
    const { startIndex, endIndex } = this.visibleRange;
    
    // Calculate top spacer height (messages before visible range)
    let topHeight = 0;
    for (let i = 0; i < startIndex; i++) {
      const message = this.messages[i];
      if (message) {
        topHeight += this.getMessageHeight(message.id);
      }
    }
    
    // Calculate bottom spacer height (messages after visible range)
    let bottomHeight = 0;
    for (let i = endIndex; i < this.messages.length; i++) {
      const message = this.messages[i];
      if (message) {
        bottomHeight += this.getMessageHeight(message.id);
      }
    }
    
    this.topSpacer.style.height = `${topHeight}px`;
    this.bottomSpacer.style.height = `${bottomHeight}px`;
  }
  
  /**
   * Get message height from cache or estimate
   */
  private getMessageHeight(messageId: string): number {
    return this.messageHeights[messageId] || this.ESTIMATED_MESSAGE_HEIGHT;
  }
  
  /**
   * Check if message is currently visible
   */
  private isMessageVisible(index: number): boolean {
    return index >= this.visibleRange.startIndex && index < this.visibleRange.endIndex;
  }
  
  /**
   * Check if scrolled to bottom
   */
  private isScrolledToBottom(): boolean {
    const threshold = 50; // pixels from bottom
    const scrollTop = this.scrollContainer.scrollTop;
    const scrollHeight = this.scrollContainer.scrollHeight;
    const clientHeight = this.scrollContainer.clientHeight;
    
    return scrollHeight - scrollTop - clientHeight < threshold;
  }
  
  /**
   * Scroll to bottom of message list
   * Requirement 8.1: Auto-scroll for new messages
   */
  scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.scrollContainer.scrollTop = this.scrollContainer.scrollHeight;
      this.isAutoScrollEnabled = true;
    });
  }
  
  /**
   * Enable auto-scroll
   */
  enableAutoScroll(): void {
    this.isAutoScrollEnabled = true;
  }
  
  /**
   * Disable auto-scroll
   */
  disableAutoScroll(): void {
    this.isAutoScrollEnabled = false;
  }
  
  /**
   * Get scroll container element
   */
  getScrollContainer(): HTMLElement {
    return this.scrollContainer;
  }
  
  /**
   * Destroy the message display
   */
  destroy(): void {
    this.resizeObserver.disconnect();
    
    if (this.scrollTimeout !== null) {
      clearTimeout(this.scrollTimeout);
    }
    
    this.contentContainer.innerHTML = '';
    this.messages = [];
    this.messageHeights = {};
  }
}
