import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ContentCapture,
  CaptureError,
  CaptureErrorType,
  type CaptureOptions,
} from "../ContentCapture.js";
import type {
  IDOMAnalyzer,
  IContentSanitizer,
  IMediaCapture,
  IReliableSelectionCapture,
  IContentProcessor,
} from "../ContentCapture.js";

function makeDeps(overrides: Partial<ReturnType<typeof createDeps>> = {}) {
  const base = createDeps();
  return { ...base, ...overrides };
}

function createDeps() {
  const dom: IDOMAnalyzer = {
    extractMetadata: () => ({
      url: "https://example.com",
      timestamp: Date.now(),
    }),
    extractText: () => ({
      content: "Full page content",
      wordCount: 3,
      characterCount: 18,
      paragraphs: [],
      headings: [],
      links: [],
      images: [],
      lists: [],
      tables: [],
    }),
    extractStructuredData: () => [{ type: "Article" }],
    analyzeReadability: () => ({
      textLength: 18,
      averageWordLength: 6,
      averageSentenceLength: 3,
      readingTimeMinutes: 1,
    }),
    extractSelection: () => ({
      content: "Selected text",
      wordCount: 2,
      characterCount: 12,
      paragraphs: [],
      headings: [],
      links: [],
      images: [],
      lists: [],
      tables: [],
    }),
    extractDetailedSelection: (n?: number) => null,
    getSelectionContext: (b: number, a: number) =>
      "before [Selected text] after",
  };

  const sanitizer: IContentSanitizer = {
    sanitize: (content: string) => ({
      sanitizedContent: content.replace(/\S+@\S+/, "[EMAIL_REDACTED]"),
      redactionCount: /@/.test(content) ? 1 : 0,
      detectedPII: /@/.test(content) ? ([{ type: "EMAIL" }] as any) : [],
    }),
  };

  const media: IMediaCapture = {
    captureAllMedia: async () => ({
      images: [
        {
          metadata: {} as any,
          dataUrl: "data:image/png;base64,abc",
          capturedAt: Date.now(),
          thumbnail: "data:image/png;base64,thumb",
        } as any,
      ],
      audios: [],
      videos: [],
      totalSize: 1024,
      capturedAt: Date.now(),
    }),
  };

  const selection: IReliableSelectionCapture = {
    captureWithReliability: async (op) => await op(),
  };

  const processor: IContentProcessor = {
    processContent: vi.fn(async (o) => ({
      contentId: "id",
      preview: "p",
      status: "COMPLETED",
      type: "TEXT",
    })),
  } as any;

  const messenger = {
    captureScreenshot: vi.fn(async () => "data:image/png;base64,snap"),
  };

  return { dom, sanitizer, media, selection, processor, messenger };
}

describe("ContentCapture - mode routing and metadata", () => {
  it("routes by mode and returns metadata for note", async () => {
    const deps = makeDeps();
    const cc = new ContentCapture({
      domAnalyzer: deps.dom,
      sanitizer: deps.sanitizer,
      media: deps.media,
      selection: deps.selection,
      processor: deps.processor,
      messenger: deps.messenger,
    });

    const options: CaptureOptions = {
      mode: "note",
      pocketId: "p1",
      sanitize: false,
      noteText: "hello",
    };
    const res = await cc.capture(options);

    expect(res.mode).toBe("note");
    expect(res.metadata.url).toBe("https://example.com");
    expect(res.content.text).toBe("hello");
    expect(deps.processor.processContent).toHaveBeenCalled();
    const callArg = (deps.processor.processContent as any).mock.calls[0][0];
    expect(callArg.pocketId).toBe("p1");
    expect(callArg.sourceUrl).toBe("https://example.com");
  });
});

describe("ContentCapture - selection mode", () => {
  it("captures selection with preview and sanitization off", async () => {
    const deps = makeDeps();
    const cc = new ContentCapture({
      domAnalyzer: deps.dom,
      sanitizer: deps.sanitizer,
      media: deps.media,
      selection: deps.selection,
      processor: deps.processor,
      messenger: deps.messenger,
    });

    const res = await cc.capture({
      mode: "selection",
      pocketId: "p1",
      sanitize: false,
    });
    expect(res.mode).toBe("selection");
    expect(res.content.text.content).toContain("Selected text");
    const withPreview = await cc.captureWithPreview({
      mode: "selection",
      pocketId: "p1",
      sanitize: false,
    });
    expect(withPreview.editablePreview).not.toBeNull();
    expect(withPreview.editablePreview?.preview?.length).toBeGreaterThan(0);
  });

  it("throws SELECTION_EMPTY when no selection", async () => {
    const deps = makeDeps({
      dom: { ...createDeps().dom, extractSelection: () => null } as any,
    });
    const cc = new ContentCapture({
      domAnalyzer: deps.dom,
      sanitizer: deps.sanitizer,
      media: deps.media,
      selection: deps.selection,
      messenger: deps.messenger,
    });

    await expect(
      cc.capture({ mode: "selection", pocketId: "p1" }),
    ).rejects.toMatchObject({ type: CaptureErrorType.SELECTION_EMPTY });
  });
});

describe("ContentCapture - media mode", () => {
  it("aggregates basic counts and generates preview", async () => {
    const deps = makeDeps();
    const cc = new ContentCapture({
      domAnalyzer: deps.dom,
      sanitizer: deps.sanitizer,
      media: deps.media,
      selection: deps.selection,
      messenger: deps.messenger,
    });

    const res = await cc.capture({ mode: "media", pocketId: "p1" });
    expect(res.content.images.length).toBe(1);
    expect(res.preview).toContain("image(s)");
  });
});

describe("ContentCapture - sanitization toggle", () => {
  it("applies sanitizer when enabled", async () => {
    const deps = makeDeps();
    // Override selection to include an email for redaction
    deps.dom.extractSelection = () => ({
      content: "Contact me test@example.com",
      wordCount: 3,
      characterCount: 26,
      paragraphs: [],
      headings: [],
      links: [],
      images: [],
      lists: [],
      tables: [],
    });

    const cc = new ContentCapture({
      domAnalyzer: deps.dom,
      sanitizer: deps.sanitizer,
      media: deps.media,
      selection: deps.selection,
      messenger: deps.messenger,
    });

    const res = await cc.capture({
      mode: "selection",
      pocketId: "p1",
      sanitize: true,
    });
    expect(res.content.sanitization.redactionCount).toBe(1);
    expect(String(res.content.text.content)).toContain("[EMAIL_REDACTED]");
  });
});
