/**
 * Element Selector UI
 * Provides interactive element selection with visual highlighting
 * Requirements: 2.2, 2.3, 2.4, 39
 */

import { domAnalyzer, type ElementInfo } from "./dom-analyzer.js";

export interface SelectedElement {
  element: HTMLElement;
  info: ElementInfo;
  screenshot?: string;
}

export interface ElementSelectorOptions {
  multiSelect?: boolean;
  onSelect?: (elements: SelectedElement[]) => void;
  onCancel?: () => void;
}

export class ElementSelector {
  private isActive = false;
  private selectedElements: Set<HTMLElement> = new Set();
  private overlay: HTMLElement | null = null;
  private highlightBoxes: Map<HTMLElement, HTMLElement> = new Map();
  private hoverBox: HTMLElement | null = null;
  private options: ElementSelectorOptions = {};

  /**
   * Enable element selection mode
   */
  enable(options: ElementSelectorOptions = {}): void {
    if (this.isActive) {
      console.warn("[ElementSelector] Already active");
      return;
    }

    this.options = options;
    this.isActive = true;
    this.selectedElements.clear();

    // Create overlay
    this.createOverlay();

    // Add event listeners
    this.attachEventListeners();

    console.info("[ElementSelector] Selection mode enabled");
  }

  /**
   * Disable element selection mode
   */
  disable(): void {
    if (!this.isActive) return;

    this.isActive = false;

    // Remove overlay
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }

    // Remove highlight boxes
    this.highlightBoxes.forEach((box) => box.remove());
    this.highlightBoxes.clear();

    // Remove hover box
    if (this.hoverBox) {
      this.hoverBox.remove();
      this.hoverBox = null;
    }

    // Remove event listeners
    this.detachEventListeners();

    // Clear selections
    this.selectedElements.clear();

    console.info("[ElementSelector] Selection mode disabled");
  }

  /**
   * Get currently selected elements
   */
  getSelectedElements(): SelectedElement[] {
    return Array.from(this.selectedElements).map((element) => ({
      element,
      info: domAnalyzer.extractElement(element),
    }));
  }

  /**
   * Create overlay UI
   */
  private createOverlay(): void {
    this.overlay = document.createElement("div");
    this.overlay.id = "ai-pocket-element-selector-overlay";
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2147483646;
      pointer-events: none;
    `;

    // Create toolbar
    const toolbar = document.createElement("div");
    toolbar.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      pointer-events: auto;
      z-index: 2147483647;
      display: flex;
      gap: 12px;
      align-items: center;
    `;

    // Add instruction text
    const instruction = document.createElement("span");
    instruction.textContent = this.options.multiSelect
      ? "Click elements to select • ESC to cancel"
      : "Click an element to select • ESC to cancel";
    instruction.style.cssText = "margin-right: 8px;";
    toolbar.appendChild(instruction);

    // Add selected count if multi-select
    if (this.options.multiSelect) {
      const counter = document.createElement("span");
      counter.id = "ai-pocket-selection-counter";
      counter.textContent = "0 selected";
      counter.style.cssText = `
        background: rgba(255, 255, 255, 0.2);
        padding: 4px 8px;
        border-radius: 4px;
        font-weight: 500;
      `;
      toolbar.appendChild(counter);
    }

    // Add confirm button
    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = "Confirm";
    confirmBtn.style.cssText = `
      background: #10b981;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.2s;
    `;
    confirmBtn.onmouseenter = () => {
      confirmBtn.style.background = "#059669";
    };
    confirmBtn.onmouseleave = () => {
      confirmBtn.style.background = "#10b981";
    };
    confirmBtn.onclick = () => this.handleConfirm();
    toolbar.appendChild(confirmBtn);

    // Add cancel button
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = `
      background: #ef4444;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.2s;
    `;
    cancelBtn.onmouseenter = () => {
      cancelBtn.style.background = "#dc2626";
    };
    cancelBtn.onmouseleave = () => {
      cancelBtn.style.background = "#ef4444";
    };
    cancelBtn.onclick = () => this.handleCancel();
    toolbar.appendChild(cancelBtn);

    this.overlay.appendChild(toolbar);
    document.body.appendChild(this.overlay);
  }

  /**
   * Create hover highlight box
   */
  private createHoverBox(): HTMLElement {
    const box = document.createElement("div");
    box.style.cssText = `
      position: absolute;
      pointer-events: none;
      border: 2px dashed #3b82f6;
      background: rgba(59, 130, 246, 0.1);
      z-index: 2147483645;
      transition: all 0.1s ease;
    `;
    return box;
  }

  /**
   * Create selection highlight box
   */
  private createSelectionBox(): HTMLElement {
    const box = document.createElement("div");
    box.style.cssText = `
      position: absolute;
      pointer-events: none;
      border: 2px solid #10b981;
      background: rgba(16, 185, 129, 0.2);
      z-index: 2147483645;
    `;

    // Add checkmark indicator
    const checkmark = document.createElement("div");
    checkmark.textContent = "✓";
    checkmark.style.cssText = `
      position: absolute;
      top: -12px;
      right: -12px;
      width: 24px;
      height: 24px;
      background: #10b981;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: bold;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    `;
    box.appendChild(checkmark);

    return box;
  }

  /**
   * Update highlight box position
   */
  private updateBoxPosition(box: HTMLElement, element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    box.style.top = `${rect.top + window.scrollY}px`;
    box.style.left = `${rect.left + window.scrollX}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }

  /**
   * Handle element hover
   */
  private handleMouseOver = (event: MouseEvent): void => {
    if (!this.isActive) return;

    const target = event.target as HTMLElement;

    // Ignore overlay elements
    if (
      target.id === "ai-pocket-element-selector-overlay" ||
      target.closest("#ai-pocket-element-selector-overlay")
    ) {
      return;
    }

    // Create hover box if it doesn't exist
    if (!this.hoverBox) {
      this.hoverBox = this.createHoverBox();
      document.body.appendChild(this.hoverBox);
    }

    // Update hover box position
    this.updateBoxPosition(this.hoverBox, target);
  };

  /**
   * Handle element click
   */
  private handleClick = (event: MouseEvent): void => {
    if (!this.isActive) return;

    event.preventDefault();
    event.stopPropagation();

    const target = event.target as HTMLElement;

    // Ignore overlay elements
    if (
      target.id === "ai-pocket-element-selector-overlay" ||
      target.closest("#ai-pocket-element-selector-overlay")
    ) {
      return;
    }

    // Toggle selection
    if (this.selectedElements.has(target)) {
      this.deselectElement(target);
    } else {
      this.selectElement(target);
    }

    // If not multi-select, confirm immediately
    if (!this.options.multiSelect && this.selectedElements.size > 0) {
      this.handleConfirm();
    }
  };

  /**
   * Select an element
   */
  private selectElement(element: HTMLElement): void {
    if (this.selectedElements.has(element)) return;

    this.selectedElements.add(element);

    // Create selection highlight
    const box = this.createSelectionBox();
    this.updateBoxPosition(box, element);
    document.body.appendChild(box);
    this.highlightBoxes.set(element, box);

    // Update counter
    this.updateCounter();

    console.debug("[ElementSelector] Element selected", {
      tag: element.tagName,
      count: this.selectedElements.size,
    });
  }

  /**
   * Deselect an element
   */
  private deselectElement(element: HTMLElement): void {
    if (!this.selectedElements.has(element)) return;

    this.selectedElements.delete(element);

    // Remove highlight box
    const box = this.highlightBoxes.get(element);
    if (box) {
      box.remove();
      this.highlightBoxes.delete(element);
    }

    // Update counter
    this.updateCounter();

    console.debug("[ElementSelector] Element deselected", {
      tag: element.tagName,
      count: this.selectedElements.size,
    });
  }

  /**
   * Update selection counter
   */
  private updateCounter(): void {
    const counter = document.getElementById("ai-pocket-selection-counter");
    if (counter) {
      const count = this.selectedElements.size;
      counter.textContent = `${count} selected`;
    }
  }

  /**
   * Handle confirm action
   */
  private handleConfirm(): void {
    const selected = this.getSelectedElements();

    console.info("[ElementSelector] Selection confirmed", {
      count: selected.length,
    });

    if (this.options.onSelect) {
      this.options.onSelect(selected);
    }

    this.disable();
  }

  /**
   * Handle cancel action
   */
  private handleCancel(): void {
    console.info("[ElementSelector] Selection cancelled");

    if (this.options.onCancel) {
      this.options.onCancel();
    }

    this.disable();
  }

  /**
   * Handle escape key
   */
  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.isActive) return;

    if (event.key === "Escape") {
      event.preventDefault();
      this.handleCancel();
    }
  };

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    document.addEventListener("mouseover", this.handleMouseOver, true);
    document.addEventListener("click", this.handleClick, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
  }

  /**
   * Detach event listeners
   */
  private detachEventListeners(): void {
    document.removeEventListener("mouseover", this.handleMouseOver, true);
    document.removeEventListener("click", this.handleClick, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
  }
}

// Export singleton instance
export const elementSelector = new ElementSelector();
