/**
 * History Overlay Component
 * Full-screen overlay for conversation history management
 * Requirements: 29.2, 29.3, 29.4, 29.5, 29.6, 29.8, 29.9
 */

import type { ConversationSummary } from './conversation-manager';

export interface HistoryOverlayCallbacks {
  onSwitch?: (conversationId: string) => void;
  onNew?: () => void;
  onDelete?: (conversationId: string) => void;
  onRename?: (conversationId: string, newTitle: string) => void;
}

/**
 * History Overlay class
 * Manages the full-screen conversation history overlay
 */
export class HistoryOverlay {
  private overlay: HTMLElement | null = null;
  private backdrop: HTMLElement | null = null;
  private isOpen: boolean = false;
  private conversations: ConversationSummary[] = [];
  private currentConversationId: string | null = null;
  private callbacks: HistoryOverlayCallbacks = {};
  private searchQuery: string = '';
  private longPressTimer: number | null = null;
  private longPressTarget: string | null = null;

  constructor(callbacks: HistoryOverlayCallbacks = {}) {
    this.callbacks = callbacks;
    this.createOverlay();
    this.setupEventListeners();
  }

  /**
   * Create the overlay DOM structure
   * Requirement 29.2: Create full-screen overlay
   */
  private createOverlay(): void {
    // Create backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'history-backdrop';
    this.backdrop.setAttribute('aria-hidden', 'true');

    // Create overlay container
    this.overlay = document.createElement('div');
    this.overlay.className = 'history-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', 'Conversation history');
    this.overlay.setAttribute('aria-hidden', 'true');

    // Build overlay content
    this.overlay.innerHTML = `
      <div class="history-overlay-content">
        <!-- Header with search -->
        <div class="history-header">
          <div class="search-container">
            <svg class="search-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2"/>
              <path d="M12.5 12.5L17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <input 
              type="search" 
              id="history-search-input"
              class="history-search-input" 
              placeholder="Search Grok History"
              aria-label="Search conversations"
            />
          </div>
          <button 
            id="history-close-button"
            class="history-close-btn" 
            aria-label="Close history"
            title="Close history"
            type="button"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M5 5L15 15M5 15L15 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <!-- Conversations Section -->
        <div class="history-conversations-section">
          <h2 class="history-section-title">CONVERSATIONS</h2>
          <div id="history-conversation-list" class="history-conversation-list" role="list">
            <!-- Conversation items will be inserted here -->
          </div>
        </div>
      </div>
    `;

    // Append to body
    document.body.appendChild(this.backdrop);
    document.body.appendChild(this.overlay);
  }

  /**
   * Set up event listeners
   * Requirement 29.6: Add backdrop click and ESC key to close
   */
  private setupEventListeners(): void {
    // Close button
    const closeBtn = document.getElementById('history-close-button');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Backdrop click
    if (this.backdrop) {
      this.backdrop.addEventListener('click', () => this.close());
    }

    // ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    // Search input
    const searchInput = document.getElementById('history-search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = (e.target as HTMLInputElement).value;
        this.renderConversationList();
      });
    }
  }

  /**
   * Open the overlay
   * Requirement 29.7: Implement slide-in animations
   */
  open(): void {
    if (this.isOpen) return;

    this.isOpen = true;

    // Show backdrop
    if (this.backdrop) {
      this.backdrop.classList.add('visible');
      this.backdrop.setAttribute('aria-hidden', 'false');
    }

    // Show overlay with animation
    if (this.overlay) {
      this.overlay.classList.add('open');
      this.overlay.setAttribute('aria-hidden', 'false');
      
      // Focus search input
      setTimeout(() => {
        const searchInput = document.getElementById('history-search-input') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }, 300); // Wait for animation to complete
    }

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    console.info('[HistoryOverlay] Opened');
  }

  /**
   * Close the overlay
   * Requirement 29.7: Implement slide-out animations
   */
  close(): void {
    if (!this.isOpen) return;

    this.isOpen = false;

    // Hide backdrop
    if (this.backdrop) {
      this.backdrop.classList.remove('visible');
      this.backdrop.setAttribute('aria-hidden', 'true');
    }

    // Hide overlay with animation
    if (this.overlay) {
      this.overlay.classList.remove('open');
      this.overlay.setAttribute('aria-hidden', 'true');
    }

    // Restore body scroll
    document.body.style.overflow = '';

    // Clear search
    const searchInput = document.getElementById('history-search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.value = '';
      this.searchQuery = '';
    }

    console.info('[HistoryOverlay] Closed');
  }

  /**
   * Toggle overlay open/close
   */
  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Update conversations list
   * Requirement 29.5: Create conversation list with titles, dates, and previews
   */
  updateConversations(conversations: ConversationSummary[]): void {
    this.conversations = conversations;
    this.renderConversationList();
  }

  /**
   * Set current active conversation
   */
  setCurrentConversation(conversationId: string | null): void {
    this.currentConversationId = conversationId;
    this.renderConversationList();
  }

  /**
   * Render the conversation list
   * Requirement 29.3: Add search functionality
   */
  private renderConversationList(): void {
    const listContainer = document.getElementById('history-conversation-list');
    if (!listContainer) return;

    // Filter conversations based on search query
    const filteredConversations = this.searchQuery
      ? this.conversations.filter(conv =>
          conv.title.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
          conv.preview.toLowerCase().includes(this.searchQuery.toLowerCase())
        )
      : this.conversations;

    if (filteredConversations.length === 0) {
      listContainer.innerHTML = `
        <div class="history-empty-state">
          <p>${this.searchQuery ? 'No conversations found' : 'No conversations yet'}</p>
          <p class="history-empty-hint">${this.searchQuery ? 'Try a different search term' : 'Start a new conversation to begin'}</p>
        </div>
      `;
      return;
    }

    // Render conversation items
    listContainer.innerHTML = filteredConversations
      .map(conv => this.renderConversationItem(conv))
      .join('');

    // Add event listeners
    filteredConversations.forEach(conv => {
      const item = document.getElementById(`history-conv-${conv.id}`);
      if (item) {
        // Click to switch conversation
        item.addEventListener('click', () => this.handleConversationClick(conv.id));

        // Long press for context menu
        this.setupLongPress(item, conv.id);

        // Keyboard support
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.handleConversationClick(conv.id);
          }
        });
      }
    });
  }

  /**
   * Render a single conversation item
   * Requirement 29.5: Display title, date, and preview
   */
  private renderConversationItem(conversation: ConversationSummary): string {
    const isActive = conversation.id === this.currentConversationId;
    const date = this.formatDate(conversation.updatedAt);
    
    return `
      <div 
        id="history-conv-${conversation.id}"
        class="history-conversation-item ${isActive ? 'active' : ''}"
        role="listitem"
        tabindex="0"
        aria-label="${this.escapeHtml(conversation.title)}"
        aria-current="${isActive ? 'true' : 'false'}"
      >
        <div class="history-conversation-content">
          <h3 class="history-conversation-title">${this.escapeHtml(conversation.title)}</h3>
          <p class="history-conversation-date">${date}</p>
          ${conversation.preview ? `<p class="history-conversation-preview">${this.escapeHtml(conversation.preview)}</p>` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Set up long press for context menu
   * Requirement 29.8: Add long-press context menu for delete/rename
   */
  private setupLongPress(element: HTMLElement, conversationId: string): void {
    let pressTimer: number | null = null;

    const startPress = () => {
      pressTimer = window.setTimeout(() => {
        this.showContextMenu(conversationId);
      }, 500); // 500ms for long press
    };

    const cancelPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    element.addEventListener('mousedown', startPress);
    element.addEventListener('touchstart', startPress);
    element.addEventListener('mouseup', cancelPress);
    element.addEventListener('mouseleave', cancelPress);
    element.addEventListener('touchend', cancelPress);
    element.addEventListener('touchcancel', cancelPress);

    // Context menu on right-click
    element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(conversationId);
    });
  }

  /**
   * Show context menu for conversation
   * Requirement 29.9: Implement delete/rename functionality
   */
  private showContextMenu(conversationId: string): void {
    const conversation = this.conversations.find(c => c.id === conversationId);
    if (!conversation) return;

    // Simple confirm dialogs for now (can be enhanced with custom modal later)
    const action = confirm(
      `Options for "${conversation.title}":\n\n` +
      `Click OK to DELETE this conversation.\n` +
      `Click Cancel to keep it.`
    );

    if (action) {
      // Delete conversation
      if (this.callbacks.onDelete) {
        this.callbacks.onDelete(conversationId);
      }
    }

    // TODO: Implement proper context menu with rename option
    // For now, we'll just support delete via confirm dialog
  }

  /**
   * Handle conversation click
   */
  private handleConversationClick(conversationId: string): void {
    if (this.callbacks.onSwitch) {
      this.callbacks.onSwitch(conversationId);
    }
    this.close();
  }

  /**
   * Format date for display
   */
  private formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    } else if (diffDays < 365) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Check if overlay is open
   */
  isOverlayOpen(): boolean {
    return this.isOpen;
  }

  /**
   * Destroy the overlay
   */
  destroy(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this.backdrop) {
      this.backdrop.remove();
      this.backdrop = null;
    }
  }
}
