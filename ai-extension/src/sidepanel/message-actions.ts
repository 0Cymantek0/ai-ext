/**
 * Message Actions Component
 * 
 * Implements action buttons for messages (copy, regenerate).
 * Requirements: 8.4, 11.2
 */

export interface MessageActionsConfig {
  onCopy?: (messageId: string, content: string) => void;
  onRegenerate?: (messageId: string) => void;
  showCopy?: boolean;
  showRegenerate?: boolean;
}

/**
 * Message Actions class
 * Manages action buttons for individual messages
 */
export class MessageActions {
  private container: HTMLElement;
  private messageId: string;
  private content: string;
  private config: MessageActionsConfig;

  constructor(
    messageId: string,
    content: string,
    config: MessageActionsConfig = {}
  ) {
    this.messageId = messageId;
    this.content = content;
    this.config = {
      showCopy: true,
      showRegenerate: true,
      ...config
    };

    this.container = this.createActionsContainer();
  }

  /**
   * Create actions container
   * Requirement 8.4: Options to copy, regenerate
   */
  private createActionsContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'message-actions';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Message actions');

    // Add copy button
    if (this.config.showCopy) {
      const copyButton = this.createCopyButton();
      container.appendChild(copyButton);
    }

    // Add regenerate button
    if (this.config.showRegenerate) {
      const regenerateButton = this.createRegenerateButton();
      container.appendChild(regenerateButton);
    }

    return container;
  }

  /**
   * Create copy button
   * Requirement 8.4: Implement copy button
   * Requirement 11.2: Keyboard accessible
   */
  private createCopyButton(): HTMLElement {
    const button = document.createElement('button');
    button.className = 'message-action-button copy-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'Copy message to clipboard');
    button.title = 'Copy to clipboard';
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M4 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M6 0h6a2 2 0 0 1 2 2v6" stroke="currentColor" stroke-width="1.5" fill="none"/>
      </svg>
      <span class="button-text">Copy</span>
    `;

    button.addEventListener('click', () => this.handleCopy(button));

    return button;
  }

  /**
   * Create regenerate button
   * Requirement 8.4: Add regenerate option
   * Requirement 11.2: Keyboard accessible
   */
  private createRegenerateButton(): HTMLElement {
    const button = document.createElement('button');
    button.className = 'message-action-button regenerate-button';
    button.type = 'button';
    button.setAttribute('aria-label', 'Regenerate response');
    button.title = 'Regenerate response';
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M14 8a6 6 0 1 1-6-6 6 6 0 0 1 6 6z" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M8 2v6l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M8 2 6 4M8 2l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <span class="button-text">Regenerate</span>
    `;

    button.addEventListener('click', () => this.handleRegenerate(button));

    return button;
  }

  /**
   * Handle copy button click
   * Requirement 8.4: Copy message content
   */
  private async handleCopy(button: HTMLElement): Promise<void> {
    try {
      // Copy to clipboard
      await navigator.clipboard.writeText(this.content);

      // Show success feedback
      this.showCopySuccess(button);

      // Call callback if provided
      if (this.config.onCopy) {
        this.config.onCopy(this.messageId, this.content);
      }

      // Announce to screen readers
      this.announceToScreenReader('Message copied to clipboard');
    } catch (error) {
      console.error('Failed to copy message:', error);
      this.showCopyError(button);
      this.announceToScreenReader('Failed to copy message');
    }
  }

  /**
   * Handle regenerate button click
   * Requirement 8.4: Regenerate response
   */
  private handleRegenerate(button: HTMLElement): void {
    // Disable button during regeneration
    button.setAttribute('disabled', 'true');
    button.classList.add('loading');

    // Call callback if provided
    if (this.config.onRegenerate) {
      this.config.onRegenerate(this.messageId);
    }

    // Announce to screen readers
    this.announceToScreenReader('Regenerating response');
  }

  /**
   * Show copy success feedback
   */
  private showCopySuccess(button: HTMLElement): void {
    const originalHTML = button.innerHTML;
    
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M13 4L6 11L3 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="button-text">Copied!</span>
    `;
    button.classList.add('success');

    // Reset after 2 seconds
    setTimeout(() => {
      button.innerHTML = originalHTML;
      button.classList.remove('success');
    }, 2000);
  }

  /**
   * Show copy error feedback
   */
  private showCopyError(button: HTMLElement): void {
    const originalHTML = button.innerHTML;
    
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M8 2v6M8 10v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <span class="button-text">Failed</span>
    `;
    button.classList.add('error');

    // Reset after 2 seconds
    setTimeout(() => {
      button.innerHTML = originalHTML;
      button.classList.remove('error');
    }, 2000);
  }

  /**
   * Announce message to screen readers
   * Requirement 11.2: Screen reader support
   */
  private announceToScreenReader(message: string): void {
    const announcement = document.createElement('div');
    announcement.className = 'sr-only';
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.textContent = message;

    document.body.appendChild(announcement);

    // Remove after announcement
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }

  /**
   * Get the actions container element
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Update message content (for regeneration)
   */
  updateContent(content: string): void {
    this.content = content;
  }

  /**
   * Enable regenerate button
   */
  enableRegenerate(): void {
    const regenerateButton = this.container.querySelector('.regenerate-button');
    if (regenerateButton) {
      regenerateButton.removeAttribute('disabled');
      regenerateButton.classList.remove('loading');
    }
  }

  /**
   * Disable regenerate button
   */
  disableRegenerate(): void {
    const regenerateButton = this.container.querySelector('.regenerate-button');
    if (regenerateButton) {
      regenerateButton.setAttribute('disabled', 'true');
    }
  }

  /**
   * Show/hide actions
   */
  setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'flex' : 'none';
  }

  /**
   * Destroy the actions component
   */
  destroy(): void {
    this.container.remove();
  }
}
