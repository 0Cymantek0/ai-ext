import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextBundleBuilder } from "./context-bundle";

vi.mock("./monitoring", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("./vector-search-service", () => ({
  vectorSearchService: {
    searchChunks: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("./conversation-context-loader", () => ({
  conversationContextLoader: {
    buildConversationContext: vi.fn().mockResolvedValue({
      messages: [],
      totalTokens: 0,
      truncated: false,
    }),
    formatContextAsString: vi.fn().mockReturnValue(""),
  },
}));

vi.mock("./content-extractor", () => ({
  extractLLMContent: vi.fn(),
  extractLLMContentFromChunk: vi.fn(),
  estimateChunkTokens: vi.fn().mockReturnValue(0),
}));

vi.mock("./tab-search-service", () => ({
  searchAllTabs: vi.fn().mockResolvedValue({
    results: [],
    totalTabs: 0,
    searchedTabs: 0,
    duration: 0,
  }),
}));

describe("ContextBundleBuilder timeouts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 123 }]),
      },
      scripting: {
        executeScript: vi.fn().mockImplementation(
          () =>
            new Promise(() => {
              // Intentionally never resolves.
            }),
        ),
      },
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({}),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("skips page context when page extraction times out", async () => {
    const builder = new ContextBundleBuilder({
      page: true,
      selection: false,
      input: false,
      tabs: false,
      tabSearch: false,
      pockets: false,
      history: false,
    });

    const bundlePromise = builder.buildContextBundle({
      mode: "ask",
      query: "hello",
    });

    await vi.advanceTimersByTimeAsync(1000);

    const bundle = await bundlePromise;

    expect(bundle.signals).not.toContain("page");
    expect(bundle.totalTokens).toBe(0);
  });
});
