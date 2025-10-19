import { describe, it, expect, vi } from "vitest";
import { ContentCapture, type CaptureOptions } from "../ContentCapture.js";
import type { IDOMAnalyzer, IContentSanitizer, IMediaCapture, IReliableSelectionCapture } from "../ContentCapture.js";

function createDeps() {
  const dom: IDOMAnalyzer = {
    extractMetadata: () => ({ title: "Test Page", domain: "example.com", url: "https://example.com" }),
    extractText: () => ({ 
      content: "Full page content", 
      wordCount: 3, 
      characterCount: 17, 
      paragraphs: [], 
      headings: [], 
      links: [], 
      images: [], 
      lists: [], 
      tables: [] 
    }),
    extractStructuredData: () => [],
    analyzeReadability: () => ({ textLength: 17, averageWordLength: 5, averageSentenceLength: 10, readingTimeMinutes: 1 }),
    extractSelection: () => ({ 
      content: "Selected text", 
      wordCount: 2, 
      characterCount: 13, 
      paragraphs: [], 
      headings: [], 
      links: [], 
      images: [], 
      lists: [], 
      tables: [] 
    }),
    extractDetailedSelection: (n?: number) => null,
    getSelectionContext: (b: number, a: number) => "before [Selected text] after" as any,
  };

  const sanitizer: IContentSanitizer = {
    sanitize: (s: string) => ({ 
      sanitizedContent: s.replace(/\S+@\S+/, "[EMAIL_REDACTED]"), 
      redactionCount: /@/.test(s) ? 1 : 0, 
      detectedPII: /@/.test(s) ? [{ type: "EMAIL" }] as any : [] 
    })
  };

  const media: IMediaCapture = {
    captureAllMedia: async () => ({ 
      images: [], 
      audios: [], 
      videos: [], 
      totalSize: 0, 
      capturedAt: Date.now() 
    })
  };

  const selection: IReliableSelectionCapture = {
    captureWithReliability: async (op) => await op(),
  };

  const messenger = {
    captureScreenshot: vi.fn(async () => "data:image/png;base64,snap"),
  };

  return { dom, sanitizer, media, selection, messenger };
}

describe("ContentCapture.captureWithPreview - selection mode", () => {
  it("creates editable preview with validation for selection", async () => {
    const deps = createDeps();
    deps.dom.extractDetailedSelection = () => ({
      text: "This is a selected text",
      htmlContent: "<b>This is a selected text</b>",
      beforeContext: "Some text before",
      afterContext: "Some text after",
      elementPath: "body>div>p",
      containerTag: "p",
      position: { top: 100, left: 50, width: 200, height: 30 },
      url: "https://example.com",
      timestamp: Date.now(),
    });

    const cc = new ContentCapture({ 
      domAnalyzer: deps.dom, 
      sanitizer: deps.sanitizer, 
      media: deps.media, 
      selection: deps.selection, 
      messenger: deps.messenger 
    });

    const result = await cc.captureWithPreview({ 
      mode: "selection", 
      pocketId: "p1", 
      sanitize: false 
    });

    // Check result structure
    expect(result.result.mode).toBe("selection");
    expect(result.result.content.text).toBe("This is a selected text");
    
    // Check editable preview
    expect(result.editablePreview).not.toBeNull();
    expect(result.editablePreview?.text).toBe("This is a selected text");
    expect(result.editablePreview?.htmlContent).toBe("<b>This is a selected text</b>");
    expect(result.editablePreview?.context?.before).toBe("Some text before");
    expect(result.editablePreview?.context?.after).toBe("Some text after");
    expect(result.editablePreview?.sourceLocation?.url).toBe("https://example.com");
    expect(result.editablePreview?.editable).toBe(true);
    
    // Check validation
    expect(result.validation.isValid).toBe(true);
    expect(result.validation.errors).toHaveLength(0);
    expect(result.validation.warnings).toHaveLength(0);
  });

  it("validates empty selection and returns errors", async () => {
    const deps = createDeps();
    deps.dom.extractDetailedSelection = () => ({
      text: "",
      htmlContent: "",
      beforeContext: "Some text before",
      afterContext: "Some text after",
      elementPath: "body>div>p",
      containerTag: "p",
      position: { top: 100, left: 50, width: 200, height: 30 },
      url: "https://example.com",
      timestamp: Date.now(),
    });

    const cc = new ContentCapture({ 
      domAnalyzer: deps.dom, 
      sanitizer: deps.sanitizer, 
      media: deps.media, 
      selection: deps.selection, 
      messenger: deps.messenger 
    });

    const result = await cc.captureWithPreview({ 
      mode: "selection", 
      pocketId: "p1", 
      sanitize: false 
    });

    // Check validation
    expect(result.validation.isValid).toBe(false);
    expect(result.validation.errors).toContain("Selection text is empty");
  });

  it("generates warnings for large selections", async () => {
    const deps = createDeps();
    const largeText = "a".repeat(60000);
    deps.dom.extractDetailedSelection = () => ({
      text: largeText,
      htmlContent: largeText,
      beforeContext: "Some text before",
      afterContext: "Some text after",
      elementPath: "body>div>p",
      containerTag: "p",
      position: { top: 100, left: 50, width: 200, height: 30 },
      url: "https://example.com",
      timestamp: Date.now(),
    });

    const cc = new ContentCapture({ 
      domAnalyzer: deps.dom, 
      sanitizer: deps.sanitizer, 
      media: deps.media, 
      selection: deps.selection, 
      messenger: deps.messenger 
    });

    const result = await cc.captureWithPreview({ 
      mode: "selection", 
      pocketId: "p1", 
      sanitize: false 
    });

    // Check validation
    expect(result.validation.isValid).toBe(true);
    expect(result.validation.warnings).toContain("Selection is very large (>50,000 characters)");
  });

  it("generates warnings for missing context", async () => {
    const deps = createDeps();
    deps.dom.extractDetailedSelection = () => ({
      text: "Selected text",
      htmlContent: "<b>Selected text</b>",
      beforeContext: "",
      afterContext: "",
      elementPath: "body>div>p",
      containerTag: "p",
      position: { top: 100, left: 50, width: 200, height: 30 },
      url: "https://example.com",
      timestamp: Date.now(),
    });

    const cc = new ContentCapture({ 
      domAnalyzer: deps.dom, 
      sanitizer: deps.sanitizer, 
      media: deps.media, 
      selection: deps.selection, 
      messenger: deps.messenger 
    });

    const result = await cc.captureWithPreview({ 
      mode: "selection", 
      pocketId: "p1", 
      sanitize: false 
    });

    // Check validation
    expect(result.validation.isValid).toBe(true);
    expect(result.validation.warnings).toContain("No surrounding context available");
  });

  it("generates warnings for sanitization", async () => {
    const deps = createDeps();
    deps.dom.extractDetailedSelection = () => ({
      text: "Contact me at test@example.com",
      htmlContent: "<b>Contact me at test@example.com</b>",
      beforeContext: "Hello",
      afterContext: "Thanks",
      elementPath: "body>div>p",
      containerTag: "p",
      position: { top: 100, left: 50, width: 200, height: 30 },
      url: "https://example.com",
      timestamp: Date.now(),
    });

    const cc = new ContentCapture({ 
      domAnalyzer: deps.dom, 
      sanitizer: deps.sanitizer, 
      media: deps.media, 
      selection: deps.selection, 
      messenger: deps.messenger 
    });

    const result = await cc.captureWithPreview({ 
      mode: "selection", 
      pocketId: "p1", 
      sanitize: true 
    });

    // Check validation
    expect(result.validation.isValid).toBe(true);
    expect(result.validation.warnings.some(w => w.includes("PII item(s) were redacted"))).toBe(true);
  });
});

describe("ContentCapture.captureWithPreview - note mode", () => {
  it("creates editable preview with validation for note", async () => {
    const deps = createDeps();
    const cc = new ContentCapture({ 
      domAnalyzer: deps.dom, 
      sanitizer: deps.sanitizer, 
      media: deps.media, 
      selection: deps.selection, 
      messenger: deps.messenger 
    });

    const result = await cc.captureWithPreview({ 
      mode: "note", 
      noteText: "This is my note",
      pocketId: "p1", 
      sanitize: false 
    });

    // Check result structure
    expect(result.result.mode).toBe("note");
    expect(result.result.content.text).toBe("This is my note");
    
    // Check editable preview
    expect(result.editablePreview).not.toBeNull();
    expect(result.editablePreview?.text).toBe("This is my note");
    expect(result.editablePreview?.editable).toBe(true);
    
    // Check validation
    expect(result.validation.isValid).toBe(true);
    expect(result.validation.errors).toHaveLength(0);
  });

  it("validates empty note and returns errors", async () => {
    const deps = createDeps();
    const cc = new ContentCapture({ 
      domAnalyzer: deps.dom, 
      sanitizer: deps.sanitizer, 
      media: deps.media, 
      selection: deps.selection, 
      messenger: deps.messenger 
    });

    const result = await cc.captureWithPreview({ 
      mode: "note", 
      noteText: "",
      pocketId: "p1", 
      sanitize: false 
    });

    // Check validation
    expect(result.validation.isValid).toBe(false);
    expect(result.validation.errors).toContain("Note text is empty");
  });
});

describe("ContentCapture.captureWithPreview - element mode", () => {
  it("creates editable preview with validation for elements", async () => {
    const deps = createDeps();
    const mockRect = { top: 0, left: 0, width: 100, height: 50, bottom: 50, right: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    
    const elementProvider = async () => [
      { 
        element: document.createElement("div") as HTMLElement,
        info: { 
          tagName: "DIV", 
          selector: "div.article", 
          textContent: "Article content", 
          innerHTML: "<p>Article content</p>", 
          attributes: {}, 
          boundingRect: mockRect 
        },
        enhancedInfo: {} as any,
        textContent: "Article content"
      },
    ];

    const cc = new ContentCapture({ 
      domAnalyzer: deps.dom, 
      sanitizer: deps.sanitizer, 
      media: deps.media, 
      selection: deps.selection, 
      messenger: deps.messenger,
      elementProvider 
    });

    const result = await cc.captureWithPreview({ 
      mode: "element", 
      pocketId: "p1", 
      sanitize: false 
    });

    // Check result structure
    expect(result.result.mode).toBe("element");
    expect(result.result.content.count).toBe(1);
    
    // Check editable preview
    expect(result.editablePreview).not.toBeNull();
    expect(result.editablePreview?.text).toBe("Article content");
    expect(result.editablePreview?.htmlContent).toBe("<p>Article content</p>");
    expect(result.editablePreview?.editable).toBe(true);
    
    // Check validation
    expect(result.validation.isValid).toBe(true);
    expect(result.validation.errors).toHaveLength(0);
  });

  it("validates empty elements and returns errors", async () => {
    const deps = createDeps();
    const elementProvider = async () => [];

    const cc = new ContentCapture({ 
      domAnalyzer: deps.dom, 
      sanitizer: deps.sanitizer, 
      media: deps.media, 
      selection: deps.selection, 
      messenger: deps.messenger,
      elementProvider 
    });

    const result = await cc.captureWithPreview({ 
      mode: "element", 
      pocketId: "p1", 
      sanitize: false 
    });

    // Check validation
    expect(result.validation.isValid).toBe(false);
    expect(result.validation.errors).toContain("No elements were selected");
  });

  it("generates warnings for elements without text content", async () => {
    const deps = createDeps();
    const mockRect = { top: 0, left: 0, width: 100, height: 50, bottom: 50, right: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    
    const elementProvider = async () => [
      { 
        element: document.createElement("div") as HTMLElement,
        info: { 
          tagName: "DIV", 
          selector: "div.article", 
          textContent: "", 
          innerHTML: "<img src='test.png'>", 
          attributes: {}, 
          boundingRect: mockRect 
        },
        enhancedInfo: {} as any,
        textContent: ""
      },
    ];

    const cc = new ContentCapture({ 
      domAnalyzer: deps.dom, 
      sanitizer: deps.sanitizer, 
      media: deps.media, 
      selection: deps.selection, 
      messenger: deps.messenger,
      elementProvider 
    });

    const result = await cc.captureWithPreview({ 
      mode: "element", 
      pocketId: "p1", 
      sanitize: false 
    });

    // Check validation
    expect(result.validation.isValid).toBe(true);
    expect(result.validation.warnings).toContain("1 element(s) have no text content");
  });
});
