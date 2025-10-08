/**
 * Streaming Display Component
 * 
 * Reusable component for displaying streaming text with progressive rendering,
 * visual feedback, and accessibility support.
 * 
 * Requirements: 8.3, 8.9
 */

/**
 * Streaming display configuration
 */
export interface StreamingDisplayConfig {
  /** Show blinking cursor during streaming */
  showCursor?: boolean;
  /** Cursor character (default: '▊') */
  cursorChar?: string;
  /** Enable smooth scrolling to new content */
  autoScroll?: boolean;
  /** Announce updates to screen readers */
  announceToScreenReader?: boolean;
  /** Debounce time for screen reader announcements (ms) */
  announceDebounce?: number;
}

/**
 * Streaming display state
 */
interface StreamingState {
  isStreaming: boolean;
  content: string;
  startTime: number;
  chunkCount: number;
}

/**
 * Streaming Display Component
 * 
 * Handles progressive text rendering with visual feedback and accessibility support.
 * Requirement 8.3: Stream responses in real-time for immediate feedback
 * Requirement 8.9: Display visual indicators during processing
 */
export class StreamingDisplay {
  private container: HTMLElement;
  private contentElement!: HTMLElement;
  private cursorElement: HTMLElement | null = null;
  private liveRegion: HTMLElement | null = null;
  
  private config: Required<StreamingDisplayConfig>;
  private state: StreamingState;
  
  private announceTimeout: number | null = null;
  private lastAnnouncedContent = '';
  
  /**
   * Create a new streaming display
   * 
   * @param container Container element for the streaming display
   * @param config Configuration options
   */
  constructor(container: HTMLElement, config: StreamingDisplayConfig = {}) {
    this.container = container;
    
    // Set default configuration
    this.config = {
      showCursor: config.showCursor ?? true,
      cursorChar: config.cursorChar ?? '▊',
      autoScroll: config.autoScroll ?? true,
      announceToScreenReader: config.announceToScreenReader ?? true,
      announceDebounce: config.announceDebounce ?? 1000
    };
    
    // Initialize state
    this.state = {
      isStreaming: false,
      content: '',
      startTime: 0,
      chunkCount: 0
    };
    
    // Initialize DOM
    this.initializeDOM();
  }
  
  /**
   * Initialize DOM structure
   */
  private initializeDOM(): void {
    // Clear container
    this.container.innerHTML = '';
    
    // Create content element
    this.contentElement = document.createElement('span');
    this.contentElement.className = 'streaming-content';
    this.container.appendChild(this.contentElement);
    
    // Create cursor element if enabled
    if (this.config.showCursor) {
      this.cursorElement = document.createElement('span');
      this.cursorElement.className = 'streaming-cursor';
      this.cursorElement.textContent = this.config.cursorChar;
      this.cursorElement.setAttribute('aria-hidden', 'true');
      this.container.appendChild(this.cursorElement);
    }
    
    // Create ARIA live region for screen reader announcements
    if (this.config.announceToScreenReader) {
      this.liveRegion = document.createElement('div');
      this.liveRegion.className = 'sr-only';
      this.liveRegion.setAttribute('role', 'status');
      this.liveRegion.setAttribute('aria-live', 'polite');
      this.liveRegion.setAttribute('aria-atomic', 'false');
      this.container.appendChild(this.liveRegion);
    }
  }
  
  /**
   * Start streaming
   * Requirement 8.9: Show visual indicator when streaming starts
   */
  startStreaming(): void {
    this.state.isStreaming = true;
    this.state.content = '';
    this.state.startTime = performance.now();
    this.state.chunkCount = 0;
    
    // Clear content
    this.contentElement.textContent = '';
    
    // Show cursor
    if (this.cursorElement) {
      this.cursorElement.style.display = 'inline';
      this.cursorElement.classList.add('blinking');
    }
    
    // Announce to screen reader
    this.announceToScreenReader('AI response streaming started');
  }
  
  /**
   * Append streaming chunk
   * Requirement 8.3: Progressive UI updates
   * 
   * @param chunk Text chunk to append
   */
  appendChunk(chunk: string): void {
    if (!this.state.isStreaming) {
      console.warn('StreamingDisplay: Cannot append chunk when not streaming');
      return;
    }
    
    // Update state
    this.state.content += chunk;
    this.state.chunkCount++;
    
    // Update content element
    this.contentElement.textContent = this.state.content;
    
    // Auto-scroll if enabled
    if (this.config.autoScroll) {
      this.scrollToEnd();
    }
    
    // Debounced screen reader announcement
    this.debouncedAnnounce();
  }
  
  /**
   * Stop streaming
   * Requirement 8.9: Hide visual indicator when streaming completes
   */
  stopStreaming(): void {
    this.state.isStreaming = false;
    
    // Hide cursor
    if (this.cursorElement) {
      this.cursorElement.classList.remove('blinking');
      this.cursorElement.style.display = 'none';
    }
    
    // Final screen reader announcement
    if (this.config.announceToScreenReader && this.state.content) {
      this.announceToScreenReader('AI response complete');
    }
    
    // Clear any pending announcements
    if (this.announceTimeout !== null) {
      clearTimeout(this.announceTimeout);
      this.announceTimeout = null;
    }
  }
  
  /**
   * Set content directly (non-streaming)
   * 
   * @param content Content to display
   */
  setContent(content: string): void {
    this.state.content = content;
    this.contentElement.textContent = content;
    
    // Hide cursor
    if (this.cursorElement) {
      this.cursorElement.style.display = 'none';
    }
  }
  
  /**
   * Get current content
   */
  getContent(): string {
    return this.state.content;
  }
  
  /**
   * Check if currently streaming
   */
  isStreaming(): boolean {
    return this.state.isStreaming;
  }
  
  /**
   * Get streaming statistics
   */
  getStats(): {
    chunkCount: number;
    duration: number;
    contentLength: number;
  } {
    return {
      chunkCount: this.state.chunkCount,
      duration: this.state.isStreaming 
        ? performance.now() - this.state.startTime 
        : 0,
      contentLength: this.state.content.length
    };
  }
  
  /**
   * Clear content
   */
  clear(): void {
    this.state.content = '';
    this.state.chunkCount = 0;
    this.contentElement.textContent = '';
    this.lastAnnouncedContent = '';
    
    if (this.announceTimeout !== null) {
      clearTimeout(this.announceTimeout);
      this.announceTimeout = null;
    }
  }
  
  /**
   * Scroll to end of content
   */
  private scrollToEnd(): void {
    // Scroll container to show new content
    const scrollContainer = this.findScrollContainer();
    if (scrollContainer) {
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });
    }
  }
  
  /**
   * Find the nearest scrollable container
   */
  private findScrollContainer(): HTMLElement | null {
    let element: HTMLElement | null = this.container;
    
    while (element && element !== document.body) {
      const overflow = window.getComputedStyle(element).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') {
        return element;
      }
      element = element.parentElement;
    }
    
    return null;
  }
  
  /**
   * Announce content to screen reader with debouncing
   * Requirement 8.3: Ensure screen reader compatibility
   */
  private debouncedAnnounce(): void {
    if (!this.config.announceToScreenReader || !this.liveRegion) {
      return;
    }
    
    // Clear existing timeout
    if (this.announceTimeout !== null) {
      clearTimeout(this.announceTimeout);
    }
    
    // Set new timeout
    this.announceTimeout = window.setTimeout(() => {
      // Only announce if content has changed significantly
      const newContent = this.state.content;
      if (newContent.length - this.lastAnnouncedContent.length > 50) {
        this.announceToScreenReader('New content received');
        this.lastAnnouncedContent = newContent;
      }
      this.announceTimeout = null;
    }, this.config.announceDebounce);
  }
  
  /**
   * Announce message to screen reader
   * 
   * @param message Message to announce
   */
  private announceToScreenReader(message: string): void {
    if (!this.liveRegion) {
      return;
    }
    
    // Update live region
    this.liveRegion.textContent = message;
    
    // Clear after announcement
    setTimeout(() => {
      if (this.liveRegion) {
        this.liveRegion.textContent = '';
      }
    }, 1000);
  }
  
  /**
   * Update configuration
   * 
   * @param config New configuration options
   */
  updateConfig(config: Partial<StreamingDisplayConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update cursor visibility
    if (this.cursorElement) {
      if (this.config.showCursor && this.state.isStreaming) {
        this.cursorElement.style.display = 'inline';
      } else {
        this.cursorElement.style.display = 'none';
      }
    }
  }
  
  /**
   * Destroy the streaming display
   */
  destroy(): void {
    if (this.announceTimeout !== null) {
      clearTimeout(this.announceTimeout);
    }
    
    this.container.innerHTML = '';
    this.state.isStreaming = false;
  }
}

/**
 * Create a streaming display instance
 * 
 * @param container Container element
 * @param config Configuration options
 * @returns StreamingDisplay instance
 */
export function createStreamingDisplay(
  container: HTMLElement,
  config?: StreamingDisplayConfig
): StreamingDisplay {
  return new StreamingDisplay(container, config);
}
