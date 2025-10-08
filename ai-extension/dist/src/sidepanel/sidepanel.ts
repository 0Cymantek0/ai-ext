/**
 * Side Panel Entry Point
 * Initializes the side panel with all components
 * Requirements: 8.1, 8.2, 8.8
 */

import { ChatInterface } from './chat-interface';
import { PreferencesManager } from './preferences-manager';
import { StateManager } from './state-manager';
import { CommunicationManager } from './communication-manager';

/**
 * Side Panel Application
 */
class SidePanelApp {
  private chatInterface: ChatInterface | null = null;
  private preferencesManager: PreferencesManager;
  private stateManager: StateManager;
  private communicationManager: CommunicationManager;

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
  private initializeUI(): void {
    try {
      // Initialize chat interface
      const chatPanel = document.getElementById('chat-panel');
      if (chatPanel) {
        this.chatInterface = new ChatInterface('chat-panel');
        console.info('[SidePanel] Chat interface initialized');
      }
    } catch (error) {
      console.error('[SidePanel] Failed to initialize chat interface:', error);
      throw error;
    }
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Tab navigation
    this.setupTabNavigation();

    // Theme toggle
    this.setupThemeToggle();

    // Settings button
    this.setupSettingsButton();

    // Window visibility
    this.setupVisibilityListener();
  }

  /**
   * Set up tab navigation
   */
  private setupTabNavigation(): void {
    const chatTab = document.getElementById('chat-tab');
    const pocketsTab = document.getElementById('pockets-tab');
    const chatPanel = document.getElementById('chat-panel');
    const pocketsPanel = document.getElementById('pockets-panel');

    if (!chatTab || !pocketsTab || !chatPanel || !pocketsPanel) {
      console.warn('[SidePanel] Tab elements not found');
      return;
    }

    const switchTab = (tab: 'chat' | 'pockets') => {
      // Update state
      this.stateManager.setActiveTab(tab);

      // Update UI
      if (tab === 'chat') {
        chatTab.classList.add('active');
        pocketsTab.classList.remove('active');
        chatTab.setAttribute('aria-selected', 'true');
        pocketsTab.setAttribute('aria-selected', 'false');
        
        chatPanel.classList.add('active');
        pocketsPanel.classList.remove('active');
        chatPanel.removeAttribute('aria-hidden');
        pocketsPanel.setAttribute('aria-hidden', 'true');
      } else {
        pocketsTab.classList.add('active');
        chatTab.classList.remove('active');
        pocketsTab.setAttribute('aria-selected', 'true');
        chatTab.setAttribute('aria-selected', 'false');
        
        pocketsPanel.classList.add('active');
        chatPanel.classList.remove('active');
        pocketsPanel.removeAttribute('aria-hidden');
        chatPanel.setAttribute('aria-hidden', 'true');
      }
    };

    chatTab.addEventListener('click', () => switchTab('chat'));
    pocketsTab.addEventListener('click', () => switchTab('pockets'));

    // Keyboard navigation
    chatTab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchTab('chat');
      }
    });

    pocketsTab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchTab('pockets');
      }
    });
  }

  /**
   * Set up theme toggle
   */
  private setupThemeToggle(): void {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) {
      console.warn('[SidePanel] Theme toggle button not found');
      return;
    }

    themeToggle.addEventListener('click', async () => {
      const currentTheme = this.preferencesManager.getPreference('theme');
      
      // Cycle through themes: auto -> light -> dark -> auto
      let newTheme: 'light' | 'dark' | 'auto';
      if (currentTheme === 'auto') {
        newTheme = 'light';
      } else if (currentTheme === 'light') {
        newTheme = 'dark';
      } else {
        newTheme = 'auto';
      }

      await this.preferencesManager.updatePreference('theme', newTheme);
      
      // Update icon
      const icon = themeToggle.querySelector('.theme-icon');
      if (icon) {
        icon.textContent = newTheme === 'light' ? '☀️' : newTheme === 'dark' ? '🌙' : '🌓';
      }
    });
  }

  /**
   * Set up settings button
   */
  private setupSettingsButton(): void {
    const settingsButton = document.getElementById('settings-button');
    if (!settingsButton) {
      console.warn('[SidePanel] Settings button not found');
      return;
    }

    settingsButton.addEventListener('click', () => {
      // TODO: Open settings panel (will be implemented in a future task)
      console.info('[SidePanel] Settings clicked');
      alert('Settings panel coming soon!');
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

    const pocketsPanel = document.getElementById('pockets-panel');
    if (pocketsPanel) {
      this.stateManager.setScrollPosition('pockets', pocketsPanel.scrollTop);
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

    const pocketsPanel = document.getElementById('pockets-panel');
    if (pocketsPanel) {
      let scrollTimeout: number | null = null;
      
      pocketsPanel.addEventListener('scroll', () => {
        if (scrollTimeout !== null) {
          clearTimeout(scrollTimeout);
        }
        
        scrollTimeout = window.setTimeout(() => {
          this.stateManager.setScrollPosition('pockets', pocketsPanel.scrollTop);
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

    // Restore active tab
    const activeTab = state.activeTab;
    if (activeTab === 'pockets') {
      const pocketsTab = document.getElementById('pockets-tab');
      if (pocketsTab) {
        pocketsTab.click();
      }
    }

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
    const pocketsScrollPos = this.stateManager.getScrollPosition('pockets');
    
    if (chatScrollPos > 0) {
      const chatPanel = document.getElementById('chat-panel');
      const messageList = chatPanel?.querySelector('.message-list');
      if (messageList) {
        messageList.scrollTop = chatScrollPos;
      }
    }

    if (pocketsScrollPos > 0) {
      const pocketsPanel = document.getElementById('pockets-panel');
      if (pocketsPanel) {
        pocketsPanel.scrollTop = pocketsScrollPos;
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
   * Get managers for debugging
   */
  getManagers() {
    return {
      preferences: this.preferencesManager,
      state: this.stateManager,
      communication: this.communicationManager,
      chat: this.chatInterface,
    };
  }
}

// Initialize the application
const app = new SidePanelApp();
app.initialize();

// Export for debugging
(window as any).sidePanelApp = app;

console.info('[SidePanel] Side panel loaded');
