/**
 * Universal Text Enhancement System
 * Injects AI enhancement buttons near text input fields
 * Requirements: 9.1, 9.9
 */

interface EnhancementButton {
  button: HTMLElement;
  textField: HTMLElement;
}

class UniversalTextEnhancer {
  private injectedButtons: WeakMap<HTMLElement, HTMLElement> = new WeakMap();
  private observer: MutationObserver | null = null;
  private isEnabled: boolean = true;
  private sensitivePatterns = [
    /bank|banking|financial|credit|payment/i,
    /health|medical|patient|hospital/i,
    /password|login|signin|auth/i,
    /ssn|social.security/i,
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
      this.isEnabled = false;
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

      /* Hide button when text field is not focused */
      .ai-pocket-text-field-wrapper {
        position: relative;
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

    // TODO: Show enhancement menu (will be implemented in task 11.2)
    // For now, just provide visual feedback
    button.style.transform = "scale(1.1)";
    setTimeout(() => {
      button.style.transform = "";
    }, 200);
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
