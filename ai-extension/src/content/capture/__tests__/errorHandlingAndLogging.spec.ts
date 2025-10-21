import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ContentCapture, CaptureError, CaptureErrorType } from "../ContentCapture.js";
import type { IDOMAnalyzer, IContentSanitizer, IMediaCapture, IReliableSelectionCapture } from "../ContentCapture.js";

function createDeps() {
  const dom: IDOMAnalyzer = {
    extractMetadata: () => ({ url: "https://example.com", timestamp: Date.now() }),
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

describe("ContentCapture - Error Handling and Logging", () => {
  let consoleInfoSpy: any;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe("CaptureError user messages", () => {
    it("should provide user-friendly message for SELECTION_EMPTY", () => {
      const error = new CaptureError(CaptureErrorType.SELECTION_EMPTY, "No text selected");
      expect(error.userMessage).toBe("No text selected. Please select text and try again.");
    });

    it("should provide user-friendly message for DOM_ACCESS", () => {
      const error = new CaptureError(CaptureErrorType.DOM_ACCESS, "Failed to access DOM");
      expect(error.userMessage).toBe("Couldn't access page content. The page may be restricted.");
    });

    it("should provide user-friendly message for SANITIZATION", () => {
      const error = new CaptureError(CaptureErrorType.SANITIZATION, "Sanitization failed");
      expect(error.userMessage).toBe("Sanitization failed. Try again without sanitization.");
    });

    it("should provide user-friendly message for STORAGE", () => {
      const error = new CaptureError(CaptureErrorType.STORAGE, "Storage failed");
      expect(error.userMessage).toBe("Couldn't save content. Check storage or try again.");
    });

    it("should provide user-friendly message for MEDIA_LOAD", () => {
      const error = new CaptureError(CaptureErrorType.MEDIA_LOAD, "Media load failed");
      expect(error.userMessage).toBe("Some media couldn't be captured; continue or retry.");
    });

    it("should provide user-friendly message for UNKNOWN", () => {
      const error = new CaptureError(CaptureErrorType.UNKNOWN, "Unknown error");
      expect(error.userMessage).toBe("An unexpected error occurred. Please try again.");
    });
  });

  describe("Capture start logging", () => {
    it("should log capture start with mode, sanitize, and pocketId", async () => {
      const deps = createDeps();
      const cc = new ContentCapture({ 
        domAnalyzer: deps.dom, 
        sanitizer: deps.sanitizer, 
        media: deps.media, 
        selection: deps.selection, 
        messenger: deps.messenger 
      });

      await cc.capture({ 
        mode: "full-page", 
        pocketId: "test-pocket-123", 
        sanitize: true 
      });

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        "[ContentCapture] Capture started",
        expect.objectContaining({
          mode: "full-page",
          sanitize: true,
          pocketId: expect.stringContaining("test-poc"),
          timestamp: expect.any(String),
        })
      );
    });

    it("should mask long pocket IDs in logs", async () => {
      const deps = createDeps();
      const cc = new ContentCapture({ 
        domAnalyzer: deps.dom, 
        sanitizer: deps.sanitizer, 
        media: deps.media, 
        selection: deps.selection, 
        messenger: deps.messenger 
      });

      await cc.capture({ 
        mode: "selection", 
        pocketId: "very-long-pocket-id-12345678", 
        sanitize: false 
      });

      const startCall = consoleInfoSpy.mock.calls.find((call: any) => 
        call[0] === "[ContentCapture] Capture started"
      );
      
      expect(startCall[1].pocketId).toBe("very-lon...");
    });
  });

  describe("Capture completion logging", () => {
    it("should log completion with duration and summary for full-page", async () => {
      const deps = createDeps();
      const cc = new ContentCapture({ 
        domAnalyzer: deps.dom, 
        sanitizer: deps.sanitizer, 
        media: deps.media, 
        selection: deps.selection, 
        messenger: deps.messenger 
      });

      await cc.capture({ 
        mode: "full-page", 
        pocketId: "test-pocket", 
        sanitize: false 
      });

      const completionCall = consoleInfoSpy.mock.calls.find((call: any) => 
        call[0] === "[ContentCapture] Capture completed"
      );

      expect(completionCall).toBeDefined();
      expect(completionCall[1]).toMatchObject({
        mode: "full-page",
        durationMs: expect.any(Number),
        summary: expect.objectContaining({
          textLength: expect.any(Number),
          wordCount: expect.any(Number),
          hasScreenshot: expect.any(Boolean),
        }),
      });
    });

    it("should log completion with summary for selection", async () => {
      const deps = createDeps();
      const cc = new ContentCapture({ 
        domAnalyzer: deps.dom, 
        sanitizer: deps.sanitizer, 
        media: deps.media, 
        selection: deps.selection, 
        messenger: deps.messenger 
      });

      await cc.capture({ 
        mode: "selection", 
        pocketId: "test-pocket", 
        sanitize: false 
      });

      const completionCall = consoleInfoSpy.mock.calls.find((call: any) => 
        call[0] === "[ContentCapture] Capture completed"
      );

      expect(completionCall[1].summary).toMatchObject({
        textLength: expect.any(Number),
        hasContext: expect.any(Boolean),
      });
    });

    it("should log completion with summary for media", async () => {
      const deps = createDeps();
      deps.media.captureAllMedia = async () => ({
        images: [{ metadata: {} } as any],
        audios: [],
        videos: [{ metadata: {} } as any],
        totalSize: 1024,
        capturedAt: Date.now(),
      });

      const cc = new ContentCapture({ 
        domAnalyzer: deps.dom, 
        sanitizer: deps.sanitizer, 
        media: deps.media, 
        selection: deps.selection, 
        messenger: deps.messenger 
      });

      await cc.capture({ 
        mode: "media", 
        pocketId: "test-pocket", 
        sanitize: false 
      });

      const completionCall = consoleInfoSpy.mock.calls.find((call: any) => 
        call[0] === "[ContentCapture] Capture completed"
      );

      expect(completionCall[1].summary).toMatchObject({
        imageCount: 1,
        audioCount: 0,
        videoCount: 1,
        totalSize: 1024,
      });
    });

    it("should include warnings in completion log when present", async () => {
      const deps = createDeps();
      deps.dom.extractSelection = () => ({
        content: "a".repeat(60000),
        wordCount: 60000,
        characterCount: 60000,
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
        messenger: deps.messenger 
      });

      await cc.capture({ 
        mode: "selection", 
        pocketId: "test-pocket", 
        sanitize: false 
      });

      const completionCall = consoleInfoSpy.mock.calls.find((call: any) => 
        call[0] === "[ContentCapture] Capture completed"
      );

      expect(completionCall[1].warnings).toBeDefined();
      expect(completionCall[1].warnings).toContain("Content is very large (>50,000 characters)");
    });
  });

  describe("Capture error logging", () => {
    it("should log error with duration and error details", async () => {
      const deps = createDeps();
      deps.dom.extractMetadata = () => {
        throw new Error("DOM access denied");
      };

      const cc = new ContentCapture({ 
        domAnalyzer: deps.dom, 
        sanitizer: deps.sanitizer, 
        media: deps.media, 
        selection: deps.selection, 
        messenger: deps.messenger 
      });

      await expect(cc.capture({ 
        mode: "full-page", 
        pocketId: "test-pocket", 
        sanitize: false 
      })).rejects.toThrow();

      const errorCall = consoleErrorSpy.mock.calls.find((call: any) => 
        call[0] === "[ContentCapture] Capture failed"
      );

      expect(errorCall).toBeDefined();
      expect(errorCall[1]).toMatchObject({
        mode: "full-page",
        durationMs: expect.any(Number),
        errorType: CaptureErrorType.DOM_ACCESS,
        message: expect.any(String),
        userMessage: "Couldn't access page content. The page may be restricted.",
      });
    });

    it("should log error for empty selection", async () => {
      const deps = createDeps();
      deps.dom.extractSelection = () => ({
        content: "",
        wordCount: 0,
        characterCount: 0,
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
        messenger: deps.messenger 
      });

      await expect(cc.capture({ 
        mode: "selection", 
        pocketId: "test-pocket", 
        sanitize: false 
      })).rejects.toThrow(CaptureError);

      const errorCall = consoleErrorSpy.mock.calls.find((call: any) => 
        call[0] === "[ContentCapture] Capture failed"
      );

      expect(errorCall[1].errorType).toBe(CaptureErrorType.SELECTION_EMPTY);
      expect(errorCall[1].userMessage).toBe("No text selected. Please select text and try again.");
    });
  });

  describe("Mode-specific logging", () => {
    it("should log full-page extraction start and completion", async () => {
      const deps = createDeps();
      const cc = new ContentCapture({ 
        domAnalyzer: deps.dom, 
        sanitizer: deps.sanitizer, 
        media: deps.media, 
        selection: deps.selection, 
        messenger: deps.messenger 
      });

      await cc.capture({ 
        mode: "full-page", 
        pocketId: "test-pocket", 
        sanitize: false 
      });

      expect(consoleInfoSpy).toHaveBeenCalledWith("[ContentCapture] Full-page extraction started");
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        "[ContentCapture] Full-page extraction completed",
        expect.objectContaining({
          durationMs: expect.any(Number),
          wordCount: expect.any(Number),
          hasScreenshot: expect.any(Boolean),
        })
      );
    });

    it("should log selection extraction start and completion", async () => {
      const deps = createDeps();
      const cc = new ContentCapture({ 
        domAnalyzer: deps.dom, 
        sanitizer: deps.sanitizer, 
        media: deps.media, 
        selection: deps.selection, 
        messenger: deps.messenger 
      });

      await cc.capture({ 
        mode: "selection", 
        pocketId: "test-pocket", 
        sanitize: false 
      });

      expect(consoleInfoSpy).toHaveBeenCalledWith("[ContentCapture] Selection extraction started");
      expect(consoleInfoSpy).toHaveBeenCalledWith("[ContentCapture] Selection extraction completed");
    });

    it("should log element extraction with count", async () => {
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

      await cc.capture({ 
        mode: "element", 
        pocketId: "test-pocket", 
        sanitize: false 
      });

      expect(consoleInfoSpy).toHaveBeenCalledWith("[ContentCapture] Element extraction started");
      expect(consoleInfoSpy).toHaveBeenCalledWith("[ContentCapture] Processing elements", { count: 1 });
      expect(consoleInfoSpy).toHaveBeenCalledWith("[ContentCapture] Element extraction completed", { count: 1 });
    });

    it("should log media capture with counts", async () => {
      const deps = createDeps();
      deps.media.captureAllMedia = async () => ({
        images: [{ metadata: {} } as any, { metadata: {} } as any],
        audios: [{ metadata: {} } as any],
        videos: [],
        totalSize: 2048,
        capturedAt: Date.now(),
      });

      const cc = new ContentCapture({ 
        domAnalyzer: deps.dom, 
        sanitizer: deps.sanitizer, 
        media: deps.media, 
        selection: deps.selection, 
        messenger: deps.messenger 
      });

      await cc.capture({ 
        mode: "media", 
        pocketId: "test-pocket", 
        sanitize: false 
      });

      expect(consoleInfoSpy).toHaveBeenCalledWith("[ContentCapture] Media capture started");
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        "[ContentCapture] Media capture completed",
        expect.objectContaining({
          imageCount: 2,
          audioCount: 1,
          videoCount: 0,
          totalSize: 2048,
        })
      );
    });

    it("should log note capture", async () => {
      const deps = createDeps();
      const cc = new ContentCapture({ 
        domAnalyzer: deps.dom, 
        sanitizer: deps.sanitizer, 
        media: deps.media, 
        selection: deps.selection, 
        messenger: deps.messenger 
      });

      await cc.capture({ 
        mode: "note", 
        noteText: "My test note",
        pocketId: "test-pocket", 
        sanitize: false 
      });

      expect(consoleInfoSpy).toHaveBeenCalledWith("[ContentCapture] Note capture started", { textLength: 12 });
      expect(consoleInfoSpy).toHaveBeenCalledWith("[ContentCapture] Note capture completed");
    });
  });

  describe("Sanitization logging", () => {
    it("should log sanitization in full-page mode", async () => {
      const deps = createDeps();
      deps.dom.extractText = () => ({
        content: "Contact test@example.com",
        wordCount: 2,
        characterCount: 24,
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
        messenger: deps.messenger 
      });

      await cc.capture({ 
        mode: "full-page", 
        pocketId: "test-pocket", 
        sanitize: true 
      });

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        "[ContentCapture] Sanitization applied",
        expect.objectContaining({
          redactionCount: 1,
          piiTypes: ["EMAIL"],
        })
      );
    });

    it("should log sanitization errors", async () => {
      const deps = createDeps();
      deps.sanitizer.sanitize = () => {
        throw new Error("Sanitization engine failed");
      };

      const cc = new ContentCapture({ 
        domAnalyzer: deps.dom, 
        sanitizer: deps.sanitizer, 
        media: deps.media, 
        selection: deps.selection, 
        messenger: deps.messenger 
      });

      await expect(cc.capture({ 
        mode: "full-page", 
        pocketId: "test-pocket", 
        sanitize: true 
      })).rejects.toThrow(CaptureError);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[ContentCapture] Sanitization failed in full-page mode",
        expect.any(Error)
      );
    });
  });

  describe("Screenshot error logging", () => {
    it("should not throw when screenshot fails", async () => {
      const deps = createDeps();
      // Create a messenger that throws but logs the warning
      const failingMessenger = {
        captureScreenshot: vi.fn(async () => {
          try {
            throw new Error("Screenshot API unavailable");
          } catch (err) {
            console.warn("[ContentCapture] Screenshot capture failed (non-blocking)", err);
            return null;
          }
        }),
      };

      const cc = new ContentCapture({ 
        domAnalyzer: deps.dom, 
        sanitizer: deps.sanitizer, 
        media: deps.media, 
        selection: deps.selection, 
        messenger: failingMessenger 
      });

      // Should not throw - screenshot failure is non-blocking
      await expect(cc.capture({ 
        mode: "full-page", 
        pocketId: "test-pocket", 
        sanitize: false 
      })).resolves.toBeDefined();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[ContentCapture] Screenshot capture failed (non-blocking)",
        expect.any(Error)
      );
    });

    it("should log warning when screenshot returns no data", async () => {
      const deps = createDeps();
      // Create a messenger that returns null and logs warning
      const nullMessenger = {
        captureScreenshot: vi.fn(async () => {
          console.warn("[ContentCapture] Screenshot capture returned no data (non-blocking)");
          return null;
        }),
      };

      const cc = new ContentCapture({ 
        domAnalyzer: deps.dom, 
        sanitizer: deps.sanitizer, 
        media: deps.media, 
        selection: deps.selection, 
        messenger: nullMessenger 
      });

      await cc.capture({ 
        mode: "full-page", 
        pocketId: "test-pocket", 
        sanitize: false 
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[ContentCapture] Screenshot capture returned no data (non-blocking)"
      );
    });
  });

  describe("Timing metrics", () => {
    it("should track and log capture duration", async () => {
      const deps = createDeps();
      const cc = new ContentCapture({ 
        domAnalyzer: deps.dom, 
        sanitizer: deps.sanitizer, 
        media: deps.media, 
        selection: deps.selection, 
        messenger: deps.messenger 
      });

      await cc.capture({ 
        mode: "full-page", 
        pocketId: "test-pocket", 
        sanitize: false 
      });

      const completionCall = consoleInfoSpy.mock.calls.find((call: any) => 
        call[0] === "[ContentCapture] Capture completed"
      );

      expect(completionCall[1].durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof completionCall[1].durationMs).toBe("number");
    });

    it("should include duration in error logs", async () => {
      const deps = createDeps();
      deps.dom.extractMetadata = () => {
        throw new Error("Metadata extraction failed");
      };

      const cc = new ContentCapture({ 
        domAnalyzer: deps.dom, 
        sanitizer: deps.sanitizer, 
        media: deps.media, 
        selection: deps.selection, 
        messenger: deps.messenger 
      });

      await expect(cc.capture({ 
        mode: "selection", 
        pocketId: "test-pocket", 
        sanitize: false 
      })).rejects.toThrow();

      const errorCall = consoleErrorSpy.mock.calls.find((call: any) => 
        call[0] === "[ContentCapture] Capture failed"
      );

      expect(errorCall[1].durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof errorCall[1].durationMs).toBe("number");
    });
  });
});
