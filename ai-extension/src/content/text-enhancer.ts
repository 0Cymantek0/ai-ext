/**
 * Universal Text Enhancement System
 * Injects AI enhancement buttons near text input fields
 * Requirements: 9.1, 9.9, 9.5, 9.6
 */

import { PageContextDetector, type PageContext } from './page-context-detector';
import { PocketContextProvider, type PocketContextResult } from './pocket-context-provider';

enum EnhancementStyle {
  FUNNY = 'funny',
  PROFESSIONAL = 'professional',
  CONCISE = 'concise',
  EMPATHETIC = 'empathetic',
  PERSUASIVE = 'persuasive',
  OPTIMIZE = 'optimize'
}

interface EnhancementOption {
  id: EnhancementStyle;
  label: string;
  icon: string;
  description: string;
}

class UniversalTextEnhancer {
  private injectedButtons: WeakMap<HTMLElement, HTMLElement> = new WeakMap();
  private observer: MutationObserver | null = null;
  private currentMenu: HTMLElement | null = null;
  private currentTextField: HTMLElement | null = null;
  private pageContext: PageContext | null = null;
  private pocketContext: PocketContextResult | null = null;
  private sensitivePatterns = [
    /bank|banking|financial|credit|payment/i,
    /health|medical|patient|hospital/i,
    /password|login|signin|auth/i,
    /ssn|social.security/i,
  ];

  private enhancementOptions: EnhancementOption[] = [
    {
      id: EnhancementStyle.PROFESSIONAL,
      label: 'Professional',
      icon: '💼',
      description: 'Make it more formal and business-appropriate'
    },
    {
      id: EnhancementStyle.CONCISE,
      label: 'Concise',
      icon: '✂️',
      description: 'Shorten and simplify the text'
    },
    {
      id: EnhancementStyle.EMPATHETIC,
      label: 'Empathetic',
      icon: '❤️',
      description: 'Add warmth and understanding'
    },
    {
      id: EnhancementStyle.PERSUASIVE,
      label: 'Persuasive',
      icon: '🎯',
      description: 'Make it more convincing and compelling'
    },
    {
      id: EnhancementStyle.FUNNY,
      label: 'Funny',
      icon: '😄',
      description: 'Add humor and lightheartedness'
    },
    {
      id: EnhancementStyle.OPTIMIZE,
      label: 'Optimize',
      icon: '✨',
      description: 'Improve grammar, clarity, and flow'
    }
  ];

  constructor() {
    this.initialize();
  }

  /**
   * Initialize the text enhancer
   */
  private initialize(): void {
    console.info("[TextEnhancer] Initializing");

    // Check if we're on a sensitive site
    if (this.isSensitiveSite()) {
      console.info("[TextEnhancer] Sensitive site detected, disabling by default");
      // TODO: Show UI to allow user to enable per-site
      return;
    }

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
   * Detect page context for context-aware enhancements
   * Requirement 9.5: Detect page context
   */
  private detectPageContext(): void {
    try {
      this.pageContext = PageContextDetector.detectContext();
      console.debug("[TextEnhancer] Page context detected", {
        type: this.pageContext.type,
        domain: this.pageContext.domain
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
      this.pocketContext = await PocketContextProvider.getRelevantContent(this.pageContext);
      
      if (this.pocketContext.relevantContent.length > 0) {
        console.debug("[TextEnhancer] Loaded pocket context", {
          itemCount: this.pocketContext.relevantContent.length,
          totalFound: this.pocketContext.totalFound
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
        min-width: 280px;
        max-width: 320px;
        padding: 8px;
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

      .ai-pocket-enhancement-menu-header {
        padding: 12px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        margin-bottom: 8px;
      }

      .ai-pocket-enhancement-menu-title {
        font-size: 14px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
        margin: 0;
        font-family: "Space Grotesk", sans-serif;
      }

      .ai-pocket-enhancement-menu-subtitle {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
        margin: 4px 0 0 0;
        font-family: "Space Grotesk", sans-serif;
      }

      .ai-pocket-enhancement-option {
        display: flex;
        align-items: flex-start;
        padding: 12px 16px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px solid transparent;
        background: transparent;
        width: 100%;
        text-align: left;
        margin: 2px 0;
        font-family: "Space Grotesk", sans-serif;
      }

      .ai-pocket-enhancement-option:hover:not(.selected) {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.1);
      }

      .ai-pocket-enhancement-option:focus:not(.selected) {
        outline: 2px solid hsl(217.2 91.2% 59.8%);
        outline-offset: -2px;
        background: rgba(255, 255, 255, 0.05);
      }

      .ai-pocket-enhancement-option:active:not(.selected) {
        background: rgba(255, 255, 255, 0.1);
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
        font-size: 20px;
        margin-right: 12px;
        flex-shrink: 0;
        line-height: 1;
      }

      .ai-pocket-enhancement-option-content {
        flex: 1;
        min-width: 0;
      }

      .ai-pocket-enhancement-option-label {
        font-size: 14px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.9);
        margin: 0 0 4px 0;
        font-family: "Space Grotesk", sans-serif;
      }

      .ai-pocket-enhancement-option-description {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
        margin: 0;
        line-height: 1.4;
        font-family: "Space Grotesk", sans-serif;
      }

      .ai-pocket-enhancement-menu-footer {
        padding: 8px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        margin-top: 8px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        text-align: center;
        font-family: "Space Grotesk", sans-serif;
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
      'input:not([type])', // Input without type defaults to text
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
    if (
      element instanceof HTMLInputElement &&
      element.type === "password"
    ) {
      return true;
    }

    // Exclude fields with specific attributes
    if (
      element.hasAttribute("data-ai-pocket-exclude") ||
      element.hasAttribute("autocomplete") &&
      element.getAttribute("autocomplete")?.includes("password")
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
  private handleButtonClick(textField: HTMLElement, button: HTMLElement, event?: MouseEvent): void {
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
  private async handleDirectEnhancement(textField: HTMLElement, currentText: string): Promise<void> {
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
      const professionalContexts = ['email', 'business', 'linkedin', 'work', 'corporate'];
      if (professionalContexts.some(ctx => 
        this.pageContext!.domain.includes(ctx) || 
        this.pageContext!.type.includes(ctx) ||
        (this.pageContext!.title && this.pageContext!.title.toLowerCase().includes(ctx))
      )) {
        return EnhancementStyle.PROFESSIONAL;
      }
    }

    // Check for informal language patterns
    const informalPatterns = [
      /\b(hey|hi|yo|sup|lol|omg|btw|tbh|imo|fyi)\b/i,
      /\b(gonna|wanna|gotta|kinda|sorta)\b/i,
      /[.]{2,}|[!]{2,}|[?]{2,}/,
      /\b(awesome|cool|sweet|dope|sick)\b/i
    ];
    
    if (informalPatterns.some(pattern => pattern.test(text))) {
      // If it's informal, check if it needs to be more professional
      if (text.length > 50) {
        return EnhancementStyle.PROFESSIONAL;
      } else {
        return EnhancementStyle.CONCISE;
      }
    }

    // Check for verbose text that could be shortened
    if (text.length > 200 || text.split(' ').length > 40) {
      return EnhancementStyle.CONCISE;
    }

    // Check for emotional content
    const emotionalPatterns = [
      /\b(sorry|apologize|understand|feel|emotion|heart|care|love|hate|angry|sad|happy|excited)\b/i,
      /\b(please|thank|appreciate|grateful|help|support)\b/i
    ];
    
    if (emotionalPatterns.some(pattern => pattern.test(text))) {
      return EnhancementStyle.EMPATHETIC;
    }

    // Check for persuasive intent
    const persuasivePatterns = [
      /\b(should|must|need|important|urgent|recommend|suggest|propose|convince|believe)\b/i,
      /\b(benefits?|advantages?|opportunity|offer|deal|value|worth)\b/i
    ];
    
    if (persuasivePatterns.some(pattern => pattern.test(text))) {
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

    return issues.some(pattern => pattern.test(text));
  }

  /**
   * Process direct enhancement without showing preview
   */
  private async processDirectEnhancement(
    textField: HTMLElement,
    originalText: string,
    style: EnhancementStyle
  ): Promise<void> {
    console.info("[TextEnhancer] Processing direct enhancement", { style, textLength: originalText.length });

    // Verify textField is still valid
    if (!textField || !document.body.contains(textField)) {
      console.error("[TextEnhancer] Text field no longer in DOM, cannot process");
      return;
    }

    // Show loading indicator
    const loadingOverlay = this.showLoadingIndicator(textField);

    try {
      // Send enhancement request to service worker
      const enhancedText = await this.requestEnhancement(originalText, style, true); // true for direct mode

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
      this.showErrorMessage(textField, error instanceof Error ? error.message : 'Enhancement failed');
    }
  }

  /**
   * Get text field value
   */
  private getTextFieldValue(textField: HTMLElement): string {
    if (textField instanceof HTMLInputElement || textField instanceof HTMLTextAreaElement) {
      return textField.value;
    } else if (textField.isContentEditable) {
      return textField.textContent || '';
    }
    return '';
  }

  /**
   * Set text field value
   */
  private setTextFieldValue(textField: HTMLElement, value: string): void {
    if (textField instanceof HTMLInputElement || textField instanceof HTMLTextAreaElement) {
      textField.value = value;
      // Trigger input event for frameworks
      textField.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (textField.isContentEditable) {
      textField.textContent = value;
      // Trigger input event
      textField.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /**
   * Create enhancement menu
   */
  private createEnhancementMenu(): HTMLElement {
    const menu = document.createElement('div');
    menu.className = 'ai-pocket-enhancement-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Text enhancement options');

    // Header
    const header = document.createElement('div');
    header.className = 'ai-pocket-enhancement-menu-header';

    const title = document.createElement('h3');
    title.className = 'ai-pocket-enhancement-menu-title';
    title.textContent = 'Enhance Text';

    const subtitle = document.createElement('p');
    subtitle.className = 'ai-pocket-enhancement-menu-subtitle';
    
    // Show context-aware subtitle if context is available
    if (this.pageContext) {
      const contextLabel = this.pageContext.type.replace('_', ' ');
      subtitle.textContent = `Optimized for ${contextLabel}`;
      
      if (this.pocketContext && this.pocketContext.relevantContent.length > 0) {
        subtitle.textContent += ` • ${this.pocketContext.relevantContent.length} saved items`;
      }
    } else {
      subtitle.textContent = 'Choose a style to improve your text';
    }

    header.appendChild(title);
    header.appendChild(subtitle);
    menu.appendChild(header);

    // Options
    this.enhancementOptions.forEach((option, index) => {
      const optionButton = document.createElement('button');
      optionButton.className = 'ai-pocket-enhancement-option';
      optionButton.setAttribute('role', 'menuitem');
      optionButton.setAttribute('data-style', option.id);
      optionButton.setAttribute('tabindex', index === 0 ? '0' : '-1');
      optionButton.setAttribute('aria-checked', 'false');

      const icon = document.createElement('span');
      icon.className = 'ai-pocket-enhancement-option-icon';
      icon.textContent = option.icon;
      icon.setAttribute('aria-hidden', 'true');

      const content = document.createElement('div');
      content.className = 'ai-pocket-enhancement-option-content';

      const label = document.createElement('div');
      label.className = 'ai-pocket-enhancement-option-label';
      label.textContent = option.label;

      const description = document.createElement('div');
      description.className = 'ai-pocket-enhancement-option-description';
      description.textContent = option.description;

      content.appendChild(label);
      content.appendChild(description);

      optionButton.appendChild(icon);
      optionButton.appendChild(content);

      // Add click handler
      optionButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleStyleSelection(option.id, optionButton);
      });

      menu.appendChild(optionButton);
    });

    // Footer
    const footer = document.createElement('div');
    footer.className = 'ai-pocket-enhancement-menu-footer';
    footer.textContent = 'Press ESC to close';
    menu.appendChild(footer);

    // Keyboard navigation
    this.setupMenuKeyboardNavigation(menu);

    return menu;
  }

  /**
   * Show enhancement menu
   */
  private showEnhancementMenu(textField: HTMLElement, button: HTMLElement): void {
    // Close existing menu if any
    this.closeEnhancementMenu();

    // Store current text field
    this.currentTextField = textField;

    // Create menu
    this.currentMenu = this.createEnhancementMenu();
    document.body.appendChild(this.currentMenu);

    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'ai-pocket-menu-backdrop';
    backdrop.addEventListener('click', () => this.closeEnhancementMenu());
    document.body.appendChild(backdrop);
    (this.currentMenu as any).__backdrop = backdrop;

    // Position menu
    this.positionMenu(this.currentMenu, button, textField);

    // Show menu with animation
    requestAnimationFrame(() => {
      this.currentMenu?.classList.add('visible');
    });

    // Focus first option
    const firstOption = this.currentMenu.querySelector('.ai-pocket-enhancement-option') as HTMLElement;
    if (firstOption) {
      firstOption.focus();
    }

    // Add ESC key listener
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeEnhancementMenu();
        button.focus();
      }
    };
    document.addEventListener('keydown', escHandler);
    (this.currentMenu as any).__escHandler = escHandler;

    console.debug("[TextEnhancer] Enhancement menu shown");
  }

  /**
   * Position menu near button
   */
  private positionMenu(menu: HTMLElement, button: HTMLElement, textField: HTMLElement): void {
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
    const options = Array.from(menu.querySelectorAll('.ai-pocket-enhancement-option')) as HTMLElement[];

    menu.addEventListener('keydown', (e: KeyboardEvent) => {
      const currentIndex = options.findIndex(opt => opt === document.activeElement);

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          const nextIndex = (currentIndex + 1) % options.length;
          options[nextIndex]?.focus();
          break;

        case 'ArrowUp':
          e.preventDefault();
          const prevIndex = currentIndex <= 0 ? options.length - 1 : currentIndex - 1;
          options[prevIndex]?.focus();
          break;

        case 'Home':
          e.preventDefault();
          options[0]?.focus();
          break;

        case 'End':
          e.preventDefault();
          options[options.length - 1]?.focus();
          break;

        case 'Enter':
        case ' ':
          e.preventDefault();
          if (currentIndex >= 0 && options[currentIndex]) {
            const style = options[currentIndex].getAttribute('data-style') as EnhancementStyle;
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
  private async handleStyleSelection(style: EnhancementStyle, optionElement: HTMLElement): Promise<void> {
    console.info("[TextEnhancer] Style selected:", style);

    if (!this.currentTextField || !this.currentMenu) {
      console.error("[TextEnhancer] No text field or menu available");
      return;
    }

    // Update visual selection in menu FIRST
    const allOptions = this.currentMenu.querySelectorAll('.ai-pocket-enhancement-option');
    allOptions.forEach((opt) => {
      opt.classList.remove('selected');
      opt.setAttribute('aria-checked', 'false');
    });

    optionElement.classList.add('selected');
    optionElement.setAttribute('aria-checked', 'true');

    // Store reference to textField BEFORE closing menu
    const textFieldRef = this.currentTextField;
    const currentText = this.getTextFieldValue(textFieldRef);

    console.debug("[TextEnhancer] Enhancing text with style:", {
      style,
      textLength: currentText.length,
      textPreview: currentText.substring(0, 50)
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
    style: EnhancementStyle
  ): Promise<void> {
    console.info("[TextEnhancer] Processing enhancement", { style, textLength: originalText.length });

    // Verify textField is still valid
    if (!textField || !document.body.contains(textField)) {
      console.error("[TextEnhancer] Text field no longer in DOM, cannot process");
      return;
    }

    // Show loading indicator
    const loadingOverlay = this.showLoadingIndicator(textField);

    try {
      // Send enhancement request to service worker
      const enhancedText = await this.requestEnhancement(originalText, style, false);

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
      this.showErrorMessage(textField, error instanceof Error ? error.message : 'Enhancement failed');
    }
  }

  /**
   * Request text enhancement from service worker
   */
  private async requestEnhancement(text: string, style: EnhancementStyle, directMode: boolean = false): Promise<string> {
    // Import sendMessage dynamically to avoid circular dependencies
    const { sendMessage } = await import('../shared/message-client.js');

    // Create enhancement prompt based on style
    const prompt = this.createEnhancementPrompt(text, style, directMode);

    // Send request to service worker
    const response = await sendMessage<{ enhancedText: string }>(
      'AI_PROCESS_REQUEST',
      {
        prompt,
        task: 'enhance',
        preferLocal: true, // Use on-device AI for privacy (Requirement 9.8)
        style,
        originalText: text,
        directMode,
      },
      { timeout: 30000 }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Enhancement request failed');
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
      /\n\n.*?(explanation|analysis|note|context).*$/is, // Remove explanations at the end
    ];

    // Apply cleaning patterns
    unwantedPatterns.forEach(pattern => {
      if (pattern.source.includes('\\*\\*(.*?)\\*\\*')) {
        // Special handling for bold text - keep the content
        cleaned = cleaned.replace(pattern, '$1');
      } else {
        cleaned = cleaned.replace(pattern, '');
      }
    });

    // If the response contains multiple options, try to extract the first clean option
    const optionMatch = cleaned.match(/^[^>\n\*\d-].*?(?=\n\n|\n[>\*\d-]|$)/s);
    if (optionMatch && optionMatch[0].length > 10) {
      cleaned = optionMatch[0].trim();
    }

    // Remove any remaining formatting artifacts
    cleaned = cleaned
      .replace(/^\s*["'`]|["'`]\s*$/g, '') // Remove quotes at start/end
      .replace(/\n{3,}/g, '\n\n') // Reduce multiple newlines
      .replace(/^\s+|\s+$/g, '') // Trim whitespace
      .replace(/\s{2,}/g, ' '); // Reduce multiple spaces

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
  private createEnhancementPrompt(text: string, style: EnhancementStyle, directMode: boolean = false): string {
    const styleInstructions: Record<EnhancementStyle, string> = {
      [EnhancementStyle.PROFESSIONAL]:
        'Rewrite the following text in a professional, formal, and business-appropriate tone. Maintain the core message but make it suitable for professional communication.',
      [EnhancementStyle.CONCISE]:
        'Rewrite the following text to be more concise and direct. Remove unnecessary words while preserving the essential meaning.',
      [EnhancementStyle.EMPATHETIC]:
        'Rewrite the following text with a warm, empathetic, and understanding tone. Show compassion and emotional intelligence.',
      [EnhancementStyle.PERSUASIVE]:
        'Rewrite the following text to be more persuasive and compelling. Use rhetorical techniques to make the message more convincing.',
      [EnhancementStyle.FUNNY]:
        'Rewrite the following text with humor and lightheartedness. Add wit and playfulness while maintaining the core message.',
      [EnhancementStyle.OPTIMIZE]:
        'Improve the following text by fixing grammar errors, enhancing clarity, and improving overall flow. Make it more polished and well-written.',
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
      const suggestions = PageContextDetector.getContextualSuggestions(this.pageContext);
      if (suggestions.length > 0) {
        prompt += `\n\nConsiderations for this context:\n${suggestions.map(s => `- ${s}`).join('\n')}`;
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
      console.warn("[TextEnhancer] Cannot show loading indicator - textField not in DOM");
      return null;
    }

    // Get the enhancement button for this text field
    const button = this.injectedButtons.get(textField);
    if (!button) {
      console.warn("[TextEnhancer] No button found for text field");
      return null;
    }

    // Add loading state to button
    button.classList.add('loading');
    button.setAttribute('aria-label', 'Enhancing text...');
    
    // Change icon to indicate loading (the CSS animation will handle the spinning)
    const icon = button.querySelector('.ai-pocket-enhance-btn-icon');
    if (icon) {
      icon.textContent = '⟳'; // Rotating arrow icon
    }

    return button;
  }

  /**
   * Hide loading indicator and restore button state
   */
  private hideLoadingIndicator(textField: HTMLElement, loadingButton: HTMLElement | null): void {
    if (!loadingButton) return;

    // Remove loading state from button
    loadingButton.classList.remove('loading');
    loadingButton.setAttribute('aria-label', 'Enhance text with AI (drag to move)');
    
    // Restore original icon
    const icon = loadingButton.querySelector('.ai-pocket-enhance-btn-icon');
    if (icon) {
      icon.textContent = '✨'; // Original sparkle icon
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
    style: EnhancementStyle
  ): void {
    console.debug("[TextEnhancer] Showing preview", {
      originalLength: originalText.length,
      enhancedLength: enhancedText.length,
    });

    // Create preview dialog
    const preview = document.createElement('div');
    preview.className = 'ai-pocket-enhancement-preview';
    preview.setAttribute('role', 'dialog');
    preview.setAttribute('aria-labelledby', 'preview-title');
    preview.setAttribute('aria-modal', 'true');

    // Header
    const header = document.createElement('div');
    header.className = 'ai-pocket-preview-header';

    const title = document.createElement('h3');
    title.id = 'preview-title';
    title.className = 'ai-pocket-preview-title';
    title.textContent = `Enhanced Text (${this.getStyleLabel(style)})`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ai-pocket-preview-close';
    closeBtn.setAttribute('aria-label', 'Close preview');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.closePreview(preview));

    header.appendChild(title);
    header.appendChild(closeBtn);
    preview.appendChild(header);

    // Content comparison
    const content = document.createElement('div');
    content.className = 'ai-pocket-preview-content';

    // Original text section
    const originalSection = document.createElement('div');
    originalSection.className = 'ai-pocket-preview-section';

    const originalLabel = document.createElement('div');
    originalLabel.className = 'ai-pocket-preview-label';
    originalLabel.textContent = 'Original';

    const originalTextEl = document.createElement('div');
    originalTextEl.className = 'ai-pocket-preview-text ai-pocket-preview-original';
    originalTextEl.textContent = originalText;

    originalSection.appendChild(originalLabel);
    originalSection.appendChild(originalTextEl);

    // Enhanced text section
    const enhancedSection = document.createElement('div');
    enhancedSection.className = 'ai-pocket-preview-section';

    const enhancedLabel = document.createElement('div');
    enhancedLabel.className = 'ai-pocket-preview-label';
    enhancedLabel.textContent = 'Enhanced';

    const enhancedTextEl = document.createElement('div');
    enhancedTextEl.className = 'ai-pocket-preview-text ai-pocket-preview-enhanced';
    enhancedTextEl.textContent = enhancedText;

    enhancedSection.appendChild(enhancedLabel);
    enhancedSection.appendChild(enhancedTextEl);

    content.appendChild(originalSection);
    content.appendChild(enhancedSection);
    preview.appendChild(content);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'ai-pocket-preview-actions';

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'ai-pocket-preview-btn ai-pocket-preview-btn-secondary';
    rejectBtn.textContent = 'Reject';
    rejectBtn.setAttribute('aria-label', 'Reject enhanced text');
    rejectBtn.addEventListener('click', () => {
      console.info("[TextEnhancer] Enhancement rejected");
      this.closePreview(preview);
    });

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'ai-pocket-preview-btn ai-pocket-preview-btn-primary';
    acceptBtn.textContent = 'Accept';
    acceptBtn.setAttribute('aria-label', 'Accept enhanced text');
    acceptBtn.addEventListener('click', () => {
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
    const backdrop = document.createElement('div');
    backdrop.className = 'ai-pocket-preview-backdrop';
    backdrop.addEventListener('click', () => this.closePreview(preview));
    document.body.appendChild(backdrop);
    (preview as any).__backdrop = backdrop;

    // Position preview
    this.positionPreview(preview, textField);

    // Add to DOM
    document.body.appendChild(preview);

    // Show with animation
    requestAnimationFrame(() => {
      preview.classList.add('visible');
      backdrop.classList.add('visible');
    });

    // Focus accept button
    acceptBtn.focus();

    // Add ESC key listener
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closePreview(preview);
      }
    };
    document.addEventListener('keydown', escHandler);
    (preview as any).__escHandler = escHandler;
  }

  /**
   * Get style label for display
   */
  private getStyleLabel(style: EnhancementStyle): string {
    const option = this.enhancementOptions.find(opt => opt.id === style);
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
      document.removeEventListener('keydown', escHandler);
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

    const errorEl = document.createElement('div');
    errorEl.className = 'ai-pocket-enhancement-error';
    errorEl.setAttribute('role', 'alert');
    errorEl.textContent = `Enhancement failed: ${message}`;

    const rect = textField.getBoundingClientRect();
    errorEl.style.position = 'absolute';
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
        document.removeEventListener('keydown', escHandler);
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
