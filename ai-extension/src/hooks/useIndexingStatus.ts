import * as React from "react";

export interface IndexingProgress {
  jobId: string;
  contentId: string;
  operation: "create" | "update" | "delete";
  chunksTotal: number;
  chunksProcessed: number;
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
}

export interface IndexingStatusByPocket {
  [pocketId: string]: {
    contentIds: string[];
    indexingContentIds: string[];
    failedContentIds: string[];
    progress: Map<string, IndexingProgress>;
  };
}

export interface IndexingStatusState {
  progressByContentId: Map<string, IndexingProgress>;
  indexingContentIds: Set<string>;
  failedContentIds: Set<string>;
  isAnyIndexing: boolean;
}

export function useIndexingStatus() {
  const [status, setStatus] = React.useState<IndexingStatusState>({
    progressByContentId: new Map(),
    indexingContentIds: new Set(),
    failedContentIds: new Set(),
    isAnyIndexing: false,
  });

  React.useEffect(() => {
    const messageListener = (message: any) => {
      if (message.type === "VECTOR_INDEXING_PROGRESS") {
        const progress = message.payload as IndexingProgress;
        
        setStatus((prev) => {
          const newProgressMap = new Map(prev.progressByContentId);
          newProgressMap.set(progress.contentId, progress);

          const newIndexingSet = new Set(prev.indexingContentIds);
          const newFailedSet = new Set(prev.failedContentIds);

          if (progress.status === "pending" || progress.status === "processing") {
            newIndexingSet.add(progress.contentId);
            newFailedSet.delete(progress.contentId);
          } else if (progress.status === "completed") {
            newIndexingSet.delete(progress.contentId);
            newFailedSet.delete(progress.contentId);
          } else if (progress.status === "failed") {
            newIndexingSet.delete(progress.contentId);
            newFailedSet.add(progress.contentId);
          }

          return {
            progressByContentId: newProgressMap,
            indexingContentIds: newIndexingSet,
            failedContentIds: newFailedSet,
            isAnyIndexing: newIndexingSet.size > 0,
          };
        });
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  const getContentStatus = React.useCallback(
    (contentId: string): IndexingProgress | undefined => {
      return status.progressByContentId.get(contentId);
    },
    [status.progressByContentId]
  );

  const isContentIndexing = React.useCallback(
    (contentId: string): boolean => {
      return status.indexingContentIds.has(contentId);
    },
    [status.indexingContentIds]
  );

  const isContentFailed = React.useCallback(
    (contentId: string): boolean => {
      return status.failedContentIds.has(contentId);
    },
    [status.failedContentIds]
  );

  const getPocketIndexingStatus = React.useCallback(
    (contentIds: string[]) => {
      const indexing = contentIds.filter((id) => status.indexingContentIds.has(id));
      const failed = contentIds.filter((id) => status.failedContentIds.has(id));
      const completed = contentIds.filter(
        (id) => !status.indexingContentIds.has(id) && !status.failedContentIds.has(id)
      );

      return {
        totalContent: contentIds.length,
        indexingCount: indexing.length,
        failedCount: failed.length,
        completedCount: completed.length,
        isIndexing: indexing.length > 0,
        hasFailed: failed.length > 0,
        indexingContentIds: indexing,
        failedContentIds: failed,
      };
    },
    [status.indexingContentIds, status.failedContentIds]
  );

  const retryFailedIndexing = React.useCallback(async (contentId: string) => {
    try {
      await chrome.runtime.sendMessage({
        kind: "VECTOR_INDEXING_RETRY",
        requestId: crypto.randomUUID(),
        payload: { contentId },
      });
    } catch (error) {
      console.error("Failed to retry indexing:", error);
    }
  }, []);

  return {
    status,
    getContentStatus,
    isContentIndexing,
    isContentFailed,
    getPocketIndexingStatus,
    retryFailedIndexing,
  };
}
