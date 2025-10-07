/**
 * Element Selector Module
 * Implements interactive element selection UI for content capture
 * Requirements: 2.2, 2.3, 2.4
 */

import { domAnalyzer } from "./dom-analyzer.js";
import { contentSanitizer } from "./content-sanitizer.js";
import type { CapturedContent } from "./content-capture.js";

/**
 * Element content structure
 */
export interface ElementContent {
  element: HTMLElement;
  selector: string;
  html: string;
  text: string;
  attributes: Record<string, string>;
  boundingRect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

/**
 * Selection state
 */
interface SelectionState {
  isActive: boolean;
  selectedElements: Set<HTMLElement>;
  hoveredElement: HTMLElement | null;
  overlay: HTMLElement | null;
  toolbar: HTMLElement | null;
}

/**
 * Element Selector UI class
 * Implements click-to-select interface with visual highlighting
 * Requirements: 2.2, 2.3, 2.4
 */
export class ElementSelectorUI {
  private state: SelectionState = {
    isActive: false,
    selectedElements: new Set(),
    hoveredElement: null,
    overlay: null,
    toolbar: null,
  };

  private readonly OVERLAY_CLASS = "ai-pocket-selector-overlay";
  private readonly HOVER_CLASS = "ai-pocket-element-hover";
  private readonly SELECTED_CLASS = "ai-pocket-element-selected";
  private readonly TOOLBAR_CLASS = "ai-pocket-selector-toolbar";
  private readonly INDICATOR_CLASS = "ai-pocket-selection-indicator";

  private boundHandleClick: ((event: MouseEvent) => void) | null = null;
  private boundHandleHover: ((event: MouseEvent) => void) | null = null;
  private boundHandleKeydown: ((event: KeyboardEvent) => void) | null = null;

  /**
   * Enable element selection mode
   * Requirements: 2.2, 2.3
   */
  enableSelectionMode(): void {
    if (this.state.isActive) {
      console.warn("[ElementSelector] Selection mode already active");
      return;
    }

    console.info("[ElementSelector] Enabling selection mode");

    try {
      // Inject styles
      this.injectStyles();

      // Create overlay
      this.state.overlay = this.createOverlay();
      document.body.appendChild(this.state.overlay);

      // Create toolbar
      this.state.toolbar = this.createToolbar();
      document.body.appendChild(this.state.toolbar);

      // Bind event handlers
      this.boundHandleClick = this.handleClick.bind(this);
      this.boundHandleHover = this.handleHover.bind(this);
      this.boundHandleKeydown = this.handleKeydown.bind(this);

      // Add event listeners with capture phase to intercept before page handlers
      document.addEventListener("click", this.boundHandleClick, true);
      document.addEventListener("mouseover", this.boundHandleHover, true);
      document.addEventListener("mouseout", this.handleMouseOut.bind(this), true);
      document.addEventListener("keydown", this.boundHandleKeydown, true);

      this.state.isActive = true;

      console.info("[ElementSelector] Selection mode enabled");
    } catch (error) {
      console.error("[ElementSelector] Failed to enable selection mode", error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * Disable element selection mode
   * Requirements: 2.2
   */
  disableSelectionMode(): void {
    if (!this.state.isActive) {
      console.warn("[ElementSelector] Selection mode not active");
      return;
    }

    console.info("[ElementSelector] Disabling selection mode");
    this.cleanup();
    console.info("[ElementSelector] Selection mode disabled");
  }

  /**
   * Create selection overlay
   * Requirements: 2.3
   */
  private createOverlay(): HTMLElement {
    const overlay = document.createElement("div");
    overlay.className = this.OVERLAY_CLASS;
    overlay.setAttribute("role", "application");
    overlay.setAttribute("aria-label", "Element selection mode active");
    overlay.setAttribute("data-ai-pocket-overlay", "true");

    return overlay;
  }

  /**
   * Create toolbar with controls
   * Requirements: 2.3, 2.4
   */
  private createToolbar(): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.className = this.TOOLBAR_CLASS;
    toolbar.setAttribute("data-ai-pocket-toolbar", "true");

    // Selection count
    const countDisplay = document.createElement("span");
    countDisplay.className = "selection-count";
    countDisplay.textContent = "0 elements selected";
    countDisplay.setAttribute("aria-live", "polite");

    // Confirm button
    const confirmBtn = document.createElement("button");
    confirmBtn.className = "toolbar-btn confirm-btn";
    confirmBtn.textContent = "Capture Selected";
    confirmBtn.setAttribute("aria-label", "Capture selected elements");
    confirmBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.confirmSelection();
    });

    // Cancel button
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "toolbar-btn cancel-btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.setAttribute("aria-label", "Cancel element selection");
    cancelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.disableSelectionMode();
    });

    // Clear button
    const clearBtn = document.createElement("button");
    clearBtn.className = "toolbar-btn clear-btn";
    clearBtn.textContent = "Clear All";
    clearBtn.setAttribute("aria-label", "Clear all selected elements");
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.clearSelection();
    });

    toolbar.appendChild(countDisplay);
    toolbar.appendChild(clearBtn);
    toolbar.appendChild(confirmBtn);
    toolbar.appendChild(cancelBtn);

    return toolbar;
  }

  /**
   * Handle click events for element selection
   * Requirements: 2.2, 2.3
   */
  private handleClick(event: MouseEvent): void {
    // Ignore clicks on our own UI elements
    const target = event.target as HTMLElement;
    if (
      target.closest(`[data-ai-pocket-overlay]`) ||
      target.closest(`[data-ai-pocket-toolbar]`) ||
      target.closest(`.${this.INDICATOR_CLASS}`)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const element = event.target as HTMLElement;

    if (this.state.selectedElements.has(element)) {
      this.deselectElement(element);
    } else {
      this.selectElement(element);
    }
  }

  /**
   * Handle hover events for element highlighting
   * Requirements: 2.3
   */
  private handleHover(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // Ignore our own UI elements
    if (
      target.closest(`[data-ai-pocket-overlay]`) ||
      target.closest(`[data-ai-pocket-toolbar]`) ||
      target.closest(`.${this.INDICATOR_CLASS}`)
    ) {
      return;
    }

    // Remove hover from previous element
    if (this.state.hoveredElement && this.state.hoveredElement !== target) {
      this.state.hoveredElement.classList.remove(this.HOVER_CLASS);
    }

    // Add hover to current element (if not already selected)
    if (!this.state.selectedElements.has(target)) {
      target.classList.add(this.HOVER_CLASS);
      this.state.hoveredElement = target;
    }
  }

  /**
   * Handle mouse out events
   */
  private handleMouseOut(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    target.classList.remove(this.HOVER_CLASS);

    if (this.state.hoveredElement === target) {
      this.state.hoveredElement = null;
    }
  }

  /**
   * Handle keyboard events
   * Requirements: 2.2
   */
  private handleKeydown(event: KeyboardEvent): void {
    // ESC to cancel
    if (event.key === "Escape") {
      event.preventDefault();
      this.disableSelectionMode();
    }

    // Enter to confirm
    if (event.key === "Enter" && this.state.selectedElements.size > 0) {
      event.preventDefault();
      this.confirmSelection();
    }

    // Delete/Backspace to clear last selection
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      this.state.selectedElements.size > 0
    ) {
      event.preventDefault();
      const lastElement = Array.from(this.state.selectedElements).pop();
      if (lastElement) {
        this.deselectElement(lastElement);
      }
    }
  }

  /**
   * Select an element
   * Requirements: 2.3
   */
  private selectElement(element: HTMLElement): void {
    console.debug("[ElementSelector] Selecting element", element);

    this.state.selectedElements.add(element);
    element.classList.add(this.SELECTED_CLASS);
    element.classList.remove(this.HOVER_CLASS);

    // Add selection indicator
    this.showSelectionIndicator(element);

    // Update toolbar
    this.updateToolbar();

    // Announce to screen readers
    this.announceSelection(element, "selected");
  }

  /**
   * Deselect an element
   * Requirements: 2.3
   */
  private deselectElement(element: HTMLElement): void {
    console.debug("[ElementSelector] Deselecting element", element);

    this.state.selectedElements.delete(element);
    element.classList.remove(this.SELECTED_CLASS);

    // Remove selection indicator
    this.removeSelectionIndicator(element);

    // Update toolbar
    this.updateToolbar();

    // Announce to screen readers
    this.announceSelection(element, "deselected");
  }

  /**
   * Show visual indicator for selected element
   * Requirements: 2.3
   */
  private showSelectionIndicator(element: HTMLElement): void {
    const indicator = document.createElement("div");
    indicator.className = this.INDICATOR_CLASS;
    indicator.setAttribute("data-ai-pocket-indicator", "true");
    indicator.setAttribute("aria-hidden", "true");

    // Position indicator at top-left of element
    const rect = element.getBoundingClientRect();
    indicator.style.position = "fixed";
    indicator.style.top = `${rect.top}px`;
    indicator.style.left = `${rect.left}px`;
    indicator.style.zIndex = "2147483646";

    // Add selection number
    const selectionNumber = this.state.selectedElements.size;
    indicator.textContent = `${selectionNumber}`;
    indicator.title = `Selected element ${selectionNumber}`;

    // Store reference on element
    (element as any).__aiPocketIndicator = indicator;

    document.body.appendChild(indicator);
  }

  /**
   * Remove selection indicator from element
   */
  private removeSelectionIndicator(element: HTMLElement): void {
    const indicator = (element as any).__aiPocketIndicator;
    if (indicator && indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
      delete (element as any).__aiPocketIndicator;
    }
  }

  /**
   * Update toolbar display
   */
  private updateToolbar(): void {
    if (!this.state.toolbar) return;

    const countDisplay = this.state.toolbar.querySelector(".selection-count");
    if (countDisplay) {
      const count = this.state.selectedElements.size;
      countDisplay.textContent = `${count} element${count !== 1 ? "s" : ""} selected`;
    }

    // Enable/disable confirm button based on selection
    const confirmBtn = this.state.toolbar.querySelector(".confirm-btn") as HTMLButtonElement;
    if (confirmBtn) {
      confirmBtn.disabled = this.state.selectedElements.size === 0;
    }

    // Enable/disable clear button based on selection
    const clearBtn = this.state.toolbar.querySelector(".clear-btn") as HTMLButtonElement;
    if (clearBtn) {
      clearBtn.disabled = this.state.selectedElements.size === 0;
    }
  }

  /**
   * Clear all selections
   */
  private clearSelection(): void {
    console.debug("[ElementSelector] Clearing all selections");

    // Remove classes and indicators from all selected elements
    this.state.selectedElements.forEach((element) => {
      element.classList.remove(this.SELECTED_CLASS);
      this.removeSelectionIndicator(element);
    });

    this.state.selectedElements.clear();
    this.updateToolbar();

    // Announce to screen readers
    const liveRegion = document.querySelector('[aria-live="polite"]');
    if (liveRegion) {
      liveRegion.textContent = "All selections cleared";
    }
  }

  /**
   * Confirm selection and capture elements
   * Requirements: 2.4
   */
  private async confirmSelection(): Promise<void> {
    if (this.state.selectedElements.size === 0) {
      console.warn("[ElementSelector] No elements selected");
      return;
    }

    console.info(
      "[ElementSelector] Confirming selection",
      `${this.state.selectedElements.size} elements`
    );

    try {
      // Capture selected elements
      const capturedElements = await this.captureSelectedElements();

      // Disable selection mode
      this.disableSelectionMode();

      // Notify that capture is complete (will be handled by content-main)
      window.dispatchEvent(
        new CustomEvent("ai-pocket-elements-captured", {
          detail: {
            elements: capturedElements,
            count: Array.from(this.state.selectedElements).length,
            timestamp: Date.now(),
          },
        })
      );

      console.info("[ElementSelector] Elements captured successfully");
    } catch (error) {
      console.error("[ElementSelector] Failed to capture elements", error);
      alert("Failed to capture elements. Please try again.");
    }
  }

  /**
   * Capture selected elements with their content
   * Requirements: 2.4
   */
  async captureSelectedElements(): Promise<CapturedContent> {
    const elements: ElementContent[] = [];

    for (const element of this.state.selectedElements) {
      try {
        const elementContent = this.extractElementContent(element);
        elements.push(elementContent);
      } catch (error) {
        console.error("[ElementSelector] Failed to extract element content", error);
      }
    }

    // Build captured content object
    const metadata = domAnalyzer.extractMetadata();

    // Combine all element text
    const combinedText = elements.map((e) => e.text).join("\n\n");

    // Sanitize combined text
    const sanitizationResult = contentSanitizer.sanitize(combinedText);

    const capturedContent: CapturedContent = {
      id: this.generateId(),
      type: "element",
      url: window.location.href,
      title: document.title,
      capturedAt: Date.now(),
      metadata: {
        ...metadata,
        elementCount: elements.length,
        elements: elements.map((e) => ({
          selector: e.selector,
          tagName: e.element.tagName,
          attributes: e.attributes,
          boundingRect: e.boundingRect,
        })),
      } as any,
      text: {
        content: combinedText,
        wordCount: combinedText.split(/\s+/).length,
        characterCount: combinedText.length,
        paragraphs: elements.map((e) => e.text),
        headings: [],
        links: [],
        images: [],
      },
      sanitizedText: sanitizationResult.sanitizedContent,
      sanitizationInfo: {
        detectedPII: sanitizationResult.detectedPII.length,
        redactionCount: sanitizationResult.redactionCount,
      },
    };

    console.debug("[ElementSelector] Captured content", {
      elementCount: elements.length,
      textLength: combinedText.length,
      sanitized: sanitizationResult.redactionCount > 0,
    });

    return capturedContent;
  }

  /**
   * Extract content from a single element
   */
  private extractElementContent(element: HTMLElement): ElementContent {
    const rect = element.getBoundingClientRect();

    // Generate CSS selector
    const selector = this.generateSelector(element);

    // Extract text content
    const text = element.innerText || element.textContent || "";

    // Extract attributes
    const attributes: Record<string, string> = {};
    for (const attr of element.attributes) {
      attributes[attr.name] = attr.value;
    }

    return {
      element,
      selector,
      html: element.outerHTML,
      text: text.trim(),
      attributes,
      boundingRect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    };
  }

  /**
   * Generate CSS selector for an element
   */
  private generateSelector(element: HTMLElement): string {
    // Use ID if available
    if (element.id) {
      return `#${element.id}`;
    }

    // Build selector path
    const path: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      // Add class if available
      if (current.className && typeof current.className === "string") {
        const classes = current.className
          .trim()
          .split(/\s+/)
          .filter((c) => c.length > 0 && !c.startsWith("ai-pocket"))
          .slice(0, 2);
        if (classes.length > 0) {
          selector += `.${classes.join(".")}`;
        }
      }

      // Add nth-child if needed for uniqueness
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children);
        const index = siblings.indexOf(current);
        const currentTagName = current.tagName;
        if (siblings.filter((s) => s.tagName === currentTagName).length > 1) {
          selector += `:nth-child(${index + 1})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(" > ");
  }

  /**
   * Generate unique ID for captured content
   */
  private generateId(): string {
    return `element_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Announce selection changes to screen readers
   */
  private announceSelection(element: HTMLElement, action: "selected" | "deselected"): void {
    const tagName = element.tagName.toLowerCase();
    const text = element.innerText?.substring(0, 50) || "element";
    const message = `${tagName} ${action}: ${text}`;

    // Create or update live region
    let liveRegion = document.querySelector('[aria-live="polite"]');
    if (!liveRegion) {
      liveRegion = document.createElement("div");
      liveRegion.setAttribute("aria-live", "polite");
      liveRegion.setAttribute("aria-atomic", "true");
      liveRegion.className = "sr-only";
      liveRegion.setAttribute("data-ai-pocket-live", "true");
      document.body.appendChild(liveRegion);
    }

    liveRegion.textContent = message;
  }

  /**
   * Inject CSS styles for element selector
   */
  private injectStyles(): void {
    // Check if styles already injected
    if (document.getElementById("ai-pocket-selector-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "ai-pocket-selector-styles";
    style.textContent = `
      /* Selection overlay */
      .${this.OVERLAY_CLASS} {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.1);
        z-index: 2147483645;
        pointer-events: none;
        cursor: crosshair;
      }

      /* Hover state */
      .${this.HOVER_CLASS} {
        outline: 2px dashed #4285f4 !important;
        outline-offset: 2px !important;
        background-color: rgba(66, 133, 244, 0.1) !important;
        cursor: pointer !important;
      }

      /* Selected state */
      .${this.SELECTED_CLASS} {
        outline: 3px solid #0f9d58 !important;
        outline-offset: 2px !important;
        background-color: rgba(15, 157, 88, 0.15) !important;
        position: relative !important;
      }

      /* Selection indicator */
      .${this.INDICATOR_CLASS} {
        position: fixed;
        background: #0f9d58;
        color: white;
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: bold;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        pointer-events: none;
        z-index: 2147483646;
      }

      /* Toolbar */
      .${this.TOOLBAR_CLASS} {
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border-radius: 8px;
        padding: 12px 16px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
      }

      .${this.TOOLBAR_CLASS} .selection-count {
        font-weight: 500;
        color: #333;
        margin-right: 8px;
      }

      .${this.TOOLBAR_CLASS} .toolbar-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .${this.TOOLBAR_CLASS} .toolbar-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .${this.TOOLBAR_CLASS} .confirm-btn {
        background: #0f9d58;
        color: white;
      }

      .${this.TOOLBAR_CLASS} .confirm-btn:hover:not(:disabled) {
        background: #0d8a4d;
      }

      .${this.TOOLBAR_CLASS} .cancel-btn {
        background: #f44336;
        color: white;
      }

      .${this.TOOLBAR_CLASS} .cancel-btn:hover {
        background: #d32f2f;
      }

      .${this.TOOLBAR_CLASS} .clear-btn {
        background: #e0e0e0;
        color: #333;
      }

      .${this.TOOLBAR_CLASS} .clear-btn:hover:not(:disabled) {
        background: #bdbdbd;
      }

      /* Screen reader only */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Cleanup all selection UI elements and event listeners
   */
  private cleanup(): void {
    // Remove event listeners
    if (this.boundHandleClick) {
      document.removeEventListener("click", this.boundHandleClick, true);
    }
    if (this.boundHandleHover) {
      document.removeEventListener("mouseover", this.boundHandleHover, true);
    }
    if (this.boundHandleKeydown) {
      document.removeEventListener("keydown", this.boundHandleKeydown, true);
    }

    // Remove classes from all elements
    this.state.selectedElements.forEach((element) => {
      element.classList.remove(this.SELECTED_CLASS);
      this.removeSelectionIndicator(element);
    });

    if (this.state.hoveredElement) {
      this.state.hoveredElement.classList.remove(this.HOVER_CLASS);
    }

    // Remove overlay
    if (this.state.overlay && this.state.overlay.parentNode) {
      this.state.overlay.parentNode.removeChild(this.state.overlay);
    }

    // Remove toolbar
    if (this.state.toolbar && this.state.toolbar.parentNode) {
      this.state.toolbar.parentNode.removeChild(this.state.toolbar);
    }

    // Remove live region
    const liveRegion = document.querySelector('[data-ai-pocket-live]');
    if (liveRegion && liveRegion.parentNode) {
      liveRegion.parentNode.removeChild(liveRegion);
    }

    // Reset state
    this.state = {
      isActive: false,
      selectedElements: new Set(),
      hoveredElement: null,
      overlay: null,
      toolbar: null,
    };
  }

  /**
   * Get current selection state
   */
  getSelectionState(): {
    isActive: boolean;
    selectedCount: number;
    selectedElements: HTMLElement[];
  } {
    return {
      isActive: this.state.isActive,
      selectedCount: this.state.selectedElements.size,
      selectedElements: Array.from(this.state.selectedElements),
    };
  }

  /**
   * Check if selection mode is active
   */
  isActive(): boolean {
    return this.state.isActive;
  }
}

// Export singleton instance
export const elementSelector = new ElementSelectorUI();
