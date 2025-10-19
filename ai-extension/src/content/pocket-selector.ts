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
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: fadeIn 0.2s ease-out;
    `;

    // Create modal
    const modal = document.createElement("div");
    modal.style.cssText = `
      background: #1f2937;
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      border: 1px solid #374151;
      animation: slideUp 0.3s ease-out;
    `;

    // Header
    const header = document.createElement("div");
    header.style.cssText = `
      padding: 24px;
      border-bottom: 1px solid #374151;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(to bottom, #1f2937, #111827);
    `;

    const title = document.createElement("h2");
    title.textContent = "Save to Pocket";
    title.style.cssText = `
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      color: #f9fafb;
      letter-spacing: -0.5px;
    `;

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = `
      background: none;
      border: none;
      font-size: 24px;
      color: #9ca3af;
      cursor: pointer;
      padding: 0;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      transition: all 0.2s;
    `;
    closeBtn.onmouseover = () => {
      closeBtn.style.background = "#374151";
      closeBtn.style.color = "#f9fafb";
    };
    closeBtn.onmouseout = () => {
      closeBtn.style.background = "none";
      closeBtn.style.color = "#9ca3af";
    };
    closeBtn.onclick = () => this.handleCancel();

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Pocket list container
    const listContainer = document.createElement("div");
    listContainer.style.cssText = `
      padding: 20px;
      overflow-y: auto;
      flex: 1;
      background: #111827;
    `;

    // Create pocket items
    pockets.forEach((pocket) => {
      const item = this.createPocketItem(pocket);
      listContainer.appendChild(item);
    });

    // Footer
    const footer = document.createElement("div");
    footer.style.cssText = `
      padding: 20px 24px;
      border-top: 1px solid #374151;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      background: #1f2937;
    `;

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = `
      padding: 10px 20px;
      border: 1px solid #4b5563;
      background: #374151;
      color: #f9fafb;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    `;
    cancelBtn.onmouseover = () => {
      cancelBtn.style.background = "#4b5563";
      cancelBtn.style.borderColor = "#6b7280";
    };
    cancelBtn.onmouseout = () => {
      cancelBtn.style.background = "#374151";
      cancelBtn.style.borderColor = "#4b5563";
    };
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
      padding: 18px;
      margin-bottom: 12px;
      border: 2px solid #374151;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 16px;
      background: #1f2937;
    `;

    // Color indicator
    const colorDot = document.createElement("div");
    colorDot.style.cssText = `
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: ${pocket.color || "#3b82f6"};
      flex-shrink: 0;
      box-shadow: 0 0 0 3px ${pocket.color || "#3b82f6"}33;
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
      font-weight: 600;
      color: #f9fafb;
      margin-bottom: 4px;
    `;

    const description = document.createElement("div");
    description.textContent = pocket.description || "No description";
    description.style.cssText = `
      font-size: 13px;
      color: #9ca3af;
    `;

    textContainer.appendChild(name);
    textContainer.appendChild(description);

    item.appendChild(colorDot);
    item.appendChild(textContainer);

    // Hover effects
    item.onmouseover = () => {
      item.style.borderColor = pocket.color || "#3b82f6";
      item.style.background = "#374151";
      item.style.transform = "translateY(-2px)";
      item.style.boxShadow = `0 4px 12px ${pocket.color || "#3b82f6"}40`;
    };
    item.onmouseout = () => {
      item.style.borderColor = "#374151";
      item.style.background = "#1f2937";
      item.style.transform = "translateY(0)";
      item.style.boxShadow = "none";
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
