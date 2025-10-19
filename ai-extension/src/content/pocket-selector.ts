/**
 * Pocket Selector UI
 * Shows a modal dialog for selecting a pocket to save content to
 */

export interface Pocket {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

export class PocketSelector {
  private overlay: HTMLDivElement | null = null;
  private resolveSelection: ((pocketId: string | null) => void) | null = null;

  /**
   * Show pocket selector and wait for user selection
   */
  async show(pockets: Pocket[]): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolveSelection = resolve;
      this.createUI(pockets);
    });
  }

  /**
   * Create the pocket selector UI
   */
  private createUI(pockets: Pocket[]): void {
    // Remove existing overlay if any
    this.cleanup();

    // Create overlay
    this.overlay = document.createElement("div");
    this.overlay.id = "pocket-selector-overlay";
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    // Create modal
    const modal = document.createElement("div");
    modal.style.cssText = `
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;

    // Header
    const header = document.createElement("div");
    header.style.cssText = `
      padding: 20px 24px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const title = document.createElement("h2");
    title.textContent = "Save to Pocket";
    title.style.cssText = `
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #111827;
    `;

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = `
      background: none;
      border: none;
      font-size: 24px;
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
    closeBtn.onmouseover = () => (closeBtn.style.background = "#f3f4f6");
    closeBtn.onmouseout = () => (closeBtn.style.background = "none");
    closeBtn.onclick = () => this.handleCancel();

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Pocket list container
    const listContainer = document.createElement("div");
    listContainer.style.cssText = `
      padding: 16px;
      overflow-y: auto;
      flex: 1;
    `;

    // Create pocket items
    pockets.forEach((pocket) => {
      const item = this.createPocketItem(pocket);
      listContainer.appendChild(item);
    });

    // Footer
    const footer = document.createElement("div");
    footer.style.cssText = `
      padding: 16px 24px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    `;

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = `
      padding: 8px 16px;
      border: 1px solid #d1d5db;
      background: white;
      color: #374151;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    `;
    cancelBtn.onmouseover = () => (cancelBtn.style.background = "#f9fafb");
    cancelBtn.onmouseout = () => (cancelBtn.style.background = "white");
    cancelBtn.onclick = () => this.handleCancel();

    footer.appendChild(cancelBtn);

    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(listContainer);
    modal.appendChild(footer);

    this.overlay.appendChild(modal);
    document.body.appendChild(this.overlay);

    // Handle ESC key
    document.addEventListener("keydown", this.handleKeyDown);
  }

  /**
   * Create a pocket item element
   */
  private createPocketItem(pocket: Pocket): HTMLDivElement {
    const item = document.createElement("div");
    item.style.cssText = `
      padding: 16px;
      margin-bottom: 8px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 12px;
    `;

    // Color indicator
    const colorDot = document.createElement("div");
    colorDot.style.cssText = `
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: ${pocket.color || "#3b82f6"};
      flex-shrink: 0;
    `;

    // Text content
    const textContainer = document.createElement("div");
    textContainer.style.cssText = `
      flex: 1;
    `;

    const name = document.createElement("div");
    name.textContent = pocket.name;
    name.style.cssText = `
      font-size: 16px;
      font-weight: 500;
      color: #111827;
      margin-bottom: 4px;
    `;

    const description = document.createElement("div");
    description.textContent = pocket.description || "";
    description.style.cssText = `
      font-size: 14px;
      color: #6b7280;
    `;

    textContainer.appendChild(name);
    if (pocket.description) {
      textContainer.appendChild(description);
    }

    item.appendChild(colorDot);
    item.appendChild(textContainer);

    // Hover effects
    item.onmouseover = () => {
      item.style.borderColor = pocket.color || "#3b82f6";
      item.style.background = "#f9fafb";
    };
    item.onmouseout = () => {
      item.style.borderColor = "#e5e7eb";
      item.style.background = "white";
    };

    // Click handler
    item.onclick = () => this.handleSelection(pocket.id);

    return item;
  }

  /**
   * Handle pocket selection
   */
  private handleSelection(pocketId: string): void {
    if (this.resolveSelection) {
      this.resolveSelection(pocketId);
    }
    this.cleanup();
  }

  /**
   * Handle cancel
   */
  private handleCancel(): void {
    if (this.resolveSelection) {
      this.resolveSelection(null);
    }
    this.cleanup();
  }

  /**
   * Handle keyboard events
   */
  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      this.handleCancel();
    }
  };

  /**
   * Clean up the UI
   */
  private cleanup(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    document.removeEventListener("keydown", this.handleKeyDown);
    this.resolveSelection = null;
  }
}
