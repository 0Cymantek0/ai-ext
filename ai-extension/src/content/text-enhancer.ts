/**
 * Universal Text Enhancement System
 * Injects AI enhancement buttons near text input fields
 * Requirements: 9.1, 9.9
 */

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
      .ai-pocket-enhance-btn {
        position: absolute;
        width: 28px;
        height: 28px;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        background: white;
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        z-index: 10000;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        transition: all 0.2s ease;
        opacity: 0;
        pointer-events: none;
        user-select: none;
        touch-action: none;
      }

      .ai-pocket-enhance-btn.visible {
        opacity: 1;
        pointer-events: auto;
      }

      .ai-pocket-enhance-btn.dragging {
        cursor: grabbing;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
        transform: scale(1.15);
        transition: none;
        z-index: 10001;
      }

      .ai-pocket-enhance-btn:hover:not(.dragging) {
        background: #f5f5f5;
        border-color: #d0d0d0;
        box-shadow: 0 3px 6px rgba(0, 0, 0, 0.15);
        transform: scale(1.05);
      }

      .ai-pocket-enhance-btn:active:not(.dragging) {
        cursor: grabbing;
      }

      .ai-pocket-enhance-btn:focus {
        outline: 2px solid #4285f4;
        outline-offset: 2px;
      }

      .ai-pocket-enhance-btn-icon {
        user-select: none;
        pointer-events: none;
      }

      /* Enhancement Menu Styles */
      .ai-pocket-enhancement-menu {
        position: absolute;
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10002;
        min-width: 280px;
        max-width: 320px;
        padding: 8px;
        opacity: 0;
        transform: scale(0.95);
        transition: opacity 0.15s ease, transform 0.15s ease;
        pointer-events: none;
      }

      .ai-pocket-enhancement-menu.visible {
        opacity: 1;
        transform: scale(1);
        pointer-events: auto;
      }

      .ai-pocket-enhancement-menu-header {
        padding: 8px 12px;
        border-bottom: 1px solid #f0f0f0;
        margin-bottom: 4px;
      }

      .ai-pocket-enhancement-menu-title {
        font-size: 14px;
        font-weight: 600;
        color: #202124;
        margin: 0;
      }

      .ai-pocket-enhancement-menu-subtitle {
        font-size: 12px;
        color: #5f6368;
        margin: 2px 0 0 0;
      }

      .ai-pocket-enhancement-option {
        display: flex;
        align-items: flex-start;
        padding: 10px 12px;
        border-radius: 6px;
        cursor: pointer;
        transition: background-color 0.1s ease;
        border: none;
        background: none;
        width: 100%;
        text-align: left;
        margin: 2px 0;
      }

      .ai-pocket-enhancement-option:hover {
        background-color: #f5f5f5;
      }

      .ai-pocket-enhancement-option:focus {
        outline: 2px solid #4285f4;
        outline-offset: -2px;
        background-color: #f5f5f5;
      }

      .ai-pocket-enhancement-option:active {
        background-color: #e8e8e8;
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
        color: #202124;
        margin: 0 0 2px 0;
      }

      .ai-pocket-enhancement-option-description {
        font-size: 12px;
        color: #5f6368;
        margin: 0;
        line-height: 1.4;
      }

      .ai-pocket-enhancement-menu-footer {
        padding: 8px 12px;
        border-top: 1px solid #f0f0f0;
        margin-top: 4px;
        font-size: 11px;
        color: #5f6368;
        text-align: center;
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
        this.handleButtonClick(textField, button);
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
        // Handle as click
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
  private handleButtonClick(textField: HTMLElement, button: HTMLElement): void {
    console.debug("[TextEnhancer] Enhancement button clicked", {
      tag: textField.tagName,
      value: (textField as HTMLInputElement).value,
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

    // Show enhancement menu
    this.showEnhancementMenu(textField, button);
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
    subtitle.textContent = 'Choose a style to improve your text';
    
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
        this.handleStyleSelection(option.id);
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
    const buttonRect = button.getBoundingClientRect();
    const textFieldRect = textField.getBoundingClientRect();
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
          if (currentIndex >= 0) {
            const style = options[currentIndex]?.getAttribute('data-style') as EnhancementStyle;
            if (style) {
              this.handleStyleSelection(style);
            }
          }
          break;
      }
    });
  }

  /**
   * Handle style selection
   */
  private handleStyleSelection(style: EnhancementStyle): void {
    console.info("[TextEnhancer] Style selected:", style);

    if (!this.currentTextField) {
      console.error("[TextEnhancer] No text field selected");
      this.closeEnhancementMenu();
      return;
    }

    const currentText = this.getTextFieldValue(this.currentTextField);
    
    console.debug("[TextEnhancer] Enhancing text with style:", {
      style,
      textLength: currentText.length,
      textPreview: currentText.substring(0, 50)
    });

    // Close menu
    this.closeEnhancementMenu();

    // TODO: Task 11.3 will implement the actual enhancement processing
    // For now, just log the selection
    console.info("[TextEnhancer] Enhancement requested:", {
      style,
      text: currentText,
      field: this.currentTextField.tagName
    });

    // Provide visual feedback
    const button = this.injectedButtons.get(this.currentTextField);
    if (button) {
      button.style.transform = "scale(1.1)";
      setTimeout(() => {
        button.style.transform = "";
      }, 200);
    }
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
