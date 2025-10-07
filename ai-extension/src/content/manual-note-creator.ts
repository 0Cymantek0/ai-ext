/**
 * Manual Note Creator Module
 * Implements manual note creation interface with formatting options
 * Requirements: 2.1, 2.5
 */

import { domAnalyzer } from "./dom-analyzer.js";
import { contentSanitizer } from "./content-sanitizer.js";
import type { CapturedContent } from "./content-capture.js";

/**
 * Note formatting options
 */
export interface NoteFormattingOptions {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  heading?: 1 | 2 | 3;
  list?: "ordered" | "unordered";
}

/**
 * Note creator state
 */
interface NoteCreatorState {
  isActive: boolean;
  modal: HTMLElement | null;
  editor: HTMLElement | null;
  toolbar: HTMLElement | null;
  overlay: HTMLElement | null;
}

/**
 * Manual Note Creator UI class
 * Implements note input interface with formatting toolbar
 * Requirements: 2.1, 2.5
 */
export class ManualNoteCreatorUI {
  private state: NoteCreatorState = {
    isActive: false,
    modal: null,
    editor: null,
    toolbar: null,
    overlay: null,
  };

  private readonly MODAL_CLASS = "ai-pocket-note-modal";
  private readonly OVERLAY_CLASS = "ai-pocket-note-overlay";
  private readonly TOOLBAR_CLASS = "ai-pocket-note-toolbar";
  private readonly EDITOR_CLASS = "ai-pocket-note-editor";

  /**
   * Open note creation interface
   * Requirements: 2.1
   */
  openNoteCreator(): void {
    if (this.state.isActive) {
      console.warn("[ManualNoteCreator] Note creator already active");
      return;
    }

    console.info("[ManualNoteCreator] Opening note creator");

    try {
      // Inject styles
      this.injectStyles();

      // Create overlay
      this.state.overlay = this.createOverlay();
      document.body.appendChild(this.state.overlay);

      // Create modal
      this.state.modal = this.createModal();
      document.body.appendChild(this.state.modal);

      // Focus editor
      if (this.state.editor) {
        this.state.editor.focus();
      }

      this.state.isActive = true;

      console.info("[ManualNoteCreator] Note creator opened");
    } catch (error) {
      console.error("[ManualNoteCreator] Failed to open note creator", error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * Close note creation interface
   */
  closeNoteCreator(): void {
    if (!this.state.isActive) {
      console.warn("[ManualNoteCreator] Note creator not active");
      return;
    }

    console.info("[ManualNoteCreator] Closing note creator");
    this.cleanup();
    console.info("[ManualNoteCreator] Note creator closed");
  }

  /**
   * Create overlay backdrop
   */
  private createOverlay(): HTMLElement {
    const overlay = document.createElement("div");
    overlay.className = this.OVERLAY_CLASS;
    overlay.setAttribute("data-ai-pocket-note-overlay", "true");
    overlay.addEventListener("click", () => this.handleCancel());

    return overlay;
  }

  /**
   * Create modal with editor and toolbar
   * Requirements: 2.1, 2.5
   */
  private createModal(): HTMLElement {
    const modal = document.createElement("div");
    modal.className = this.MODAL_CLASS;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-label", "Create manual note");
    modal.setAttribute("data-ai-pocket-note-modal", "true");

    // Header
    const header = document.createElement("div");
    header.className = "note-modal-header";

    const title = document.createElement("h2");
    title.textContent = "Create Note";
    title.className = "note-modal-title";

    const closeBtn = document.createElement("button");
    closeBtn.className = "note-close-btn";
    closeBtn.innerHTML = "×";
    closeBtn.setAttribute("aria-label", "Close note creator");
    closeBtn.addEventListener("click", () => this.handleCancel());

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Toolbar
    this.state.toolbar = this.createToolbar();

    // Editor
    this.state.editor = this.createEditor();

    // Footer with action buttons
    const footer = this.createFooter();

    modal.appendChild(header);
    modal.appendChild(this.state.toolbar);
    modal.appendChild(this.state.editor);
    modal.appendChild(footer);

    // Prevent clicks inside modal from closing it
    modal.addEventListener("click", (e) => e.stopPropagation());

    return modal;
  }

  /**
   * Create formatting toolbar
   * Requirements: 2.5
   */
  private createToolbar(): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.className = this.TOOLBAR_CLASS;
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Text formatting options");

    // Bold button
    const boldBtn = this.createFormatButton("Bold", "B", "bold", () =>
      this.applyFormat("bold")
    );

    // Italic button
    const italicBtn = this.createFormatButton("Italic", "I", "italic", () =>
      this.applyFormat("italic")
    );

    // Underline button
    const underlineBtn = this.createFormatButton("Underline", "U", "underline", () =>
      this.applyFormat("underline")
    );

    // Separator
    const separator1 = document.createElement("div");
    separator1.className = "toolbar-separator";

    // Heading buttons
    const h1Btn = this.createFormatButton("Heading 1", "H1", "heading", () =>
      this.applyFormat("formatBlock", "h1")
    );

    const h2Btn = this.createFormatButton("Heading 2", "H2", "heading", () =>
      this.applyFormat("formatBlock", "h2")
    );

    const h3Btn = this.createFormatButton("Heading 3", "H3", "heading", () =>
      this.applyFormat("formatBlock", "h3")
    );

    // Separator
    const separator2 = document.createElement("div");
    separator2.className = "toolbar-separator";

    // List buttons
    const ulBtn = this.createFormatButton("Bullet List", "•", "list", () =>
      this.applyFormat("insertUnorderedList")
    );

    const olBtn = this.createFormatButton("Numbered List", "1.", "list", () =>
      this.applyFormat("insertOrderedList")
    );

    toolbar.appendChild(boldBtn);
    toolbar.appendChild(italicBtn);
    toolbar.appendChild(underlineBtn);
    toolbar.appendChild(separator1);
    toolbar.appendChild(h1Btn);
    toolbar.appendChild(h2Btn);
    toolbar.appendChild(h3Btn);
    toolbar.appendChild(separator2);
    toolbar.appendChild(ulBtn);
    toolbar.appendChild(olBtn);

    return toolbar;
  }

  /**
   * Create a formatting button
   */
  private createFormatButton(
    label: string,
    text: string,
    className: string,
    onClick: () => void
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = `toolbar-btn ${className}-btn`;
    button.textContent = text;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.type = "button";
    button.addEventListener("click", (e) => {
      e.preventDefault();
      onClick();
      // Return focus to editor
      if (this.state.editor) {
        this.state.editor.focus();
      }
    });

    return button;
  }

  /**
   * Create contenteditable editor
   * Requirements: 2.1
   */
  private createEditor(): HTMLElement {
    const editor = document.createElement("div");
    editor.className = this.EDITOR_CLASS;
    editor.contentEditable = "true";
    editor.setAttribute("role", "textbox");
    editor.setAttribute("aria-label", "Note content");
    editor.setAttribute("aria-multiline", "true");
    editor.setAttribute("data-placeholder", "Start typing your note...");

    // Handle keyboard shortcuts
    editor.addEventListener("keydown", (e) => this.handleEditorKeydown(e));

    return editor;
  }

  /**
   * Create footer with action buttons
   */
  private createFooter(): HTMLElement {
    const footer = document.createElement("div");
    footer.className = "note-modal-footer";

    // Character count
    const charCount = document.createElement("span");
    charCount.className = "char-count";
    charCount.textContent = "0 characters";
    charCount.setAttribute("aria-live", "polite");

    // Update character count on input
    if (this.state.editor) {
      this.state.editor.addEventListener("input", () => {
        const text = this.state.editor?.textContent || "";
        charCount.textContent = `${text.length} character${text.length !== 1 ? "s" : ""}`;
      });
    }

    // Cancel button
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "note-action-btn cancel-btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", () => this.handleCancel());

    // Save button
    const saveBtn = document.createElement("button");
    saveBtn.className = "note-action-btn save-btn";
    saveBtn.textContent = "Save Note";
    saveBtn.type = "button";
    saveBtn.addEventListener("click", () => this.handleSave());

    footer.appendChild(charCount);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    return footer;
  }

  /**
   * Apply formatting to selected text
   * Requirements: 2.5
   */
  private applyFormat(command: string, value?: string): void {
    try {
      document.execCommand(command, false, value);
      console.debug("[ManualNoteCreator] Applied format", { command, value });
    } catch (error) {
      console.error("[ManualNoteCreator] Failed to apply format", error);
    }
  }

  /**
   * Handle keyboard shortcuts in editor
   */
  private handleEditorKeydown(event: KeyboardEvent): void {
    // Ctrl/Cmd + B for bold
    if ((event.ctrlKey || event.metaKey) && event.key === "b") {
      event.preventDefault();
      this.applyFormat("bold");
    }

    // Ctrl/Cmd + I for italic
    if ((event.ctrlKey || event.metaKey) && event.key === "i") {
      event.preventDefault();
      this.applyFormat("italic");
    }

    // Ctrl/Cmd + U for underline
    if ((event.ctrlKey || event.metaKey) && event.key === "u") {
      event.preventDefault();
      this.applyFormat("underline");
    }

    // Ctrl/Cmd + S to save
    if ((event.ctrlKey || event.metaKey) && event.key === "s") {
      event.preventDefault();
      this.handleSave();
    }

    // ESC to cancel
    if (event.key === "Escape") {
      event.preventDefault();
      this.handleCancel();
    }
  }

  /**
   * Handle cancel action
   */
  private handleCancel(): void {
    const hasContent = this.state.editor?.textContent?.trim().length || 0;

    if (hasContent > 0) {
      const confirmed = confirm("Discard note? Your changes will be lost.");
      if (!confirmed) {
        return;
      }
    }

    this.closeNoteCreator();
  }

  /**
   * Handle save action
   * Requirements: 2.1, 2.5
   */
  private async handleSave(): Promise<void> {
    if (!this.state.editor) {
      console.error("[ManualNoteCreator] Editor not found");
      return;
    }

    const content = this.state.editor.innerHTML;
    const textContent = this.state.editor.textContent || "";

    if (textContent.trim().length === 0) {
      alert("Please enter some content for your note.");
      return;
    }

    console.info("[ManualNoteCreator] Saving note");

    try {
      // Create captured content
      const capturedNote = await this.createCapturedNote(content, textContent);

      // Close note creator
      this.closeNoteCreator();

      // Dispatch event with captured note
      window.dispatchEvent(
        new CustomEvent("ai-pocket-note-created", {
          detail: {
            note: capturedNote,
            timestamp: Date.now(),
          },
        })
      );

      console.info("[ManualNoteCreator] Note saved successfully");
    } catch (error) {
      console.error("[ManualNoteCreator] Failed to save note", error);
      alert("Failed to save note. Please try again.");
    }
  }

  /**
   * Create captured content from note
   * Requirements: 2.1, 2.5
   */
  private async createCapturedNote(
    htmlContent: string,
    textContent: string
  ): Promise<CapturedContent> {
    // Extract metadata
    const metadata = domAnalyzer.extractMetadata();

    // Sanitize content
    const sanitizationResult = contentSanitizer.sanitize(textContent);

    // Build captured content object
    const capturedContent: CapturedContent = {
      id: this.generateId(),
      type: "note",
      url: window.location.href,
      title: document.title,
      capturedAt: Date.now(),
      metadata: {
        ...metadata,
        noteHtml: htmlContent,
        noteLength: textContent.length,
        wordCount: textContent.split(/\s+/).filter((w) => w.length > 0).length,
      } as any,
      text: {
        content: textContent,
        wordCount: textContent.split(/\s+/).filter((w) => w.length > 0).length,
        characterCount: textContent.length,
        paragraphs: textContent.split("\n").filter((p) => p.trim().length > 0),
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

    console.debug("[ManualNoteCreator] Created captured note", {
      textLength: textContent.length,
      wordCount: capturedContent.text.wordCount,
      sanitized: sanitizationResult.redactionCount > 0,
    });

    return capturedContent;
  }

  /**
   * Generate unique ID for captured content
   */
  private generateId(): string {
    return `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Inject CSS styles for note creator
   */
  private injectStyles(): void {
    // Check if styles already injected
    if (document.getElementById("ai-pocket-note-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "ai-pocket-note-styles";
    style.textContent = `
      /* Overlay */
      .${this.OVERLAY_CLASS} {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 2147483645;
        backdrop-filter: blur(2px);
      }

      /* Modal */
      .${this.MODAL_CLASS} {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        max-width: 700px;
        max-height: 80vh;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        z-index: 2147483646;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }

      /* Header */
      .note-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        border-bottom: 1px solid #e0e0e0;
      }

      .note-modal-title {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #333;
      }

      .note-close-btn {
        background: none;
        border: none;
        font-size: 32px;
        line-height: 1;
        color: #666;
        cursor: pointer;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s;
      }

      .note-close-btn:hover {
        background: #f5f5f5;
        color: #333;
      }

      /* Toolbar */
      .${this.TOOLBAR_CLASS} {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 12px 16px;
        border-bottom: 1px solid #e0e0e0;
        background: #f9f9f9;
        flex-wrap: wrap;
      }

      .toolbar-btn {
        padding: 6px 12px;
        border: 1px solid #d0d0d0;
        background: white;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        min-width: 36px;
      }

      .toolbar-btn:hover {
        background: #f0f0f0;
        border-color: #b0b0b0;
      }

      .toolbar-btn:active {
        background: #e0e0e0;
      }

      .toolbar-separator {
        width: 1px;
        height: 24px;
        background: #d0d0d0;
        margin: 0 4px;
      }

      /* Editor */
      .${this.EDITOR_CLASS} {
        flex: 1;
        padding: 20px 24px;
        overflow-y: auto;
        font-size: 15px;
        line-height: 1.6;
        color: #333;
        outline: none;
        min-height: 200px;
      }

      .${this.EDITOR_CLASS}:empty:before {
        content: attr(data-placeholder);
        color: #999;
        font-style: italic;
      }

      .${this.EDITOR_CLASS} h1 {
        font-size: 28px;
        font-weight: 700;
        margin: 16px 0 12px;
        color: #222;
      }

      .${this.EDITOR_CLASS} h2 {
        font-size: 22px;
        font-weight: 600;
        margin: 14px 0 10px;
        color: #333;
      }

      .${this.EDITOR_CLASS} h3 {
        font-size: 18px;
        font-weight: 600;
        margin: 12px 0 8px;
        color: #444;
      }

      .${this.EDITOR_CLASS} p {
        margin: 8px 0;
      }

      .${this.EDITOR_CLASS} ul,
      .${this.EDITOR_CLASS} ol {
        margin: 8px 0;
        padding-left: 24px;
      }

      .${this.EDITOR_CLASS} li {
        margin: 4px 0;
      }

      .${this.EDITOR_CLASS} strong {
        font-weight: 700;
      }

      .${this.EDITOR_CLASS} em {
        font-style: italic;
      }

      .${this.EDITOR_CLASS} u {
        text-decoration: underline;
      }

      /* Footer */
      .note-modal-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 24px;
        border-top: 1px solid #e0e0e0;
        background: #f9f9f9;
      }

      .char-count {
        font-size: 13px;
        color: #666;
      }

      .note-action-btn {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        margin-left: 8px;
      }

      .cancel-btn {
        background: #e0e0e0;
        color: #333;
      }

      .cancel-btn:hover {
        background: #d0d0d0;
      }

      .save-btn {
        background: #4285f4;
        color: white;
      }

      .save-btn:hover {
        background: #3367d6;
      }

      .save-btn:active {
        background: #2851a3;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Cleanup all UI elements and event listeners
   */
  private cleanup(): void {
    // Remove modal
    if (this.state.modal && this.state.modal.parentNode) {
      this.state.modal.parentNode.removeChild(this.state.modal);
    }

    // Remove overlay
    if (this.state.overlay && this.state.overlay.parentNode) {
      this.state.overlay.parentNode.removeChild(this.state.overlay);
    }

    // Reset state
    this.state = {
      isActive: false,
      modal: null,
      editor: null,
      toolbar: null,
      overlay: null,
    };
  }

  /**
   * Check if note creator is active
   */
  isActive(): boolean {
    return this.state.isActive;
  }

  /**
   * Get current note content
   */
  getNoteContent(): { html: string; text: string } | null {
    if (!this.state.editor) {
      return null;
    }

    return {
      html: this.state.editor.innerHTML,
      text: this.state.editor.textContent || "",
    };
  }
}

// Export singleton instance
export const manualNoteCreator = new ManualNoteCreatorUI();
