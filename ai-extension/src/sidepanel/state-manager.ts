/**
 * State Manager
 * Manages side panel state and conversation context with persistence
 * Requirements: 8.8, 15.4
 */

import type { SidePanelState } from '../shared/types/index.d';

/**
 * Current state version for migration
 */
const STATE_VERSION = 1;

/**
 * Storage key for state
 */
const STATE_STORAGE_KEY = 'sidePanelState';

/**
 * Storage key for state backup
 */
const STATE_BACKUP_KEY = 'sidePanelStateBackup';

/**
 * Default side panel state
 */
const DEFAULT_STATE: SidePanelState = {
  version: STATE_VERSION,
  activeTab: 'chat',
  currentConversationId: null,
  lastActiveTimestamp: Date.now(),
  
  ui: {
    chatScrollPosition: 0,
    pocketsScrollPosition: 0,
    expandedSections: [],
    sidebarCollapsed: false,
  },
  
  pockets: {
    selectedPocketId: null,
    filterQuery: '',
    sortBy: 'date',
    viewMode: 'list',
  },
  
  chat: {
    draftMessage: '',
    recentPrompts: [],
    preferredModel: null,
  },
};

/**
 * State update transaction
 */
interface StateTransaction {
  updates: Partial<SidePanelState>;
  timestamp: number;
}

/**
 * State Manager class
 * Requirement 8.8: Preserve conversation context when switching tabs
 * Requirement 15.4: Persist state for recovery after service worker termination
 */
export class StateManager {
  private state: SidePanelState;
  private listeners: Set<(state: SidePanelState) => void> = new Set();
  private saveTimeout: number | null = null;
  private transactionQueue: StateTransaction[] = [];
  private isProcessingTransaction = false;

  constructor() {
    this.state = this.createDefaultState();
  }

  /**
   * Create default state with current timestamp
   */
  private createDefaultState(): SidePanelState {
    return {
      ...DEFAULT_STATE,
      lastActiveTimestamp: Date.now(),
    };
  }

  /**
   * Load state from storage with validation and migration
   * Requirement 8.8: Load preserved state on initialization
   * Requirement 15.4: Recover from corrupted state
   */
  async load(): Promise<SidePanelState> {
    try {
      const result = await chrome.storage.local.get([STATE_STORAGE_KEY, STATE_BACKUP_KEY]);
      
      // Try to load primary state
      let loadedState = result[STATE_STORAGE_KEY];
      
      // If primary state is invalid, try backup
      if (!this.validateState(loadedState)) {
        console.warn('[StateManager] Primary state invalid, trying backup...');
        loadedState = result[STATE_BACKUP_KEY];
      }
      
      // If backup is also invalid, use default
      if (!this.validateState(loadedState)) {
        console.warn('[StateManager] Backup state invalid, using default state');
        this.state = this.createDefaultState();
      } else {
        // Migrate state if needed
        this.state = this.migrateState(loadedState);
      }

      console.info('[StateManager] State loaded successfully:', this.state);
      return this.state;
    } catch (error) {
      console.error('[StateManager] Failed to load state:', error);
      this.state = this.createDefaultState();
      return this.state;
    }
  }

  /**
   * Validate state structure
   */
  private validateState(state: any): boolean {
    if (!state || typeof state !== 'object') {
      return false;
    }

    // Check required fields
    const requiredFields = ['version', 'activeTab', 'lastActiveTimestamp', 'ui', 'pockets', 'chat'];
    for (const field of requiredFields) {
      if (!(field in state)) {
        console.warn(`[StateManager] Missing required field: ${field}`);
        return false;
      }
    }

    // Validate activeTab value
    if (!['chat', 'pockets'].includes(state.activeTab)) {
      console.warn(`[StateManager] Invalid activeTab: ${state.activeTab}`);
      return false;
    }

    return true;
  }

  /**
   * Migrate state from older versions
   */
  private migrateState(state: any): SidePanelState {
    let migratedState = { ...state };

    // If state is from an older version, migrate it
    if (migratedState.version < STATE_VERSION) {
      console.info(`[StateManager] Migrating state from version ${migratedState.version} to ${STATE_VERSION}`);
      
      // Add migration logic here as state structure evolves
      // For now, just merge with defaults for any missing fields
      migratedState = {
        ...DEFAULT_STATE,
        ...migratedState,
        version: STATE_VERSION,
        ui: {
          ...DEFAULT_STATE.ui,
          ...(migratedState.ui || {}),
        },
        pockets: {
          ...DEFAULT_STATE.pockets,
          ...(migratedState.pockets || {}),
        },
        chat: {
          ...DEFAULT_STATE.chat,
          ...(migratedState.chat || {}),
        },
      };
    }

    return migratedState;
  }

  /**
   * Save state to storage with backup
   * Requirement 15.4: Persist state for recovery
   */
  private async saveToStorage(): Promise<void> {
    try {
      // Update timestamp
      this.state.lastActiveTimestamp = Date.now();

      // Create backup of current state before saving new one
      const currentState = await chrome.storage.local.get(STATE_STORAGE_KEY);
      if (currentState[STATE_STORAGE_KEY]) {
        await chrome.storage.local.set({
          [STATE_BACKUP_KEY]: currentState[STATE_STORAGE_KEY],
        });
      }

      // Save new state
      await chrome.storage.local.set({
        [STATE_STORAGE_KEY]: this.state,
      });

      console.debug('[StateManager] State saved with backup');
    } catch (error) {
      console.error('[StateManager] Failed to save state:', error);
      
      // Try to recover by clearing corrupted data
      if (error instanceof Error && error.message.includes('QUOTA_BYTES')) {
        console.warn('[StateManager] Storage quota exceeded, clearing old data...');
        await this.clearOldData();
      }
    }
  }

  /**
   * Clear old data to free up storage
   */
  private async clearOldData(): Promise<void> {
    try {
      // Clear backup to free up space
      await chrome.storage.local.remove(STATE_BACKUP_KEY);
      
      // Clear old recent prompts
      if (this.state.chat.recentPrompts.length > 10) {
        this.state.chat.recentPrompts = this.state.chat.recentPrompts.slice(-10);
      }
      
      console.info('[StateManager] Old data cleared');
    } catch (error) {
      console.error('[StateManager] Failed to clear old data:', error);
    }
  }

  /**
   * Debounced save to avoid excessive writes
   */
  private debouncedSave(): void {
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = window.setTimeout(() => {
      this.saveToStorage();
      this.saveTimeout = null;
    }, 500);
  }

  /**
   * Get current state
   */
  get(): SidePanelState {
    return { ...this.state };
  }

  /**
   * Update state with deep merge
   */
  update(updates: Partial<SidePanelState>): void {
    this.state = this.deepMerge(this.state, updates);

    // Notify listeners
    this.notifyListeners();

    // Save to storage
    this.debouncedSave();
  }

  /**
   * Batch update multiple state changes
   * Useful for updating multiple related fields atomically
   */
  batchUpdate(updates: Partial<SidePanelState>[]): void {
    // Apply all updates
    for (const update of updates) {
      this.state = this.deepMerge(this.state, update);
    }

    // Notify listeners once
    this.notifyListeners();

    // Save to storage once
    this.debouncedSave();
  }

  /**
   * Deep merge two objects
   */
  private deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        result[key] = this.deepMerge(
          targetValue && typeof targetValue === 'object' ? targetValue : {} as any,
          sourceValue
        ) as any;
      } else {
        result[key] = sourceValue as any;
      }
    }

    return result;
  }

  /**
   * Set active tab
   */
  setActiveTab(tab: 'chat' | 'pockets'): void {
    this.update({ activeTab: tab });
  }

  /**
   * Set current conversation ID
   */
  setCurrentConversationId(conversationId: string | null): void {
    this.update({ currentConversationId: conversationId });
  }

  /**
   * Get active tab
   */
  getActiveTab(): 'chat' | 'pockets' {
    return this.state.activeTab;
  }

  /**
   * Get current conversation ID
   */
  getCurrentConversationId(): string | null {
    return this.state.currentConversationId;
  }

  /**
   * Update UI state
   */
  updateUI(updates: Partial<SidePanelState['ui']>): void {
    this.update({
      ui: {
        ...this.state.ui,
        ...updates,
      },
    });
  }

  /**
   * Update pocket state
   */
  updatePockets(updates: Partial<SidePanelState['pockets']>): void {
    this.update({
      pockets: {
        ...this.state.pockets,
        ...updates,
      },
    });
  }

  /**
   * Update chat state
   */
  updateChat(updates: Partial<SidePanelState['chat']>): void {
    this.update({
      chat: {
        ...this.state.chat,
        ...updates,
      },
    });
  }

  /**
   * Save draft message
   */
  saveDraftMessage(message: string): void {
    this.updateChat({ draftMessage: message });
  }

  /**
   * Get draft message
   */
  getDraftMessage(): string {
    return this.state.chat.draftMessage;
  }

  /**
   * Add recent prompt
   */
  addRecentPrompt(prompt: string): void {
    const recentPrompts = [prompt, ...this.state.chat.recentPrompts.filter(p => p !== prompt)];
    
    // Keep only last 20 prompts
    this.updateChat({
      recentPrompts: recentPrompts.slice(0, 20),
    });
  }

  /**
   * Get recent prompts
   */
  getRecentPrompts(): string[] {
    return [...this.state.chat.recentPrompts];
  }

  /**
   * Set selected pocket
   */
  setSelectedPocket(pocketId: string | null): void {
    this.updatePockets({ selectedPocketId: pocketId });
  }

  /**
   * Get selected pocket
   */
  getSelectedPocket(): string | null {
    return this.state.pockets.selectedPocketId;
  }

  /**
   * Set scroll position
   */
  setScrollPosition(tab: 'chat' | 'pockets', position: number): void {
    if (tab === 'chat') {
      this.updateUI({ chatScrollPosition: position });
    } else {
      this.updateUI({ pocketsScrollPosition: position });
    }
  }

  /**
   * Get scroll position
   */
  getScrollPosition(tab: 'chat' | 'pockets'): number {
    return tab === 'chat' 
      ? this.state.ui.chatScrollPosition 
      : this.state.ui.pocketsScrollPosition;
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: SidePanelState) => void): () => void {
    this.listeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.state);
      } catch (error) {
        console.error('[StateManager] Error in listener:', error);
      }
    });
  }

  /**
   * Create a snapshot of current state
   */
  createSnapshot(): SidePanelState {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Restore state from snapshot
   */
  restoreSnapshot(snapshot: SidePanelState): void {
    if (this.validateState(snapshot)) {
      this.state = snapshot;
      this.notifyListeners();
      this.debouncedSave();
    } else {
      console.error('[StateManager] Invalid snapshot, cannot restore');
    }
  }

  /**
   * Export state as JSON
   */
  exportState(): string {
    return JSON.stringify(this.state, null, 2);
  }

  /**
   * Import state from JSON
   */
  importState(json: string): boolean {
    try {
      const imported = JSON.parse(json);
      
      if (this.validateState(imported)) {
        this.state = this.migrateState(imported);
        this.notifyListeners();
        this.debouncedSave();
        return true;
      } else {
        console.error('[StateManager] Invalid imported state');
        return false;
      }
    } catch (error) {
      console.error('[StateManager] Failed to import state:', error);
      return false;
    }
  }

  /**
   * Reset to default state
   */
  async reset(): Promise<void> {
    this.state = this.createDefaultState();
    await this.saveToStorage();
    this.notifyListeners();
    console.info('[StateManager] State reset to defaults');
  }

  /**
   * Clear state (alias for reset)
   */
  async clear(): Promise<void> {
    await this.reset();
  }

  /**
   * Force immediate save (bypass debounce)
   */
  async forceSave(): Promise<void> {
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    await this.saveToStorage();
  }

  /**
   * Get state statistics
   */
  getStats(): {
    version: number;
    lastActive: Date;
    recentPromptsCount: number;
    expandedSectionsCount: number;
  } {
    return {
      version: this.state.version,
      lastActive: new Date(this.state.lastActiveTimestamp),
      recentPromptsCount: this.state.chat.recentPrompts.length,
      expandedSectionsCount: this.state.ui.expandedSections.length,
    };
  }

  /**
   * Cleanup on destroy
   */
  async destroy(): Promise<void> {
    // Clear timeout
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    // Force save current state
    await this.saveToStorage();

    // Clear listeners
    this.listeners.clear();

    console.info('[StateManager] State manager destroyed');
  }
}
