/**
 * Side Panel Entry Point
 * Initializes the side panel with all components
 * Requirements: 8.1, 8.2, 8.8
 */

import { ChatInterface } from './chat-interface';
import { PreferencesManager } from './preferences-manager';
import { StateManager } from './state-manager';
import { CommunicationManager } from './communication-manager';
import { ConversationManager } from './conversation-manager';
import { ConversationSidebar } from './conversation-sidebar';

/**
 * Side Panel Application
 */
class SidePanelApp {
  private chatInterface: ChatInterface | null = null;
  private preferencesManager: PreferencesManager;
  private stateManager: StateManager;
  private communicationManager: CommunicationManager;
  private conversationManager: ConversationManager | null = null;
  private conversationSidebar: ConversationSidebar | null = null;

  constructor() {
    this.preferencesManager = new PreferencesManager();
    this.stateManager = new StateManager();
    this.communicationManager = new CommunicationManager();
  }

  /**
   * Initialize the side panel
   * Requirement 8.2: Create entry point, set up communication, load preferences
   */
  async initialize(): Promise<void> {
    try {
      console.info('[SidePanel] Starting initialization...');

      // 1. Load preferences
      await this.loadPreferences();

      // 2. Load state
      await this.loadState();

      // 3. Set up communication
      this.setupCommunication();

      // 4. Initialize UI components
      this.initializeUI();

      // 5. Set up event listeners
      this.setupEventListeners();

      // 6. Restore previous state
      this.restoreState();

      console.info('[SidePanel] Initialization complete');
    } catch (error) {
      console.error('[SidePanel] Initialization failed:', error);
      this.showError(error);
    }
  }

  /**
   * Load user preferences
   * Requirement 8.2: Load preferences on initialization
   */
  private async loadPreferences(): Promise<void> {
    try {
      const preferences = await this.preferencesManager.load();
      
      // Apply theme
      this.preferencesManager.applyTheme();
      
      // Apply accessibility settings
      this.preferencesManager.applyAccessibility();

      // Subscribe to preference changes
      this.preferencesManager.subscribe((prefs) => {
        this.preferencesManager.applyTheme();
        this.preferencesManager.applyAccessibility();
      });

      console.info('[SidePanel] Preferences loaded:', preferences);
    } catch (error) {
      console.error('[SidePanel] Failed to load preferences:', error);
    }
  }

  /**
   * Load side panel state
   * Requirement 8.8: Preserve conversation context
   */
  private async loadState(): Promise<void> {
    try {
      const state = await this.stateManager.load();
      console.info('[SidePanel] State loaded:', state);
    } catch (error) {
      console.error('[SidePanel] Failed to load state:', error);
    }
  }

  /**
   * Set up communication with service worker
   * Requirement 8.2: Set up communication
   */
  private setupCommunication(): void {
    this.communicationManager.initialize();

    // Set up connection status monitoring
    this.monitorConnection();
  }

  /**
   * Initialize UI components
   */
  private async initializeUI(): Promise<void> {
    try {
      // Initialize conversation manager
      this.conversationManager = new ConversationManager(this.stateManager);
      await this.conversationManager.initialize();
      console.info('[SidePanel] Conversation manager initialized');

      // Initialize conversation sidebar
      const sidebarContainer = document.getElementById('conversation-sidebar-container');
      if (sidebarContainer) {
        this.conversationSidebar = new ConversationSidebar('conversation-sidebar-container');
        this.setupConversationSidebarCallbacks();
        console.info('[SidePanel] Conversation sidebar initialized');
      }

      // Initialize chat interface
      const chatInterfaceContainer = document.getElementById('chat-interface-container');
      if (chatInterfaceContainer) {
        const currentConversationId = this.conversationManager.getCurrentConversationId();
        this.chatInterface = new ChatInterface('chat-interface-container', currentConversationId || undefined);
        console.info('[SidePanel] Chat interface initialized');
        
        // Load current conversation if exists
        if (currentConversationId) {
          await this.loadConversation(currentConversationId);
        }
      }
    } catch (error) {
      console.error('[SidePanel] Failed to initialize UI components:', error);
      throw error;
    }
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Hamburger button (history overlay)
    this.setupHamburgerButton();

    // New chat button
    this.setupNewChatButton();

    // Window visibility
    this.setupVisibilityListener();
  }

  /**
   * Set up hamburger button
   * Requirement 29.2: Open history overlay
   */
  private setupHamburgerButton(): void {
    const hamburgerButton = document.getElementById('hamburger-button');
    if (!hamburgerButton) {
      console.warn('[SidePanel] Hamburger button not found');
      return;
    }

    hamburgerButton.addEventListener('click', () => {
      // TODO: Open history overlay (will be implemented in task 9.6.2)
      console.info('[SidePanel] Hamburger button clicked - History overlay coming soon');
    });

    // Keyboard support
    hamburgerButton.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        hamburgerButton.click();
      }
    });
  }

  /**
   * Set up new chat button
   * Requirement 35.3: Create new conversation
   */
  private setupNewChatButton(): void {
    const newChatButton = document.getElementById('new-chat-button');
    if (!newChatButton) {
      console.warn('[SidePanel] New chat button not found');
      return;
    }

    newChatButton.addEventListener('click', async () => {
      console.info('[SidePanel] New chat button clicked');
      await this.createNewConversation();
    });

    // Keyboard support
    newChatButton.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        newChatButton.click();
      }
    });
  }

  /**
   * Set up visibility listener
   * Requirement 8.8: Update state when tab becomes visible/hidden
   */
  private setupVisibilityListener(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        console.debug('[SidePanel] Panel hidden');
        // Save current state before hiding
        this.saveCurrentState();
      } else {
        console.debug('[SidePanel] Panel visible');
        // Refresh connection status
        this.monitorConnection();
      }
    });

    // Save state before unload
    window.addEventListener('beforeunload', () => {
      this.saveCurrentState();
      this.stateManager.forceSave();
    });

    // Track scroll positions
    this.setupScrollTracking();

    // Track draft message
    this.setupDraftTracking();
  }

  /**
   * Save current UI state
   */
  private saveCurrentState(): void {
    // Save scroll positions
    const chatPanel = document.getElementById('chat-panel');
    const messageList = chatPanel?.querySelector('.message-list');
    if (messageList) {
      this.stateManager.setScrollPosition('chat', messageList.scrollTop);
    }

    // Save draft message
    const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
    if (chatInput && chatInput.value) {
      this.stateManager.saveDraftMessage(chatInput.value);
    }
  }

  /**
   * Set up scroll position tracking
   */
  private setupScrollTracking(): void {
    const chatPanel = document.getElementById('chat-panel');
    const messageList = chatPanel?.querySelector('.message-list');
    
    if (messageList) {
      let scrollTimeout: number | null = null;
      
      messageList.addEventListener('scroll', () => {
        if (scrollTimeout !== null) {
          clearTimeout(scrollTimeout);
        }
        
        scrollTimeout = window.setTimeout(() => {
          this.stateManager.setScrollPosition('chat', messageList.scrollTop);
          scrollTimeout = null;
        }, 500);
      });
    }
  }

  /**
   * Set up draft message tracking
   */
  private setupDraftTracking(): void {
    const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
    
    if (chatInput) {
      let draftTimeout: number | null = null;
      
      chatInput.addEventListener('input', () => {
        if (draftTimeout !== null) {
          clearTimeout(draftTimeout);
        }
        
        draftTimeout = window.setTimeout(() => {
          this.stateManager.saveDraftMessage(chatInput.value);
          draftTimeout = null;
        }, 1000);
      });

      // Clear draft when message is sent
      chatInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          // Message will be sent, clear draft after a short delay
          setTimeout(() => {
            if (!chatInput.value) {
              this.stateManager.saveDraftMessage('');
            }
          }, 100);
        }
      });
    }
  }

  /**
   * Restore previous state
   * Requirement 8.8: Restore conversation context
   */
  private restoreState(): void {
    const state = this.stateManager.get();

    // Restore draft message
    const draftMessage = this.stateManager.getDraftMessage();
    if (draftMessage && this.chatInterface) {
      const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
      if (chatInput) {
        chatInput.value = draftMessage;
        console.info('[SidePanel] Restored draft message');
      }
    }

    // Restore scroll positions
    const chatScrollPos = this.stateManager.getScrollPosition('chat');
    
    if (chatScrollPos > 0) {
      const chatPanel = document.getElementById('chat-panel');
      const messageList = chatPanel?.querySelector('.message-list');
      if (messageList) {
        messageList.scrollTop = chatScrollPos;
      }
    }

    // Restore conversation context
    if (state.currentConversationId && this.chatInterface) {
      console.info('[SidePanel] Restoring conversation:', state.currentConversationId);
      // TODO: Load conversation history (will be implemented when conversation storage is added)
    }

    console.info('[SidePanel] State restored:', this.stateManager.getStats());
  }

  /**
   * Monitor connection to service worker
   */
  private async monitorConnection(): Promise<void> {
    const statusIndicator = document.getElementById('connection-status');
    const statusDot = statusIndicator?.querySelector('.status-dot');
    const statusText = statusIndicator?.querySelector('.status-text');

    if (!statusIndicator || !statusDot || !statusText) {
      return;
    }

    try {
      const isConnected = await this.communicationManager.checkServiceWorker();
      
      if (isConnected) {
        statusDot.classList.remove('error');
        statusDot.classList.add('success');
        statusText.textContent = 'Ready';
      } else {
        statusDot.classList.remove('success');
        statusDot.classList.add('error');
        statusText.textContent = 'Disconnected';
      }
    } catch (error) {
      statusDot.classList.remove('success');
      statusDot.classList.add('error');
      statusText.textContent = 'Error';
    }
  }

  /**
   * Show error message
   */
  private showError(error: unknown): void {
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #dc3545;">
          <h2>⚠️ Initialization Error</h2>
          <p>Failed to initialize the side panel.</p>
          <p style="font-size: 12px; color: #666;">${error instanceof Error ? error.message : 'Unknown error'}</p>
          <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; cursor: pointer;">
            Reload
          </button>
        </div>
      `;
    }
  }

  /**
   * Set up conversation sidebar callbacks
   * Requirement 8.8: Handle conversation switching
   */
  private setupConversationSidebarCallbacks(): void {
    if (!this.conversationSidebar || !this.conversationManager) {
      return;
    }

    // Handle conversation switch
    this.conversationSidebar.onSwitch(async (conversationId) => {
      await this.loadConversation(conversationId);
    });

    // Handle new conversation
    this.conversationSidebar.onNew(async () => {
      await this.createNewConversation();
    });

    // Handle delete conversation
    this.conversationSidebar.onDelete(async (conversationId) => {
      await this.deleteConversation(conversationId);
    });

    // Subscribe to conversation list updates
    this.conversationManager.subscribe((conversations) => {
      if (this.conversationSidebar) {
        this.conversationSidebar.updateConversations(conversations);
        const currentId = this.conversationManager?.getCurrentConversationId() || null;
        this.conversationSidebar.setCurrentConversation(currentId);
      }
    });
  }

  /**
   * Load a conversation
   * Requirement 8.8: Switch between conversations
   */
  private async loadConversation(conversationId: string): Promise<void> {
    if (!this.conversationManager || !this.chatInterface) {
      return;
    }

    try {
      console.info('[SidePanel] Loading conversation:', conversationId);
      
      const conversation = await this.conversationManager.switchConversation(conversationId);
      
      if (conversation) {
        // Load messages into chat interface
        this.chatInterface.loadConversation(conversation.id, conversation.messages);
        
        // Update sidebar
        if (this.conversationSidebar) {
          this.conversationSidebar.setCurrentConversation(conversation.id);
        }
        
        console.info('[SidePanel] Conversation loaded successfully');
      } else {
        console.error('[SidePanel] Failed to load conversation');
      }
    } catch (error) {
      console.error('[SidePanel] Error loading conversation:', error);
    }
  }

  /**
   * Create a new conversation
   * Requirement 8.8: Create new conversation
   */
  private async createNewConversation(): Promise<void> {
    if (!this.conversationManager || !this.chatInterface) {
      return;
    }

    try {
      console.info('[SidePanel] Creating new conversation');
      
      const conversationId = await this.conversationManager.createConversation();
      
      // Clear chat interface and set new conversation ID
      this.chatInterface.clearConversation();
      this.chatInterface.setConversationId(conversationId);
      
      // Switch to the new conversation
      await this.conversationManager.switchConversation(conversationId);
      
      // Update sidebar
      if (this.conversationSidebar) {
        this.conversationSidebar.setCurrentConversation(conversationId);
      }
      
      console.info('[SidePanel] New conversation created:', conversationId);
    } catch (error) {
      console.error('[SidePanel] Error creating new conversation:', error);
    }
  }

  /**
   * Delete a conversation
   */
  private async deleteConversation(conversationId: string): Promise<void> {
    if (!this.conversationManager || !this.chatInterface) {
      return;
    }

    try {
      console.info('[SidePanel] Deleting conversation:', conversationId);
      
      const success = await this.conversationManager.deleteConversation(conversationId);
      
      if (success) {
        // If we deleted the current conversation, create a new one
        const currentId = this.conversationManager.getCurrentConversationId();
        if (!currentId) {
          await this.createNewConversation();
        }
        
        console.info('[SidePanel] Conversation deleted successfully');
      } else {
        console.error('[SidePanel] Failed to delete conversation');
      }
    } catch (error) {
      console.error('[SidePanel] Error deleting conversation:', error);
    }
  }

  /**
   * Get managers for debugging
   */
  getManagers() {
    return {
      preferences: this.preferencesManager,
      state: this.stateManager,
      communication: this.communicationManager,
      chat: this.chatInterface,
      conversations: this.conversationManager,
      sidebar: this.conversationSidebar,
    };
  }
}

// Initialize the application
const app = new SidePanelApp();
app.initialize();

// Export for debugging
(window as any).sidePanelApp = app;

console.info('[SidePanel] Side panel loaded');
