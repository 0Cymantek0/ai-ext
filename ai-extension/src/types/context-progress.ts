/**
 * Context Progress Types
 *
 * Message types for real-time context gathering progress updates
 */

export type ContextProgressEventType =
  | "CONTEXT_GATHERING_STARTED"
  | "TAB_SEARCH_STARTED"
  | "TAB_SEARCH_PROGRESS"
  | "TAB_SEARCH_COMPLETE"
  | "PAGE_CONTEXT_STARTED"
  | "PAGE_CONTEXT_COMPLETE"
  | "HISTORY_CONTEXT_STARTED"
  | "HISTORY_CONTEXT_COMPLETE"
  | "RAG_SEARCH_STARTED"
  | "RAG_SEARCH_COMPLETE"
  | "CONTEXT_GATHERING_COMPLETE";

export interface ContextProgressEvent {
  type: ContextProgressEventType;
  conversationId?: string;
  data?: {
    totalTabs?: number;
    searchedTabs?: number;
    currentTab?: string;
    resultsCount?: number;
    duration?: number;
    messageCount?: number;
    chunkCount?: number;
    signals?: string[];
  };
}

export interface ContextProgressMessage {
  kind: "CONTEXT_PROGRESS";
  requestId: string;
  payload: ContextProgressEvent;
}
