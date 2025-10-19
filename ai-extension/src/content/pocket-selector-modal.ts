/**
 * Pocket Selector Modal
 * Injected UI for selecting which pocket to save content to
 * Requirements: 2.1, 7.1
 */

import { logger } from "../background/monitoring.js";

export interface PocketSelectorOptions {
  selectedText: string;
  onPocketSelected: (pocketId: string) => void;
  onCancel: () => void;
}

export class PocketSelectorModal {
  private modal: HTMLDivElement | null = null;
  private options: PocketSelectorOptions | null = null;

  /**
   * Show the pocket selector modal
   */
  async show(options: PocketSelectorOptions): Promise<void> {
    this.options = options;

    // Remove existing modal if any
    this.hide();

    // Create modal container
    this.modal = document.createElement("div");
    this.modal.id = "ai-pocket-selector-modal";
    this.modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    // Create modal content
    const modalContent = document.createElement("div");
    modalContent.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    `;

    // Header
    const header = document.createElement("div");
    header.style.cssText = `
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid #e5e7eb;
    `;
    header.innerHTML = `
      <h2 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #111827;">
        Save to Pocket
      </h2>
      <p style="margin: 0; font-size: 14px; color: #6b7280;">
        Choose a pocket to save the selected text
      </p>
    `;

    // Preview of selected text
    const preview = document.createElement("div");
    preview.style.cssText = `
      margin-bottom: 16px;
      padding: 12px;
      background: #f9fafb;
      border-radius: 8px;
      font-size: 13px;
      color: #374151;
      max-height: 100px;
      overflow-y: auto;
      line-height: 1.5;
    `;
    const previewText = options.selectedText.substring(0, 200);
    preview.textContent = previewText + (options.selectedText.length > 200 ? "..." : "");

    // Pockets list container
    const pocketsContainer = document.createElement("div");
    pocketsContainer.style.cssText = `
      margin-bottom: 16px;
    `;

    // Loading state
    pocketsContainer.innerHTML = `
      <div style="text-align: center; padding: 20px; color: #6b7280;">
        Loading pockets...
      </div>
    `;

    // Buttons
    const buttonsContainer = document.createElement("div");
    buttonsContainer.style.cssText = `
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    `;

    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    cancelButton.style.cssText = `
      padding: 8px 16px;
      border: 1px solid #d1d5db;
      background: white;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      cursor: pointer;
      transition: all 0.2s;
    `;
    cancelButton.onmouseover = () => {
      cancelButton.style.background = "#f9fafb";
    };
    cancelButton.onmouseout = () => {
      cancelButton.style.background = "white";
    };
    cancelButton.onclick = () => {
      this.hide();
      options.onCancel();
    };

    buttonsContainer.appendChild(cancelButton);

    // Assemble modal
    modalContent.appendChild(header);
    modalContent.appendChild(preview);
    modalContent.appendChild(pocketsContainer);
    modalContent.appendChild(buttonsContainer);
    this.modal.appendChild(modalContent);

    // Add to page
    document.body.appendChild(this.modal);

    // Load pockets
    await this.loadPockets(pocketsContainer);

    // Close on backdrop click
    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) {
        this.hide();
        options.onCancel();
      }
    });

    // Close on Escape key
    const escapeHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.hide();
        options.onCancel();
        document.removeEventListener("keydown", escapeHandler);
      }
    };
    document.addEventListener("keydown", escapeHandler);
  }

  /**
   * Load and display pockets
   */
  private async loadPockets(container: HTMLElement): Promise<void> {
    try {
      // Request pockets from background
      const response = await chrome.runtime.sendMessage({
        kind: "POCKET_LIST",
        payload: {},
      });

      if (!response.success || !response.data?.pockets) {
        throw new Error("Failed to load pockets");
      }

      const pockets = response.data.pockets;

      if (pockets.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 20px; color: #6b7280;">
            <p style="margin: 0 0 12px 0;">No pockets found</p>
            <p style="margin: 0; font-size: 13px;">Create a pocket first in the side panel</p>
          </div>
        `;
        return;
      }

      // Clear loading state
      container.innerHTML = "";

      // Create pocket list
      const pocketList = document.createElement("div");
      pocketList.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 300px;
        overflow-y: auto;
      `;

      pockets.forEach((pocket: any) => {
        const pocketItem = document.createElement("button");
        pocketItem.style.cssText = `
          padding: 12px;
          border: 2px solid #e5e7eb;
          background: white;
          border-radius: 8px;
          text-align: left;
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

        // Pocket info
        const pocketInfo = document.createElement("div");
        pocketInfo.style.cssText = `
          flex: 1;
        `;
        pocketInfo.innerHTML = `
          <div style="font-weight: 500; color: #111827; font-size: 14px; margin-bottom: 2px;">
            ${this.escapeHtml(pocket.name)}
          </div>
          <div style="font-size: 12px; color: #6b7280;">
            ${pocket.contentIds?.length || 0} items
          </div>
        `;

        pocketItem.appendChild(colorDot);
        pocketItem.appendChild(pocketInfo);

        // Hover effect
        pocketItem.onmouseover = () => {
          pocketItem.style.borderColor = pocket.color || "#3b82f6";
          pocketItem.style.background = "#f9fafb";
        };
        pocketItem.onmouseout = () => {
          pocketItem.style.borderColor = "#e5e7eb";
          pocketItem.style.background = "white";
        };

        // Click handler
        pocketItem.onclick = () => {
          this.hide();
          if (this.options) {
            this.options.onPocketSelected(pocket.id);
          }
        };

        pocketList.appendChild(pocketItem);
      });

      container.appendChild(pocketList);
    } catch (error) {
      logger.error("PocketSelectorModal", "Failed to load pockets", error);
      container.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #ef4444;">
          Failed to load pockets. Please try again.
        </div>
      `;
    }
  }

  /**
   * Hide and remove the modal
   */
  hide(): void {
    if (this.modal && this.modal.parentNode) {
      this.modal.parentNode.removeChild(this.modal);
    }
    this.modal = null;
    this.options = null;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// Export singleton instance
export const pocketSelectorModal = new PocketSelectorModal();
