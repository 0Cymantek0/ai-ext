/**
 * Typing Indicator Component
 * 
 * Enhanced typing indicator with contextual messages and animations.
 * 
 * Requirements: 8.9
 */

/**
 * Typing indicator configuration
 */
export interface TypingIndicatorConfig {
  /** Messages to cycle through */
  messages?: string[];
  /** Time between message changes (ms) */
  messageInterval?: number;
  /** Show animated dots */
  showDots?: boolean;
  /** Custom CSS class */
  className?: string;
}

/**
 * Typing Indicator Component
 * 
 * Displays an animated typing indicator with contextual messages.
 * Requirement 8.9: Display typing indicator during processing
 */
export class TypingIndicator {
  private container: HTMLElement;
  private config: Required<TypingIndicatorConfig>;
  
  private dotsContainer: HTMLElement | null = null;
  private messageElement: HTMLElement | null = null;
  private messageIndex = 0;
  private messageInterval: number | null = null;
  
  private isVisible = false;
  
  /**
   * Default messages
   */
  private static readonly DEFAULT_MESSAGES = [
    'AI is thinking...',
    'Processing your request...',
    'Generating response...',
    'Almost there...'
  ];
  
  /**
   * Create a new typing indicator
   * 
   * @param container Container element
   * @param config Configuration options
   */
  constructor(container: HTMLElement, config: TypingIndicatorConfig = {}) {
    this.container = container;
    
    // Set default configuration
    this.config = {
      messages: config.messages ?? TypingIndicator.DEFAULT_MESSAGES,
      messageInterval: config.messageInterval ?? 2000,
      showDots: config.showDots ?? true,
      className: config.className ?? 'typing-indicator'
    };
    
    // Initialize DOM
    this.initializeDOM();
  }
  
  /**
   * Initialize DOM structure
   */
  private initializeDOM(): void {
    // Set container attributes
    this.container.className = this.config.className;
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-label', 'AI is processing');
    this.container.style.display = 'none';
    
    // Clear container
    this.container.innerHTML = '';
    
    // Create dots container if enabled
    if (this.config.showDots) {
      this.dotsContainer = document.createElement('div');
      this.dotsContainer.className = 'typing-dots';
      this.dotsContainer.setAttribute('aria-hidden', 'true');
      
      // Create three animated dots
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        this.dotsContainer.appendChild(dot);
      }
      
      this.container.appendChild(this.dotsContainer);
    }
    
    // Create message element
    this.messageElement = document.createElement('span');
    this.messageElement.className = 'typing-text';
    this.messageElement.textContent = this.config.messages[0] || '';
    this.container.appendChild(this.messageElement);
  }
  
  /**
   * Show the typing indicator
   * Requirement 8.9: Display indicator when AI is processing
   */
  show(): void {
    if (this.isVisible) {
      return;
    }
    
    this.isVisible = true;
    this.messageIndex = 0;
    
    // Show container
    this.container.style.display = 'flex';
    
    // Update message
    this.updateMessage();
    
    // Start message rotation if multiple messages
    if (this.config.messages.length > 1) {
      this.startMessageRotation();
    }
  }
  
  /**
   * Hide the typing indicator
   */
  hide(): void {
    if (!this.isVisible) {
      return;
    }
    
    this.isVisible = false;
    
    // Hide container
    this.container.style.display = 'none';
    
    // Stop message rotation
    this.stopMessageRotation();
  }
  
  /**
   * Check if indicator is visible
   */
  isShowing(): boolean {
    return this.isVisible;
  }
  
  /**
   * Set custom message
   * 
   * @param message Message to display
   */
  setMessage(message: string): void {
    if (this.messageElement) {
      this.messageElement.textContent = message;
    }
    
    // Stop rotation when custom message is set
    this.stopMessageRotation();
  }
  
  /**
   * Reset to default messages
   */
  resetMessages(): void {
    this.messageIndex = 0;
    this.updateMessage();
    
    if (this.isVisible && this.config.messages.length > 1) {
      this.startMessageRotation();
    }
  }
  
  /**
   * Update displayed message
   */
  private updateMessage(): void {
    if (!this.messageElement) {
      return;
    }
    
    const message = this.config.messages[this.messageIndex];
    if (message) {
      this.messageElement.textContent = message;
    }
  }
  
  /**
   * Start message rotation
   */
  private startMessageRotation(): void {
    this.stopMessageRotation();
    
    this.messageInterval = window.setInterval(() => {
      // Move to next message
      this.messageIndex = (this.messageIndex + 1) % this.config.messages.length;
      this.updateMessage();
    }, this.config.messageInterval);
  }
  
  /**
   * Stop message rotation
   */
  private stopMessageRotation(): void {
    if (this.messageInterval !== null) {
      clearInterval(this.messageInterval);
      this.messageInterval = null;
    }
  }
  
  /**
   * Update configuration
   * 
   * @param config New configuration options
   */
  updateConfig(config: Partial<TypingIndicatorConfig>): void {
    const wasVisible = this.isVisible;
    
    // Hide if visible
    if (wasVisible) {
      this.hide();
    }
    
    // Update config
    this.config = { ...this.config, ...config };
    
    // Reinitialize DOM
    this.initializeDOM();
    
    // Show again if was visible
    if (wasVisible) {
      this.show();
    }
  }
  
  /**
   * Destroy the typing indicator
   */
  destroy(): void {
    this.stopMessageRotation();
    this.container.innerHTML = '';
    this.isVisible = false;
  }
}

/**
 * Create a typing indicator instance
 * 
 * @param container Container element
 * @param config Configuration options
 * @returns TypingIndicator instance
 */
export function createTypingIndicator(
  container: HTMLElement,
  config?: TypingIndicatorConfig
): TypingIndicator {
  return new TypingIndicator(container, config);
}
