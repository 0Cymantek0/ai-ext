/**
 * PDF Processor
 * Extracts text, tables, images, and structure from PDF files
 * Generates LLM-friendly metadata for AI processing
 */

import * as pdfjsLib from "pdfjs-dist";
import { logger } from "./monitoring.js";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
  "pdfjs-dist/build/pdf.worker.mjs",
);

export interface PDFTextItem {
  text: string;
  fontSize: number;
  fontName: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PDFStructuredContent {
  headings: Array<{ level: number; text: string }>;
  paragraphs: string[];
  lists: string[];
  tables: string[];
}

export interface PDFImage {
  data: string; // base64
  width: number;
  height: number;
  pageNumber: number;
}

export interface PDFMetadata {
  text: string; // Full extracted text
  structuredContent: PDFStructuredContent;
  images: PDFImage[];
  pageCount: number;
  extractedAt: number;
  tokenCount: number; // Approximate token count for LLM
}

export class PDFProcessor {
  /**
   * Process PDF file and extract all content
   */
  async processPDF(fileData: string): Promise<PDFMetadata> {
    logger.info("PDFProcessor", "Starting PDF processing");

    try {
      // Convert base64 to Uint8Array
      const binaryString = atob(fileData.split(",")[1] || fileData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;

      logger.info("PDFProcessor", "PDF loaded", { pageCount: pdf.numPages });

      // Extract content from all pages
      const allText: string[] = [];
      const allTextItems: PDFTextItem[] = [];
      const images: PDFImage[] = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);

        // Extract text with positioning
        const textContent = await page.getTextContent();
        const pageTextItems = this.extractTextItems(textContent);
        allTextItems.push(...pageTextItems);

        const pageText = pageTextItems.map((item) => item.text).join(" ");
        allText.push(pageText);

        // Extract images
        const pageImages = await this.extractImages(page, pageNum);
        images.push(...pageImages);
      }

      // Combine all text
      const fullText = allText.join("\n\n");

      // Analyze structure
      const structuredContent = this.analyzeStructure(allTextItems);

      // Calculate approximate token count (rough estimate: 1 token ≈ 4 characters)
      const tokenCount = Math.ceil(fullText.length / 4);

      const metadata: PDFMetadata = {
        text: fullText,
        structuredContent,
        images,
        pageCount: pdf.numPages,
        extractedAt: Date.now(),
        tokenCount,
      };

      logger.info("PDFProcessor", "PDF processing completed", {
        pageCount: pdf.numPages,
        textLength: fullText.length,
        imageCount: images.length,
        tokenCount,
      });

      return metadata;
    } catch (error) {
      logger.error("PDFProcessor", "PDF processing failed", error);
      throw new Error(`Failed to process PDF: ${error}`);
    }
  }

  /**
   * Extract text items with positioning and formatting
   */
  private extractTextItems(textContent: any): PDFTextItem[] {
    const items: PDFTextItem[] = [];

    for (const item of textContent.items) {
      if (item.str && item.str.trim()) {
        items.push({
          text: item.str,
          fontSize: item.height || 12,
          fontName: item.fontName || "unknown",
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        });
      }
    }

    return items;
  }

  /**
   * Analyze document structure (headings, paragraphs, lists, tables)
   */
  private analyzeStructure(textItems: PDFTextItem[]): PDFStructuredContent {
    const headings: Array<{ level: number; text: string }> = [];
    const paragraphs: string[] = [];
    const lists: string[] = [];
    const tables: string[] = [];

    // Sort items by Y position (top to bottom)
    const sortedItems = [...textItems].sort((a, b) => b.y - a.y);

    // Calculate average font size
    const avgFontSize =
      sortedItems.reduce((sum, item) => sum + item.fontSize, 0) /
      sortedItems.length;

    let currentParagraph: string[] = [];
    let currentList: string[] = [];
    let currentTable: string[][] = [];
    let lastY = -1;
    const lineThreshold = 5; // pixels

    for (const item of sortedItems) {
      const text = item.text.trim();
      if (!text) continue;

      // Detect headings (larger font size)
      if (item.fontSize > avgFontSize * 1.2) {
        if (currentParagraph.length > 0) {
          paragraphs.push(currentParagraph.join(" "));
          currentParagraph = [];
        }

        const level = item.fontSize > avgFontSize * 1.5 ? 1 : 2;
        headings.push({ level, text });
        continue;
      }

      // Detect lists (starts with bullet points or numbers)
      if (/^[•\-\*\d+\.)]\s/.test(text)) {
        if (currentParagraph.length > 0) {
          paragraphs.push(currentParagraph.join(" "));
          currentParagraph = [];
        }
        currentList.push(text);
        continue;
      } else if (currentList.length > 0) {
        lists.push(currentList.join("\n"));
        currentList = [];
      }

      // Detect table-like structures (items on same line with spacing)
      const isNewLine =
        lastY === -1 || Math.abs(item.y - lastY) > lineThreshold;

      if (!isNewLine && currentParagraph.length > 0) {
        // Potential table cell
        if (currentTable.length === 0) {
          currentTable.push([currentParagraph.join(" ")]);
          currentParagraph = [];
        }
        const lastRow = currentTable[currentTable.length - 1];
        if (lastRow) {
          lastRow.push(text);
        }
      } else {
        // New line
        const firstRow = currentTable[0];
        if (currentTable.length > 0 && firstRow && firstRow.length > 1) {
          // Convert table to Markdown
          tables.push(this.tableToMarkdown(currentTable));
          currentTable = [];
        }

        if (currentParagraph.length > 0) {
          paragraphs.push(currentParagraph.join(" "));
        }
        currentParagraph = [text];
      }

      lastY = item.y;
    }

    // Flush remaining content
    if (currentParagraph.length > 0) {
      paragraphs.push(currentParagraph.join(" "));
    }
    if (currentList.length > 0) {
      lists.push(currentList.join("\n"));
    }
    const firstRow = currentTable[0];
    if (currentTable.length > 0 && firstRow && firstRow.length > 1) {
      tables.push(this.tableToMarkdown(currentTable));
    }

    return { headings, paragraphs, lists, tables };
  }

  /**
   * Convert table data to Markdown format
   */
  private tableToMarkdown(table: string[][]): string {
    if (table.length === 0) return "";

    const maxCols = Math.max(...table.map((row) => row.length));

    // Normalize rows to have same number of columns
    const normalizedTable = table.map((row) => {
      const normalized = [...row];
      while (normalized.length < maxCols) {
        normalized.push("");
      }
      return normalized;
    });

    // Create Markdown table
    const firstRow = normalizedTable[0];
    if (!firstRow) return "";

    const header = "| " + firstRow.join(" | ") + " |";
    const separator = "|" + firstRow.map(() => "---").join("|") + "|";
    const rows = normalizedTable
      .slice(1)
      .map((row) => "| " + row.join(" | ") + " |");

    return [header, separator, ...rows].join("\n");
  }

  /**
   * Extract images from PDF page
   */
  private async extractImages(page: any, pageNum: number): Promise<PDFImage[]> {
    const images: PDFImage[] = [];

    try {
      const ops = await page.getOperatorList();

      for (let i = 0; i < ops.fnArray.length; i++) {
        // Check for image operations
        if (
          ops.fnArray[i] === pdfjsLib.OPS.paintImageXObject ||
          ops.fnArray[i] === pdfjsLib.OPS.paintInlineImageXObject
        ) {
          try {
            const imageName = ops.argsArray[i][0];
            const image = await page.objs.get(imageName);

            if (image && image.width && image.height) {
              // Convert image to base64
              const canvas = new OffscreenCanvas(image.width, image.height);
              const ctx = canvas.getContext("2d");

              if (ctx && image.data) {
                const imageData = ctx.createImageData(
                  image.width,
                  image.height,
                );
                imageData.data.set(image.data);
                ctx.putImageData(imageData, 0, 0);

                const blob = await canvas.convertToBlob({ type: "image/png" });
                const base64 = await this.blobToBase64(blob);

                images.push({
                  data: base64,
                  width: image.width,
                  height: image.height,
                  pageNumber: pageNum,
                });
              }
            }
          } catch (imgError) {
            logger.warn("PDFProcessor", "Failed to extract image", imgError);
          }
        }
      }
    } catch (error) {
      logger.warn("PDFProcessor", "Failed to extract images from page", error);
    }

    return images;
  }

  /**
   * Convert Blob to base64
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Generate LLM-friendly summary of PDF content
   * This creates a token-efficient representation for Gemini Nano
   */
  generateLLMSummary(metadata: PDFMetadata): string {
    const parts: string[] = [];

    // Add document overview
    parts.push(`PDF Document (${metadata.pageCount} pages)`);
    parts.push("");

    // Add headings structure
    if (metadata.structuredContent.headings.length > 0) {
      parts.push("## Document Structure");
      for (const heading of metadata.structuredContent.headings) {
        const prefix = "#".repeat(heading.level + 1);
        parts.push(`${prefix} ${heading.text}`);
      }
      parts.push("");
    }

    // Add key paragraphs (first few)
    if (metadata.structuredContent.paragraphs.length > 0) {
      parts.push("## Content Summary");
      const keyParagraphs = metadata.structuredContent.paragraphs.slice(0, 5);
      parts.push(keyParagraphs.join("\n\n"));

      if (metadata.structuredContent.paragraphs.length > 5) {
        parts.push(
          `\n... (${metadata.structuredContent.paragraphs.length - 5} more paragraphs)`,
        );
      }
      parts.push("");
    }

    // Add tables
    if (metadata.structuredContent.tables.length > 0) {
      parts.push("## Tables");
      for (const table of metadata.structuredContent.tables) {
        parts.push(table);
        parts.push("");
      }
    }

    // Add lists
    if (metadata.structuredContent.lists.length > 0) {
      parts.push("## Lists");
      for (const list of metadata.structuredContent.lists) {
        parts.push(list);
        parts.push("");
      }
    }

    // Add image count
    if (metadata.images.length > 0) {
      parts.push(`## Images: ${metadata.images.length} images found`);
    }

    return parts.join("\n");
  }
}

// Export singleton instance
export const pdfProcessor = new PDFProcessor();
