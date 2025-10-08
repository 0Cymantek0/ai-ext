/**
 * Conversation Sidebar
 * UI component for displaying and managing conversation history
 * Requirements: 8.8, 7.6
 */

import type { ConversationSummary } from './conversation-manager';

/**
 * Conversation Sidebar class
 * Displays conversation history and handles user interactions
 */
export class ConversationSidebar {
  private container: HTMLElement;
  private conversations: ConversationSummary[] = [];
  private currentConversationId: string | null = null;
  private onSwitchCallback: ((conversationId: string) => void) | null = null;
  private onNewCallback: (() => void) | null = null;
  private onDeleteCallback: ((conversationId: string) => void) | null = null;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element with id "${containerId}" not found`);
    }
    this.container = container;
    this.render();
  }

  /**
   * Render the sidebar UI
   */
  private render(): void {
    this.container.innerHTML = `
      <div class="conversation-sidebar">
        <div class="sidebar-header">
          <h3>Conversations</h3>
          <button 
            id="new-conversation-btn" 
            class="icon-button" 
            aria-label="New conversation"
            title="New conversation"
          >
            ➕
          </button>
        </div>
        
        <div class="conversation-list" id="conversation-list" role="list">
          <div class="empty-state">
            <p>No conversations yet</p>
            <p class="empty-state-hint">Start a new conversation to begin</p>
          </div>
        </div>
      </div>
    `;

    // Set up event listeners
    const newBtn = document.getElementById('new-conversation-btn');
    if (newBtn) {
      newBtn.addEventListener('click', () => this.handleNewConversation());
    }
  }

  /**
   * Update the conversation list
   * Requirement 7.6: Display conversation content
   */
  updateConversations(conversations: ConversationSummary[]): void {
    this.conversations = conversations;
    this.renderConversationList();
  }

  /**
   * Set the current active conversation
   * Requirement 8.8: Highlight active conversation
   */
  setCurrentConversation(conversationId: string | null): void {
    this.currentConversationId = conversationId;
    this.renderConversationList();
  }

  /**
   * Render the conversation list
   */
  private renderConversationList(): void {
    const listContainer = document.getElementById('conversation-list');
    if (!listContainer) return;

    if (this.conversations.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <p>No conversations yet</p>
          <p class="empty-state-hint">Start a new conversation to begin</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = this.conversations
      .map(conv => this.renderConversationItem(conv))
      .join('');

    // Add event listeners to conversation items
    this.conversations.forEach(conv => {
      const item = document.getElementById(`conv-${conv.id}`);
      if (item) {
        item.addEventListener('click', () => this.handleConversationClick(conv.id));
        
        const deleteBtn = item.querySelector('.delete-conversation-btn');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleDeleteConversation(conv.id);
          });
        }
      }
    });
  }

  /**
   * Render a single conversation item
   */
  private renderConversationItem(conversation: ConversationSummary): string {
    const isActive = conversation.id === this.currentConversationId;
    const date = this.formatDate(conversation.updatedAt);
    
    return `
      <div 
        id="conv-${conversation.id}"
        class="conversation-item ${isActive ? 'active' : ''}"
        role="listitem"
        tabindex="0"
        aria-label="${conversation.title}"
        aria-current="${isActive ? 'true' : 'false'}"
      >
        <div class="conversation-content">
          <div class="conversation-header">
            <h4 class="conversation-title">${this.escapeHtml(conversation.title)}</h4>
            <button 
              class="delete-conversation-btn icon-button-small"
              aria-label="Delete conversation"
              title="Delete conversation"
            >
              🗑️
            </button>
          </div>
          <p class="conversation-preview">${this.escapeHtml(conversation.preview)}</p>
          <div class="conversation-meta">
            <span class="message-count">${conversation.messageCount} messages</span>
            <span class="conversation-date">${date}</span>
          </div>
        </div>
      </div>
    `;
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
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
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
   * Handle conversation click
   * Requirement 8.8: Implement switching
   */
  private handleConversationClick(conversationId: string): void {
    if (this.onSwitchCallback) {
      this.onSwitchCallback(conversationId);
    }
  }

  /**
   * Handle new conversation button click
   */
  private handleNewConversation(): void {
    if (this.onNewCallback) {
      this.onNewCallback();
    }
  }

  /**
   * Handle delete conversation button click
   */
  private handleDeleteConversation(conversationId: string): void {
    // Show confirmation dialog
    const conversation = this.conversations.find(c => c.id === conversationId);
    if (!conversation) return;

    const confirmed = confirm(
      `Are you sure you want to delete "${conversation.title}"?\n\nThis action cannot be undone.`
    );

    if (confirmed && this.onDeleteCallback) {
      this.onDeleteCallback(conversationId);
    }
  }

  /**
   * Set callback for conversation switch
   */
  onSwitch(callback: (conversationId: string) => void): void {
    this.onSwitchCallback = callback;
  }

  /**
   * Set callback for new conversation
   */
  onNew(callback: () => void): void {
    this.onNewCallback = callback;
  }

  /**
   * Set callback for delete conversation
   */
  onDelete(callback: (conversationId: string) => void): void {
    this.onDeleteCallback = callback;
  }

  /**
   * Show the sidebar
   */
  show(): void {
    this.container.style.display = 'block';
    this.container.setAttribute('aria-hidden', 'false');
  }

  /**
   * Hide the sidebar
   */
  hide(): void {
    this.container.style.display = 'none';
    this.container.setAttribute('aria-hidden', 'true');
  }

  /**
   * Toggle sidebar visibility
   */
  toggle(): void {
    if (this.container.style.display === 'none') {
      this.show();
    } else {
      this.hide();
    }
  }
}
