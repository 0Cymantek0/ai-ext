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
  private static isShowing: boolean = false;

  /**
   * Show pocket selector and wait for user selection
   */
  async show(pockets: Pocket[]): Promise<string | null> {
    // Prevent multiple instances from showing simultaneously
    if (PocketSelector.isShowing) {
      console.warn(
        "[PocketSelector] Already showing, ignoring duplicate request",
      );
      return null;
    }

    PocketSelector.isShowing = true;

    return new Promise((resolve) => {
      this.resolveSelection = (pocketId: string | null) => {
        PocketSelector.isShowing = false;
        resolve(pocketId);
      };
      this.createUI(pockets);
    });
  }

  /**
   * Create the pocket selector UI
   */
  private createUI(pockets: Pocket[]): void {
    // Remove existing overlay if any
    this.cleanup();

    // Also remove any orphaned overlays from previous instances
    const existingOverlay = document.getElementById("pocket-selector-overlay");
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // Create overlay
    this.overlay = document.createElement("div");
    this.overlay.id = "pocket-selector-overlay";
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(15, 23, 42, 0.45);
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
      position: relative;
      background: rgba(15, 23, 42, 0.88);
      border-radius: 18px;
      border: 1px solid rgba(148, 163, 184, 0.22);
      box-shadow: 0 30px 60px -20px rgba(15, 23, 42, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.06);
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      animation: slideUp 0.3s ease-out;
    `;

    // Header
    const header = document.createElement("div");
    header.style.cssText = `
      padding: 24px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.22);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(to bottom, rgba(17, 24, 39, 0.9), rgba(15, 23, 42, 0.65));
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
      background: rgba(148, 163, 184, 0.08);
      border: 1px solid transparent;
      font-size: 22px;
      color: #d1d5db;
      cursor: pointer;
      padding: 0;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 9999px;
      transition: all 0.2s;
    `;
    const applyCloseHighlight = () => {
      closeBtn.style.background = "rgba(148, 163, 184, 0.18)";
      closeBtn.style.color = "#f9fafb";
      closeBtn.style.borderColor = "rgba(148, 163, 184, 0.35)";
    };
    const resetCloseHighlight = () => {
      closeBtn.style.background = "rgba(148, 163, 184, 0.08)";
      closeBtn.style.color = "#d1d5db";
      closeBtn.style.borderColor = "transparent";
    };
    closeBtn.onmouseover = applyCloseHighlight;
    closeBtn.onfocus = applyCloseHighlight;
    closeBtn.onmouseout = resetCloseHighlight;
    closeBtn.onblur = resetCloseHighlight;
    closeBtn.onclick = () => this.handleCancel();

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Pocket list container
    const listContainer = document.createElement("div");
    listContainer.style.cssText = `
      padding: 20px;
      overflow-y: auto;
      flex: 1;
      background: rgba(15, 23, 42, 0.55);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
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
      border-top: 1px solid rgba(148, 163, 184, 0.22);
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    `;

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = `
      padding: 10px 20px;
      border: 1px solid rgba(148, 163, 184, 0.35);
      background: rgba(148, 163, 184, 0.16);
      color: #e5e7eb;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    `;
    const applyCancelHighlight = () => {
      cancelBtn.style.background = "rgba(148, 163, 184, 0.24)";
      cancelBtn.style.borderColor = "rgba(148, 163, 184, 0.5)";
    };
    const resetCancelHighlight = () => {
      cancelBtn.style.background = "rgba(148, 163, 184, 0.16)";
      cancelBtn.style.borderColor = "rgba(148, 163, 184, 0.35)";
    };
    cancelBtn.onmouseover = applyCancelHighlight;
    cancelBtn.onfocus = applyCancelHighlight;
    cancelBtn.onmouseout = resetCancelHighlight;
    cancelBtn.onblur = resetCancelHighlight;
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
    const baseBackground = "rgba(15, 23, 42, 0.6)";
    const baseBorderColor = "rgba(148, 163, 184, 0.25)";
    const baseBoxShadow = "inset 0 1px 0 rgba(255, 255, 255, 0.04)";
    const accentColor = pocket.color || "#3b82f6";

    const item = document.createElement("div");
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-label", `Save to ${pocket.name}`);
    item.style.cssText = `
      padding: 18px;
      margin-bottom: 12px;
      border: 1px solid ${baseBorderColor};
      border-radius: 14px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 16px;
      background: ${baseBackground};
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: ${baseBoxShadow};
      transform: translateY(0);
    `;

    // Color indicator
    const colorDot = document.createElement("div");
    colorDot.style.cssText = `
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: ${accentColor};
      flex-shrink: 0;
      box-shadow: 0 0 0 4px ${accentColor}26;
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
      color: rgba(209, 213, 219, 0.72);
    `;

    textContainer.appendChild(name);
    textContainer.appendChild(description);

    item.appendChild(colorDot);
    item.appendChild(textContainer);

    const applyHoverState = () => {
      item.style.borderColor = accentColor;
      item.style.background = "rgba(30, 41, 59, 0.75)";
      item.style.transform = "translateY(-2px)";
      item.style.boxShadow = `0 18px 35px -18px ${accentColor}80, inset 0 1px 0 rgba(255, 255, 255, 0.08)`;
    };

    const resetState = () => {
      item.style.borderColor = baseBorderColor;
      item.style.background = baseBackground;
      item.style.transform = "translateY(0)";
      item.style.boxShadow = baseBoxShadow;
    };

    // Hover & focus effects
    item.onmouseover = applyHoverState;
    item.onfocus = applyHoverState;
    item.onmouseout = resetState;
    item.onblur = resetState;

    // Click handler
    item.onclick = () => this.handleSelection(pocket.id);
    item.onkeydown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.handleSelection(pocket.id);
      }
    };

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
