import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContentCapture, CaptureErrorType, type CaptureOptions } from "../content/capture/ContentCapture.js";
import type { IDOMAnalyzer, IContentSanitizer, IMediaCapture, IReliableSelectionCapture, IContentProcessor } from "../content/capture/ContentCapture.js";

function createDeps() {
  const dom: IDOMAnalyzer = {
    extractMetadata: () => ({ url: "https://example.com", timestamp: Date.now() }),
    extractText: () => ({ content: "Full page content with email test@example.com", wordCount: 6, characterCount: 40, paragraphs: [], headings: [], links: [], images: [], lists: [], tables: [] }),
    extractStructuredData: () => [{ type: "Article" }],
    analyzeReadability: () => ({ textLength: 40, averageWordLength: 5, averageSentenceLength: 10, readingTimeMinutes: 1 }),
    extractSelection: () => ({ content: "Selected text", wordCount: 2, characterCount: 12, paragraphs: [], headings: [], links: [], images: [], lists: [], tables: [] }),
    extractDetailedSelection: (n?: number) => null,
    getSelectionContext: (b: number, a: number) => "before [Selected text] after" as any,
  };

  const sanitizer: IContentSanitizer = {
    sanitize: (s: string) => ({ sanitizedContent: s.replace(/\S+@\S+/, "[EMAIL_REDACTED]"), redactionCount: /@/.test(s) ? 1 : 0, detectedPII: /@/.test(s) ? [{ type: "EMAIL" }] as any : [] })
  };

  const media: IMediaCapture = {
    captureAllMedia: async () => ({ images: [{ src: "img1.png", dataUrl: "data:image/png;base64,abc", thumbnail: "data:image/png;base64,thumb", metadata: {} as any, capturedAt: Date.now() } as any], audios: [{ src: "a1.mp3", duration: 3 } as any], videos: [], totalSize: 2048, capturedAt: Date.now() })
  };

  const selection: IReliableSelectionCapture = {
    captureWithReliability: async (op) => await op(),
  };

  const processor: IContentProcessor = {
    processContent: vi.fn(async (o) => ({ contentId: "id", preview: "p", status: "COMPLETED", type: "TEXT" })),
  } as any;

  const messenger = {
    captureScreenshot: vi.fn(async () => "data:image/png;base64,snap"),
  };

  return { dom, sanitizer, media, selection, processor, messenger };
}

describe("ContentCapture.capture - full-page", () => {
  it("routes correctly and returns content with metadata and preview; sanitization applied when enabled", async () => {
    const deps = createDeps();
    const cc = new ContentCapture({ domAnalyzer: deps.dom, sanitizer: deps.sanitizer, media: deps.media, selection: deps.selection, processor: deps.processor, messenger: deps.messenger });

    const res = await cc.capture({ mode: "full-page", pocketId: "p1", sanitize: true });
    expect(res.mode).toBe("full-page");
    expect(res.metadata.url).toBe("https://example.com");
    expect(res.preview && res.preview.length).toBeGreaterThan(0);
    expect(res.content.text.formattedContent.length).toBeGreaterThan(0);
    expect(res.content.sanitization.redactionCount).toBe(1);
    // metadata untouched
    expect(res.metadata.url).toBe("https://example.com");
  });
});

describe("ContentCapture.capture - selection", () => {
  it("returns selection content and preview", async () => {
    const deps = createDeps();
    const cc = new ContentCapture({ domAnalyzer: deps.dom, sanitizer: deps.sanitizer, media: deps.media, selection: deps.selection, processor: deps.processor, messenger: deps.messenger });

    const res = await cc.capture({ mode: "selection", pocketId: "p1", sanitize: false });
    expect(res.mode).toBe("selection");
    expect(String(res.content.text.content)).toContain("Selected text");
    expect(res.preview && res.preview.length).toBeGreaterThan(0);
  });

  it("uses detailed selection when available and sanitizes text and context", async () => {
    const base = createDeps();
    base.dom.extractDetailedSelection = () => ({
      text: "Email me at test@example.com",
      htmlContent: "<b>Email me</b>",
      beforeContext: "Hello",
      afterContext: "Thanks",
      elementPath: "body>p",
      containerTag: "p",
      position: { top: 0, left: 0, width: 10, height: 10 },
      url: "https://example.com",
      timestamp: Date.now(),
    });
    const cc = new ContentCapture({ domAnalyzer: base.dom, sanitizer: base.sanitizer, media: base.media, selection: base.selection, processor: base.processor, messenger: base.messenger });

    const res = await cc.capture({ mode: "selection", pocketId: "p1", sanitize: true });
    expect(res.content.sanitization.redactionCount).toBe(1);
    expect(String(res.content.text)).toContain("[EMAIL_REDACTED]");
    expect(res.preview && res.preview.length).toBeGreaterThan(0);
  });

  it("throws CaptureError(SELECTION_EMPTY) when selection is empty", async () => {
    const base = createDeps();
    base.dom.extractSelection = () => null as any;
    const cc = new ContentCapture({ domAnalyzer: base.dom, sanitizer: base.sanitizer, media: base.media, selection: base.selection, messenger: base.messenger });

    await expect(cc.capture({ mode: "selection", pocketId: "p1" })).rejects.toMatchObject({ type: CaptureErrorType.SELECTION_EMPTY });
  });
});

describe("ContentCapture.capture - element", () => {
  it("aggregates selected elements with per-element previews and sanitization when enabled", async () => {
    const deps = createDeps();
    const mockRect = { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    const elementProvider = async () => [
      { 
        element: document.createElement("div") as HTMLElement,
        info: { tagName: "DIV", selector: "div.article", textContent: "Hello from article", innerHTML: "", attributes: {}, boundingRect: mockRect },
        enhancedInfo: {} as any,
        textContent: "Hello from article"
      },
      { 
        element: document.createElement("a") as HTMLElement,
        info: { tagName: "A", selector: "a.contact", textContent: "Contact at test@example.com", innerHTML: "", attributes: {}, boundingRect: mockRect },
        enhancedInfo: {} as any,
        textContent: "Contact at test@example.com"
      },
    ];

    const cc = new ContentCapture({ domAnalyzer: deps.dom, sanitizer: deps.sanitizer, media: deps.media, selection: deps.selection, messenger: deps.messenger, elementProvider });

    const res = await cc.capture({ mode: "element", pocketId: "p1", sanitize: true });
    expect(res.content.count).toBe(2);
    expect(res.preview && res.preview.length).toBeGreaterThan(0);
    // second element should be sanitized
    const second = res.content.elements[1];
    expect(String(second.textContent)).toContain("[EMAIL_REDACTED]");
  });
});

describe("ContentCapture.capture - media", () => {
  it("returns media with preview and aggregated size", async () => {
    const deps = createDeps();
    const cc = new ContentCapture({ domAnalyzer: deps.dom, sanitizer: deps.sanitizer, media: deps.media, selection: deps.selection, messenger: deps.messenger });

    const res = await cc.capture({ mode: "media", pocketId: "p1" });
    expect(res.content.images.length).toBe(1);
    expect(res.content.audios.length).toBe(1);
    expect(res.preview && res.preview.length).toBeGreaterThan(0);
  });
});

describe("ContentCapture.capture - note", () => {
  it("returns note content with preview and preserves metadata", async () => {
    const deps = createDeps();
    const cc = new ContentCapture({ domAnalyzer: deps.dom, sanitizer: deps.sanitizer, media: deps.media, selection: deps.selection, messenger: deps.messenger });

    const res = await cc.capture({ mode: "note", noteText: "My note", pocketId: "p1", sanitize: false });
    expect(res.content.text).toBe("My note");
    expect(res.preview).toBe("My note");
    expect(res.metadata.url).toBe("https://example.com");
  });

  it("applies sanitization when enabled for notes", async () => {
    const deps = createDeps();
    const cc = new ContentCapture({ domAnalyzer: deps.dom, sanitizer: deps.sanitizer, media: deps.media, selection: deps.selection, messenger: deps.messenger });

    const res = await cc.capture({ mode: "note", noteText: "Email me test@example.com", pocketId: "p1", sanitize: true });
    expect(res.content.sanitization.redactionCount).toBe(1);
    expect(String(res.content.text)).toContain("[EMAIL_REDACTED]");
  });
});
