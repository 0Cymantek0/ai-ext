/**
 * Element Preview Generator
 * Generates visual previews of captured elements before saving
 * Requirements: 2.2, 2.3, 2.4, 39
 */

import type { EnhancedElementInfo } from "./element-extractor.js";

/**
 * Preview options
 */
export interface PreviewOptions {
  includeStyles?: boolean;
  includeChildren?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  backgroundColor?: string;
}

/**
 * Generated preview
 */
export interface ElementPreview {
  html: string;
  dataUrl: string;
  thumbnail: string;
  dimensions: {
    width: number;
    height: number;
  };
}

/**
 * Element Preview Generator class
 */
export class ElementPreviewGenerator {
  private readonly defaultOptions: Required<PreviewOptions> = {
    includeStyles: true,
    includeChildren: true,
    maxWidth: 800,
    maxHeight: 600,
    backgroundColor: "#ffffff",
  };

  /**
   * Generate preview for an element
   * Requirements: 2.2, 2.3, 2.4
   */
  async generatePreview(
    element: HTMLElement,
    elementInfo: EnhancedElementInfo,
    options: PreviewOptions = {}
  ): Promise<ElementPreview> {
    const opts = { ...this.defaultOptions, ...options };

    // Clone the element for preview
    const clone = element.cloneNode(opts.includeChildren) as HTMLElement;

    // Apply styles to clone
    if (opts.includeStyles) {
      this.applyStyles(clone, elementInfo);
    }

    // Generate HTML preview
    const html = this.generateHTMLPreview(clone, elementInfo);

    // Generate visual preview (data URL)
    const dataUrl = await this.generateVisualPreview(clone, opts);

    // Generate thumbnail
    const thumbnail = await this.generateThumbnail(clone, opts);

    return {
      html,
      dataUrl,
      thumbnail,
      dimensions: {
        width: elementInfo.dimensions.width,
        height: elementInfo.dimensions.height,
      },
    };
  }

  /**
   * Generate HTML preview with styles
   * Requirements: 2.3, 2.4
   */
  private generateHTMLPreview(
    element: HTMLElement,
    elementInfo: EnhancedElementInfo
  ): string {
    const parts: string[] = [];

    // Add element info header
    parts.push(`<!-- Element: ${elementInfo.tagName} -->`);
    parts.push(`<!-- Selector: ${elementInfo.selector} -->`);
    parts.push("");

    // Add styles
    parts.push("<style>");
    parts.push(this.generateCSSFromComputedStyles(elementInfo));
    parts.push("</style>");
    parts.push("");

    // Add HTML
    parts.push(element.outerHTML);

    return parts.join("\n");
  }

  /**
   * Generate CSS from computed styles
   * Requirements: 2.3, 2.4
   */
  private generateCSSFromComputedStyles(
    elementInfo: EnhancedElementInfo
  ): string {
    const styles = elementInfo.computedStyles;
    const selector = `.preview-${elementInfo.tagName.toLowerCase()}`;

    const cssProperties: string[] = [];

    // Add important visual properties
    const importantProps = [
      "display",
      "position",
      "width",
      "height",
      "margin",
      "padding",
      "border",
      "backgroundColor",
      "color",
      "fontSize",
      "fontFamily",
      "fontWeight",
      "lineHeight",
      "textAlign",
      "boxShadow",
      "borderRadius",
      "opacity",
    ];

    for (const prop of importantProps) {
      const value = styles[prop as keyof typeof styles];
      if (value && value !== "none" && value !== "0px") {
        const cssProp = this.camelToKebab(prop);
        cssProperties.push(`  ${cssProp}: ${value};`);
      }
    }

    // Add flexbox properties if applicable
    if (styles.display?.includes("flex")) {
      if (styles.flexDirection)
        cssProperties.push(`  flex-direction: ${styles.flexDirection};`);
      if (styles.flexWrap) cssProperties.push(`  flex-wrap: ${styles.flexWrap};`);
      if (styles.justifyContent)
        cssProperties.push(`  justify-content: ${styles.justifyContent};`);
      if (styles.alignItems)
        cssProperties.push(`  align-items: ${styles.alignItems};`);
      if (styles.gap) cssProperties.push(`  gap: ${styles.gap};`);
    }

    // Add grid properties if applicable
    if (styles.display?.includes("grid")) {
      if (styles.gridTemplateColumns)
        cssProperties.push(
          `  grid-template-columns: ${styles.gridTemplateColumns};`
        );
      if (styles.gridTemplateRows)
        cssProperties.push(`  grid-template-rows: ${styles.gridTemplateRows};`);
      if (styles.gap) cssProperties.push(`  gap: ${styles.gap};`);
    }

    return `${selector} {\n${cssProperties.join("\n")}\n}`;
  }

  /**
   * Convert camelCase to kebab-case
   */
  private camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  }

  /**
   * Apply styles to cloned element
   * Requirements: 2.3, 2.4
   */
  private applyStyles(
    element: HTMLElement,
    elementInfo: EnhancedElementInfo
  ): void {
    const styles = elementInfo.computedStyles;

    // Apply computed styles as inline styles
    Object.entries(styles).forEach(([key, value]) => {
      if (value && value !== "none") {
        element.style.setProperty(this.camelToKebab(key), value);
      }
    });
  }

  /**
   * Generate visual preview as data URL
   * Requirements: 2.3, 2.4
   */
  private async generateVisualPreview(
    element: HTMLElement,
    options: Required<PreviewOptions>
  ): Promise<string> {
    try {
      // Create a canvas to render the element
      const canvas = document.createElement("canvas");
      const rect = element.getBoundingClientRect();

      // Calculate scaled dimensions
      const scale = Math.min(
        options.maxWidth / rect.width,
        options.maxHeight / rect.height,
        1
      );

      canvas.width = rect.width * scale;
      canvas.height = rect.height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      // Fill background
      ctx.fillStyle = options.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Scale context
      ctx.scale(scale, scale);

      // Draw element (simplified - in production, use html2canvas or similar)
      const computedStyle = window.getComputedStyle(element);
      ctx.fillStyle = computedStyle.backgroundColor || "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);

      // Add text content if available
      const text = element.textContent?.trim();
      if (text) {
        ctx.fillStyle = computedStyle.color || "#000000";
        ctx.font = `${computedStyle.fontSize} ${computedStyle.fontFamily}`;
        ctx.fillText(text.substring(0, 100), 10, 30);
      }

      return canvas.toDataURL("image/png");
    } catch (error) {
      console.warn("[ElementPreview] Failed to generate visual preview", error);
      return "";
    }
  }

  /**
   * Generate thumbnail preview
   * Requirements: 2.3
   */
  private async generateThumbnail(
    element: HTMLElement,
    options: Required<PreviewOptions>
  ): Promise<string> {
    try {
      const canvas = document.createElement("canvas");
      const thumbnailSize = 150;

      canvas.width = thumbnailSize;
      canvas.height = thumbnailSize;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      // Fill background
      ctx.fillStyle = options.backgroundColor;
      ctx.fillRect(0, 0, thumbnailSize, thumbnailSize);

      // Draw simplified representation
      const computedStyle = window.getComputedStyle(element);
      ctx.fillStyle = computedStyle.backgroundColor || "#f0f0f0";
      ctx.fillRect(10, 10, thumbnailSize - 20, thumbnailSize - 20);

      // Add element tag name
      ctx.fillStyle = "#666666";
      ctx.font = "12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(
        element.tagName.toLowerCase(),
        thumbnailSize / 2,
        thumbnailSize / 2
      );

      return canvas.toDataURL("image/png");
    } catch (error) {
      console.warn("[ElementPreview] Failed to generate thumbnail", error);
      return "";
    }
  }

  /**
   * Generate interactive preview HTML
   * Requirements: 2.3, 2.4
   */
  generateInteractivePreview(
    elementInfo: EnhancedElementInfo,
    preview: ElementPreview
  ): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Element Preview - ${elementInfo.tagName}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .preview-container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .preview-header {
      background: #2563eb;
      color: white;
      padding: 16px 24px;
    }
    .preview-header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }
    .preview-info {
      padding: 16px 24px;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
    }
    .preview-info-item {
      margin: 8px 0;
      font-size: 14px;
    }
    .preview-info-label {
      font-weight: 600;
      color: #374151;
    }
    .preview-content {
      padding: 24px;
    }
    .preview-visual {
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 16px;
      background: white;
      margin-bottom: 24px;
    }
    .preview-visual img {
      max-width: 100%;
      height: auto;
      display: block;
    }
    .preview-code {
      background: #1f2937;
      color: #f9fafb;
      padding: 16px;
      border-radius: 4px;
      overflow-x: auto;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="preview-container">
    <div class="preview-header">
      <h1>Element Preview: ${elementInfo.tagName}</h1>
    </div>
    <div class="preview-info">
      <div class="preview-info-item">
        <span class="preview-info-label">Selector:</span> ${elementInfo.selector}
      </div>
      <div class="preview-info-item">
        <span class="preview-info-label">Dimensions:</span> ${preview.dimensions.width}px × ${preview.dimensions.height}px
      </div>
      <div class="preview-info-item">
        <span class="preview-info-label">Position:</span> ${elementInfo.computedStyles.position}
      </div>
    </div>
    <div class="preview-content">
      <h2>Visual Preview</h2>
      <div class="preview-visual">
        <img src="${preview.dataUrl}" alt="Element preview" />
      </div>
      <h2>HTML Code</h2>
      <pre class="preview-code">${this.escapeHtml(preview.html)}</pre>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Escape HTML for display
   */
  private escapeHtml(html: string): string {
    return html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// Export singleton instance
export const elementPreviewGenerator = new ElementPreviewGenerator();
