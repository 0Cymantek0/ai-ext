import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useIndexingStatus } from "../useIndexingStatus";
import type { IndexingProgress } from "../useIndexingStatus";

// Mock chrome runtime API
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    sendMessage: vi.fn(),
  },
};

(global as any).chrome = mockChrome;
(global as any).crypto = {
  randomUUID: () => "test-uuid",
};

describe("useIndexingStatus", () => {
  let messageListener: ((message: any) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChrome.runtime.onMessage.addListener.mockImplementation((listener) => {
      messageListener = listener;
    });
  });

  afterEach(() => {
    messageListener = null;
  });

  it("initializes with empty state", () => {
    const { result } = renderHook(() => useIndexingStatus());

    expect(result.current.status.isAnyIndexing).toBe(false);
    expect(result.current.status.indexingContentIds.size).toBe(0);
    expect(result.current.status.failedContentIds.size).toBe(0);
  });

  it("tracks indexing progress", async () => {
    const { result } = renderHook(() => useIndexingStatus());

    const progress: IndexingProgress = {
      jobId: "job-1",
      contentId: "content-1",
      operation: "create",
      chunksTotal: 10,
      chunksProcessed: 5,
      status: "processing",
    };

    act(() => {
      messageListener?.({
        kind: "VECTOR_INDEXING_PROGRESS",
        payload: progress,
      });
    });

    await waitFor(() => {
      expect(result.current.status.isAnyIndexing).toBe(true);
      expect(result.current.isContentIndexing("content-1")).toBe(true);
    });
  });

  it("removes content from indexing set when completed", async () => {
    const { result } = renderHook(() => useIndexingStatus());

    act(() => {
      messageListener?.({
        kind: "VECTOR_INDEXING_PROGRESS",
        payload: {
          jobId: "job-1",
          contentId: "content-1",
          operation: "create",
          chunksTotal: 10,
          chunksProcessed: 5,
          status: "processing",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.isContentIndexing("content-1")).toBe(true);
    });

    act(() => {
      messageListener?.({
        kind: "VECTOR_INDEXING_PROGRESS",
        payload: {
          jobId: "job-1",
          contentId: "content-1",
          operation: "create",
          chunksTotal: 10,
          chunksProcessed: 10,
          status: "completed",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.isContentIndexing("content-1")).toBe(false);
      expect(result.current.status.isAnyIndexing).toBe(false);
    });
  });

  it("tracks failed content", async () => {
    const { result } = renderHook(() => useIndexingStatus());

    act(() => {
      messageListener?.({
        kind: "VECTOR_INDEXING_PROGRESS",
        payload: {
          jobId: "job-1",
          contentId: "content-1",
          operation: "create",
          chunksTotal: 10,
          chunksProcessed: 5,
          status: "failed",
          error: "Rate limit exceeded",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.isContentFailed("content-1")).toBe(true);
      expect(result.current.isContentIndexing("content-1")).toBe(false);
    });
  });

  it("calculates pocket indexing status correctly", async () => {
    const { result } = renderHook(() => useIndexingStatus());

    act(() => {
      messageListener?.({
        kind: "VECTOR_INDEXING_PROGRESS",
        payload: {
          jobId: "job-1",
          contentId: "content-1",
          operation: "create",
          chunksTotal: 10,
          chunksProcessed: 5,
          status: "processing",
        },
      });
    });

    act(() => {
      messageListener?.({
        type: "VECTOR_INDEXING_PROGRESS",
        payload: {
          jobId: "job-2",
          contentId: "content-2",
          operation: "create",
          chunksTotal: 10,
          chunksProcessed: 5,
          status: "failed",
          error: "Error",
        },
      });
    });

    await waitFor(() => {
      const pocketStatus = result.current.getPocketIndexingStatus([
        "content-1",
        "content-2",
        "content-3",
      ]);

      expect(pocketStatus.totalContent).toBe(3);
      expect(pocketStatus.indexingCount).toBe(1);
      expect(pocketStatus.failedCount).toBe(1);
      expect(pocketStatus.completedCount).toBe(1);
      expect(pocketStatus.isIndexing).toBe(true);
      expect(pocketStatus.hasFailed).toBe(true);
    });
  });

  it("calls retry for failed indexing", async () => {
    const { result } = renderHook(() => useIndexingStatus());

    await act(async () => {
      await result.current.retryFailedIndexing("content-1");
    });

    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
      kind: "VECTOR_INDEXING_RETRY",
      requestId: "test-uuid",
      payload: { contentId: "content-1" },
    });
  });
});
