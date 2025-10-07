/**
 * DOM Analysis Utilities
 * Provides utilities for traversing, analyzing, and extracting content from web pages
 * Requirements: 2.2, 2.5, 3.4
 */

/**
 * Metadata extracted from a web page
 */
export interface PageMetadata {
  title: string;
  description?: string;
  author?: string;
  publishedDate?: string;
  modifiedDate?: string;
  domain: string;
  url: string;
  language?: string;
  keywords?: string[];
  ogImage?: string;
  favicon?: string;
  canonicalUrl?: string;
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

  private readonly HEADING_TAGS = new Set([
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
  ]);

  /**
   * Extract comprehensive metadata from the current page
   * Requirements: 2.5
   */
  extractMetadata(): PageMetadata {
    const metadata: PageMetadata = {
      title: document.title,
      domain: window.location.hostname,
      url: window.location.href,
    };

    // Extract meta tags
    const metaTags = document.querySelectorAll("meta");
    metaTags.forEach((meta) => {
      const name = meta.getAttribute("name") || meta.getAttribute("property");
      const content = meta.getAttribute("content");

      if (!name || !content) return;

      switch (name.toLowerCase()) {
        case "description":
        case "og:description":
          if (!metadata.description) metadata.description = content;
          break;
        case "author":
          if (!metadata.author) metadata.author = content;
          break;
        case "article:published_time":
        case "date":
          if (!metadata.publishedDate) metadata.publishedDate = content;
          break;
        case "article:modified_time":
        case "last-modified":
          if (!metadata.modifiedDate) metadata.modifiedDate = content;
          break;
        case "keywords":
          metadata.keywords = content.split(",").map((k) => k.trim());
          break;
        case "og:image":
          if (!metadata.ogImage) metadata.ogImage = content;
          break;
        case "language":
        case "og:locale":
          if (!metadata.language) metadata.language = content;
          break;
      }
    });

    // Extract language from html tag if not found
    if (!metadata.language) {
      metadata.language =
        document.documentElement.lang || navigator.language || "en";
    }

    // Extract canonical URL
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      const canonicalHref = canonical.getAttribute("href");
      if (canonicalHref) {
        metadata.canonicalUrl = canonicalHref;
      }
    }

    // Extract favicon
    const favicon =
      document.querySelector('link[rel="icon"]') ||
      document.querySelector('link[rel="shortcut icon"]');
    if (favicon) {
      const faviconHref = favicon.getAttribute("href");
      if (faviconHref) {
        metadata.favicon = faviconHref;
      }
    }

    return metadata;
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
    maxDepth: number = 100
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
   * Requirements: 2.2
   */
  getSelectionContext(
    beforeChars: number = 100,
    afterChars: number = 100
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
      startIndex
    );
    const after = fullText.substring(
      startIndex + selectedText.length,
      Math.min(fullText.length, startIndex + selectedText.length + afterChars)
    );

    return `${before}[${selectedText}]${after}`;
  }

  /**
   * Extract structured data (JSON-LD, microdata)
   * Requirements: 2.5
   */
  extractStructuredData(): any[] {
    const structuredData: any[] = [];

    // Extract JSON-LD
    const jsonLdScripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
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
