/**
 * DOM Analysis Utilities
 * Provides utilities for traversing, analyzing, and extracting content from web pages
 * Requirements: 2.2, 2.5, 3.4
 */

/**
 * Metadata extracted from a web page
 */
export interface PageMetadata {
  url: string;
  timestamp: number;
}

/**
 * Extracted text content with context
 */
export interface ExtractedText {
  content: string;
  wordCount: number;
  characterCount: number;
  paragraphs: string[];
  headings: Array<{ level: number; text: string }>;
  links: Array<{ text: string; href: string }>;
  images: Array<{ alt: string; src: string }>;
  lists: Array<{ type: 'ordered' | 'unordered'; items: string[] }>;
  tables: Array<{ headers: string[]; rows: string[][] }>;
}

/**
 * Element information for specific element capture
 */
export interface ElementInfo {
  tagName: string;
  textContent: string;
  innerHTML: string;
  attributes: Record<string, string>;
  selector: string;
  boundingRect: DOMRect;
}

/**
 * Detailed selection information with context
 * Requirements: 2.1, 2.2, 2.3
 */
export interface DetailedSelection {
  text: string;
  htmlContent: string;
  beforeContext: string;
  afterContext: string;
  elementPath: string;
  containerTag: string;
  position: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  url: string;
  timestamp: number;
}

/**
 * DOM traversal options
 */
export interface TraversalOptions {
  maxDepth?: number;
  skipHidden?: boolean;
  skipScripts?: boolean;
  skipStyles?: boolean;
  includeMetadata?: boolean;
}

/**
 * DOM Analyzer class for extracting and analyzing web page content
 */
export class DOMAnalyzer {
  private readonly SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "IFRAME",
    "OBJECT",
    "EMBED",
  ]);

  private readonly HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

  /**
   * Extract comprehensive metadata from the current page
   * Requirements: 2.5
   */
  extractMetadata(): PageMetadata {
    return {
      url: window.location.href,
      timestamp: Date.now(),
    };
  }

  /**
   * Extract all text content from the page with structure
   * Requirements: 2.2, 3.4
   */
  extractText(options: TraversalOptions = {}): ExtractedText {
    const {
      skipHidden = true,
      skipScripts = true,
      skipStyles = true,
    } = options;

    const result: ExtractedText = {
      content: "",
      wordCount: 0,
      characterCount: 0,
      paragraphs: [],
      headings: [],
      links: [],
      images: [],
      lists: [],
      tables: [],
    };

    // Extract main content
    const mainContent = this.findMainContent();
    const textNodes: string[] = [];

    // Traverse and extract text
    this.traverseDOM(mainContent, (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text && text.length > 0) {
          textNodes.push(text);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;

        // Skip hidden elements if requested
        if (skipHidden && this.isHidden(element)) {
          return false;
        }

        // Skip scripts and styles if requested
        if (
          (skipScripts && element.tagName === "SCRIPT") ||
          (skipStyles && element.tagName === "STYLE")
        ) {
          return false;
        }

        // Extract headings
        if (this.HEADING_TAGS.has(element.tagName)) {
          const level = parseInt(element.tagName.charAt(1));
          const text = element.textContent?.trim();
          if (text) {
            result.headings.push({ level, text });
          }
        }

        // Extract paragraphs
        if (element.tagName === "P") {
          const text = element.textContent?.trim();
          if (text && text.length > 0) {
            result.paragraphs.push(text);
          }
        }

        // Extract links
        if (element.tagName === "A") {
          const href = element.getAttribute("href");
          const text = element.textContent?.trim();
          if (href && text) {
            result.links.push({ text, href });
          }
        }

        // Extract images
        if (element.tagName === "IMG") {
          const src = element.getAttribute("src");
          const alt = element.getAttribute("alt") || "";
          if (src) {
            result.images.push({ alt, src });
          }
        }

        // Extract lists
        if (element.tagName === "UL" || element.tagName === "OL") {
          const listType = element.tagName === "OL" ? "ordered" : "unordered";
          const items: string[] = [];
          const listItems = element.querySelectorAll(":scope > li");
          listItems.forEach((li) => {
            const text = li.textContent?.trim();
            if (text) items.push(text);
          });
          if (items.length > 0) {
            result.lists.push({ type: listType, items });
          }
        }

        // Extract tables
        if (element.tagName === "TABLE") {
          const headers: string[] = [];
          const rows: string[][] = [];

          // Extract headers
          const headerCells = element.querySelectorAll("thead th, thead td");
          headerCells.forEach((cell) => {
            const text = cell.textContent?.trim();
            if (text) headers.push(text);
          });

          // If no thead, try first row
          if (headers.length === 0) {
            const firstRow = element.querySelector("tr");
            if (firstRow) {
              const cells = firstRow.querySelectorAll("th, td");
              cells.forEach((cell) => {
                const text = cell.textContent?.trim();
                if (text) headers.push(text);
              });
            }
          }

          // Extract rows
          const bodyRows = element.querySelectorAll("tbody tr, tr");
          bodyRows.forEach((row, index) => {
            // Skip first row if it was used as headers
            if (index === 0 && headers.length > 0 && !element.querySelector("thead")) {
              return;
            }

            const rowData: string[] = [];
            const cells = row.querySelectorAll("td, th");
            cells.forEach((cell) => {
              const text = cell.textContent?.trim();
              rowData.push(text || "");
            });

            if (rowData.length > 0) {
              rows.push(rowData);
            }
          });

          if (headers.length > 0 || rows.length > 0) {
            result.tables.push({ headers, rows });
          }
        }
      }

      return true;
    });

    // Combine all text
    result.content = textNodes.join(" ");
    result.characterCount = result.content.length;
    result.wordCount = this.countWords(result.content);

    return result;
  }

  /**
   * Extract text from a specific selection
   * Requirements: 2.2
   */
  extractSelection(): ExtractedText | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const container = range.cloneContents();

    // Create temporary div to extract content
    const tempDiv = document.createElement("div");
    tempDiv.appendChild(container);

    const result: ExtractedText = {
      content: tempDiv.textContent?.trim() || "",
      wordCount: 0,
      characterCount: 0,
      paragraphs: [],
      headings: [],
      links: [],
      images: [],
      lists: [],
      tables: [],
    };

    // Extract structured content from selection
    const paragraphs = tempDiv.querySelectorAll("p");
    paragraphs.forEach((p) => {
      const text = p.textContent?.trim();
      if (text) result.paragraphs.push(text);
    });

    const headings = tempDiv.querySelectorAll("h1, h2, h3, h4, h5, h6");
    headings.forEach((h) => {
      const level = parseInt(h.tagName.charAt(1));
      const text = h.textContent?.trim();
      if (text) result.headings.push({ level, text });
    });

    const links = tempDiv.querySelectorAll("a");
    links.forEach((a) => {
      const href = a.getAttribute("href");
      const text = a.textContent?.trim();
      if (href && text) result.links.push({ text, href });
    });

    const images = tempDiv.querySelectorAll("img");
    images.forEach((img) => {
      const src = img.getAttribute("src");
      const alt = img.getAttribute("alt") || "";
      if (src) result.images.push({ alt, src });
    });

    // Extract lists from selection
    const lists = tempDiv.querySelectorAll("ul, ol");
    lists.forEach((list) => {
      const listType = list.tagName === "OL" ? "ordered" : "unordered";
      const items: string[] = [];
      const listItems = list.querySelectorAll(":scope > li");
      listItems.forEach((li) => {
        const text = li.textContent?.trim();
        if (text) items.push(text);
      });
      if (items.length > 0) {
        result.lists.push({ type: listType, items });
      }
    });

    // Extract tables from selection
    const tables = tempDiv.querySelectorAll("table");
    tables.forEach((table) => {
      const headers: string[] = [];
      const rows: string[][] = [];

      const headerCells = table.querySelectorAll("thead th, thead td");
      headerCells.forEach((cell) => {
        const text = cell.textContent?.trim();
        if (text) headers.push(text);
      });

      if (headers.length === 0) {
        const firstRow = table.querySelector("tr");
        if (firstRow) {
          const cells = firstRow.querySelectorAll("th, td");
          cells.forEach((cell) => {
            const text = cell.textContent?.trim();
            if (text) headers.push(text);
          });
        }
      }

      const bodyRows = table.querySelectorAll("tbody tr, tr");
      bodyRows.forEach((row, index) => {
        if (index === 0 && headers.length > 0 && !table.querySelector("thead")) {
          return;
        }

        const rowData: string[] = [];
        const cells = row.querySelectorAll("td, th");
        cells.forEach((cell) => {
          const text = cell.textContent?.trim();
          rowData.push(text || "");
        });

        if (rowData.length > 0) {
          rows.push(rowData);
        }
      });

      if (headers.length > 0 || rows.length > 0) {
        result.tables.push({ headers, rows });
      }
    });

    result.characterCount = result.content.length;
    result.wordCount = this.countWords(result.content);

    return result;
  }

  /**
   * Extract information about a specific element
   * Requirements: 2.2
   */
  extractElement(element: Element): ElementInfo {
    const attributes: Record<string, string> = {};
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      if (attr) {
        attributes[attr.name] = attr.value;
      }
    }

    return {
      tagName: element.tagName,
      textContent: element.textContent?.trim() || "",
      innerHTML: element.innerHTML,
      attributes,
      selector: this.generateSelector(element),
      boundingRect: element.getBoundingClientRect(),
    };
  }

  /**
   * Traverse the DOM tree with a callback
   * Requirements: 2.2
   */
  private traverseDOM(
    node: Node,
    callback: (node: Node) => boolean | void,
    depth: number = 0,
    maxDepth: number = 100,
  ): void {
    if (depth > maxDepth) return;

    // Skip certain tags
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      this.SKIP_TAGS.has((node as Element).tagName)
    ) {
      return;
    }

    // Call callback and check if we should continue
    const shouldContinue = callback(node);
    if (shouldContinue === false) return;

    // Traverse children
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child) {
        this.traverseDOM(child, callback, depth + 1, maxDepth);
      }
    }
  }

  /**
   * Find the main content area of the page
   * Requirements: 2.2, 3.4
   */
  private findMainContent(): Element {
    // Try common main content selectors
    const selectors = [
      "main",
      '[role="main"]',
      "article",
      "#content",
      "#main",
      ".content",
      ".main",
      ".post-content",
      ".article-content",
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && this.hasSignificantContent(element)) {
        return element;
      }
    }

    // Fallback to body
    return document.body;
  }

  /**
   * Check if an element has significant content
   */
  private hasSignificantContent(element: Element): boolean {
    const text = element.textContent?.trim() || "";
    return text.length > 100;
  }

  /**
   * Check if an element is hidden
   */
  private isHidden(element: Element): boolean {
    const style = window.getComputedStyle(element);
    return (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0" ||
      (element as HTMLElement).hidden
    );
  }

  /**
   * Generate a unique CSS selector for an element
   * Requirements: 2.2
   */
  private generateSelector(element: Element): string {
    // If element has an ID, use it
    if (element.id) {
      return `#${element.id}`;
    }

    // Build path from element to root
    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      // Add class if available
      if (current.className && typeof current.className === "string") {
        const classes = current.className
          .trim()
          .split(/\s+/)
          .filter((c) => c.length > 0);
        if (classes.length > 0) {
          selector += `.${classes.join(".")}`;
        }
      }

      // Add nth-child if needed for uniqueness
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children);
        const index = siblings.indexOf(current);
        if (siblings.filter((s) => s.tagName === current!.tagName).length > 1) {
          selector += `:nth-child(${index + 1})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(" > ");
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter((word) => word.length > 0).length;
  }

  /**
   * Get selection context (surrounding text)
   * Requirements: 2.2, 2.3
   */
  getSelectionContext(
    beforeChars: number = 200,
    afterChars: number = 200,
  ): string | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;

    // Get the full text of the container
    const fullText =
      container.nodeType === Node.TEXT_NODE
        ? container.textContent || ""
        : (container as Element).textContent || "";

    const selectedText = selection.toString();
    const startIndex = fullText.indexOf(selectedText);

    if (startIndex === -1) return null;

    const before = fullText.substring(
      Math.max(0, startIndex - beforeChars),
      startIndex,
    );
    const after = fullText.substring(
      startIndex + selectedText.length,
      Math.min(fullText.length, startIndex + selectedText.length + afterChars),
    );

    return `${before}[${selectedText}]${after}`;
  }

  /**
   * Extract detailed selection information with context
   * Requirements: 2.1, 2.2, 2.3
   */
  extractDetailedSelection(
    contextChars: number = 200
  ): DetailedSelection | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.toString().trim() === "") {
      return null;
    }

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString();
    
    // Get the container element
    let containerElement = range.commonAncestorContainer;
    if (containerElement.nodeType === Node.TEXT_NODE) {
      containerElement = containerElement.parentElement || containerElement;
    }

    // Extract surrounding context
    const fullText = (containerElement as Element).textContent || "";
    const startIndex = fullText.indexOf(selectedText);
    
    let beforeContext = "";
    let afterContext = "";
    
    if (startIndex !== -1) {
      beforeContext = fullText.substring(
        Math.max(0, startIndex - contextChars),
        startIndex
      ).trim();
      
      afterContext = fullText.substring(
        startIndex + selectedText.length,
        Math.min(fullText.length, startIndex + selectedText.length + contextChars)
      ).trim();
    }

    // Get HTML content to preserve formatting
    const tempDiv = document.createElement("div");
    tempDiv.appendChild(range.cloneContents());
    const htmlContent = tempDiv.innerHTML;

    // Get element path for source location
    const elementPath = this.generateSelector(containerElement as Element);

    // Get bounding rect for position information
    const rect = range.getBoundingClientRect();

    return {
      text: selectedText,
      htmlContent,
      beforeContext,
      afterContext,
      elementPath,
      containerTag: (containerElement as Element).tagName,
      position: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
      url: window.location.href,
      timestamp: Date.now(),
    };
  }

  /**
   * Extract multiple selections with batch processing
   * Requirements: 2.1, 2.2, 2.3
   */
  extractMultipleSelections(
    contextChars: number = 200
  ): DetailedSelection[] {
    const selections: DetailedSelection[] = [];
    const selection = window.getSelection();
    
    if (!selection) {
      return selections;
    }

    // Process all ranges in the selection
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i);
      const selectedText = range.toString().trim();
      
      if (!selectedText) {
        continue;
      }

      // Get the container element
      let containerElement = range.commonAncestorContainer;
      if (containerElement.nodeType === Node.TEXT_NODE) {
        containerElement = containerElement.parentElement || containerElement;
      }

      // Extract surrounding context
      const fullText = (containerElement as Element).textContent || "";
      const startIndex = fullText.indexOf(selectedText);
      
      let beforeContext = "";
      let afterContext = "";
      
      if (startIndex !== -1) {
        beforeContext = fullText.substring(
          Math.max(0, startIndex - contextChars),
          startIndex
        ).trim();
        
        afterContext = fullText.substring(
          startIndex + selectedText.length,
          Math.min(fullText.length, startIndex + selectedText.length + contextChars)
        ).trim();
      }

      // Get HTML content to preserve formatting
      const tempDiv = document.createElement("div");
      tempDiv.appendChild(range.cloneContents());
      const htmlContent = tempDiv.innerHTML;

      // Get element path for source location
      const elementPath = this.generateSelector(containerElement as Element);

      // Get bounding rect for position information
      const rect = range.getBoundingClientRect();

      selections.push({
        text: selectedText,
        htmlContent,
        beforeContext,
        afterContext,
        elementPath,
        containerTag: (containerElement as Element).tagName,
        position: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
        url: window.location.href,
        timestamp: Date.now(),
      });
    }

    return selections;
  }

  /**
   * Get element path as array of selectors
   * Requirements: 2.3
   */
  getElementPath(element: Element): string[] {
    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break; // ID is unique, no need to go further
      }

      if (current.className && typeof current.className === "string") {
        const classes = current.className
          .trim()
          .split(/\s+/)
          .filter((c) => c.length > 0);
        if (classes.length > 0) {
          selector += `.${classes[0]}`; // Use first class for brevity
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path;
  }

  /**
   * Extract structured data (JSON-LD, microdata)
   * Requirements: 2.5
   */
  extractStructuredData(): any[] {
    const structuredData: any[] = [];

    // Extract JSON-LD
    const jsonLdScripts = document.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    jsonLdScripts.forEach((script) => {
      try {
        const data = JSON.parse(script.textContent || "");
        structuredData.push(data);
      } catch (error) {
        console.warn("[DOMAnalyzer] Failed to parse JSON-LD", error);
      }
    });

    return structuredData;
  }

  /**
   * Format extracted text with proper structure
   * Requirements: 2.2, 2.5
   */
  formatExtractedContent(extracted: ExtractedText): string {
    const parts: string[] = [];

    // Add headings with hierarchy
    if (extracted.headings.length > 0) {
      parts.push("=== HEADINGS ===");
      extracted.headings.forEach((heading) => {
        const indent = "  ".repeat(heading.level - 1);
        parts.push(`${indent}${heading.text}`);
      });
      parts.push("");
    }

    // Add main content
    if (extracted.content) {
      parts.push("=== CONTENT ===");
      parts.push(extracted.content);
      parts.push("");
    }

    // Add lists
    if (extracted.lists.length > 0) {
      parts.push("=== LISTS ===");
      extracted.lists.forEach((list, index) => {
        parts.push(`List ${index + 1} (${list.type}):`);
        list.items.forEach((item, itemIndex) => {
          const prefix = list.type === "ordered" ? `${itemIndex + 1}.` : "•";
          parts.push(`  ${prefix} ${item}`);
        });
        parts.push("");
      });
    }

    // Add tables
    if (extracted.tables.length > 0) {
      parts.push("=== TABLES ===");
      extracted.tables.forEach((table, index) => {
        parts.push(`Table ${index + 1}:`);
        if (table.headers.length > 0) {
          parts.push(`Headers: ${table.headers.join(" | ")}`);
        }
        table.rows.forEach((row, rowIndex) => {
          parts.push(`Row ${rowIndex + 1}: ${row.join(" | ")}`);
        });
        parts.push("");
      });
    }

    // Add links
    if (extracted.links.length > 0) {
      parts.push("=== LINKS ===");
      extracted.links.forEach((link) => {
        parts.push(`${link.text}: ${link.href}`);
      });
      parts.push("");
    }

    // Add images
    if (extracted.images.length > 0) {
      parts.push("=== IMAGES ===");
      extracted.images.forEach((image) => {
        parts.push(`${image.alt || "Image"}: ${image.src}`);
      });
      parts.push("");
    }

    return parts.join("\n");
  }

  /**
   * Analyze page readability
   * Requirements: 3.4
   */
  analyzeReadability(): {
    textLength: number;
    averageWordLength: number;
    averageSentenceLength: number;
    readingTimeMinutes: number;
  } {
    const text = this.extractText().content;
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    const totalChars = words.reduce((sum, word) => sum + word.length, 0);
    const averageWordLength = words.length > 0 ? totalChars / words.length : 0;
    const averageSentenceLength =
      sentences.length > 0 ? words.length / sentences.length : 0;

    // Estimate reading time (average 200 words per minute)
    const readingTimeMinutes = Math.ceil(words.length / 200);

    return {
      textLength: text.length,
      averageWordLength,
      averageSentenceLength,
      readingTimeMinutes,
    };
  }
}

// Export singleton instance
export const domAnalyzer = new DOMAnalyzer();
