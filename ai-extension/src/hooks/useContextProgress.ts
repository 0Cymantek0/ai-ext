/**
 * useContextProgress Hook
 * 
 * Manages context gathering progress state and listens for progress events
 */

import * as React from "react";
import type { ContextProgressEvent } from "@/types/context-progress";
import type { ContextStep } from "@/components/ai/ContextGatheringIndicator";

export function useContextProgress(conversationId: string | null) {
  const [steps, setSteps] = React.useState<ContextStep[]>([]);
  const [isGathering, setIsGathering] = React.useState(false);

  React.useEffect(() => {
    if (!conversationId) return;

    const handleMessage = (message: any) => {
      if (message.kind !== "CONTEXT_PROGRESS") return;
      if (message.payload.conversationId !== conversationId) return;

      const event: ContextProgressEvent = message.payload;

      switch (event.type) {
        case "CONTEXT_GATHERING_STARTED":
          setIsGathering(true);
          setSteps([]);
          break;

        case "TAB_SEARCH_STARTED":
          setSteps((prev) => [
            ...prev,
            {
              id: "tab-search",
              label: `Searching ${event.data?.totalTabs || 0} tabs`,
              icon: "🔍",
              status: "loading",
            },
          ]);
          break;

        case "TAB_SEARCH_COMPLETE":
          setSteps((prev) =>
            prev.map((step) =>
              step.id === "tab-search"
                ? {
                    ...step,
                    status: "complete" as const,
                    detail: `${event.data?.resultsCount || 0} results`,
                  }
                : step
            )
          );
          break;

        case "PAGE_CONTEXT_STARTED":
          setSteps((prev) => [
            ...prev,
            {
              id: "page-context",
              label: "Reading current page",
              icon: "📄",
              status: "loading",
            },
          ]);
          break;

        case "PAGE_CONTEXT_COMPLETE":
          setSteps((prev) =>
            prev.map((step) =>
              step.id === "page-context"
                ? { ...step, status: "complete" as const }
                : step
            )
          );
          break;

        case "HISTORY_CONTEXT_STARTED":
          setSteps((prev) => [
            ...prev,
            {
              id: "history-context",
              label: "Loading conversation history",
              icon: "💬",
              status: "loading",
            },
          ]);
          break;

        case "HISTORY_CONTEXT_COMPLETE":
          setSteps((prev) =>
            prev.map((step) =>
              step.id === "history-context"
                ? {
                    ...step,
                    status: "complete" as const,
                    detail: `${event.data?.messageCount || 0} messages`,
                  }
                : step
            )
          );
          break;

        case "RAG_SEARCH_STARTED":
          setSteps((prev) => [
            ...prev,
            {
              id: "rag-search",
              label: "Searching pockets",
              icon: "🗂️",
              status: "loading",
            },
          ]);
          break;

        case "RAG_SEARCH_COMPLETE":
          setSteps((prev) =>
            prev.map((step) =>
              step.id === "rag-search"
                ? {
                    ...step,
                    status: "complete" as const,
                    detail: `${event.data?.chunkCount || 0} chunks`,
                  }
                : step
            )
          );
          break;

        case "CONTEXT_GATHERING_COMPLETE":
          // Mark all remaining steps as complete
          setSteps((prev) =>
            prev.map((step) =>
              step.status === "loading"
                ? { ...step, status: "complete" as const }
                : step
            )
          );
          // Auto-hide after 2 seconds
          setTimeout(() => {
            setIsGathering(false);
            setSteps([]);
          }, 2000);
          break;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [conversationId]);

  return { steps, isGathering };
}
