/**
 * Element Selector UI
 * Provides interactive element selection with visual highlighting
 * Requirements: 2.2, 2.3, 2.4, 39
 */

import { domAnalyzer, type ElementInfo } from "./dom-analyzer.js";
import {
  elementExtractor,
  type EnhancedElementInfo,
} from "./element-extractor.js";
import {
  elementPreviewGenerator,
  type ElementPreview,
} from "./element-preview.js";
import {
  codeSnippetGenerator,
  type CodeSnippet,
  type SnippetFormat,
} from "./code-snippet-generator.js";
import { contentSanitizer } from "./content-sanitizer.js";

export interface SelectedElement {
  element: HTMLElement;
  info: ElementInfo;
  enhancedInfo: EnhancedElementInfo;
  preview?: ElementPreview;
  snippets?: CodeSnippet[];
  screenshot?: string;
  sanitized?: boolean;
}

export interface ElementSelectorOptions {
  multiSelect?: boolean;
  onSelect?: (elements: SelectedElement[]) => void;
  onCancel?: () => void;
  generatePreview?: boolean;
  generateSnippets?: boolean;
  snippetFormats?: SnippetFormat[];
  sanitizeContent?: boolean;
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
   * Get currently selected elements with enhanced information
   * Requirements: 2.2, 2.3, 2.4, 39
   */
  async getSelectedElements(): Promise<SelectedElement[]> {
    const elements = Array.from(this.selectedElements);
    const results: SelectedElement[] = [];

    for (const element of elements) {
      const basicInfo = domAnalyzer.extractElement(element);
      const enhancedInfo = elementExtractor.extractEnhanced(element);

      const selectedElement: SelectedElement = {
        element,
        info: basicInfo,
        enhancedInfo,
      };

      // Generate preview if requested
      if (this.options.generatePreview) {
        try {
          selectedElement.preview =
            await elementPreviewGenerator.generatePreview(
              element,
              enhancedInfo,
            );
        } catch (error) {
          console.warn("[ElementSelector] Failed to generate preview", error);
        }
      }

      // Generate code snippets if requested
      if (this.options.generateSnippets) {
        try {
          const formats = this.options.snippetFormats || [
            "html",
            "css",
            "react",
          ];
          selectedElement.snippets = formats.map((format) =>
            codeSnippetGenerator.generateSnippet(element, enhancedInfo, format),
          );
        } catch (error) {
          console.warn("[ElementSelector] Failed to generate snippets", error);
        }
      }

      // Sanitize content if requested
      if (this.options.sanitizeContent) {
        try {
          const textContent = element.textContent || "";
          const sanitized = contentSanitizer.sanitize(textContent);
          selectedElement.sanitized = sanitized.redactionCount > 0;

          // Update text content in enhanced info if sanitized
          if (selectedElement.sanitized) {
            enhancedInfo.textContent = sanitized.sanitizedContent;
          }
        } catch (error) {
          console.warn("[ElementSelector] Failed to sanitize content", error);
        }
      }

      results.push(selectedElement);
    }

    return results;
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
  private async handleConfirm(): Promise<void> {
    console.info("[ElementSelector] Processing selected elements...");

    // Show loading indicator
    this.showLoadingIndicator();

    try {
      const selected = await this.getSelectedElements();

      console.info("[ElementSelector] Selection confirmed", {
        count: selected.length,
        hasPreview: selected.some((s) => s.preview),
        hasSnippets: selected.some((s) => s.snippets),
        sanitized: selected.some((s) => s.sanitized),
      });

      if (this.options.onSelect) {
        this.options.onSelect(selected);
      }
    } catch (error) {
      console.error("[ElementSelector] Failed to process selection", error);
      this.showError("Failed to process selected elements");
    } finally {
      this.hideLoadingIndicator();
      this.disable();
    }
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

  /**
   * Show loading indicator
   */
  private showLoadingIndicator(): void {
    if (!this.overlay) return;

    const loading = document.createElement("div");
    loading.id = "ai-pocket-element-selector-loading";
    loading.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 24px 32px;
      border-radius: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 12px;
    `;

    // Add spinner
    const spinner = document.createElement("div");
    spinner.style.cssText = `
      width: 20px;
      height: 20px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    `;

    // Add animation
    const style = document.createElement("style");
    style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    loading.appendChild(spinner);
    loading.appendChild(document.createTextNode("Processing elements..."));

    this.overlay.appendChild(loading);
  }

  /**
   * Hide loading indicator
   */
  private hideLoadingIndicator(): void {
    const loading = document.getElementById(
      "ai-pocket-element-selector-loading",
    );
    if (loading) {
      loading.remove();
    }
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    if (!this.overlay) return;

    const error = document.createElement("div");
    error.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #ef4444;
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
    `;

    error.textContent = message;
    this.overlay.appendChild(error);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      error.remove();
    }, 3000);
  }
}

// Export singleton instance
export const elementSelector = new ElementSelector();
