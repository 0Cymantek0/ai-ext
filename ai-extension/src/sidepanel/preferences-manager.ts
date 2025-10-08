/**
 * Preferences Manager
 * Manages user preferences for the side panel
 * Requirements: 8.2, 8.8
 */

import type { UserPreferences, AccessibilityPreferences } from '../shared/types/index.d';

/**
 * Default user preferences
 */
const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'auto',
  language: 'en',
  defaultAIModel: 'nano',
  privacyMode: 'balanced',
  accessibility: {
    highContrast: false,
    largeText: false,
    reducedMotion: false,
    screenReaderOptimized: false,
    keyboardNavigationOnly: false,
  },
};

/**
 * Preferences Manager class
 */
export class PreferencesManager {
  private preferences: UserPreferences;
  private listeners: Set<(preferences: UserPreferences) => void> = new Set();

  constructor() {
    this.preferences = { ...DEFAULT_PREFERENCES };
  }

  /**
   * Load preferences from storage
   * Requirement 8.2: Load preferences on initialization
   */
  async load(): Promise<UserPreferences> {
    try {
      const result = await chrome.storage.sync.get('userPreferences');
      
      if (result.userPreferences) {
        // Merge with defaults to ensure all fields exist
        this.preferences = {
          ...DEFAULT_PREFERENCES,
          ...result.userPreferences,
          accessibility: {
            ...DEFAULT_PREFERENCES.accessibility,
            ...(result.userPreferences.accessibility || {}),
          },
        };
      }

      console.info('[PreferencesManager] Preferences loaded:', this.preferences);
      return this.preferences;
    } catch (error) {
      console.error('[PreferencesManager] Failed to load preferences:', error);
      return DEFAULT_PREFERENCES;
    }
  }

  /**
   * Save preferences to storage
   */
  async save(preferences: Partial<UserPreferences>): Promise<void> {
    try {
      // Merge with current preferences
      this.preferences = {
        ...this.preferences,
        ...preferences,
      };

      // Save to storage
      await chrome.storage.sync.set({
        userPreferences: this.preferences,
      });

      // Notify listeners
      this.notifyListeners();

      console.info('[PreferencesManager] Preferences saved:', this.preferences);
    } catch (error) {
      console.error('[PreferencesManager] Failed to save preferences:', error);
      throw error;
    }
  }

  /**
   * Get current preferences
   */
  get(): UserPreferences {
    return { ...this.preferences };
  }

  /**
   * Get specific preference
   */
  getPreference<K extends keyof UserPreferences>(key: K): UserPreferences[K] {
    return this.preferences[key];
  }

  /**
   * Update specific preference
   */
  async updatePreference<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ): Promise<void> {
    await this.save({ [key]: value } as Partial<UserPreferences>);
  }

  /**
   * Reset to default preferences
   */
  async reset(): Promise<void> {
    this.preferences = { ...DEFAULT_PREFERENCES };
    await chrome.storage.sync.set({
      userPreferences: this.preferences,
    });
    this.notifyListeners();
  }

  /**
   * Subscribe to preference changes
   */
  subscribe(listener: (preferences: UserPreferences) => void): () => void {
    this.listeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of preference changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.preferences);
      } catch (error) {
        console.error('[PreferencesManager] Error in listener:', error);
      }
    });
  }

  /**
   * Apply theme preference to document
   */
  applyTheme(): void {
    const theme = this.preferences.theme;
    const body = document.body;

    if (theme === 'auto') {
      // Use system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      body.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      body.setAttribute('data-theme', theme);
    }
  }

  /**
   * Apply accessibility preferences
   */
  applyAccessibility(): void {
    const { accessibility } = this.preferences;
    const body = document.body;

    // High contrast
    body.classList.toggle('high-contrast', accessibility.highContrast);

    // Large text
    body.classList.toggle('large-text', accessibility.largeText);

    // Reduced motion
    body.classList.toggle('reduced-motion', accessibility.reducedMotion);

    // Screen reader optimized
    body.classList.toggle('screen-reader-optimized', accessibility.screenReaderOptimized);

    // Keyboard navigation only
    body.classList.toggle('keyboard-only', accessibility.keyboardNavigationOnly);
  }
}
