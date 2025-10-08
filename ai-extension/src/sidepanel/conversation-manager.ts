/**
 * Conversation Manager
 * Manages conversation history, switching, and persistence
 * Requirements: 8.8, 7.6
 */

import type { Conversation, Message } from '../background/indexeddb-manager';
import { StateManager } from './state-manager';

/**
 * Conversation summary for list display
 */
export interface ConversationSummary {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  pocketId?: string;
}

/**
 * Conversation Manager class
 * Requirement 8.8: Manage conversation history and switching
 * Requirement 7.6: Display conversation content
 */
export class ConversationManager {
  private stateManager: StateManager;
  private conversations: Map<string, Conversation> = new Map();
  private currentConversationId: string | null = null;
  private listeners: Set<(conversations: ConversationSummary[]) => void> = new Set();

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  /**
   * Initialize conversation manager
   * Load conversations from IndexedDB
   */
  async initialize(): Promise<void> {
    try {
      console.info('[ConversationManager] Initializing...');
      
      // Load all conversations from IndexedDB
      await this.loadConversations();
      
      // Restore current conversation from state
      const savedConversationId = this.stateManager.getCurrentConversationId();
      if (savedConversationId && this.conversations.has(savedConversationId)) {
        this.currentConversationId = savedConversationId;
      }
      
      console.info('[ConversationManager] Initialized with', this.conversations.size, 'conversations');
    } catch (error) {
      console.error('[ConversationManager] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Load all conversations from IndexedDB
   */
  private async loadConversations(): Promise<void> {
    try {
      const response = await this.sendMessage({
        kind: 'CONVERSATION_LIST',
        requestId: crypto.randomUUID(),
        payload: {}
      });

      if (response.success && response.data) {
        this.conversations.clear();
        for (const conversation of response.data.conversations) {
          this.conversations.set(conversation.id, conversation);
        }
        this.notifyListeners();
      }
    } catch (error) {
      console.error('[ConversationManager] Failed to load conversations:', error);
    }
  }

  /**
   * Create a new conversation
   * Requirement 8.8: Create new conversation context
   */
  async createConversation(pocketId?: string): Promise<string> {
    try {
      const response = await this.sendMessage({
        kind: 'CONVERSATION_CREATE',
        requestId: crypto.randomUUID(),
        payload: {
          pocketId,
          model: 'gemini-nano'
        }
      });

      if (response.success && response.data) {
        const conversation = response.data.conversation;
        this.conversations.set(conversation.id, conversation);
        this.notifyListeners();
        
        console.info('[ConversationManager] Created conversation:', conversation.id);
        return conversation.id;
      } else {
        throw new Error('Failed to create conversation');
      }
    } catch (error) {
      console.error('[ConversationManager] Failed to create conversation:', error);
      throw error;
    }
  }

  /**
   * Switch to a different conversation
   * Requirement 8.8: Implement conversation switching
   */
  async switchConversation(conversationId: string): Promise<Conversation | null> {
    try {
      if (!this.conversations.has(conversationId)) {
        console.warn('[ConversationManager] Conversation not found:', conversationId);
        return null;
      }

      // Get full conversation data
      const response = await this.sendMessage({
        kind: 'CONVERSATION_GET',
        requestId: crypto.randomUUID(),
        payload: { conversationId }
      });

      if (response.success && response.data) {
        const conversation = response.data.conversation;
        this.conversations.set(conversation.id, conversation);
        this.currentConversationId = conversationId;
        
        // Update state
        this.stateManager.setCurrentConversationId(conversationId);
        
        console.info('[ConversationManager] Switched to conversation:', conversationId);
        return conversation;
      } else {
        throw new Error('Failed to load conversation');
      }
    } catch (error) {
      console.error('[ConversationManager] Failed to switch conversation:', error);
      return null;
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      const response = await this.sendMessage({
        kind: 'CONVERSATION_DELETE',
        requestId: crypto.randomUUID(),
        payload: { conversationId }
      });

      if (response.success) {
        this.conversations.delete(conversationId);
        
        // If we deleted the current conversation, clear it
        if (this.currentConversationId === conversationId) {
          this.currentConversationId = null;
          this.stateManager.setCurrentConversationId(null);
        }
        
        this.notifyListeners();
        console.info('[ConversationManager] Deleted conversation:', conversationId);
        return true;
      } else {
        throw new Error('Failed to delete conversation');
      }
    } catch (error) {
      console.error('[ConversationManager] Failed to delete conversation:', error);
      return false;
    }
  }

  /**
   * Get current conversation
   */
  getCurrentConversation(): Conversation | null {
    if (!this.currentConversationId) {
      return null;
    }
    return this.conversations.get(this.currentConversationId) || null;
  }

  /**
   * Get current conversation ID
   */
  getCurrentConversationId(): string | null {
    return this.currentConversationId;
  }

  /**
   * Get all conversations as summaries
   * Requirement 7.6: Display conversation list
   */
  getConversationSummaries(): ConversationSummary[] {
    const summaries: ConversationSummary[] = [];
    
    for (const conversation of this.conversations.values()) {
      summaries.push(this.createSummary(conversation));
    }
    
    // Sort by most recent first
    summaries.sort((a, b) => b.updatedAt - a.updatedAt);
    
    return summaries;
  }

  /**
   * Create a summary from a conversation
   */
  private createSummary(conversation: Conversation): ConversationSummary {
    // Generate title from first user message or use default
    let title = 'New Conversation';
    let preview = 'No messages yet';
    
    if (conversation.messages.length > 0) {
      const firstUserMessage = conversation.messages.find(m => m.role === 'user');
      if (firstUserMessage) {
        title = this.generateTitle(firstUserMessage.content);
        preview = firstUserMessage.content.substring(0, 100);
        if (firstUserMessage.content.length > 100) {
          preview += '...';
        }
      }
    }
    
    const summary: ConversationSummary = {
      id: conversation.id,
      title,
      preview,
      messageCount: conversation.messages.length,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    };
    
    if (conversation.pocketId) {
      summary.pocketId = conversation.pocketId;
    }
    
    return summary;
  }

  /**
   * Generate a title from message content
   */
  private generateTitle(content: string): string {
    // Take first 50 characters and truncate at word boundary
    let title = content.substring(0, 50);
    const lastSpace = title.lastIndexOf(' ');
    
    if (lastSpace > 20) {
      title = title.substring(0, lastSpace);
    }
    
    if (content.length > 50) {
      title += '...';
    }
    
    return title;
  }

  /**
   * Update conversation with new message
   */
  async updateConversation(conversationId: string, message: Message): Promise<void> {
    try {
      const response = await this.sendMessage({
        kind: 'CONVERSATION_UPDATE',
        requestId: crypto.randomUUID(),
        payload: {
          conversationId,
          message
        }
      });

      if (response.success) {
        // Update local cache
        const conversation = this.conversations.get(conversationId);
        if (conversation) {
          conversation.messages.push(message);
          conversation.updatedAt = Date.now();
          conversation.tokensUsed += message.metadata?.tokensUsed || 0;
          this.notifyListeners();
        }
      }
    } catch (error) {
      console.error('[ConversationManager] Failed to update conversation:', error);
    }
  }

  /**
   * Refresh conversations from IndexedDB
   */
  async refresh(): Promise<void> {
    await this.loadConversations();
  }

  /**
   * Subscribe to conversation list changes
   */
  subscribe(listener: (conversations: ConversationSummary[]) => void): () => void {
    this.listeners.add(listener);
    
    // Immediately call with current data
    listener(this.getConversationSummaries());
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of changes
   */
  private notifyListeners(): void {
    const summaries = this.getConversationSummaries();
    this.listeners.forEach(listener => {
      try {
        listener(summaries);
      } catch (error) {
        console.error('[ConversationManager] Error in listener:', error);
      }
    });
  }

  /**
   * Send message to service worker
   */
  private async sendMessage(message: any): Promise<any> {
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
   * Get statistics
   */
  getStats(): {
    totalConversations: number;
    totalMessages: number;
    currentConversationId: string | null;
  } {
    let totalMessages = 0;
    for (const conversation of this.conversations.values()) {
      totalMessages += conversation.messages.length;
    }
    
    return {
      totalConversations: this.conversations.size,
      totalMessages,
      currentConversationId: this.currentConversationId
    };
  }
}
