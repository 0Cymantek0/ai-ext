/**
 * Context Menu Capture Handler
 * Handles capturing selected text when triggered from context menu
 * Requirements: 2.1, 7.1, 7.2
 */

import { logger } from "../background/monitoring.js";
import { pocketSelectorModal } from "./pocket-selector-modal.js";

export class ContextMenuCaptureHandler {
  /**
   * Initialize the context menu capture handler
   * NOTE: This handler is deprecated. The new pocket selector is handled in content-main.ts
   */
  initialize(): void {
    // Deprecated - pocket selector is now handled in content-main.ts
    logger.info("ContextMenuCaptureHandler", "Deprecated - using new pocket selector in content-main.ts");
  }

  /**
   * Handle showing pocket selector and capturing content
   */
  private async handleShowPocketSelector(payload: any): Promise<any> {
    try {
      // Get selected text
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim() || "";

      if (!selectedText) {
        throw new Error("No text selected");
      }

      logger.info("ContextMenuCaptureHandler", "Selected text captured", {
        length: selectedText.length,
      });

      // Extract metadata
      const metadata = this.extractMetadata(selectedText, selection);

      // Show pocket selector and wait for user choice
      return new Promise((resolve, reject) => {
        pocketSelectorModal.show({
          selectedText,
          onPocketSelected: async (pocketId: string) => {
            try {
              // Save to selected pocket
              const result = await this.saveToPocket(pocketId, selectedText, metadata);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          },
          onCancel: () => {
            reject(new Error("User cancelled"));
          },
        });
      });
    } catch (error) {
      logger.error("ContextMenuCaptureHandler", "Error in handleShowPocketSelector", error);
      throw error;
    }
  }

  /**
   * Extract metadata from selected text and page context
   */
  private extractMetadata(selectedText: string, selection: Selection | null): any {
    const metadata: any = {
      // Page metadata
      url: window.location.href,
      title: document.title,
      domain: window.location.hostname,
      timestamp: Date.now(),
      
      // Selection metadata
      selectedText: selectedText,
      textLength: selectedText.length,
      
      // Context around selection
      selectionContext: this.getSelectionContext(selection),
      
      // Page structure
      pageLanguage: document.documentElement.lang || "unknown",
      
      // Additional metadata
      author: this.extractAuthor(),
      publishDate: this.extractPublishDate(),
      description: this.extractDescription(),
      keywords: this.extractKeywords(),
    };

    return metadata;
  }

  /**
   * Get context around the selection (surrounding text)
   */
  private getSelectionContext(selection: Selection | null): any {
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    try {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      
      // Get parent element
      const parentElement = container.nodeType === Node.TEXT_NODE 
        ? container.parentElement 
        : container as Element;

      if (!parentElement) {
        return null;
      }

      // Get surrounding text
      const fullText = parentElement.textContent || "";
      const selectedText = selection.toString();
      const startIndex = fullText.indexOf(selectedText);

      if (startIndex === -1) {
        return null;
      }

      // Get 100 characters before and after
      const beforeText = fullText.substring(Math.max(0, startIndex - 100), startIndex);
      const afterText = fullText.substring(
        startIndex + selectedText.length,
        Math.min(fullText.length, startIndex + selectedText.length + 100)
      );

      return {
        before: beforeText,
        after: afterText,
        elementTag: parentElement.tagName.toLowerCase(),
        elementClass: parentElement.className,
        elementId: parentElement.id,
      };
    } catch (error) {
      logger.warn("ContextMenuCaptureHandler", "Failed to get selection context", error);
      return null;
    }
  }

  /**
   * Extract author from page metadata
   */
  private extractAuthor(): string | null {
    // Try meta tags
    const authorMeta = document.querySelector('meta[name="author"]') as HTMLMetaElement;
    if (authorMeta?.content) {
      return authorMeta.content;
    }

    // Try Open Graph
    const ogAuthor = document.querySelector('meta[property="article:author"]') as HTMLMetaElement;
    if (ogAuthor?.content) {
      return ogAuthor.content;
    }

    // Try Twitter Card
    const twitterAuthor = document.querySelector('meta[name="twitter:creator"]') as HTMLMetaElement;
    if (twitterAuthor?.content) {
      return twitterAuthor.content;
    }

    return null;
  }

  /**
   * Extract publish date from page metadata
   */
  private extractPublishDate(): string | null {
    // Try meta tags
    const dateMeta = document.querySelector('meta[property="article:published_time"]') as HTMLMetaElement;
    if (dateMeta?.content) {
      return dateMeta.content;
    }

    // Try other common meta tags
    const datePublished = document.querySelector('meta[name="date"]') as HTMLMetaElement;
    if (datePublished?.content) {
      return datePublished.content;
    }

    return null;
  }

  /**
   * Extract description from page metadata
   */
  private extractDescription(): string | null {
    const descMeta = document.querySelector('meta[name="description"]') as HTMLMetaElement;
    if (descMeta?.content) {
      return descMeta.content;
    }

    const ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement;
    if (ogDesc?.content) {
      return ogDesc.content;
    }

    return null;
  }

  /**
   * Extract keywords from page metadata
   */
  private extractKeywords(): string[] {
    const keywordsMeta = document.querySelector('meta[name="keywords"]') as HTMLMetaElement;
    if (keywordsMeta?.content) {
      return keywordsMeta.content.split(",").map(k => k.trim()).filter(k => k);
    }

    return [];
  }

  /**
   * Save captured content to pocket
   */
  private async saveToPocket(pocketId: string, selectedText: string, metadata: any): Promise<any> {
    try {
      logger.info("ContextMenuCaptureHandler", "Saving to pocket", {
        pocketId,
        textLength: selectedText.length,
      });

      // Send capture request to background
      const response = await chrome.runtime.sendMessage({
        kind: "CAPTURE_REQUEST",
        payload: {
          mode: "selection",
          pocketId: pocketId,
          content: {
            text: selectedText,
            type: "text/plain",
          },
          metadata: metadata,
        },
      });

      if (!response.success) {
        throw new Error(response.error?.message || "Failed to save content");
      }

      logger.info("ContextMenuCaptureHandler", "Content saved successfully", {
        contentId: response.data?.contentId,
      });

      // Show success notification
      this.showNotification("Saved to Pocket", "Text saved successfully!");

      return response.data;
    } catch (error) {
      logger.error("ContextMenuCaptureHandler", "Failed to save to pocket", error);
      this.showNotification("Save Failed", "Failed to save text to pocket", true);
      throw error;
    }
  }

  /**
   * Show notification to user
   */
  private showNotification(title: string, message: string, isError: boolean = false): void {
    // Create notification element
    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${isError ? "#ef4444" : "#10b981"};
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      max-width: 300px;
      animation: slideIn 0.3s ease-out;
    `;

    notification.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
      <div style="opacity: 0.9;">${message}</div>
    `;

    // Add animation
    const style = document.createElement("style");
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = "slideIn 0.3s ease-out reverse";
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
        if (style.parentNode) {
          style.parentNode.removeChild(style);
        }
      }, 300);
    }, 3000);
  }
}

// Export singleton instance
export const contextMenuCaptureHandler = new ContextMenuCaptureHandler();
