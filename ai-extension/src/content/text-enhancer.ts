/**
 * Universal Text Enhancement System
 * Injects AI enhancement buttons near text input fields
 * Requirements: 9.1, 9.9, 9.5, 9.6
 */

import { PageContextDetector, type PageContext } from "./page-context-detector";
import {
  PocketContextProvider,
  type PocketContextResult,
} from "./pocket-context-provider";

enum EnhancementStyle {
  FUNNY = "funny",
  PROFESSIONAL = "professional",
  CONCISE = "concise",
  EMPATHETIC = "empathetic",
  PERSUASIVE = "persuasive",
  OPTIMIZE = "optimize",
  EXPAND = "expand",
  SUMMARISE = "summarise",
  // Prompt Enhancement Styles
  CLARIFY_PROMPT = "clarify_prompt",
  EXPAND_PROMPT = "expand_prompt",
  TECHNICAL_PROMPT = "technical_prompt",
  CREATIVE_PROMPT = "creative_prompt",
  STRUCTURED_PROMPT = "structured_prompt",
}

interface EnhancementOption {
  id: EnhancementStyle;
  label: string;
  icon: string;
  description: string;
}

interface Language {
  code: string;
  name: string;
}

class UniversalTextEnhancer {
  private injectedButtons: WeakMap<HTMLElement, HTMLElement> = new WeakMap();
  private observer: MutationObserver | null = null;
  private currentMenu: HTMLElement | null = null;
  private currentTextField: HTMLElement | null = null;
  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private menuStartX: number = 0;
  private menuStartY: number = 0;
  private pageContext: PageContext | null = null;
  private pocketContext: PocketContextResult | null = null;
  private currentTranslator: any | null = null;
  private currentLanguageDetector: any | null = null;
  private detectedSourceLanguage: string | null = null;
  private selectedTargetLanguage: string = "en";
  private savedQuickLanguages: Language[] = [];
  private customPresets: EnhancementOption[] = [];
  private sensitivePatterns = [
    /bank|banking|financial|credit|payment/i,
    /health|medical|patient|hospital/i,
    /password|login|signin|auth/i,
    /ssn|social.security/i,
  ];

  private supportedLanguages: Language[] = [
    { code: "af", name: "Afrikaans" },
    { code: "sq", name: "Albanian" },
    { code: "am", name: "Amharic" },
    { code: "ar", name: "Arabic" },
    { code: "hy", name: "Armenian" },
    { code: "az", name: "Azerbaijani" },
    { code: "eu", name: "Basque" },
    { code: "be", name: "Belarusian" },
    { code: "bn", name: "Bengali" },
    { code: "bs", name: "Bosnian" },
    { code: "bg", name: "Bulgarian" },
    { code: "my", name: "Burmese" },
    { code: "ca", name: "Catalan" },
    { code: "zh", name: "Chinese" },
    { code: "hr", name: "Croatian" },
    { code: "cs", name: "Czech" },
    { code: "da", name: "Danish" },
    { code: "nl", name: "Dutch" },
    { code: "en", name: "English" },
    { code: "eo", name: "Esperanto" },
    { code: "et", name: "Estonian" },
    { code: "fi", name: "Finnish" },
    { code: "fr", name: "French" },
    { code: "gl", name: "Galician" },
    { code: "ka", name: "Georgian" },
    { code: "de", name: "German" },
    { code: "el", name: "Greek" },
    { code: "gu", name: "Gujarati" },
    { code: "ht", name: "Haitian Creole" },
    { code: "he", name: "Hebrew" },
    { code: "hi", name: "Hindi" },
    { code: "hu", name: "Hungarian" },
    { code: "is", name: "Icelandic" },
    { code: "id", name: "Indonesian" },
    { code: "ga", name: "Irish" },
    { code: "it", name: "Italian" },
    { code: "ja", name: "Japanese" },
    { code: "kn", name: "Kannada" },
    { code: "kk", name: "Kazakh" },
    { code: "km", name: "Khmer" },
    { code: "ko", name: "Korean" },
    { code: "lo", name: "Lao" },
    { code: "la", name: "Latin" },
    { code: "lv", name: "Latvian" },
    { code: "lt", name: "Lithuanian" },
    { code: "lb", name: "Luxembourgish" },
    { code: "mk", name: "Macedonian" },
    { code: "ms", name: "Malay" },
    { code: "ml", name: "Malayalam" },
    { code: "mt", name: "Maltese" },
    { code: "mr", name: "Marathi" },
    { code: "mn", name: "Mongolian" },
    { code: "ne", name: "Nepali" },
    { code: "no", name: "Norwegian" },
    { code: "ps", name: "Pashto" },
    { code: "fa", name: "Persian" },
    { code: "pl", name: "Polish" },
    { code: "pt", name: "Portuguese" },
    { code: "pa", name: "Punjabi" },
    { code: "ro", name: "Romanian" },
    { code: "ru", name: "Russian" },
    { code: "sr", name: "Serbian" },
    { code: "si", name: "Sinhala" },
    { code: "sk", name: "Slovak" },
    { code: "sl", name: "Slovenian" },
    { code: "es", name: "Spanish" },
    { code: "sw", name: "Swahili" },
    { code: "sv", name: "Swedish" },
    { code: "tl", name: "Filipino" },
    { code: "ta", name: "Tamil" },
    { code: "te", name: "Telugu" },
    { code: "th", name: "Thai" },
    { code: "tr", name: "Turkish" },
    { code: "uk", name: "Ukrainian" },
    { code: "ur", name: "Urdu" },
    { code: "uz", name: "Uzbek" },
    { code: "vi", name: "Vietnamese" },
    { code: "cy", name: "Welsh" },
    { code: "yi", name: "Yiddish" },
    { code: "zu", name: "Zulu" },
  ];

  private enhancementOptions: EnhancementOption[] = [
    {
      id: EnhancementStyle.PROFESSIONAL,
      label: "Professional",
      icon: "💼",
      description: "Make it more formal and business-appropriate",
    },
    {
      id: EnhancementStyle.CONCISE,
      label: "Concise",
      icon: "✂️",
      description: "Shorten and simplify the text",
    },
    {
      id: EnhancementStyle.EMPATHETIC,
      label: "Empathetic",
      icon: "❤️",
      description: "Add warmth and understanding",
    },
    {
      id: EnhancementStyle.PERSUASIVE,
      label: "Persuasive",
      icon: "🎯",
      description: "Make it more convincing and compelling",
    },
    {
      id: EnhancementStyle.FUNNY,
      label: "Funny",
      icon: "😄",
      description: "Add humor and lightheartedness",
    },
    {
      id: EnhancementStyle.OPTIMIZE,
      label: "Optimize",
      icon: "✨",
      description: "Improve grammar, clarity, and flow",
    },
    {
      id: EnhancementStyle.EXPAND,
      label: "Expand",
      icon: "📈",
      description: "Make the text longer and more detailed",
    },
    {
      id: EnhancementStyle.SUMMARISE,
      label: "Summarise",
      icon: "📋",
      description: "Create a concise summary of the text",
    },
    // Prompt Enhancement Options
    {
      id: EnhancementStyle.CLARIFY_PROMPT,
      label: "Clarify Prompt",
      icon: "🔍",
      description: "Make your prompt clearer and more specific",
    },
    {
      id: EnhancementStyle.EXPAND_PROMPT,
      label: "Expand Prompt",
      icon: "📝",
      description: "Add more detail and context to your prompt",
    },
    {
      id: EnhancementStyle.TECHNICAL_PROMPT,
      label: "Technical Prompt",
      icon: "⚙️",
      description: "Optimize for technical or coding tasks",
    },
    {
      id: EnhancementStyle.CREATIVE_PROMPT,
      label: "Creative Prompt",
      icon: "🎨",
      description: "Enhance for creative and imaginative outputs",
    },
    {
      id: EnhancementStyle.STRUCTURED_PROMPT,
      label: "Structured Prompt",
      icon: "📋",
      description: "Format as a well-structured, step-by-step prompt",
    },
  ];

  constructor() {
    this.initialize();
  }

  /**
   * Initialize the text enhancer
   */
  private async initialize(): Promise<void> {
    console.info("[TextEnhancer] Initializing");

    // Check if we're on a sensitive site
    if (this.isSensitiveSite()) {
      console.info(
        "[TextEnhancer] Sensitive site detected, disabling by default",
      );
      // TODO: Show UI to allow user to enable per-site
      return;
    }

    // Load saved quick languages
    await this.loadSavedLanguages();

    // Load custom presets
    await this.loadCustomPresets();

    // Detect page context (Requirement 9.5)
    this.detectPageContext();

    // Inject CSS
    this.injectStyles();

    // Process existing text fields
    this.processExistingFields();

    // Set up mutation observer for dynamic content
    this.setupMutationObserver();

    // Listen for focus events
    this.setupFocusListener();

    console.info("[TextEnhancer] Initialized successfully");
  }

  /**
   * Load saved quick languages from storage
   */
  private async loadSavedLanguages(): Promise<void> {
    try {
      const result = await chrome.storage.local.get("quickLanguages");
      if (result.quickLanguages && Array.isArray(result.quickLanguages)) {
        this.savedQuickLanguages = result.quickLanguages;
      } else {
        // Default languages
        this.savedQuickLanguages = [
          { code: "es", name: "spanish" },
          { code: "bn", name: "bengali" },
          { code: "fr", name: "french" },
          { code: "en", name: "english" },
          { code: "ja", name: "japanese" },
          { code: "zh", name: "chinese" },
        ];
      }
    } catch (error) {
      console.error("[TextEnhancer] Failed to load saved languages", error);
      // Use defaults on error
      this.savedQuickLanguages = [
        { code: "es", name: "spanish" },
        { code: "bn", name: "bengali" },
        { code: "fr", name: "french" },
        { code: "en", name: "english" },
        { code: "ja", name: "japanese" },
        { code: "zh", name: "chinese" },
      ];
    }
  }

  /**
   * Save quick languages to storage
   */
  private async saveQuickLanguages(languages: Language[]): Promise<void> {
    try {
      await chrome.storage.local.set({ quickLanguages: languages });
      this.savedQuickLanguages = languages;
      console.info("[TextEnhancer] Quick languages saved", languages);
    } catch (error) {
      console.error("[TextEnhancer] Failed to save languages", error);
      throw error;
    }
  }

  /**
   * Load saved custom presets
   */
  private async loadCustomPresets(): Promise<void> {
    try {
      const result = await chrome.storage.local.get("customPresets");
      if (result.customPresets && Array.isArray(result.customPresets)) {
        this.customPresets = result.customPresets;
        console.info("[TextEnhancer] Custom presets loaded", this.customPresets);
      }
    } catch (error) {
      console.error("[TextEnhancer] Failed to load custom presets", error);
    }
  }

  /**
   * Save custom presets
   */
  private async saveCustomPresets(): Promise<void> {
    try {
      await chrome.storage.local.set({ customPresets: this.customPresets });
      console.info("[TextEnhancer] Custom presets saved", this.customPresets);
    } catch (error) {
      console.error("[TextEnhancer] Failed to save custom presets", error);
      throw error;
    }
  }

  /**
   * Show dialog to add a new custom preset
   */
  private showAddPresetDialog(): void {
    const presetName = prompt("Enter preset name (e.g., 'Formal', 'Casual'):");
    if (!presetName || presetName.trim() === "") {
      return;
    }

    const presetPrompt = prompt(
      "Enter the enhancement instruction:\n(e.g., 'Make this text more formal and professional')",
    );
    if (!presetPrompt || presetPrompt.trim() === "") {
      return;
    }

    const presetIcon = prompt("Enter an emoji icon (optional):") || "✨";

    this.addCustomPreset(
      presetName.trim(),
      presetPrompt.trim(),
      presetIcon.trim(),
    );
  }

  /**
   * Add a new custom preset
   */
  private async addCustomPreset(
    label: string,
    prompt: string,
    icon: string,
  ): Promise<void> {
    const customId = `custom_${Date.now()}` as any;
    const newPreset: EnhancementOption = {
      id: customId,
      label,
      icon,
      description: prompt,
    };

    this.customPresets.push(newPreset);
    await this.saveCustomPresets();

    // Refresh the menu to show the new preset
    if (this.currentMenu && this.currentTextField) {
      const button = this.injectedButtons.get(this.currentTextField);
      if (button) {
        this.closeEnhancementMenu();
        this.showEnhancementMenu(this.currentTextField, button);
      }
    }

    console.info("[TextEnhancer] Custom preset added", newPreset);
  }

  /**
   * Delete a custom preset
   */
  private async deleteCustomPreset(presetId: string): Promise<void> {
    const index = this.customPresets.findIndex((p) => p.id === presetId);
    if (index === -1) {
      return;
    }

    const preset = this.customPresets[index];
    if (!preset) {
      return;
    }

    const confirmed = confirm(
      `Delete preset "${preset.label}"?\nThis action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    this.customPresets.splice(index, 1);
    await this.saveCustomPresets();

    // Refresh the menu
    if (this.currentMenu && this.currentTextField) {
      const button = this.injectedButtons.get(this.currentTextField);
      if (button) {
        this.closeEnhancementMenu();
        this.showEnhancementMenu(this.currentTextField, button);
      }
    }

    console.info("[TextEnhancer] Custom preset deleted", preset);
  }

  /**
   * Handle custom preset selection
   */
  private async handleCustomPresetSelection(
    preset: EnhancementOption,
  ): Promise<void> {
    if (!this.currentTextField) {
      console.error("[TextEnhancer] No text field selected");
      return;
    }

    const currentText = this.getTextFieldValue(this.currentTextField);
    if (!currentText || currentText.trim().length === 0) {
      console.debug("[TextEnhancer] No text to enhance");
      return;
    }

    console.debug("[TextEnhancer] Custom preset selected", {
      preset: preset.label,
    });

    // Store reference to textField BEFORE closing menu
    const textFieldRef = this.currentTextField;

    // Close menu
    this.closeEnhancementMenu();

    // Verify textField is still valid
    if (!textFieldRef || !document.body.contains(textFieldRef)) {
      console.error("[TextEnhancer] Text field no longer in DOM");
      return;
    }

    // Process enhancement with custom preset prompt
    await this.processCustomEnhancement(
      textFieldRef,
      currentText,
      preset.description,
    );
  }

  /**
   * Detect page context for context-aware enhancements
   * Requirement 9.5: Detect page context
   */
  private detectPageContext(): void {
    try {
      this.pageContext = PageContextDetector.detectContext();
      console.debug("[TextEnhancer] Page context detected", {
        type: this.pageContext.type,
        domain: this.pageContext.domain,
      });

      // Load relevant pocket content in background (Requirement 9.6)
      this.loadPocketContext();
    } catch (error) {
      console.error("[TextEnhancer] Failed to detect page context", error);
      this.pageContext = null;
    }
  }

  /**
   * Load relevant pocket content for context
   * Requirement 9.6: Use pocket content
   */
  private async loadPocketContext(): Promise<void> {
    if (!this.pageContext) return;

    try {
      this.pocketContext = await PocketContextProvider.getRelevantContent(
        this.pageContext,
      );

      if (this.pocketContext.relevantContent.length > 0) {
        console.debug("[TextEnhancer] Loaded pocket context", {
          itemCount: this.pocketContext.relevantContent.length,
          totalFound: this.pocketContext.totalFound,
        });
      }
    } catch (error) {
      console.error("[TextEnhancer] Failed to load pocket context", error);
      this.pocketContext = null;
    }
  }

  /**
   * Check if current site is sensitive (banking, healthcare, etc.)
   */
  private isSensitiveSite(): boolean {
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    const content = `${url} ${title}`;

    return this.sensitivePatterns.some((pattern) => pattern.test(content));
  }

  /**
   * Check if enhancement is enabled
   */
  private isEnhancementEnabled(): boolean {
    // Check if on sensitive site
    if (this.isSensitiveSite()) {
      // TODO: Check user preference for per-site override
      return false;
    }
    return true;
  }

  /**
   * Inject CSS styles for enhancement button
   */
  private injectStyles(): void {
    const styleId = "ai-pocket-text-enhancer-styles";

    // Don't inject if already exists
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      /* Import Space Grotesk font for consistency */
      @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap");

      .ai-pocket-enhance-btn {
        position: absolute;
        width: 28px;
        height: 28px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: all 0.2s ease;
        opacity: 0;
        pointer-events: none;
        user-select: none;
        touch-action: none;
        font-family: "Space Grotesk", sans-serif;
      }

      .ai-pocket-enhance-btn.visible {
        opacity: 1;
        pointer-events: auto;
      }

      .ai-pocket-enhance-btn.loading {
        pointer-events: none;
        cursor: default;
      }

      .ai-pocket-enhance-btn.dragging {
        cursor: grabbing;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
        transform: scale(1.15);
        transition: none;
        z-index: 10001;
      }

      .ai-pocket-enhance-btn:hover:not(.dragging):not(.loading) {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.2);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
        transform: scale(1.05);
      }

      .ai-pocket-enhance-btn:active:not(.dragging):not(.loading) {
        cursor: grabbing;
      }

      .ai-pocket-enhance-btn:focus {
        outline: 2px solid hsl(217.2 91.2% 59.8%);
        outline-offset: 2px;
      }

      .ai-pocket-enhance-btn-icon {
        user-select: none;
        pointer-events: none;
        transition: transform 0.2s ease;
      }

      .ai-pocket-enhance-btn.loading .ai-pocket-enhance-btn-icon {
        animation: ai-pocket-spin 1s linear infinite;
      }

      @keyframes ai-pocket-spin {
        to { transform: rotate(360deg); }
      }

      /* Enhancement Menu Styles - Dark Glassmorphism */
      .ai-pocket-enhancement-menu {
        position: absolute;
        background: rgba(34, 40, 49, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        z-index: 10002;
        min-width: 420px;
        max-width: 480px;
        padding: 0;
        opacity: 0;
        transform: scale(0.95);
        transition: opacity 0.15s ease, transform 0.15s ease;
        pointer-events: none;
        font-family: "Space Grotesk", sans-serif;
      }

      .ai-pocket-enhancement-menu.visible {
        opacity: 1;
        transform: scale(1);
        pointer-events: auto;
      }

      .ai-pocket-enhancement-menu.dragging {
        transition: none;
      }

      /* Drag Handle */
      .ai-pocket-menu-drag-handle {
        padding: 12px 16px;
        cursor: move;
        display: flex;
        align-items: center;
        justify-content: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        user-select: none;
        -webkit-user-select: none;
      }

      .ai-pocket-menu-drag-handle:hover {
        background: rgba(255, 255, 255, 0.05);
      }

      .ai-pocket-menu-drag-handle:active {
        cursor: grabbing;
      }

      .ai-pocket-drag-indicator {
        display: flex;
        gap: 4px;
        opacity: 0.4;
      }

      .ai-pocket-drag-dot {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.6);
      }

      .ai-pocket-menu-content {
        padding: 16px;
      }

      /* Tab Navigation */
      .ai-pocket-menu-tabs {
        display: flex;
        gap: 24px;
        padding: 0 0 12px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        margin-bottom: 16px;
      }

      .ai-pocket-menu-tab {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        font-size: 16px;
        font-weight: 600;
        font-family: "Space Grotesk", sans-serif;
        cursor: pointer;
        padding: 8px 4px;
        position: relative;
        transition: color 0.2s ease;
      }

      .ai-pocket-menu-tab:hover {
        color: rgba(255, 255, 255, 0.8);
      }

      .ai-pocket-menu-tab.active {
        color: rgba(255, 255, 255, 0.9);
      }

      .ai-pocket-menu-tab.active::after {
        content: '';
        position: absolute;
        bottom: -12px;
        left: 0;
        right: 0;
        height: 2px;
        background: rgba(255, 255, 255, 0.9);
        border-radius: 2px 2px 0 0;
      }

      /* Custom Prompt Input */
      .ai-pocket-custom-prompt-container {
        margin-bottom: 16px;
      }

      .ai-pocket-custom-prompt-wrapper {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .ai-pocket-custom-prompt-input {
        flex: 1;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        padding: 12px 16px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
        font-family: "Space Grotesk", sans-serif;
        transition: all 0.2s ease;
        resize: none;
        min-height: 44px;
        max-height: 120px;
      }

      .ai-pocket-custom-prompt-input::placeholder {
        color: rgba(255, 255, 255, 0.4);
      }

      .ai-pocket-custom-prompt-input:focus {
        outline: none;
        border-color: hsl(217.2 91.2% 59.8%);
        background: rgba(255, 255, 255, 0.1);
      }

      .ai-pocket-custom-prompt-btn {
        width: 44px;
        height: 44px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 20px;
        flex-shrink: 0;
      }

      .ai-pocket-custom-prompt-btn:hover {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.3);
        transform: scale(1.05);
      }

      .ai-pocket-custom-prompt-btn:active {
        transform: scale(0.95);
      }

      .ai-pocket-custom-prompt-btn:focus {
        outline: 2px solid hsl(217.2 91.2% 59.8%);
        outline-offset: 2px;
      }

      /* Preset Grid */
      .ai-pocket-presets-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        margin-bottom: 12px;
      }

      .ai-pocket-enhancement-option {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 14px 16px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.05);
        text-align: center;
        font-family: "Space Grotesk", sans-serif;
      }

      .ai-pocket-enhancement-option:hover:not(.selected) {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.25);
        transform: translateY(-1px);
      }

      .ai-pocket-enhancement-option:focus:not(.selected) {
        outline: 2px solid hsl(217.2 91.2% 59.8%);
        outline-offset: -2px;
        background: rgba(255, 255, 255, 0.1);
      }

      .ai-pocket-enhancement-option:active:not(.selected) {
        transform: translateY(0);
      }

      .ai-pocket-enhancement-option.selected {
        background: rgba(66, 133, 244, 0.2) !important;
        border: 1px solid hsl(217.2 91.2% 59.8%) !important;
      }

      .ai-pocket-enhancement-option.selected:hover {
        background: rgba(66, 133, 244, 0.3) !important;
      }

      .ai-pocket-enhancement-option.selected:focus {
        outline: none;
      }

      .ai-pocket-enhancement-option-icon {
        font-size: 18px;
        line-height: 1;
      }

      .ai-pocket-enhancement-option-label {
        font-size: 14px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.9);
        margin: 0;
        font-family: "Space Grotesk", sans-serif;
      }

      /* Custom Preset Styles */
      .ai-pocket-enhancement-option.custom-preset {
        position: relative;
        padding-right: 36px;
      }

      .ai-pocket-preset-delete-btn {
        position: absolute;
        right: 4px;
        top: 50%;
        transform: translateY(-50%);
        width: 24px;
        height: 24px;
        border-radius: 4px;
        border: none;
        background: rgba(255, 59, 48, 0.2);
        color: rgba(255, 255, 255, 0.9);
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        padding: 0;
      }

      .ai-pocket-preset-delete-btn:hover {
        background: rgba(255, 59, 48, 0.4);
        transform: translateY(-50%) scale(1.1);
      }

      .ai-pocket-preset-delete-btn:active {
        transform: translateY(-50%) scale(0.95);
      }

      /* Add Preset Button */
      .ai-pocket-add-preset-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 16px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px dashed rgba(255, 255, 255, 0.3);
        background: transparent;
        font-family: "Space Grotesk", sans-serif;
        color: rgba(255, 255, 255, 0.7);
        font-size: 14px;
        font-weight: 500;
      }

      .ai-pocket-add-preset-btn:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.4);
        color: rgba(255, 255, 255, 0.9);
      }

      .ai-pocket-add-preset-btn:focus {
        outline: 2px solid hsl(217.2 91.2% 59.8%);
        outline-offset: -2px;
      }

      .ai-pocket-add-preset-icon {
        font-size: 18px;
        font-weight: 300;
      }

      /* Tab Content Containers */
      .ai-pocket-tab-content {
        display: none;
      }

      .ai-pocket-tab-content.active {
        display: block;
      }

      /* Translate Tab Styles */
      .ai-pocket-translate-dropdowns {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }

      .ai-pocket-language-dropdown {
        flex: 1;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        padding: 12px 16px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
        font-family: "Space Grotesk", sans-serif;
        cursor: pointer;
        transition: all 0.2s ease;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='rgba(255,255,255,0.6)' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 12px center;
        padding-right: 36px;
        color-scheme: dark;
      }

      .ai-pocket-language-dropdown option {
        background: #1a1a1a;
        color: #ffffff;
        padding: 8px 12px;
      }

      .ai-pocket-language-dropdown:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.25);
      }

      .ai-pocket-language-dropdown:focus {
        outline: none;
        border-color: hsl(217.2 91.2% 59.8%);
        background: rgba(255, 255, 255, 0.1);
      }

      .ai-pocket-translate-arrow {
        font-size: 24px;
        color: rgba(255, 255, 255, 0.6);
        flex-shrink: 0;
      }

      .ai-pocket-translate-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 14px 16px;
        margin-bottom: 16px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px solid hsl(217.2 91.2% 59.8%);
        background: hsl(217.2 91.2% 59.8% / 0.15);
        font-family: "Space Grotesk", sans-serif;
        font-size: 14px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.95);
      }

      .ai-pocket-translate-btn:hover {
        background: hsl(217.2 91.2% 59.8% / 0.25);
        border-color: hsl(217.2 91.2% 65%);
        transform: translateY(-1px);
      }

      .ai-pocket-translate-btn:focus {
        outline: 2px solid hsl(217.2 91.2% 59.8%);
        outline-offset: 2px;
      }

      .ai-pocket-translate-btn:active {
        transform: translateY(0);
      }

      .ai-pocket-language-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-bottom: 12px;
      }

      .ai-pocket-language-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 14px 16px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.05);
        text-align: center;
        font-family: "Space Grotesk", sans-serif;
        font-size: 14px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.9);
      }

      .ai-pocket-language-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.25);
        transform: translateY(-1px);
      }

      .ai-pocket-language-btn:focus {
        outline: 2px solid hsl(217.2 91.2% 59.8%);
        outline-offset: -2px;
        background: rgba(255, 255, 255, 0.1);
      }

      .ai-pocket-language-btn:active {
        transform: translateY(0);
      }

      .ai-pocket-language-btn.selected {
        background: rgba(66, 133, 244, 0.2);
        border: 1px solid hsl(217.2 91.2% 59.8%);
      }

      .ai-pocket-add-language-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 16px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px dashed rgba(255, 255, 255, 0.3);
        background: transparent;
        font-family: "Space Grotesk", sans-serif;
        color: rgba(255, 255, 255, 0.7);
        font-size: 14px;
        font-weight: 500;
      }

      .ai-pocket-add-language-btn:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.4);
        color: rgba(255, 255, 255, 0.9);
      }

      .ai-pocket-add-language-btn:focus {
        outline: 2px solid hsl(217.2 91.2% 59.8%);
        outline-offset: -2px;
      }

      .ai-pocket-add-language-icon {
        font-size: 18px;
        font-weight: 300;
      }

      /* Language Selection Modal */
      .ai-pocket-language-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(34, 40, 49, 0.98);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 16px;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
        z-index: 10003;
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        font-family: "Space Grotesk", sans-serif;
      }

      .ai-pocket-language-modal-header {
        padding: 20px 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .ai-pocket-language-modal-title {
        font-size: 18px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.95);
        margin: 0;
      }

      .ai-pocket-language-modal-close {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        font-size: 24px;
        cursor: pointer;
        padding: 4px 8px;
        line-height: 1;
        transition: color 0.2s ease;
      }

      .ai-pocket-language-modal-close:hover {
        color: rgba(255, 255, 255, 0.9);
      }

      .ai-pocket-language-modal-body {
        padding: 24px;
        overflow-y: auto;
        flex: 1;
      }

      .ai-pocket-language-modal-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 12px;
      }

      .ai-pocket-language-modal-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.03);
      }

      .ai-pocket-language-modal-item:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
      }

      .ai-pocket-language-modal-item.selected {
        background: hsl(217.2 91.2% 59.8% / 0.15);
        border-color: hsl(217.2 91.2% 59.8%);
      }

      .ai-pocket-language-modal-checkbox {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all 0.2s ease;
      }

      .ai-pocket-language-modal-item.selected .ai-pocket-language-modal-checkbox {
        background: hsl(217.2 91.2% 59.8%);
        border-color: hsl(217.2 91.2% 59.8%);
      }

      .ai-pocket-language-modal-checkbox::after {
        content: '✓';
        color: white;
        font-size: 12px;
        font-weight: bold;
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      .ai-pocket-language-modal-item.selected .ai-pocket-language-modal-checkbox::after {
        opacity: 1;
      }

      .ai-pocket-language-modal-label {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.9);
        font-weight: 500;
      }

      .ai-pocket-language-modal-footer {
        padding: 16px 24px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }

      .ai-pocket-language-modal-btn {
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: "Space Grotesk", sans-serif;
      }

      .ai-pocket-language-modal-btn-cancel {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.8);
      }

      .ai-pocket-language-modal-btn-cancel:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.3);
      }

      .ai-pocket-language-modal-btn-save {
        background: hsl(217.2 91.2% 59.8%);
        border: 1px solid hsl(217.2 91.2% 59.8%);
        color: white;
      }

      .ai-pocket-language-modal-btn-save:hover {
        background: hsl(217.2 91.2% 65%);
        border-color: hsl(217.2 91.2% 65%);
      }

      /* Menu backdrop */
      .ai-pocket-menu-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10001;
        background: transparent;
      }

      .ai-pocket-modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10002;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }

      /* Preview Dialog Styles - True Glassmorphism like Chatbox */
      .ai-pocket-enhancement-preview {
        position: fixed;
        background: rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(20px) saturate(180%) brightness(1.1);
        -webkit-backdrop-filter: blur(20px) saturate(180%) brightness(1.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 16px;
        box-shadow: 
          0 8px 32px rgba(0, 0, 0, 0.3),
          inset 0 1px 0 rgba(255, 255, 255, 0.2);
        z-index: 10004;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        opacity: 0;
        transform: scale(0.95);
        transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-family: "Space Grotesk", sans-serif;
        overflow: hidden;
      }

      .ai-pocket-enhancement-preview.visible {
        opacity: 1;
        transform: scale(1);
      }

      .ai-pocket-preview-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.05);
      }

      .ai-pocket-preview-title {
        font-size: 16px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
        margin: 0;
        font-family: "Space Grotesk", sans-serif;
      }

      .ai-pocket-preview-close {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        font-size: 16px;
        color: rgba(255, 255, 255, 0.9);
        cursor: pointer;
        padding: 8px;
        border-radius: 8px;
        transition: all 0.2s ease;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .ai-pocket-preview-close:hover {
        background: rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 1);
      }

      .ai-pocket-preview-close:focus {
        outline: 2px solid hsl(217.2 91.2% 59.8%);
        outline-offset: 2px;
      }

      .ai-pocket-preview-content {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      .ai-pocket-preview-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .ai-pocket-preview-label {
        font-size: 12px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.6);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-family: "Space Grotesk", sans-serif;
      }

      .ai-pocket-preview-text {
        padding: 16px;
        border-radius: 12px;
        font-size: 14px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-wrap: break-word;
        font-family: "Space Grotesk", sans-serif;
        transition: all 0.2s ease;
      }

      .ai-pocket-preview-original {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: rgba(255, 255, 255, 0.9);
      }

      .ai-pocket-preview-enhanced {
        background: rgba(66, 133, 244, 0.15);
        border: 1px solid rgba(66, 133, 244, 0.4);
        color: rgba(255, 255, 255, 1);
      }

      .ai-pocket-preview-actions {
        display: flex;
        gap: 12px;
        padding: 20px 24px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        justify-content: flex-end;
        background: rgba(255, 255, 255, 0.05);
      }

      .ai-pocket-preview-btn {
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
        font-family: "Space Grotesk", sans-serif;
      }

      .ai-pocket-preview-btn-primary {
        background: hsl(217.2 91.2% 59.8%);
        color: white;
      }

      .ai-pocket-preview-btn-primary:hover {
        background: hsl(217.2 91.2% 55%);
        transform: translateY(-1px);
      }

      .ai-pocket-preview-btn-primary:focus {
        outline: 2px solid hsl(217.2 91.2% 59.8%);
        outline-offset: 2px;
      }

      .ai-pocket-preview-btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.2);
      }

      .ai-pocket-preview-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.15);
        color: rgba(255, 255, 255, 1);
        transform: translateY(-1px);
      }

      .ai-pocket-preview-btn-secondary:focus {
        outline: 2px solid hsl(217.2 91.2% 59.8%);
        outline-offset: 2px;
      }

      .ai-pocket-preview-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.2);
        z-index: 10003;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .ai-pocket-preview-backdrop.visible {
        opacity: 1;
      }

      /* Error Message Styles - Dark Theme */
      .ai-pocket-enhancement-error {
        position: absolute;
        background: rgba(220, 53, 69, 0.9);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 13px;
        box-shadow: 0 4px 16px rgba(220, 53, 69, 0.3);
        z-index: 10003;
        max-width: 300px;
        animation: ai-pocket-slide-in 0.2s ease;
        font-family: "Space Grotesk", sans-serif;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      @keyframes ai-pocket-slide-in {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Process all existing text fields on the page
   */
  private processExistingFields(): void {
    const fields = this.findTextFields();
    console.debug(`[TextEnhancer] Found ${fields.length} text fields`);

    fields.forEach((field) => {
      this.injectButton(field);
    });
  }

  /**
   * Find all text input fields on the page
   */
  private findTextFields(): HTMLElement[] {
    const selectors = [
      'input[type="text"]',
      'input[type="email"]',
      'input[type="search"]',
      'input[type="url"]',
      "input:not([type])", // Input without type defaults to text
      "textarea",
      '[contenteditable="true"]',
    ];

    const fields: HTMLElement[] = [];

    selectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        // Skip if already has button or is hidden
        if (
          !this.injectedButtons.has(el as HTMLElement) &&
          this.isVisible(el as HTMLElement) &&
          !this.isExcluded(el as HTMLElement)
        ) {
          fields.push(el as HTMLElement);
        }
      });
    });

    return fields;
  }

  /**
   * Check if element is visible
   */
  private isVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.offsetWidth > 0 &&
      element.offsetHeight > 0
    );
  }

  /**
   * Check if element should be excluded from enhancement
   */
  private isExcluded(element: HTMLElement): boolean {
    // Exclude password fields
    if (element instanceof HTMLInputElement && element.type === "password") {
      return true;
    }

    // Exclude fields with specific attributes
    if (
      element.hasAttribute("data-ai-pocket-exclude") ||
      (element.hasAttribute("autocomplete") &&
        element.getAttribute("autocomplete")?.includes("password"))
    ) {
      return true;
    }

    // Exclude very small fields (likely not for user input)
    if (element.offsetWidth < 50 || element.offsetHeight < 20) {
      return true;
    }

    return false;
  }

  /**
   * Inject enhancement button near a text field
   */
  private injectButton(textField: HTMLElement): void {
    // Skip if button already exists
    if (this.injectedButtons.has(textField)) {
      return;
    }

    // Create button
    const button = document.createElement("button");
    button.className = "ai-pocket-enhance-btn";
    button.setAttribute("type", "button");
    button.setAttribute("aria-label", "Enhance text with AI (drag to move)");
    button.setAttribute("title", "Enhance with AI - Drag to reposition");
    button.setAttribute("data-ai-pocket-button", "true");

    // Add icon
    const icon = document.createElement("span");
    icon.className = "ai-pocket-enhance-btn-icon";
    icon.textContent = "✨";
    button.appendChild(icon);

    // Make button draggable
    this.makeDraggable(button, textField);

    // Position button
    this.positionButton(button, textField);

    // Add to DOM
    document.body.appendChild(button);

    // Store reference
    this.injectedButtons.set(textField, button);

    console.debug("[TextEnhancer] Button injected for field", {
      tag: textField.tagName,
      name: (textField as HTMLInputElement).name,
    });
  }

  /**
   * Make button draggable
   */
  private makeDraggable(button: HTMLElement, textField: HTMLElement): void {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let hasMoved = false;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // Only left click

      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = button.getBoundingClientRect();
      initialLeft = rect.left + window.scrollX;
      initialTop = rect.top + window.scrollY;

      button.classList.add("dragging");
      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      // Check if moved more than 3px (drag threshold)
      if (!hasMoved && (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3)) {
        hasMoved = true;
      }

      if (hasMoved) {
        button.style.left = `${initialLeft + deltaX}px`;
        button.style.top = `${initialTop + deltaY}px`;
        (button as any).__isDragged = true;
      }

      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;

      isDragging = false;
      button.classList.remove("dragging");

      // If dragged, prevent click event
      if (hasMoved) {
        e.preventDefault();
        e.stopPropagation();

        // Block next click
        const blockClick = (clickEvent: Event) => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
          button.removeEventListener("click", blockClick, true);
        };
        button.addEventListener("click", blockClick, true);
      } else {
        // Not dragged, handle as click
        this.handleButtonClick(textField, button, e);
      }
    };

    // Touch support
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      if (!touch) return;

      isDragging = true;
      hasMoved = false;
      startX = touch.clientX;
      startY = touch.clientY;

      const rect = button.getBoundingClientRect();
      initialLeft = rect.left + window.scrollX;
      initialTop = rect.top + window.scrollY;

      button.classList.add("dragging");
      e.preventDefault();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;

      const touch = e.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (!hasMoved && (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3)) {
        hasMoved = true;
      }

      if (hasMoved) {
        button.style.left = `${initialLeft + deltaX}px`;
        button.style.top = `${initialTop + deltaY}px`;
        (button as any).__isDragged = true;
      }

      e.preventDefault();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!isDragging) return;

      isDragging = false;
      button.classList.remove("dragging");

      if (!hasMoved) {
        // Handle as click - note: touch events don't have ctrlKey
        this.handleButtonClick(textField, button);
      }

      e.preventDefault();
    };

    button.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    button.addEventListener("touchstart", onTouchStart, { passive: false });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);

    // Store cleanup
    (button as any).__dragCleanup = () => {
      button.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      button.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }

  /**
   * Position button relative to text field
   */
  private positionButton(button: HTMLElement, textField: HTMLElement): void {
    const updatePosition = () => {
      // Don't update if button was manually dragged
      if ((button as any).__isDragged) {
        return;
      }

      // Check if textField is still in DOM
      if (!textField || !document.body.contains(textField)) {
        return;
      }

      // Check if textField is visible
      if (!this.isVisible(textField)) {
        button.classList.remove("visible");
        return;
      }

      const rect = textField.getBoundingClientRect();

      // Position button at top-right corner of text field
      button.style.top = `${rect.top + window.scrollY + 4}px`;
      button.style.left = `${rect.right + window.scrollX - 32}px`;
    };

    // Initial position
    updatePosition();

    // Update position on scroll and resize
    const updateHandler = () => updatePosition();
    window.addEventListener("scroll", updateHandler, { passive: true });
    window.addEventListener("resize", updateHandler, { passive: true });

    // Store cleanup function
    (button as any).__cleanup = () => {
      window.removeEventListener("scroll", updateHandler);
      window.removeEventListener("resize", updateHandler);
      if ((button as any).__dragCleanup) {
        (button as any).__dragCleanup();
      }
    };
  }

  /**
   * Handle button click
   */
  private handleButtonClick(
    textField: HTMLElement,
    button: HTMLElement,
    event?: MouseEvent,
  ): void {
    console.debug("[TextEnhancer] Enhancement button clicked", {
      tag: textField.tagName,
      value: (textField as HTMLInputElement).value,
      ctrlKey: event?.ctrlKey,
    });

    // Check if enhancement is enabled
    if (!this.isEnhancementEnabled()) {
      console.warn("[TextEnhancer] Enhancement disabled on this site");
      return;
    }

    // Get current text value
    const currentText = this.getTextFieldValue(textField);

    if (!currentText || currentText.trim().length === 0) {
      console.debug("[TextEnhancer] No text to enhance");
      // Provide visual feedback
      button.style.transform = "scale(1.1)";
      setTimeout(() => {
        button.style.transform = "";
      }, 200);
      return;
    }

    // Check if Ctrl+Click for direct enhancement
    if (event?.ctrlKey) {
      console.debug("[TextEnhancer] Ctrl+Click detected - auto-enhancing");
      this.handleDirectEnhancement(textField, currentText);
    } else {
      // Show enhancement menu for normal click
      this.showEnhancementMenu(textField, button);
    }
  }

  /**
   * Handle direct enhancement with auto-detected tone (Ctrl+Click)
   */
  private async handleDirectEnhancement(
    textField: HTMLElement,
    currentText: string,
  ): Promise<void> {
    console.info("[TextEnhancer] Processing direct enhancement");

    // Auto-detect the best enhancement style
    const detectedStyle = this.autoDetectEnhancementStyle(currentText);

    console.debug("[TextEnhancer] Auto-detected style:", detectedStyle);

    // Process enhancement directly without showing menu
    await this.processDirectEnhancement(textField, currentText, detectedStyle);
  }

  /**
   * Auto-detect the best enhancement style based on text content and context
   */
  private autoDetectEnhancementStyle(text: string): EnhancementStyle {
    const lowerText = text.toLowerCase();

    // Check for grammar/spelling issues first
    const hasGrammarIssues = this.hasGrammarIssues(text);
    if (hasGrammarIssues) {
      return EnhancementStyle.OPTIMIZE;
    }

    // Check page context for professional environments
    if (this.pageContext) {
      const professionalContexts = [
        "email",
        "business",
        "linkedin",
        "work",
        "corporate",
      ];
      if (
        professionalContexts.some(
          (ctx) =>
            this.pageContext!.domain.includes(ctx) ||
            this.pageContext!.type.includes(ctx) ||
            (this.pageContext!.title &&
              this.pageContext!.title.toLowerCase().includes(ctx)),
        )
      ) {
        return EnhancementStyle.PROFESSIONAL;
      }
    }

    // Check for informal language patterns
    const informalPatterns = [
      /\b(hey|hi|yo|sup|lol|omg|btw|tbh|imo|fyi)\b/i,
      /\b(gonna|wanna|gotta|kinda|sorta)\b/i,
      /[.]{2,}|[!]{2,}|[?]{2,}/,
      /\b(awesome|cool|sweet|dope|sick)\b/i,
    ];

    if (informalPatterns.some((pattern) => pattern.test(text))) {
      // If it's informal, check if it needs to be more professional
      if (text.length > 50) {
        return EnhancementStyle.PROFESSIONAL;
      } else {
        return EnhancementStyle.CONCISE;
      }
    }

    // Check for verbose text that could be shortened
    if (text.length > 200 || text.split(" ").length > 40) {
      return EnhancementStyle.CONCISE;
    }

    // Check for emotional content
    const emotionalPatterns = [
      /\b(sorry|apologize|understand|feel|emotion|heart|care|love|hate|angry|sad|happy|excited)\b/i,
      /\b(please|thank|appreciate|grateful|help|support)\b/i,
    ];

    if (emotionalPatterns.some((pattern) => pattern.test(text))) {
      return EnhancementStyle.EMPATHETIC;
    }

    // Check for persuasive intent
    const persuasivePatterns = [
      /\b(should|must|need|important|urgent|recommend|suggest|propose|convince|believe)\b/i,
      /\b(benefits?|advantages?|opportunity|offer|deal|value|worth)\b/i,
    ];

    if (persuasivePatterns.some((pattern) => pattern.test(text))) {
      return EnhancementStyle.PERSUASIVE;
    }

    // Default to optimize for general improvement
    return EnhancementStyle.OPTIMIZE;
  }

  /**
   * Check if text has potential grammar or clarity issues
   */
  private hasGrammarIssues(text: string): boolean {
    // Simple heuristics for common issues
    const issues = [
      /\b(i)\b/g, // Lowercase 'i'
      /[a-z]\.[A-Z]/g, // Missing space after period
      /\s{2,}/g, // Multiple spaces
      /\b(there|their|they're)\b.*\b(there|their|they're)\b/i, // Common confusion
      /\b(your|you're)\b.*\b(your|you're)\b/i,
      /\b(its|it's)\b.*\b(its|it's)\b/i,
      /[.!?]\s*[a-z]/g, // Lowercase after sentence end
    ];

    return issues.some((pattern) => pattern.test(text));
  }

  /**
   * Process direct enhancement without showing preview
   */
  private async processDirectEnhancement(
    textField: HTMLElement,
    originalText: string,
    style: EnhancementStyle,
  ): Promise<void> {
    console.info("[TextEnhancer] Processing direct enhancement", {
      style,
      textLength: originalText.length,
    });

    // Verify textField is still valid
    if (!textField || !document.body.contains(textField)) {
      console.error(
        "[TextEnhancer] Text field no longer in DOM, cannot process",
      );
      return;
    }

    // Show loading indicator
    const loadingOverlay = this.showLoadingIndicator(textField);

    try {
      // Send enhancement request to service worker
      const enhancedText = await this.requestEnhancement(
        originalText,
        style,
        true,
      ); // true for direct mode

      // Remove loading indicator
      this.hideLoadingIndicator(textField, loadingOverlay);

      // Verify textField is still valid before applying
      if (!textField || !document.body.contains(textField)) {
        console.error("[TextEnhancer] Text field removed during processing");
        return;
      }

      // Apply enhancement directly
      this.setTextFieldValue(textField, enhancedText);

      // Provide visual feedback
      const button = this.injectedButtons.get(textField);
      if (button) {
        button.style.transform = "scale(1.2)";
        button.style.background = "#4caf50";
        setTimeout(() => {
          button.style.transform = "";
          button.style.background = "";
        }, 500);
      }

      console.info("[TextEnhancer] Direct enhancement applied successfully");
    } catch (error) {
      console.error("[TextEnhancer] Direct enhancement failed", error);

      // Remove loading indicator
      this.hideLoadingIndicator(textField, loadingOverlay);

      // Show error message
      this.showErrorMessage(
        textField,
        error instanceof Error ? error.message : "Enhancement failed",
      );
    }
  }

  /**
   * Get text field value
   */
  private getTextFieldValue(textField: HTMLElement): string {
    if (
      textField instanceof HTMLInputElement ||
      textField instanceof HTMLTextAreaElement
    ) {
      return textField.value;
    } else if (textField.isContentEditable) {
      return textField.textContent || "";
    }
    return "";
  }

  /**
   * Set text field value
   */
  private setTextFieldValue(textField: HTMLElement, value: string): void {
    if (
      textField instanceof HTMLInputElement ||
      textField instanceof HTMLTextAreaElement
    ) {
      textField.value = value;
      // Trigger input event for frameworks
      textField.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (textField.isContentEditable) {
      textField.textContent = value;
      // Trigger input event
      textField.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  /**
   * Create option button for enhancement menu (legacy - for full descriptions)
   */
  private createOptionButton(
    option: EnhancementOption,
    index: number,
  ): HTMLElement {
    const optionButton = document.createElement("button");
    optionButton.className = "ai-pocket-enhancement-option";
    optionButton.setAttribute("role", "menuitem");
    optionButton.setAttribute("data-style", option.id);
    optionButton.setAttribute("tabindex", index === 0 ? "0" : "-1");
    optionButton.setAttribute("aria-checked", "false");

    const icon = document.createElement("span");
    icon.className = "ai-pocket-enhancement-option-icon";
    icon.textContent = option.icon;
    icon.setAttribute("aria-hidden", "true");

    const content = document.createElement("div");
    content.className = "ai-pocket-enhancement-option-content";

    const label = document.createElement("div");
    label.className = "ai-pocket-enhancement-option-label";
    label.textContent = option.label;

    const description = document.createElement("div");
    description.className = "ai-pocket-enhancement-option-description";
    description.textContent = option.description;

    content.appendChild(label);
    content.appendChild(description);

    optionButton.appendChild(icon);
    optionButton.appendChild(content);

    // Add click handler
    optionButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleStyleSelection(option.id, optionButton);
    });

    return optionButton;
  }

  /**
   * Create preset button for enhancement menu (compact grid style)
   */
  private createPresetButton(
    option: EnhancementOption,
    index: number,
    isCustom: boolean = false,
  ): HTMLElement {
    const optionButton = document.createElement("button");
    optionButton.className = "ai-pocket-enhancement-option";
    if (isCustom) {
      optionButton.classList.add("custom-preset");
    }
    optionButton.setAttribute("role", "menuitem");
    optionButton.setAttribute("data-style", option.id);
    optionButton.setAttribute("tabindex", index === 0 ? "0" : "-1");
    optionButton.setAttribute("aria-checked", "false");
    optionButton.setAttribute("type", "button");

    const icon = document.createElement("span");
    icon.className = "ai-pocket-enhancement-option-icon";
    icon.textContent = option.icon;
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "ai-pocket-enhancement-option-label";
    label.textContent = option.label;

    optionButton.appendChild(icon);
    optionButton.appendChild(label);

    // Add delete button for custom presets
    if (isCustom) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "ai-pocket-preset-delete-btn";
      deleteBtn.textContent = "×";
      deleteBtn.setAttribute("type", "button");
      deleteBtn.setAttribute("aria-label", "Delete preset");
      deleteBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.deleteCustomPreset(option.id);
      });
      optionButton.appendChild(deleteBtn);
    }

    // Add click handler
    optionButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isCustom) {
        this.handleCustomPresetSelection(option);
      } else {
        this.handleStyleSelection(option.id, optionButton);
      }
    });

    return optionButton;
  }

  /**
   * Handle custom prompt enhancement
   */
  private async handleCustomPromptEnhancement(
    customPrompt: string,
  ): Promise<void> {
    if (!this.currentTextField) {
      console.error("[TextEnhancer] No text field selected");
      return;
    }

    const currentText = this.getTextFieldValue(this.currentTextField);
    if (!currentText || currentText.trim().length === 0) {
      console.debug("[TextEnhancer] No text to enhance");
      return;
    }

    console.debug("[TextEnhancer] Custom prompt enhancement", { customPrompt });

    // Store reference to textField BEFORE closing menu
    const textFieldRef = this.currentTextField;

    // Close menu
    this.closeEnhancementMenu();

    // Verify textField is still valid
    if (!textFieldRef || !document.body.contains(textFieldRef)) {
      console.error("[TextEnhancer] Text field no longer in DOM");
      return;
    }

    // Process enhancement with custom prompt
    await this.processCustomEnhancement(
      textFieldRef,
      currentText,
      customPrompt,
    );
  }

  /**
   * Process custom prompt enhancement
   */
  private async processCustomEnhancement(
    textField: HTMLElement,
    originalText: string,
    customPrompt: string,
  ): Promise<void> {
    console.info("[TextEnhancer] Processing custom enhancement", {
      customPrompt,
      textLength: originalText.length,
    });

    // Verify textField is still valid
    if (!textField || !document.body.contains(textField)) {
      console.error(
        "[TextEnhancer] Text field no longer in DOM, cannot process",
      );
      return;
    }

    // Show loading indicator
    const loadingOverlay = this.showLoadingIndicator(textField);

    try {
      // Send custom enhancement request to service worker
      const enhancedText = await this.requestCustomEnhancement(
        originalText,
        customPrompt,
      );

      // Remove loading indicator
      this.hideLoadingIndicator(textField, loadingOverlay);

      // Verify textField is still valid before showing preview
      if (!textField || !document.body.contains(textField)) {
        console.error("[TextEnhancer] Text field removed during processing");
        return;
      }

      // Show preview with accept/reject options
      this.showEnhancementPreview(
        textField,
        originalText,
        enhancedText,
        EnhancementStyle.OPTIMIZE,
      );
    } catch (error) {
      console.error("[TextEnhancer] Custom enhancement failed", error);

      // Remove loading indicator
      this.hideLoadingIndicator(textField, loadingOverlay);

      // Show error message
      this.showErrorMessage(
        textField,
        error instanceof Error ? error.message : "Enhancement failed",
      );
    }
  }

  /**
   * Request custom text enhancement from service worker
   */
  private async requestCustomEnhancement(
    text: string,
    customPrompt: string,
  ): Promise<string> {
    // Import sendMessage dynamically to avoid circular dependencies
    const { sendMessage } = await import("../shared/message-client.js");

    // Create custom enhancement prompt
    let prompt = `${customPrompt}\n\nIMPORTANT: Provide ONLY the enhanced text as your response. Do not include explanations, options, analysis, or any other text. Just return the improved version of the original text.`;

    prompt += `\n\nOriginal text:\n"${text}"\n\nEnhanced text (provide ONLY the enhanced text, no explanations):`;

    // Send request to service worker
    const response = await sendMessage<{ enhancedText: string }>(
      "AI_PROCESS_REQUEST",
      {
        prompt,
        task: "enhance",
        preferLocal: true,
        style: "custom",
        originalText: text,
        directMode: false,
      },
      { timeout: 100000 },
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || "Enhancement request failed");
    }

    // Clean up the response to ensure we only get the enhanced text
    const cleanedText = this.cleanEnhancedText(response.data.enhancedText);
    return cleanedText;
  }

  /**
   * Handle translation
   */
  private async handleTranslation(textField: HTMLElement): Promise<void> {
    if (!textField) {
      console.error("[TextEnhancer] No text field provided");
      return;
    }

    const currentText = this.getTextFieldValue(textField);
    if (!currentText || currentText.trim().length === 0) {
      console.debug("[TextEnhancer] No text to translate");
      return;
    }

    console.debug("[TextEnhancer] Starting translation", {
      targetLanguage: this.selectedTargetLanguage,
    });

    // Store reference to textField
    const textFieldRef = textField;

    // Close menu
    this.closeEnhancementMenu();

    // Verify textField is still valid
    if (!textFieldRef || !document.body.contains(textFieldRef)) {
      console.error("[TextEnhancer] Text field no longer in DOM");
      return;
    }

    // Process translation
    await this.processTranslation(textFieldRef, currentText);
  }

  /**
   * Process translation
   */
  private async processTranslation(
    textField: HTMLElement,
    originalText: string,
  ): Promise<void> {
    console.info("[TextEnhancer] Processing translation", {
      textLength: originalText.length,
      targetLanguage: this.selectedTargetLanguage,
    });

    // Verify textField is still valid
    if (!textField || !document.body.contains(textField)) {
      console.error(
        "[TextEnhancer] Text field no longer in DOM, cannot process",
      );
      return;
    }

    // Show loading indicator
    const loadingOverlay = this.showLoadingIndicator(textField);

    try {
      // Detect source language if needed
      let sourceLanguage = this.detectedSourceLanguage;
      if (!sourceLanguage) {
        sourceLanguage = await this.detectLanguage(originalText);
      }

      if (!sourceLanguage) {
        throw new Error("Could not detect source language");
      }

      // Translate text
      const translatedText = await this.translateText(
        originalText,
        sourceLanguage,
        this.selectedTargetLanguage,
      );

      // Remove loading indicator
      this.hideLoadingIndicator(textField, loadingOverlay);

      // Verify textField is still valid before showing preview
      if (!textField || !document.body.contains(textField)) {
        console.error("[TextEnhancer] Text field removed during processing");
        return;
      }

      // Show preview with accept/reject options
      this.showEnhancementPreview(
        textField,
        originalText,
        translatedText,
        EnhancementStyle.OPTIMIZE,
      );
    } catch (error) {
      console.error("[TextEnhancer] Translation failed", error);

      // Remove loading indicator
      this.hideLoadingIndicator(textField, loadingOverlay);

      // Show error message
      this.showErrorMessage(
        textField,
        error instanceof Error ? error.message : "Translation failed",
      );
    }
  }

  /**
   * Detect language using Language Detector API
   */
  private async detectLanguage(text: string): Promise<string | null> {
    try {
      // Check if Language Detector API is available
      if (!("LanguageDetector" in self)) {
        console.warn("[TextEnhancer] Language Detector API not available");
        return null;
      }

      const LanguageDetector = (self as any).LanguageDetector;

      // Check availability
      const availability = await LanguageDetector.availability();
      if (availability !== "available") {
        console.warn(
          "[TextEnhancer] Language Detector not available:",
          availability,
        );
        return null;
      }

      // Create detector if not exists
      if (!this.currentLanguageDetector) {
        this.currentLanguageDetector = await LanguageDetector.create();
      }

      // Detect language
      const results = await this.currentLanguageDetector.detect(text);
      if (results && results.length > 0) {
        const topResult = results[0];
        console.debug("[TextEnhancer] Detected language:", {
          language: topResult.detectedLanguage,
          confidence: topResult.confidence,
        });
        return topResult.detectedLanguage;
      }

      return null;
    } catch (error) {
      console.error("[TextEnhancer] Language detection failed", error);
      return null;
    }
  }

  /**
   * Translate text using Translator API
   */
  private async translateText(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<string> {
    try {
      // Check if Translator API is available
      if (!("Translator" in self)) {
        throw new Error("Translator API not available in this browser");
      }

      const Translator = (self as any).Translator;

      // Check if language pair is supported
      const availability = await Translator.availability({
        sourceLanguage,
        targetLanguage,
      });

      if (availability === "no") {
        throw new Error(
          `Translation from ${sourceLanguage} to ${targetLanguage} is not supported`,
        );
      }

      // Create translator for this language pair
      const translator = await Translator.create({
        sourceLanguage,
        targetLanguage,
        monitor(m: any) {
          m.addEventListener("downloadprogress", (e: any) => {
            console.debug(
              `[TextEnhancer] Translation model download: ${e.loaded * 100}%`,
            );
          });
        },
      });

      // Translate
      const translatedText = await translator.translate(text);

      // Clean up translator
      if (translator.destroy) {
        translator.destroy();
      }

      return translatedText;
    } catch (error) {
      console.error("[TextEnhancer] Translation failed", error);
      throw error;
    }
  }

  /**
   * Translate entire page
   */
  private async translatePage(targetLanguage: string): Promise<void> {
    console.info("[TextEnhancer] Translating entire page", { targetLanguage });

    try {
      // Get all text nodes in the page
      const textNodes = this.getTextNodes(document.body);

      // Translate each text node
      for (const node of textNodes) {
        const originalText = node.textContent?.trim();
        if (originalText && originalText.length > 0) {
          try {
            // Detect language
            const sourceLanguage = await this.detectLanguage(originalText);
            if (sourceLanguage && sourceLanguage !== targetLanguage) {
              // Translate
              const translatedText = await this.translateText(
                originalText,
                sourceLanguage,
                targetLanguage,
              );
              node.textContent = translatedText;
            }
          } catch (error) {
            console.error(
              "[TextEnhancer] Failed to translate node:",
              error,
            );
            // Continue with next node
          }
        }
      }

      console.info("[TextEnhancer] Page translation complete");
    } catch (error) {
      console.error("[TextEnhancer] Page translation failed", error);
      throw error;
    }
  }

  /**
   * Get all text nodes in an element
   */
  private getTextNodes(element: Node): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip script, style, and other non-visible elements
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          const tagName = parent.tagName.toLowerCase();
          if (
            tagName === "script" ||
            tagName === "style" ||
            tagName === "noscript" ||
            tagName === "iframe"
          ) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip empty or whitespace-only nodes
          const text = node.textContent?.trim();
          if (!text || text.length === 0) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );

    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }

    return textNodes;
  }

  /**
   * Create enhancement menu
   */
  private createEnhancementMenu(): HTMLElement {
    const menu = document.createElement("div");
    menu.className = "ai-pocket-enhancement-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Text enhancement options");

    // Drag Handle
    const dragHandle = document.createElement("div");
    dragHandle.className = "ai-pocket-menu-drag-handle";
    dragHandle.setAttribute("title", "Drag to move");

    const dragIndicator = document.createElement("div");
    dragIndicator.className = "ai-pocket-drag-indicator";
    for (let i = 0; i < 6; i++) {
      const dot = document.createElement("div");
      dot.className = "ai-pocket-drag-dot";
      dragIndicator.appendChild(dot);
    }
    dragHandle.appendChild(dragIndicator);

    // Add drag event listeners
    dragHandle.addEventListener("mousedown", (e) => this.handleDragStart(e, menu));

    menu.appendChild(dragHandle);

    // Content wrapper
    const contentWrapper = document.createElement("div");
    contentWrapper.className = "ai-pocket-menu-content";

    // Tab Navigation
    const tabs = document.createElement("div");
    tabs.className = "ai-pocket-menu-tabs";

    const enhanceTab = document.createElement("button");
    enhanceTab.className = "ai-pocket-menu-tab active";
    enhanceTab.textContent = "Enhance";
    enhanceTab.setAttribute("type", "button");

    const translateTab = document.createElement("button");
    translateTab.className = "ai-pocket-menu-tab";
    translateTab.textContent = "Translate";
    translateTab.setAttribute("type", "button");

    // Tab switching logic
    enhanceTab.addEventListener("click", () => {
      enhanceTab.classList.add("active");
      translateTab.classList.remove("active");
      enhanceContent.classList.add("active");
      translateContent.classList.remove("active");
    });

    translateTab.addEventListener("click", () => {
      translateTab.classList.add("active");
      enhanceTab.classList.remove("active");
      translateContent.classList.add("active");
      enhanceContent.classList.remove("active");
    });

    tabs.appendChild(enhanceTab);
    tabs.appendChild(translateTab);
    contentWrapper.appendChild(tabs);

    // Enhance Tab Content
    const enhanceContent = document.createElement("div");
    enhanceContent.className = "ai-pocket-tab-content active";

    // Custom Prompt Input
    const customPromptContainer = document.createElement("div");
    customPromptContainer.className = "ai-pocket-custom-prompt-container";

    const customPromptWrapper = document.createElement("div");
    customPromptWrapper.className = "ai-pocket-custom-prompt-wrapper";

    const customPromptInput = document.createElement("textarea");
    customPromptInput.className = "ai-pocket-custom-prompt-input";
    customPromptInput.setAttribute("placeholder", "prompt for enhance");
    customPromptInput.setAttribute("rows", "1");
    customPromptInput.setAttribute("aria-label", "Custom enhancement prompt");

    // Auto-resize textarea
    customPromptInput.addEventListener("input", () => {
      customPromptInput.style.height = "auto";
      customPromptInput.style.height = customPromptInput.scrollHeight + "px";
    });

    const customPromptBtn = document.createElement("button");
    customPromptBtn.className = "ai-pocket-custom-prompt-btn";
    customPromptBtn.textContent = "✨";
    customPromptBtn.setAttribute("type", "button");
    customPromptBtn.setAttribute("aria-label", "Apply custom enhancement");
    customPromptBtn.addEventListener("click", () => {
      const customPrompt = customPromptInput.value.trim();
      if (customPrompt) {
        this.handleCustomPromptEnhancement(customPrompt);
      }
    });

    customPromptWrapper.appendChild(customPromptInput);
    customPromptWrapper.appendChild(customPromptBtn);
    customPromptContainer.appendChild(customPromptWrapper);
    enhanceContent.appendChild(customPromptContainer);

    // Preset buttons in grid
    const presetsGrid = document.createElement("div");
    presetsGrid.className = "ai-pocket-presets-grid";

    // Default presets matching wireframe
    const defaultPresets = [
      EnhancementStyle.FUNNY,
      EnhancementStyle.EXPAND,
      EnhancementStyle.SUMMARISE,
      EnhancementStyle.PROFESSIONAL,
    ];

    const presetOptions = this.enhancementOptions.filter((opt) =>
      defaultPresets.includes(opt.id),
    );

    // Sort to match wireframe order
    presetOptions.sort((a, b) => {
      return defaultPresets.indexOf(a.id) - defaultPresets.indexOf(b.id);
    });

    presetOptions.forEach((option, index) => {
      const optionButton = this.createPresetButton(option, index);
      presetsGrid.appendChild(optionButton);
    });

    // Add custom presets
    this.customPresets.forEach((option, index) => {
      const optionButton = this.createPresetButton(option, presetOptions.length + index, true);
      presetsGrid.appendChild(optionButton);
    });

    enhanceContent.appendChild(presetsGrid);

    // Add Preset Button
    const addPresetBtn = document.createElement("button");
    addPresetBtn.className = "ai-pocket-add-preset-btn";
    addPresetBtn.setAttribute("type", "button");
    addPresetBtn.setAttribute("aria-label", "Save more presets for enhance");

    const addIcon = document.createElement("span");
    addIcon.className = "ai-pocket-add-preset-icon";
    addIcon.textContent = "+";

    const addLabel = document.createElement("span");
    addLabel.textContent = "Save more presets for enhance";

    addPresetBtn.appendChild(addIcon);
    addPresetBtn.appendChild(addLabel);
    addPresetBtn.addEventListener("click", () => {
      this.showAddPresetDialog();
    });

    enhanceContent.appendChild(addPresetBtn);
    contentWrapper.appendChild(enhanceContent);

    // Translate Tab Content
    const translateContent = document.createElement("div");
    translateContent.className = "ai-pocket-tab-content";

    // Language dropdowns
    const dropdownsContainer = document.createElement("div");
    dropdownsContainer.className = "ai-pocket-translate-dropdowns";

    // Source language dropdown
    const sourceDropdown = document.createElement("select");
    sourceDropdown.className = "ai-pocket-language-dropdown";
    sourceDropdown.setAttribute("aria-label", "Source language");

    const detectOption = document.createElement("option");
    detectOption.value = "detect";
    detectOption.textContent = "detect language";
    sourceDropdown.appendChild(detectOption);

    this.supportedLanguages.forEach((lang) => {
      const option = document.createElement("option");
      option.value = lang.code;
      option.textContent = lang.name;
      sourceDropdown.appendChild(option);
    });

    // Arrow
    const arrow = document.createElement("span");
    arrow.className = "ai-pocket-translate-arrow";
    arrow.textContent = "→";

    // Target language dropdown
    const targetDropdown = document.createElement("select");
    targetDropdown.className = "ai-pocket-language-dropdown";
    targetDropdown.setAttribute("aria-label", "Target language");

    this.supportedLanguages.forEach((lang) => {
      const option = document.createElement("option");
      option.value = lang.code;
      option.textContent = lang.name;
      if (lang.code === "en") {
        option.selected = true;
      }
      targetDropdown.appendChild(option);
    });

    dropdownsContainer.appendChild(sourceDropdown);
    dropdownsContainer.appendChild(arrow);
    dropdownsContainer.appendChild(targetDropdown);
    translateContent.appendChild(dropdownsContainer);

    // Translate button
    const translateButton = document.createElement("button");
    translateButton.className = "ai-pocket-translate-btn";
    translateButton.textContent = "Translate";
    translateButton.setAttribute("type", "button");
    translateButton.setAttribute("aria-label", "Translate text");
    translateButton.addEventListener("click", () => {
      this.selectedTargetLanguage = targetDropdown.value;
      if (sourceDropdown.value !== "detect") {
        this.detectedSourceLanguage = sourceDropdown.value;
      }
      if (this.currentTextField) {
        this.handleTranslation(this.currentTextField);
      }
    });
    translateContent.appendChild(translateButton);

    // Quick language buttons
    const languageGrid = document.createElement("div");
    languageGrid.className = "ai-pocket-language-grid";

    // Render saved quick languages
    this.savedQuickLanguages.forEach((lang) => {
      const langBtn = document.createElement("button");
      langBtn.className = "ai-pocket-language-btn";
      langBtn.textContent = lang.name;
      langBtn.setAttribute("type", "button");
      langBtn.setAttribute("data-lang-code", lang.code);
      langBtn.addEventListener("click", () => {
        targetDropdown.value = lang.code;
        this.selectedTargetLanguage = lang.code;
        if (this.currentTextField) {
          this.handleTranslation(this.currentTextField);
        }
      });
      languageGrid.appendChild(langBtn);
    });

    translateContent.appendChild(languageGrid);

    // Add Language Button
    const addLanguageBtn = document.createElement("button");
    addLanguageBtn.className = "ai-pocket-add-language-btn";
    addLanguageBtn.setAttribute("type", "button");
    addLanguageBtn.setAttribute("aria-label", "Save more languages");

    const addLangIcon = document.createElement("span");
    addLangIcon.className = "ai-pocket-add-language-icon";
    addLangIcon.textContent = "+";

    const addLangLabel = document.createElement("span");
    addLangLabel.textContent = "Save more languages";

    addLanguageBtn.appendChild(addLangIcon);
    addLanguageBtn.appendChild(addLangLabel);
    addLanguageBtn.addEventListener("click", () => {
      this.showLanguageSelectionModal(languageGrid, targetDropdown);
    });

    translateContent.appendChild(addLanguageBtn);
    contentWrapper.appendChild(translateContent);

    // Append content wrapper to menu
    menu.appendChild(contentWrapper);

    // Dropdown change handlers
    targetDropdown.addEventListener("change", () => {
      this.selectedTargetLanguage = targetDropdown.value;
    });

    sourceDropdown.addEventListener("change", () => {
      if (sourceDropdown.value !== "detect") {
        this.detectedSourceLanguage = sourceDropdown.value;
      }
    });

    // Keyboard navigation
    this.setupMenuKeyboardNavigation(menu);

    return menu;
  }

  /**
   * Handle drag start
   */
  private handleDragStart(e: MouseEvent, menu: HTMLElement): void {
    e.preventDefault();
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;

    const rect = menu.getBoundingClientRect();
    this.menuStartX = rect.left;
    this.menuStartY = rect.top;

    menu.classList.add("dragging");

    // Add document-level event listeners
    document.addEventListener("mousemove", this.handleDragMove);
    document.addEventListener("mouseup", this.handleDragEnd);
  }

  /**
   * Handle drag move
   */
  private handleDragMove = (e: MouseEvent): void => {
    if (!this.isDragging || !this.currentMenu) return;

    const deltaX = e.clientX - this.dragStartX;
    const deltaY = e.clientY - this.dragStartY;

    const newX = this.menuStartX + deltaX;
    const newY = this.menuStartY + deltaY;

    // Keep menu within viewport bounds
    const rect = this.currentMenu.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;

    const clampedX = Math.max(0, Math.min(newX, maxX));
    const clampedY = Math.max(0, Math.min(newY, maxY));

    this.currentMenu.style.left = `${clampedX}px`;
    this.currentMenu.style.top = `${clampedY}px`;
  };

  /**
   * Handle drag end
   */
  private handleDragEnd = (): void => {
    if (!this.currentMenu) return;

    this.isDragging = false;
    this.currentMenu.classList.remove("dragging");

    // Remove document-level event listeners
    document.removeEventListener("mousemove", this.handleDragMove);
    document.removeEventListener("mouseup", this.handleDragEnd);
  };

  /**
   * Show enhancement menu
   */
  private showEnhancementMenu(
    textField: HTMLElement,
    button: HTMLElement,
  ): void {
    // Close existing menu if any
    this.closeEnhancementMenu();

    // Store current text field
    this.currentTextField = textField;

    // Create menu
    this.currentMenu = this.createEnhancementMenu();
    document.body.appendChild(this.currentMenu);

    // Create backdrop
    const backdrop = document.createElement("div");
    backdrop.className = "ai-pocket-menu-backdrop";
    backdrop.addEventListener("click", () => this.closeEnhancementMenu());
    document.body.appendChild(backdrop);
    (this.currentMenu as any).__backdrop = backdrop;

    // Position menu
    this.positionMenu(this.currentMenu, button, textField);

    // Show menu with animation
    requestAnimationFrame(() => {
      this.currentMenu?.classList.add("visible");
    });

    // Focus first option
    const firstOption = this.currentMenu.querySelector(
      ".ai-pocket-enhancement-option",
    ) as HTMLElement;
    if (firstOption) {
      firstOption.focus();
    }

    // Add ESC key listener
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.closeEnhancementMenu();
        button.focus();
      }
    };
    document.addEventListener("keydown", escHandler);
    (this.currentMenu as any).__escHandler = escHandler;

    console.debug("[TextEnhancer] Enhancement menu shown");
  }

  /**
   * Show language selection modal
   */
  private showLanguageSelectionModal(
    languageGrid: HTMLElement,
    targetDropdown: HTMLSelectElement,
  ): void {
    // Create modal backdrop
    const backdrop = document.createElement("div");
    backdrop.className = "ai-pocket-modal-backdrop";

    // Create modal
    const modal = document.createElement("div");
    modal.className = "ai-pocket-language-modal";

    // Modal header
    const header = document.createElement("div");
    header.className = "ai-pocket-language-modal-header";

    const title = document.createElement("h3");
    title.className = "ai-pocket-language-modal-title";
    title.textContent = "Select Quick Languages";

    const closeBtn = document.createElement("button");
    closeBtn.className = "ai-pocket-language-modal-close";
    closeBtn.textContent = "×";
    closeBtn.setAttribute("type", "button");
    closeBtn.setAttribute("aria-label", "Close");

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Modal body
    const body = document.createElement("div");
    body.className = "ai-pocket-language-modal-body";

    const grid = document.createElement("div");
    grid.className = "ai-pocket-language-modal-grid";

    // Track selected languages
    const selectedCodes = new Set(this.savedQuickLanguages.map((l) => l.code));

    // Create language items
    this.supportedLanguages.forEach((lang) => {
      const item = document.createElement("div");
      item.className = "ai-pocket-language-modal-item";
      if (selectedCodes.has(lang.code)) {
        item.classList.add("selected");
      }

      const checkbox = document.createElement("div");
      checkbox.className = "ai-pocket-language-modal-checkbox";

      const label = document.createElement("span");
      label.className = "ai-pocket-language-modal-label";
      label.textContent = lang.name;

      item.appendChild(checkbox);
      item.appendChild(label);

      item.addEventListener("click", () => {
        if (selectedCodes.has(lang.code)) {
          selectedCodes.delete(lang.code);
          item.classList.remove("selected");
        } else {
          selectedCodes.add(lang.code);
          item.classList.add("selected");
        }
      });

      grid.appendChild(item);
    });

    body.appendChild(grid);

    // Modal footer
    const footer = document.createElement("div");
    footer.className = "ai-pocket-language-modal-footer";

    const cancelBtn = document.createElement("button");
    cancelBtn.className =
      "ai-pocket-language-modal-btn ai-pocket-language-modal-btn-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.setAttribute("type", "button");

    const saveBtn = document.createElement("button");
    saveBtn.className =
      "ai-pocket-language-modal-btn ai-pocket-language-modal-btn-save";
    saveBtn.textContent = "Save";
    saveBtn.setAttribute("type", "button");

    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);

    // Close handlers
    const closeModal = () => {
      backdrop.remove();
      modal.remove();
    };

    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    backdrop.addEventListener("click", closeModal);

    // Save handler
    saveBtn.addEventListener("click", async () => {
      const selectedLanguages = this.supportedLanguages.filter((lang) =>
        selectedCodes.has(lang.code),
      );

      if (selectedLanguages.length === 0) {
        alert("Please select at least one language");
        return;
      }

      try {
        await this.saveQuickLanguages(selectedLanguages);

        // Update the language grid
        languageGrid.innerHTML = "";
        selectedLanguages.forEach((lang) => {
          const langBtn = document.createElement("button");
          langBtn.className = "ai-pocket-language-btn";
          langBtn.textContent = lang.name;
          langBtn.setAttribute("type", "button");
          langBtn.setAttribute("data-lang-code", lang.code);
          langBtn.addEventListener("click", () => {
            targetDropdown.value = lang.code;
            this.selectedTargetLanguage = lang.code;
            if (this.currentTextField) {
              this.handleTranslation(this.currentTextField);
            }
          });
          languageGrid.appendChild(langBtn);
        });

        closeModal();
      } catch (error) {
        console.error("[TextEnhancer] Failed to save languages", error);
        alert("Failed to save languages. Please try again.");
      }
    });

    // Add to DOM
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    // Focus first item
    const firstItem = grid.querySelector(
      ".ai-pocket-language-modal-item",
    ) as HTMLElement;
    if (firstItem) {
      firstItem.focus();
    }
  }

  /**
   * Position menu near button
   */
  private positionMenu(
    menu: HTMLElement,
    button: HTMLElement,
    textField: HTMLElement,
  ): void {
    // Check if elements are valid
    if (!button || !document.body.contains(button)) {
      console.warn("[TextEnhancer] Cannot position menu - button not in DOM");
      return;
    }

    const buttonRect = button.getBoundingClientRect();
    const menuWidth = 300; // Approximate width
    const menuHeight = 400; // Approximate height

    let top = buttonRect.bottom + window.scrollY + 8;
    let left = buttonRect.left + window.scrollX;

    // Check if menu would go off-screen to the right
    if (left + menuWidth > window.innerWidth) {
      left = buttonRect.right + window.scrollX - menuWidth;
    }

    // Check if menu would go off-screen to the bottom
    if (buttonRect.bottom + menuHeight > window.innerHeight) {
      // Position above button instead
      top = buttonRect.top + window.scrollY - menuHeight - 8;
    }

    // Ensure menu doesn't go off-screen to the left
    if (left < 0) {
      left = 8;
    }

    // Ensure menu doesn't go off-screen to the top
    if (top < 0) {
      top = 8;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }

  /**
   * Setup keyboard navigation for menu
   */
  private setupMenuKeyboardNavigation(menu: HTMLElement): void {
    const options = Array.from(
      menu.querySelectorAll(".ai-pocket-enhancement-option"),
    ) as HTMLElement[];

    menu.addEventListener("keydown", (e: KeyboardEvent) => {
      const currentIndex = options.findIndex(
        (opt) => opt === document.activeElement,
      );

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          const nextIndex = (currentIndex + 1) % options.length;
          options[nextIndex]?.focus();
          break;

        case "ArrowUp":
          e.preventDefault();
          const prevIndex =
            currentIndex <= 0 ? options.length - 1 : currentIndex - 1;
          options[prevIndex]?.focus();
          break;

        case "Home":
          e.preventDefault();
          options[0]?.focus();
          break;

        case "End":
          e.preventDefault();
          options[options.length - 1]?.focus();
          break;

        case "Enter":
        case " ":
          e.preventDefault();
          if (currentIndex >= 0 && options[currentIndex]) {
            const style = options[currentIndex].getAttribute(
              "data-style",
            ) as EnhancementStyle;
            if (style) {
              this.handleStyleSelection(style, options[currentIndex]);
            }
          }
          break;
      }
    });
  }

  /**
   * Handle style selection
   */
  private async handleStyleSelection(
    style: EnhancementStyle,
    optionElement: HTMLElement,
  ): Promise<void> {
    console.info("[TextEnhancer] Style selected:", style);

    if (!this.currentTextField || !this.currentMenu) {
      console.error("[TextEnhancer] No text field or menu available");
      return;
    }

    // Update visual selection in menu FIRST
    const allOptions = this.currentMenu.querySelectorAll(
      ".ai-pocket-enhancement-option",
    );
    allOptions.forEach((opt) => {
      opt.classList.remove("selected");
      opt.setAttribute("aria-checked", "false");
    });

    optionElement.classList.add("selected");
    optionElement.setAttribute("aria-checked", "true");

    // Store reference to textField BEFORE closing menu
    const textFieldRef = this.currentTextField;
    const currentText = this.getTextFieldValue(textFieldRef);

    console.debug("[TextEnhancer] Enhancing text with style:", {
      style,
      textLength: currentText.length,
      textPreview: currentText.substring(0, 50),
    });

    // Close the menu (this clears this.currentTextField)
    this.closeEnhancementMenu();

    // Verify textField is still valid
    if (!textFieldRef || !document.body.contains(textFieldRef)) {
      console.error("[TextEnhancer] Text field no longer in DOM");
      return;
    }

    // Process the enhancement with stored reference
    await this.processEnhancement(textFieldRef, currentText, style);
  }

  /**
   * Process text enhancement
   * Requirement 9.3: Process and improve text according to selected style
   * Requirement 9.8: Use on-device AI to maintain privacy
   */
  private async processEnhancement(
    textField: HTMLElement,
    originalText: string,
    style: EnhancementStyle,
  ): Promise<void> {
    console.info("[TextEnhancer] Processing enhancement", {
      style,
      textLength: originalText.length,
    });

    // Verify textField is still valid
    if (!textField || !document.body.contains(textField)) {
      console.error(
        "[TextEnhancer] Text field no longer in DOM, cannot process",
      );
      return;
    }

    // Show loading indicator
    const loadingOverlay = this.showLoadingIndicator(textField);

    try {
      // Send enhancement request to service worker
      const enhancedText = await this.requestEnhancement(
        originalText,
        style,
        false,
      );

      // Remove loading indicator
      this.hideLoadingIndicator(textField, loadingOverlay);

      // Verify textField is still valid before showing preview
      if (!textField || !document.body.contains(textField)) {
        console.error("[TextEnhancer] Text field removed during processing");
        return;
      }

      // Show preview with accept/reject options
      // Requirement 9.4: Show preview with option to accept or reject
      this.showEnhancementPreview(textField, originalText, enhancedText, style);
    } catch (error) {
      console.error("[TextEnhancer] Enhancement failed", error);

      // Remove loading indicator
      this.hideLoadingIndicator(textField, loadingOverlay);

      // Show error message
      this.showErrorMessage(
        textField,
        error instanceof Error ? error.message : "Enhancement failed",
      );
    }
  }

  /**
   * Request text enhancement from service worker
   */
  private async requestEnhancement(
    text: string,
    style: EnhancementStyle,
    directMode: boolean = false,
  ): Promise<string> {
    // Import sendMessage dynamically to avoid circular dependencies
    const { sendMessage } = await import("../shared/message-client.js");

    // Create enhancement prompt based on style
    const prompt = this.createEnhancementPrompt(text, style, directMode);

    // Send request to service worker
    const response = await sendMessage<{ enhancedText: string }>(
      "AI_PROCESS_REQUEST",
      {
        prompt,
        task: "enhance",
        preferLocal: true, // Use on-device AI for privacy (Requirement 9.8)
        style,
        originalText: text,
        directMode,
      },
      { timeout: 100000 },
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || "Enhancement request failed");
    }

    // Clean up the response to ensure we only get the enhanced text
    const cleanedText = this.cleanEnhancedText(response.data.enhancedText);
    return cleanedText;
  }

  /**
   * Clean the enhanced text response to remove any unwanted formatting or explanations
   */
  private cleanEnhancedText(rawResponse: string): string {
    let cleaned = rawResponse.trim();

    // Remove common AI response patterns
    const unwantedPatterns = [
      /^(Here are|Here's|Here is).*?:/i,
      /^(Option \d+|Choice \d+|\*\*Option \d+).*?:/gm,
      /^\*\*.*?\*\*$/gm, // Bold headers
      /^>\s*/gm, // Quote markers
      /^\d+\.\s*/gm, // Numbered lists at start of lines
      /^-\s*/gm, // Bullet points at start of lines
      /\*\*(.*?)\*\*/g, // Bold text - keep content, remove formatting
      /^(Enhanced text|Improved version|Rewritten text):\s*/i,
      /^(The enhanced text is|The improved version is):\s*/i,
    ];

    // Apply cleaning patterns
    unwantedPatterns.forEach((pattern) => {
      if (pattern.source.includes("\\*\\*(.*?)\\*\\*")) {
        // Special handling for bold text - keep the content
        cleaned = cleaned.replace(pattern, "$1");
      } else {
        cleaned = cleaned.replace(pattern, "");
      }
    });

    // Remove explanations at the end (without using 's' flag)
    cleaned = cleaned.replace(
      /\n\n[\s\S]*?(explanation|analysis|note|context)[\s\S]*$/,
      "",
    );

    // If the response contains multiple options, try to extract the first clean option
    const lines = cleaned.split("\n");
    let firstValidLine = "";
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (
        trimmedLine &&
        !trimmedLine.match(/^[>\*\d-]/) &&
        trimmedLine.length > 10
      ) {
        firstValidLine = trimmedLine;
        break;
      }
    }
    if (firstValidLine) {
      cleaned = firstValidLine;
    }

    // Remove any remaining formatting artifacts
    cleaned = cleaned
      .replace(/^\s*["'`]|["'`]\s*$/g, "") // Remove quotes at start/end
      .replace(/\n{3,}/g, "\n\n") // Reduce multiple newlines
      .replace(/^\s+|\s+$/g, "") // Trim whitespace
      .replace(/\s{2,}/g, " "); // Reduce multiple spaces

    // If the cleaned text is too short or seems invalid, return the original trimmed response
    if (cleaned.length < 3 || cleaned === rawResponse.trim()) {
      return rawResponse.trim();
    }

    return cleaned;
  }

  /**
   * Create enhancement prompt based on style with context awareness
   * Requirements 9.5, 9.6: Include page context and pocket content
   */
  private createEnhancementPrompt(
    text: string,
    style: EnhancementStyle,
    directMode: boolean = false,
  ): string {
    const styleInstructions: Record<EnhancementStyle, string> = {
      [EnhancementStyle.PROFESSIONAL]:
        "Rewrite the following text in a professional, formal, and business-appropriate tone. Maintain the core message but make it suitable for professional communication.",
      [EnhancementStyle.CONCISE]:
        "Rewrite the following text to be more concise and direct. Remove unnecessary words while preserving the essential meaning.",
      [EnhancementStyle.EMPATHETIC]:
        "Rewrite the following text with a warm, empathetic, and understanding tone. Show compassion and emotional intelligence.",
      [EnhancementStyle.PERSUASIVE]:
        "Rewrite the following text to be more persuasive and compelling. Use rhetorical techniques to make the message more convincing.",
      [EnhancementStyle.FUNNY]:
        "Rewrite the following text with humor and lightheartedness. Add wit and playfulness while maintaining the core message.",
      [EnhancementStyle.OPTIMIZE]:
        "Improve the following text by fixing grammar errors, enhancing clarity, and improving overall flow. Make it more polished and well-written.",
      [EnhancementStyle.EXPAND]:
        "Expand the following text to be longer and more detailed. Add relevant information, examples, and elaboration while maintaining the core message. Make it more comprehensive and thorough.",
      [EnhancementStyle.SUMMARISE]:
        "Create a concise summary of the following text. Capture the key points and main ideas while removing unnecessary details. Make it brief and to the point.",
      // Prompt Enhancement Instructions
      [EnhancementStyle.CLARIFY_PROMPT]:
        "Transform the following text into a clear, specific, and well-defined prompt for an AI assistant. Remove ambiguity, add necessary context, and make the intent crystal clear. Focus on precision and clarity.",
      [EnhancementStyle.EXPAND_PROMPT]:
        "Transform the following text into a detailed, comprehensive prompt for an AI assistant. Add relevant context, specify desired format, include examples if helpful, and provide clear success criteria. Make it thorough and complete.",
      [EnhancementStyle.TECHNICAL_PROMPT]:
        "Transform the following text into a technical prompt optimized for coding, development, or technical tasks. Include specific requirements, technical constraints, desired technologies, code quality expectations, and any relevant technical context.",
      [EnhancementStyle.CREATIVE_PROMPT]:
        "Transform the following text into a creative prompt that encourages imaginative and innovative responses. Add elements that inspire creativity, specify the creative direction, and provide context that enables unique and original outputs.",
      [EnhancementStyle.STRUCTURED_PROMPT]:
        "Transform the following text into a well-structured, step-by-step prompt with clear sections. Break down the request into logical components, add numbered steps if applicable, specify input/output format, and organize information hierarchically for maximum clarity.",
    };

    let prompt = styleInstructions[style];

    // Add critical instruction for clean output
    prompt += `\n\nIMPORTANT: Provide ONLY the enhanced text as your response. Do not include explanations, options, analysis, or any other text. Just return the improved version of the original text.`;

    // Add page context if available (Requirement 9.5)
    if (this.pageContext) {
      prompt += `\n\nContext: You are helping the user write text on a ${this.pageContext.type} page`;

      if (this.pageContext.title) {
        prompt += ` titled "${this.pageContext.title}"`;
      }

      // Add contextual suggestions
      const suggestions = PageContextDetector.getContextualSuggestions(
        this.pageContext,
      );
      if (suggestions.length > 0) {
        prompt += `\n\nConsiderations for this context:\n${suggestions.map((s) => `- ${s}`).join("\n")}`;
      }
    }

    // Add pocket context if available (Requirement 9.6)
    if (this.pocketContext && this.pocketContext.relevantContent.length > 0) {
      prompt += `\n\nRelevant information from user's saved content:`;

      this.pocketContext.relevantContent.slice(0, 3).forEach((item, index) => {
        prompt += `\n${index + 1}. ${item.title}`;
        if (item.snippet) {
          prompt += `\n   ${item.snippet}`;
        }
      });

      prompt += `\n\nYou may reference or incorporate relevant information from the user's saved content if appropriate.`;
    }

    prompt += `\n\nOriginal text:\n"${text}"\n\nEnhanced text (provide ONLY the enhanced text, no explanations):`;

    return prompt;
  }

  /**
   * Show loading indicator on the enhancement button
   */
  private showLoadingIndicator(textField: HTMLElement): HTMLElement | null {
    // Check if textField is valid
    if (!textField || !document.body.contains(textField)) {
      console.warn(
        "[TextEnhancer] Cannot show loading indicator - textField not in DOM",
      );
      return null;
    }

    // Get the enhancement button for this text field
    const button = this.injectedButtons.get(textField);
    if (!button) {
      console.warn("[TextEnhancer] No button found for text field");
      return null;
    }

    // Add loading state to button
    button.classList.add("loading");
    button.setAttribute("aria-label", "Enhancing text...");

    // Change icon to indicate loading (the CSS animation will handle the spinning)
    const icon = button.querySelector(".ai-pocket-enhance-btn-icon");
    if (icon) {
      icon.textContent = "⟳"; // Rotating arrow icon
    }

    return button;
  }

  /**
   * Hide loading indicator and restore button state
   */
  private hideLoadingIndicator(
    textField: HTMLElement,
    loadingButton: HTMLElement | null,
  ): void {
    if (!loadingButton) return;

    // Remove loading state from button
    loadingButton.classList.remove("loading");
    loadingButton.setAttribute(
      "aria-label",
      "Enhance text with AI (drag to move)",
    );

    // Restore original icon
    const icon = loadingButton.querySelector(".ai-pocket-enhance-btn-icon");
    if (icon) {
      icon.textContent = "✨"; // Original sparkle icon
    }
  }

  /**
   * Show enhancement preview with accept/reject options
   * Requirement 9.4: Show preview with option to accept or reject
   */
  private showEnhancementPreview(
    textField: HTMLElement,
    originalText: string,
    enhancedText: string,
    style: EnhancementStyle,
  ): void {
    console.debug("[TextEnhancer] Showing preview", {
      originalLength: originalText.length,
      enhancedLength: enhancedText.length,
    });

    // Create preview dialog
    const preview = document.createElement("div");
    preview.className = "ai-pocket-enhancement-preview";
    preview.setAttribute("role", "dialog");
    preview.setAttribute("aria-labelledby", "preview-title");
    preview.setAttribute("aria-modal", "true");

    // Header
    const header = document.createElement("div");
    header.className = "ai-pocket-preview-header";

    const title = document.createElement("h3");
    title.id = "preview-title";
    title.className = "ai-pocket-preview-title";
    title.textContent = `Enhanced Text (${this.getStyleLabel(style)})`;

    const closeBtn = document.createElement("button");
    closeBtn.className = "ai-pocket-preview-close";
    closeBtn.setAttribute("aria-label", "Close preview");
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", () => this.closePreview(preview));

    header.appendChild(title);
    header.appendChild(closeBtn);
    preview.appendChild(header);

    // Content comparison
    const content = document.createElement("div");
    content.className = "ai-pocket-preview-content";

    // Original text section
    const originalSection = document.createElement("div");
    originalSection.className = "ai-pocket-preview-section";

    const originalLabel = document.createElement("div");
    originalLabel.className = "ai-pocket-preview-label";
    originalLabel.textContent = "Original";

    const originalTextEl = document.createElement("div");
    originalTextEl.className =
      "ai-pocket-preview-text ai-pocket-preview-original";
    originalTextEl.textContent = originalText;

    originalSection.appendChild(originalLabel);
    originalSection.appendChild(originalTextEl);

    // Enhanced text section
    const enhancedSection = document.createElement("div");
    enhancedSection.className = "ai-pocket-preview-section";

    const enhancedLabel = document.createElement("div");
    enhancedLabel.className = "ai-pocket-preview-label";
    enhancedLabel.textContent = "Enhanced";

    const enhancedTextEl = document.createElement("div");
    enhancedTextEl.className =
      "ai-pocket-preview-text ai-pocket-preview-enhanced";
    enhancedTextEl.textContent = enhancedText;

    enhancedSection.appendChild(enhancedLabel);
    enhancedSection.appendChild(enhancedTextEl);

    content.appendChild(originalSection);
    content.appendChild(enhancedSection);
    preview.appendChild(content);

    // Actions
    const actions = document.createElement("div");
    actions.className = "ai-pocket-preview-actions";

    const rejectBtn = document.createElement("button");
    rejectBtn.className =
      "ai-pocket-preview-btn ai-pocket-preview-btn-secondary";
    rejectBtn.textContent = "Reject";
    rejectBtn.setAttribute("aria-label", "Reject enhanced text");
    rejectBtn.addEventListener("click", () => {
      console.info("[TextEnhancer] Enhancement rejected");
      this.closePreview(preview);
    });

    const acceptBtn = document.createElement("button");
    acceptBtn.className = "ai-pocket-preview-btn ai-pocket-preview-btn-primary";
    acceptBtn.textContent = "Accept";
    acceptBtn.setAttribute("aria-label", "Accept enhanced text");
    acceptBtn.addEventListener("click", () => {
      console.info("[TextEnhancer] Enhancement accepted");
      this.setTextFieldValue(textField, enhancedText);
      this.closePreview(preview);

      // Provide visual feedback
      const button = this.injectedButtons.get(textField);
      if (button) {
        button.style.transform = "scale(1.2)";
        button.style.background = "#4caf50";
        setTimeout(() => {
          button.style.transform = "";
          button.style.background = "";
        }, 500);
      }
    });

    actions.appendChild(rejectBtn);
    actions.appendChild(acceptBtn);
    preview.appendChild(actions);

    // Create backdrop
    const backdrop = document.createElement("div");
    backdrop.className = "ai-pocket-preview-backdrop";
    backdrop.addEventListener("click", () => this.closePreview(preview));
    document.body.appendChild(backdrop);
    (preview as any).__backdrop = backdrop;

    // Position preview
    this.positionPreview(preview, textField);

    // Add to DOM
    document.body.appendChild(preview);

    // Show with animation
    requestAnimationFrame(() => {
      preview.classList.add("visible");
      backdrop.classList.add("visible");
    });

    // Focus accept button
    acceptBtn.focus();

    // Add ESC key listener
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.closePreview(preview);
      }
    };
    document.addEventListener("keydown", escHandler);
    (preview as any).__escHandler = escHandler;
  }

  /**
   * Get style label for display
   */
  private getStyleLabel(style: EnhancementStyle): string {
    const option = this.enhancementOptions.find((opt) => opt.id === style);
    return option ? option.label : style;
  }

  /**
   * Position preview dialog
   */
  private positionPreview(preview: HTMLElement, textField: HTMLElement): void {
    const previewWidth = 600;
    const previewHeight = 400;

    // Center on screen
    const top = Math.max(50, (window.innerHeight - previewHeight) / 2);
    const left = Math.max(20, (window.innerWidth - previewWidth) / 2);

    preview.style.top = `${top}px`;
    preview.style.left = `${left}px`;
    preview.style.maxWidth = `${previewWidth}px`;
  }

  /**
   * Close preview dialog
   */
  private closePreview(preview: HTMLElement): void {
    // Remove ESC handler
    const escHandler = (preview as any).__escHandler;
    if (escHandler) {
      document.removeEventListener("keydown", escHandler);
    }

    // Remove backdrop
    const backdrop = (preview as any).__backdrop;
    if (backdrop && backdrop.parentNode) {
      backdrop.parentNode.removeChild(backdrop);
    }

    // Remove preview
    if (preview.parentNode) {
      preview.parentNode.removeChild(preview);
    }
  }

  /**
   * Show error message
   */
  private showErrorMessage(textField: HTMLElement, message: string): void {
    // Check if textField is valid
    if (!textField || !document.body.contains(textField)) {
      console.error("[TextEnhancer] Enhancement failed:", message);
      return;
    }

    const errorEl = document.createElement("div");
    errorEl.className = "ai-pocket-enhancement-error";
    errorEl.setAttribute("role", "alert");
    errorEl.textContent = `Enhancement failed: ${message}`;

    const rect = textField.getBoundingClientRect();
    errorEl.style.position = "absolute";
    errorEl.style.top = `${rect.bottom + window.scrollY + 8}px`;
    errorEl.style.left = `${rect.left + window.scrollX}px`;

    document.body.appendChild(errorEl);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (errorEl.parentNode) {
        errorEl.parentNode.removeChild(errorEl);
      }
    }, 5000);
  }

  /**
   * Close enhancement menu
   */
  private closeEnhancementMenu(): void {
    if (this.currentMenu) {
      // Remove ESC handler
      const escHandler = (this.currentMenu as any).__escHandler;
      if (escHandler) {
        document.removeEventListener("keydown", escHandler);
      }

      // Remove backdrop
      const backdrop = (this.currentMenu as any).__backdrop;
      if (backdrop && backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }

      // Remove menu
      if (this.currentMenu.parentNode) {
        this.currentMenu.parentNode.removeChild(this.currentMenu);
      }

      this.currentMenu = null;
    }

    this.currentTextField = null;
  }

  /**
   * Set up mutation observer for dynamically added fields
   */
  private setupMutationObserver(): void {
    this.observer = new MutationObserver((mutations) => {
      let shouldProcess = false;

      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          shouldProcess = true;
          break;
        }
      }

      if (shouldProcess) {
        // Debounce processing
        this.debouncedProcessFields();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Debounced field processing
   */
  private debouncedProcessFields = (() => {
    let timeout: number | null = null;
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = window.setTimeout(() => {
        this.processExistingFields();
      }, 300);
    };
  })();

  /**
   * Set up focus listener to show/hide buttons
   */
  private setupFocusListener(): void {
    document.addEventListener("focusin", (event) => {
      const target = event.target as HTMLElement;
      const button = this.injectedButtons.get(target);

      if (button) {
        button.classList.add("visible");
        console.debug("[TextEnhancer] Button shown for focused field");
      }
    });

    document.addEventListener("focusout", (event) => {
      const target = event.target as HTMLElement;
      const button = this.injectedButtons.get(target);

      if (button) {
        // Delay hiding to allow button click
        setTimeout(() => {
          if (document.activeElement !== button) {
            button.classList.remove("visible");
          }
        }, 200);
      }
    });
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
    }

    // Close menu if open
    this.closeEnhancementMenu();

    // Clean up all buttons
    this.injectedButtons = new WeakMap();

    console.info("[TextEnhancer] Destroyed");
  }
}

// Initialize text enhancer
let textEnhancer: UniversalTextEnhancer | null = null;

export function initializeTextEnhancer(): void {
  if (!textEnhancer) {
    textEnhancer = new UniversalTextEnhancer();
  }
}

// Auto-initialize when script loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeTextEnhancer);
} else {
  initializeTextEnhancer();
}
