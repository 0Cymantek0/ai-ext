import { describe, it, expect, beforeEach, vi } from "vitest";

const saveContentMock = vi.fn();
const getContentMock = vi.fn();

vi.mock("./monitoring.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("./indexeddb-manager.js", async () => {
  const actual = await vi.importActual<typeof import("./indexeddb-manager.js")>("./indexeddb-manager.js");
  return {
    ...actual,
    indexedDBManager: {
      init: vi.fn().mockResolvedValue(undefined),
      saveContent: saveContentMock,
      getContent: getContentMock,
      listPockets: vi.fn(),
    },
  };
});

vi.mock("./pdf-processor.js", () => ({
  pdfProcessor: {
    processPDF: vi.fn(),
  },
}));

import { ContentProcessor } from "./content-processor.js";
import { ContentType, ProcessingStatus } from "./indexeddb-manager.js";
import { buildSnippetCapturePayload } from "../content/snippet-utils.js";

describe("ContentProcessor snippet integration", () => {
  beforeEach(() => {
    saveContentMock.mockReset();
    getContentMock.mockReset();
    saveContentMock.mockResolvedValue("snippet-content-id");
  });

  it("persists snippet content and returns a preview", async () => {
    const processor = new ContentProcessor();
    const snippet = buildSnippetCapturePayload("Snippet text for storage", {
      sourceUrl: "https://example.com/article",
      title: "Example Article",
      context: {
        before: "Before snippet",
        after: "After snippet",
      },
    });

    const result = await processor.processContent({
      pocketId: "pocket-123",
      mode: "selection",
      content: snippet.content,
      metadata: snippet.metadata,
      sourceUrl: snippet.metadata.url,
    });

    expect(saveContentMock).toHaveBeenCalledTimes(1);
    const savedArgs = saveContentMock.mock.calls[0]?.[0];
    expect(savedArgs.pocketId).toBe("pocket-123");
    expect(savedArgs.type).toBe(ContentType.SNIPPET);
    expect(typeof savedArgs.content).toBe("string");

    expect(result.type).toBe(ContentType.SNIPPET);
    expect(result.status).toBe(ProcessingStatus.COMPLETED);
    expect(result.preview.length).toBeGreaterThan(0);
    expect(result.preview).toContain("Snippet text for storage".slice(0, 10));
  });

  it("fails validation when snippet text is empty", async () => {
    const processor = new ContentProcessor();
    const snippet = buildSnippetCapturePayload("", {
      sourceUrl: "https://example.com",
    });

    await expect(
      processor.processContent({
        pocketId: "pocket-1",
        mode: "selection",
        content: snippet.content,
        metadata: snippet.metadata,
        sourceUrl: snippet.metadata.url,
      }),
    ).rejects.toThrow(/Content validation failed/);

    expect(saveContentMock).not.toHaveBeenCalled();
  });
});
