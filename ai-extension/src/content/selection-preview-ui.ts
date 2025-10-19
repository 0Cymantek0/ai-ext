/**
 * Selection Preview UI
 * Provides a preview and editing interface for captured text selections
 * Requirements: 2.1, 2.2, 2.3
 */

import type { EditablePreview, ValidationResult } from "./content-capture.js";

export interface PreviewUIOptions {
  onSave: (editedText: string) => void;
  onCancel: () => void;
  onEdit?: (text: string) => void;
}

export class SelectionPreviewUI {
  private container: HTMLElement | null = null;
  private preview: EditablePreview | null = null;
  private validation: ValidationResult | null = null;
  private options: PreviewUIOptions | null = null;

  /**
   * Show preview UI for captured selection
   */
  show(
    preview: EditablePreview,
    validation: ValidationResult,
    options: PreviewUIOptions
  ): void {
    this.preview = preview;
    this.validation = validation;
    this.options = options;

    // Remove existing preview if any
    this.hide();

    // Create preview container
    this.container = this.createPreviewContainer();
    document.body.appendChild(this.container);

    // Add event listeners
    this.attachEventListeners();
  }

  /**
   * Hide and remove preview UI
   */
  hide(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.preview = null;
    this.validation = null;
    this.options = null;
  }

  /**
   * Create preview container element
   */
  private createPreviewContainer(): HTMLElement {
    const container = document.createElement("div");
    container.id = "ai-pocket-selection-preview";
    container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 90%;
      max-width: 600px;
      max-height: 80vh;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    // Create header
    const header = this.createHeader();
    container.appendChild(header);

    // Create content area
    const content = this.createContent();
    container.appendChild(content);

    // Create footer with actions
    const footer = this.createFooter();
    container.appendChild(footer);

    // Create backdrop
    const backdrop = document.createElement("div");
    backdrop.id = "ai-pocket-preview-backdrop";
    backdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 999998;
    `;
    backdrop.addEventListener("click", () => this.handleCancel());
    document.body.appendChild(backdrop);

    return container;
  }

  /**
   * Create header section
   */
  private createHeader(): HTMLElement {
    const header = document.createElement("div");
    header.style.cssText = `
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const title = document.createElement("h3");
    title.textContent = "Preview Captured Selection";
    title.style.cssText = `
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #111827;
    `;

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style.cssText = `
      background: none;
      border: none;
      font-size: 28px;
      color: #6b7280;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: background 0.2s;
    `;
    closeBtn.addEventListener("mouseenter", () => {
      closeBtn.style.background = "#f3f4f6";
    });
    closeBtn.addEventListener("mouseleave", () => {
      closeBtn.style.background = "none";
    });
    closeBtn.addEventListener("click", () => this.handleCancel());

    header.appendChild(title);
    header.appendChild(closeBtn);

    return header;
  }

  /**
   * Create content section
   */
  private createContent(): HTMLElement {
    const content = document.createElement("div");
    content.style.cssText = `
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    `;

    // Show validation messages
    if (this.validation && !this.validation.isValid) {
      const errorBox = this.createValidationBox(this.validation);
      content.appendChild(errorBox);
    }

    // Show warnings
    if (this.validation && this.validation.warnings.length > 0) {
      const warningBox = this.createWarningBox(this.validation.warnings);
      content.appendChild(warningBox);
    }

    // Show source location
    if (this.preview?.sourceLocation) {
      const locationInfo = this.createLocationInfo();
      content.appendChild(locationInfo);
    }

    // Show context (before)
    if (this.preview?.context?.before) {
      const beforeContext = this.createContextSection("Before", this.preview.context.before);
      content.appendChild(beforeContext);
    }

    // Show editable text area
    const textArea = this.createTextArea();
    content.appendChild(textArea);

    // Show context (after)
    if (this.preview?.context?.after) {
      const afterContext = this.createContextSection("After", this.preview.context.after);
      content.appendChild(afterContext);
    }

    return content;
  }

  /**
   * Create validation error box
   */
  private createValidationBox(validation: ValidationResult): HTMLElement {
    const box = document.createElement("div");
    box.style.cssText = `
      padding: 12px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      margin-bottom: 16px;
    `;

    const title = document.createElement("div");
    title.textContent = "⚠️ Validation Errors";
    title.style.cssText = `
      font-weight: 600;
      color: #991b1b;
      margin-bottom: 8px;
    `;

    const list = document.createElement("ul");
    list.style.cssText = `
      margin: 0;
      padding-left: 20px;
      color: #991b1b;
    `;

    validation.errors.forEach((error) => {
      const item = document.createElement("li");
      item.textContent = error;
      list.appendChild(item);
    });

    box.appendChild(title);
    box.appendChild(list);

    return box;
  }

  /**
   * Create warning box
   */
  private createWarningBox(warnings: string[]): HTMLElement {
    const box = document.createElement("div");
    box.style.cssText = `
      padding: 12px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      margin-bottom: 16px;
    `;

    const title = document.createElement("div");
    title.textContent = "ℹ️ Warnings";
    title.style.cssText = `
      font-weight: 600;
      color: #92400e;
      margin-bottom: 8px;
    `;

    const list = document.createElement("ul");
    list.style.cssText = `
      margin: 0;
      padding-left: 20px;
      color: #92400e;
    `;

    warnings.forEach((warning) => {
      const item = document.createElement("li");
      item.textContent = warning;
      list.appendChild(item);
    });

    box.appendChild(title);
    box.appendChild(list);

    return box;
  }

  /**
   * Create location info section
   */
  private createLocationInfo(): HTMLElement {
    const info = document.createElement("div");
    info.style.cssText = `
      padding: 12px;
      background: #f9fafb;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 13px;
      color: #6b7280;
    `;

    const url = document.createElement("div");
    url.innerHTML = `<strong>Source:</strong> ${this.preview!.sourceLocation?.url || 'Unknown'}`;
    url.style.cssText = `
      margin-bottom: 4px;
      word-break: break-all;
    `;

    info.appendChild(url);

    if (this.preview!.sourceLocation?.elementPath) {
      const path = document.createElement("div");
      path.innerHTML = `<strong>Element:</strong> ${this.preview!.sourceLocation.elementPath}`;
      path.style.cssText = `
        word-break: break-all;
      `;
      info.appendChild(path);
    }

    return info;
  }

  /**
   * Create context section
   */
  private createContextSection(label: string, text: string): HTMLElement {
    const section = document.createElement("div");
    section.style.cssText = `
      margin-bottom: 12px;
    `;

    const labelEl = document.createElement("div");
    labelEl.textContent = label;
    labelEl.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;

    const textEl = document.createElement("div");
    textEl.textContent = text;
    textEl.style.cssText = `
      padding: 8px 12px;
      background: #f9fafb;
      border-radius: 6px;
      font-size: 14px;
      color: #6b7280;
      font-style: italic;
    `;

    section.appendChild(labelEl);
    section.appendChild(textEl);

    return section;
  }

  /**
   * Create editable text area
   */
  private createTextArea(): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      margin-bottom: 12px;
    `;

    const label = document.createElement("div");
    label.textContent = "Selected Text (Editable)";
    label.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;

    const textarea = document.createElement("textarea");
    textarea.id = "ai-pocket-preview-textarea";
    textarea.value = this.preview?.text || "";
    textarea.style.cssText = `
      width: 100%;
      min-height: 150px;
      padding: 12px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      resize: vertical;
      transition: border-color 0.2s;
    `;
    textarea.addEventListener("focus", () => {
      textarea.style.borderColor = "#3b82f6";
    });
    textarea.addEventListener("blur", () => {
      textarea.style.borderColor = "#e5e7eb";
    });
    textarea.addEventListener("input", () => {
      if (this.options?.onEdit) {
        this.options.onEdit(textarea.value);
      }
    });

    const charCount = document.createElement("div");
    charCount.textContent = `${textarea.value.length} characters`;
    charCount.style.cssText = `
      font-size: 12px;
      color: #6b7280;
      margin-top: 4px;
      text-align: right;
    `;

    textarea.addEventListener("input", () => {
      charCount.textContent = `${textarea.value.length} characters`;
    });

    container.appendChild(label);
    container.appendChild(textarea);
    container.appendChild(charCount);

    return container;
  }

  /**
   * Create footer with action buttons
   */
  private createFooter(): HTMLElement {
    const footer = document.createElement("div");
    footer.style.cssText = `
      padding: 16px 20px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    `;

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = `
      padding: 10px 20px;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      cursor: pointer;
      transition: all 0.2s;
    `;
    cancelBtn.addEventListener("mouseenter", () => {
      cancelBtn.style.background = "#f9fafb";
    });
    cancelBtn.addEventListener("mouseleave", () => {
      cancelBtn.style.background = "white";
    });
    cancelBtn.addEventListener("click", () => this.handleCancel());

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save to Pocket";
    saveBtn.style.cssText = `
      padding: 10px 20px;
      background: #3b82f6;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      color: white;
      cursor: pointer;
      transition: all 0.2s;
    `;
    saveBtn.addEventListener("mouseenter", () => {
      saveBtn.style.background = "#2563eb";
    });
    saveBtn.addEventListener("mouseleave", () => {
      saveBtn.style.background = "#3b82f6";
    });
    saveBtn.addEventListener("click", () => this.handleSave());

    // Disable save button if validation failed
    if (this.validation && !this.validation.isValid) {
      saveBtn.disabled = true;
      saveBtn.style.opacity = "0.5";
      saveBtn.style.cursor = "not-allowed";
    }

    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    return footer;
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    // Handle Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.handleCancel();
        document.removeEventListener("keydown", handleEscape);
      }
    };
    document.addEventListener("keydown", handleEscape);
  }

  /**
   * Handle save action
   */
  private handleSave(): void {
    const textarea = document.getElementById(
      "ai-pocket-preview-textarea"
    ) as HTMLTextAreaElement;

    if (textarea && this.options?.onSave) {
      this.options.onSave(textarea.value);
    }

    this.hide();

    // Remove backdrop
    const backdrop = document.getElementById("ai-pocket-preview-backdrop");
    if (backdrop) {
      backdrop.remove();
    }
  }

  /**
   * Handle cancel action
   */
  private handleCancel(): void {
    if (this.options?.onCancel) {
      this.options.onCancel();
    }

    this.hide();

    // Remove backdrop
    const backdrop = document.getElementById("ai-pocket-preview-backdrop");
    if (backdrop) {
      backdrop.remove();
    }
  }
}

// Export singleton instance
export const selectionPreviewUI = new SelectionPreviewUI();
