import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Conversation,
  ConversationContent,
} from "@/components/ai/conversation";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ai/message";
import { Response } from "@/components/ai/response";
import {
  AIInputWithFile,
  type ModelOption,
} from "@/components/ui/ai-input-with-file";
import { Loader } from "@/components/ai/loader";
import { Actions, ActionButton } from "@/components/ai/actions";
import { TopBar } from "@/components/TopBar";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { HistoryPanel } from "@/components/HistoryPanel";
import { ProviderSettingsSheet } from "@/sidepanel/components/ProviderSettingsSheet";
import type { Mode } from "@/components/ModeSwitcher";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/animate-ui/components/animate/tooltip";
import {
  PocketManager,
  type PocketManagerRef,
  PocketSelectionModal,
} from "@/components/pockets";
import { NoteEditorPage } from "@/components/notes/NoteEditorPage";
import { ShareModal } from "@/components/ShareModal";
import { useIndexingStatus } from "@/hooks/useIndexingStatus";
import { IndexingWarningBanner } from "@/components/IndexingWarningBanner";
import { useContextProgress } from "@/hooks/useContextProgress";
import { ContextGatheringIndicator } from "@/components/ai/ContextGatheringIndicator";
import type {
  AiStreamEndPayload,
  AiStreamStartPayload,
  MessageMetadata,
  ProviderExecutionMetadata,
  ProviderSettingsSnapshot,
} from "@/shared/types/index.d";
import {
  attachPocketToConversation,
  detachPocketFromConversation,
  getAttachedPocket,
} from "@/shared/conversation-pocket-api";
import {
  exportToMarkdown,
  exportToJSON,
  exportToPDF,
  exportMessageToMarkdown,
  exportMessageToJSON,
  exportMessageToPDF,
} from "@/lib/export-utils";
import { importPocket } from "@/lib/pocket-export-service";
import { useVirtualizer } from "@tanstack/react-virtual";
import { getDevInstrumentation } from "@/devtools/instrumentation";
import { initKonamiCode, stopKonamiCode } from "@/utils/konami-code-listener";
import type {
  AgentRun,
  AgentRunEvent,
  AgentRunMode,
} from "@/shared/agent-runtime/contracts";
import {
  selectAgentPanelState,
  selectAgentTimeline,
} from "@/shared/agent-runtime/selectors";
import { buildReportViewerUrl } from "@/shared/reporting/viewer";
import { RunHistoryPanel } from "@/sidepanel/components/RunHistoryPanel";
import { RunReviewPanel } from "@/sidepanel/components/RunReviewPanel";
import { WorkflowLauncher } from "@/sidepanel/components/WorkflowLauncher";
import { useAgentRunEvents } from "@/sidepanel/hooks/useAgentRunEvents";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  files?: File[] | undefined;
  source?: "gemini-nano" | "gemini-flash" | "gemini-pro";
  metadata?: MessageMetadata;
  reasoning?: string;
}

interface ConversationMetadata {
  summary: string;
  keywords: string[];
  topics: string[];
  entities: string[];
  mainQuestions: string[];
  generatedAt: number;
}

interface ConversationData {
  id: string;
  title: string;
  timestamp: number;
  messageCount: number;
  messages?: Array<{ role: string; content: string }>;
  metadata?: ConversationMetadata;
}

interface PocketSelectionRequestState {
  requestId: string;
  pockets: Array<{
    id: string;
    name: string;
    description?: string;
    color?: string;
  }>;
  selectionText?: string;
  preview?: string;
  sourceUrl?: string;
}

type AssistantProvenance = {
  providerLabel: string;
  fallbackLabel?: string;
};

interface BrowserActionTabContext {
  tabId?: number;
  tabUrl?: string;
  tabTitle?: string;
}

interface PocketReportSummary {
  reportId: string;
  pocketId: string;
  generatedAt: number;
  title: string;
}

type ChatModelOption = ModelOption & {
  providerId?: string;
  providerType?: string;
  modelId?: string;
};

const AUTO_MODEL_OPTION: ChatModelOption = {
  value: "auto",
  label: "Auto",
  description: "Automatically route across your configured providers.",
  icon: "auto",
};

const isChatModelEntry = (
  entry: ProviderSettingsSnapshot["modelSheet"][string],
): boolean => {
  const normalizedModelId = entry.modelId.toLowerCase();
  if (normalizedModelId.includes("embedding")) {
    return false;
  }

  return !entry.capabilities?.supportsTranscription;
};

const getModelOptionIcon = (
  providerType?: string,
): NonNullable<ChatModelOption["icon"]> => {
  if (providerType === "gemini-nano" || providerType === "ollama") {
    return "local";
  }

  if (providerType === "google" || providerType === "openai") {
    return "cloud";
  }

  return "fast";
};

const buildChatModelOptions = (
  snapshot: ProviderSettingsSnapshot | null,
): ChatModelOption[] => {
  if (!snapshot?.providers) {
    return [AUTO_MODEL_OPTION];
  }

  const configuredOptions = snapshot.providers
    .filter((provider) => provider.enabled)
    .flatMap((provider) => {
      const providerEntries = Object.values(snapshot.modelSheet)
        .filter(
          (entry) =>
            entry.providerId === provider.id &&
            entry.enabled !== false &&
            (provider.type !== "gemini-nano" || entry.modelId === "gemini-nano") &&
            isChatModelEntry(entry),
        )
        .sort((left, right) => {
          if (left.modelId === provider.modelId) return -1;
          if (right.modelId === provider.modelId) return 1;
          return left.modelId.localeCompare(right.modelId);
        });

      if (
        provider.modelId &&
        !providerEntries.some((entry) => entry.modelId === provider.modelId)
      ) {
        providerEntries.unshift({
          modelId: provider.modelId,
          providerId: provider.id,
          providerType: provider.type,
          name: provider.modelId,
        });
      }

      return providerEntries.map((entry) => ({
        value: `${provider.id}::${entry.modelId}`,
        label: `${provider.name} • ${entry.name || entry.modelId}`,
        description: `${provider.type} • ${entry.modelId}`,
        icon: getModelOptionIcon(provider.type),
        providerId: provider.id,
        providerType: provider.type,
        modelId: entry.modelId,
      }));
    });

  return [AUTO_MODEL_OPTION, ...configuredOptions];
};

const resolveSelectedChatModel = (
  selectedValue: string,
  modelOptions: ChatModelOption[],
): ChatModelOption => {
  return (
    modelOptions.find((option) => option.value === selectedValue) ||
    AUTO_MODEL_OPTION
  );
};

const getProviderExecutionMetadata = (
  value: Partial<AiStreamStartPayload & AiStreamEndPayload> | undefined,
): ProviderExecutionMetadata | undefined => {
  if (!value?.providerId || !value?.providerType || !value?.modelId) {
    return undefined;
  }

  return {
    providerId: value.providerId,
    providerType: value.providerType,
    modelId: value.modelId,
    attemptedProviderIds: value.attemptedProviderIds || [value.providerId],
    fallbackOccurred: value.fallbackOccurred ?? false,
    ...(value.fallbackFromProviderId
      ? { fallbackFromProviderId: value.fallbackFromProviderId }
      : {}),
  };
};

const getAssistantProvenance = (
  message: ChatMessage,
  providerNameLookup?: Record<string, string>,
): AssistantProvenance | undefined => {
  const providerExecution = message.metadata?.providerExecution;

  if (providerExecution) {
    const displayName =
      providerNameLookup?.[providerExecution.providerId] ||
      providerExecution.providerType ||
      providerExecution.providerId;
    return {
      providerLabel: `${displayName} • ${providerExecution.modelId}`,
      ...(providerExecution.fallbackOccurred &&
      providerExecution.fallbackFromProviderId
        ? {
            fallbackLabel: `Fallback from ${providerNameLookup?.[providerExecution.fallbackFromProviderId] || providerExecution.fallbackFromProviderId}`,
          }
        : {}),
    };
  }

  if (message.source) {
    return {
      providerLabel: message.source,
    };
  }

  return undefined;
};

function ThinkingBlock({ reasoning }: { reasoning: string }) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <div className="mb-2 w-full">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            isExpanded && "rotate-90",
          )}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
        <span className="font-medium">Thinking</span>
        <span className="text-muted-foreground/60">
          ({reasoning.length} chars)
        </span>
      </button>
      {isExpanded && (
        <div className="mt-1.5 p-3 rounded-lg bg-muted/50 border border-border/50 text-xs text-muted-foreground whitespace-pre-wrap max-h-[300px] overflow-y-auto leading-relaxed">
          {reasoning}
        </div>
      )}
    </div>
  );
}

export function ChatApp() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [currentRequestId, setCurrentRequestId] = React.useState<string | null>(
    null,
  );
  const [conversations, setConversations] = React.useState<ConversationData[]>(
    [],
  );
  const [currentConversationId, setCurrentConversationId] = React.useState<
    string | null
  >(null);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);

  // Context gathering progress
  const { steps: contextSteps, isGathering } = useContextProgress(
    currentConversationId,
  );
  const [currentMode, setCurrentMode] = React.useState<Mode>("ask");
  const conversationContentRef = React.useRef<HTMLDivElement>(null);
  // Floating mode switcher removed; drop scroll bookkeeping
  const pocketManagerRef = React.useRef<PocketManagerRef>(null);
  // Track if the conversation scroll is at the very top
  const [isAtTop, setIsAtTop] = React.useState(true);
  // Auto context toggle - enabled by default
  const [autoContext, setAutoContext] = React.useState(true);
  // Track if user is inside a pocket
  const [isInsidePocket, setIsInsidePocket] = React.useState(false);
  // Store current pocket ID for add actions
  const [currentPocketId, setCurrentPocketId] = React.useState<string | null>(
    null,
  );
  const [currentPocketName, setCurrentPocketName] = React.useState<string | null>(
    null,
  );
  const [latestPocketReport, setLatestPocketReport] =
    React.useState<PocketReportSummary | null>(null);
  const [isGeneratingPocketReport, setIsGeneratingPocketReport] =
    React.useState(false);
  const [pocketReportError, setPocketReportError] = React.useState<string | null>(
    null,
  );
  const [linkedResearchPocketToOpen, setLinkedResearchPocketToOpen] =
    React.useState<string | null>(null);
  // Pending pocket selection request from background
  const [pendingSelectionRequest, setPendingSelectionRequest] =
    React.useState<PocketSelectionRequestState | null>(null);
  // Note editor state
  const [showNoteEditor, setShowNoteEditor] = React.useState(false);
  const [isSavingNote, setIsSavingNote] = React.useState(false);
  // Share modal state
  const [showShareModal, setShowShareModal] = React.useState(false);
  // Provider settings state
  const [showProviderSettings, setShowProviderSettings] = React.useState(false);
  const [settingsSnapshot, setSettingsSnapshot] =
    React.useState<ProviderSettingsSnapshot | null>(null);
  // Export menu state - track which message's export menu is open
  const [exportMenuOpenForMessage, setExportMenuOpenForMessage] =
    React.useState<string | null>(null);
  // Virtual scroll activation threshold and setup
  const useVirtualizedMessages = messages.length > 50;
  // Attached pockets for current conversation
  const [attachedPocketIds, setAttachedPocketIds] = React.useState<string[]>(
    [],
  );
  const [attachedPockets, setAttachedPockets] = React.useState<
    Array<{ id: string; name: string; description?: string; color?: string }>
  >([]);
  const rowVirtualizer = useVirtualizer({
    count: useVirtualizedMessages ? messages.length : 0,
    getScrollElement: () => conversationContentRef.current,
    estimateSize: () => 96,
    overscan: 8,
  });

  const devtools = React.useMemo(
    () =>
      import.meta.env?.VITE_DEBUG_RECORDER
        ? getDevInstrumentation("sidepanel")
        : null,
    [],
  );

  const [selectedModel, setSelectedModel] = React.useState("auto");
  const chatModelOptions = React.useMemo(
    () => buildChatModelOptions(settingsSnapshot),
    [settingsSnapshot],
  );
  const providerNameLookup = React.useMemo(() => {
    if (!settingsSnapshot?.providers) return {};
    return Object.fromEntries(
      settingsSnapshot.providers.map((p) => [p.id, p.name || p.type]),
    );
  }, [settingsSnapshot]);
  const selectedChatModel = React.useMemo(
    () => resolveSelectedChatModel(selectedModel, chatModelOptions),
    [chatModelOptions, selectedModel],
  );
  // ── Workflow Run IDs (lightweight launch/control state) ────────────────
  const [browserActionRunId, setBrowserActionRunId] = React.useState<string | null>(null);
  const [deepResearchRunId, setDeepResearchRunId] = React.useState<string | null>(null);
  const [browserActionError, setBrowserActionError] = React.useState<
    string | null
  >(null);
  const [deepResearchError, setDeepResearchError] = React.useState<
    string | null
  >(null);

  // ── Isolated workflow streams (UX-05: bounded per-run subscriptions) ───
  const browserActionStream = useAgentRunEvents(browserActionRunId);
  const deepResearchStream = useAgentRunEvents(deepResearchRunId);

  // ── Workflow Launcher State (Phase 13-03) ─────────────────────────────────
  const [activeWorkflowMode, setActiveWorkflowMode] = React.useState<AgentRunMode>("browser-action");
  const [browserActionModel, setBrowserActionModel] = React.useState("auto");
  const [deepResearchModel, setDeepResearchModel] = React.useState("auto");

  // Resolve workflow-specific models (for launch handlers)
  const browserActionResolvedModel = React.useMemo(
    () => resolveSelectedChatModel(browserActionModel, chatModelOptions),
    [chatModelOptions, browserActionModel],
  );
  const deepResearchResolvedModel = React.useMemo(
    () => resolveSelectedChatModel(deepResearchModel, chatModelOptions),
    [chatModelOptions, deepResearchModel],
  );
  const [isRunHistoryOpen, setIsRunHistoryOpen] = React.useState(false);
  const [runHistoryList, setRunHistoryList] = React.useState<AgentRun[]>([]);
  const [isRunHistoryLoading, setIsRunHistoryLoading] = React.useState(false);
  const [selectedHistoricalRun, setSelectedHistoricalRun] = React.useState<AgentRun | null>(null);
  const [selectedHistoricalTimeline, setSelectedHistoricalTimeline] = React.useState<
    import("@/shared/agent-runtime/selectors").AgentTimelineEntry[]
  >([]);
  const [isHistoricalReviewOpen, setIsHistoricalReviewOpen] = React.useState(false);

  const browserActionPanel = React.useMemo(
    () =>
      browserActionStream.run
        ? selectAgentPanelState(browserActionStream.run, browserActionStream.events)
        : null,
    [browserActionStream.run, browserActionStream.events],
  );
  const browserActionTimeline = browserActionStream.timeline;
  const browserActionRequiresExplicitModel =
    !browserActionResolvedModel.providerId ||
    !browserActionResolvedModel.providerType ||
    !browserActionResolvedModel.modelId;
  const deepResearchPanel = React.useMemo(
    () =>
      deepResearchStream.run
        ? selectAgentPanelState(deepResearchStream.run, deepResearchStream.events)
        : null,
    [deepResearchStream.run, deepResearchStream.events],
  );
  const deepResearchTimeline = deepResearchStream.timeline;


  // Indexing status hook
  const indexingStatus = useIndexingStatus();

  React.useEffect(() => {
    if (!currentPocketId) {
      setLatestPocketReport(null);
      setPocketReportError(null);
      return;
    }

    let isActive = true;

    const loadLatestPocketReport = async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          kind: "REPORT_LIST",
          requestId: crypto.randomUUID(),
          payload: { pocketId: currentPocketId },
        });

        if (!isActive) {
          return;
        }

        if (response?.success) {
          setLatestPocketReport(response.data?.reports?.[0] ?? null);
          setPocketReportError(null);
          return;
        }

        setLatestPocketReport(null);
        setPocketReportError(response?.error || "Failed to load report status");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setLatestPocketReport(null);
        setPocketReportError(
          error instanceof Error ? error.message : "Failed to load report status",
        );
      }
    };

    void loadLatestPocketReport();

    return () => {
      isActive = false;
    };
  }, [currentPocketId]);

  const mapSelectedToPreferLocal = (
    modelOption: ChatModelOption,
  ): boolean | undefined => {
    if (modelOption.value === "auto") {
      return true;
    }

    return modelOption.providerType === "gemini-nano" ||
      modelOption.providerType === "ollama"
      ? true
      : false;
  };

  const mapSelectedToConversationModel = (
    modelOption: ChatModelOption,
  ): "gemini-nano" | "gemini-flash" | "gemini-pro" => {
    if (
      modelOption.providerType === "gemini-nano" ||
      modelOption.value === "auto"
    ) {
      return "gemini-nano";
    }

    if (modelOption.modelId?.toLowerCase().includes("pro")) {
      return "gemini-pro";
    }

    return "gemini-flash";
  };

  const getActiveTabContext = React.useCallback(async (): Promise<BrowserActionTabContext> => {
    if (!chrome.tabs?.query) {
      return {};
    }

    try {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });

      return {
        ...(typeof activeTab?.id === "number" ? { tabId: activeTab.id } : {}),
        ...(typeof activeTab?.url === "string" ? { tabUrl: activeTab.url } : {}),
        ...(typeof activeTab?.title === "string"
          ? { tabTitle: activeTab.title }
          : {}),
      };
    } catch (error) {
      console.error("Failed to resolve active tab context for browser action:", error);
      return {};
    }
  }, []);

  const loadConversations = async () => {
    console.log("📋 Loading conversations from IndexedDB...");
    try {
      // Load all conversations from IndexedDB via service worker
      const response = await chrome.runtime.sendMessage({
        kind: "CONVERSATION_LIST",
        requestId: crypto.randomUUID(),
        payload: {},
      });

      console.log("Response from CONVERSATION_LIST:", response);

      if (response.success && response.data.conversations) {
        console.log(
          `Found ${response.data.conversations.length} conversations in database`,
        );

        // Transform IndexedDB Conversation to UI ConversationData format
        const conversationData: ConversationData[] =
          response.data.conversations.map((conv: any) => {
            // Prefer the first user message, then fall back to the first message
            const firstUserMessage = conv.messages?.find(
              (m: any) => m.role === "user",
            );
            const firstMessage = conv.messages?.[0];
            let title = "New Conversation";

            const titleSource = firstUserMessage || firstMessage;
            if (titleSource?.content) {
              const content = titleSource.content;
              title =
                content.length > 50 ? content.slice(0, 50) + "..." : content;
            }

            console.log(
              `  - Conversation "${title}" (${conv.messages?.length || 0} messages)`,
            );

            return {
              id: conv.id,
              title,
              timestamp: conv.updatedAt || conv.createdAt,
              messageCount: conv.messages?.length || 0,
              messages:
                conv.messages?.map((m: any) => ({
                  role: m.role,
                  content: m.content,
                })) || [],
              metadata: conv.metadata,
            };
          });

        // Sort by timestamp descending (newest first)
        conversationData.sort((a, b) => b.timestamp - a.timestamp);
        setConversations(conversationData);
        console.log(
          `✅ Loaded ${conversationData.length} conversations successfully`,
        );
      } else {
        console.log("⚠️ No conversations found or response unsuccessful");
        setConversations([]);
      }
    } catch (error) {
      console.error("❌ Failed to load conversations:", error);
      setConversations([]);
    }
  };

  const loadSettingsSnapshot = React.useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "SETTINGS_SNAPSHOT_LOAD",
        requestId: crypto.randomUUID(),
        payload: {},
      });

      if (response.success && response.data) {
        const snapshot = response.data as ProviderSettingsSnapshot;
        setSettingsSnapshot(snapshot);

        const nextOptions = buildChatModelOptions(snapshot);
        setSelectedModel((current) =>
          nextOptions.some((option) => option.value === current)
            ? current
            : "auto",
        );
      }
    } catch (error) {
      console.error("Failed to load provider/model settings snapshot:", error);
    }
  }, []);

  // Streaming handlers with useCallback to prevent stale closures
  const handleStreamStart = React.useCallback(
    (payload: AiStreamStartPayload) => {
      const providerExecution = getProviderExecutionMetadata(payload);
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        const nextMessage: ChatMessage = {
          ...(lastMessage &&
          lastMessage.role === "assistant" &&
          lastMessage.isStreaming &&
          lastMessage.content.length === 0
            ? lastMessage
            : {
                id: crypto.randomUUID(),
                role: "assistant" as const,
                content: "",
                timestamp: Date.now(),
              }),
          id:
            payload.messageId ||
            (lastMessage &&
            lastMessage.role === "assistant" &&
            lastMessage.isStreaming &&
            lastMessage.content.length === 0
              ? lastMessage.id
              : crypto.randomUUID()),
          isStreaming: true,
          ...(providerExecution
            ? {
                metadata: {
                  ...((lastMessage &&
                    lastMessage.role === "assistant" &&
                    lastMessage.isStreaming &&
                    lastMessage.content.length === 0 &&
                    lastMessage.metadata) ||
                    {}),
                  providerExecution,
                },
              }
            : {}),
        };

        if (
          lastMessage &&
          lastMessage.role === "assistant" &&
          lastMessage.isStreaming &&
          lastMessage.content.length === 0
        ) {
          return [...prev.slice(0, -1), nextMessage];
        }

        return [...prev, nextMessage];
      });
      setIsLoading(false);
    },
    [],
  );

  const handleStreamChunk = React.useCallback((payload: { chunk: string }) => {
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.isStreaming) {
        return [
          ...prev.slice(0, -1),
          {
            ...lastMessage,
            content: lastMessage.content + payload.chunk,
          },
        ];
      }
      return prev;
    });
  }, []);

  const handleStreamReasoning = React.useCallback(
    (payload: { text: string }) => {
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && lastMessage.isStreaming) {
          return [
            ...prev.slice(0, -1),
            {
              ...lastMessage,
              reasoning: (lastMessage.reasoning || "") + payload.text,
            },
          ];
        }
        return prev;
      });
    },
    [],
  );

  const saveConversationRef = React.useRef<(() => Promise<void>) | null>(null);

  const handleStreamEnd = React.useCallback(
    async (payload: AiStreamEndPayload) => {
      const providerExecution = getProviderExecutionMetadata(payload);

      // Update the streaming status first
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && lastMessage.isStreaming) {
          return [
            ...prev.slice(0, -1),
            {
              ...lastMessage,
              isStreaming: false,
              source: payload.source,
              metadata: {
                ...(lastMessage.metadata || {}),
                ...(payload.processingTime !== undefined
                  ? { processingTime: payload.processingTime }
                  : {}),
                ...(payload.totalTokens !== undefined
                  ? { tokensUsed: payload.totalTokens }
                  : {}),
                ...(payload.mode ? { mode: payload.mode } : {}),
                ...(payload.contextUsed
                  ? { contextUsed: payload.contextUsed }
                  : {}),
                ...(providerExecution ? { providerExecution } : {}),
              },
            },
          ];
        }
        return prev;
      });
      setCurrentRequestId(null);

      // Save conversation - wait for state to settle
      setTimeout(async () => {
        try {
          if (saveConversationRef.current) {
            await saveConversationRef.current();
            console.log("✅ Conversation saved successfully");
          }
        } catch (error) {
          console.error("❌ Failed to save conversation:", error);
        }
      }, 100);
    },
    [],
  );

  const handleStreamError = React.useCallback((payload: { error: string }) => {
    setMessages((prev) => {
      const nextMessages =
        prev.length > 0 &&
        prev[prev.length - 1]?.role === "assistant" &&
        prev[prev.length - 1]?.isStreaming &&
        prev[prev.length - 1]?.content.length === 0
          ? prev.slice(0, -1)
          : prev;

      return [
        ...nextMessages,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: `⚠️ Error: ${payload.error}`,
          timestamp: Date.now(),
        },
      ];
    });
    setIsLoading(false);
    setCurrentRequestId(null);
  }, []);

  const handlePocketSelectionConfirm = React.useCallback(
    async (pocketId: string, editedTitle?: string) => {
      if (!pendingSelectionRequest) return;
      try {
        await chrome.runtime.sendMessage({
          kind: "POCKET_SELECTION_RESPONSE",
          payload: {
            requestId: pendingSelectionRequest.requestId,
            status: "success",
            pocketId,
            editedTitle,
          },
        });
      } catch (error) {
        console.error("Failed to acknowledge pocket selection", error);
      } finally {
        setPendingSelectionRequest(null);
      }
    },
    [pendingSelectionRequest],
  );

  const handlePocketSelectionCancel = React.useCallback(async () => {
    if (!pendingSelectionRequest) return;
    try {
      await chrome.runtime.sendMessage({
        kind: "POCKET_SELECTION_RESPONSE",
        payload: {
          requestId: pendingSelectionRequest.requestId,
          status: "cancelled",
        },
      });
    } catch (error) {
      console.error("Failed to cancel pocket selection", error);
    } finally {
      setPendingSelectionRequest(null);
    }
  }, [pendingSelectionRequest]);

  // Set up message listener for streaming responses
  React.useEffect(() => {
    const messageListener = (message: any) => {
      switch (message.kind) {
        case "AI_PROCESS_STREAM_START":
          handleStreamStart(message.payload);
          break;
        case "AI_PROCESS_STREAM_CHUNK":
          handleStreamChunk(message.payload);
          break;
        case "AI_PROCESS_STREAM_REASONING":
          handleStreamReasoning(message.payload);
          break;
        case "AI_PROCESS_STREAM_END":
          handleStreamEnd(message.payload);
          break;
        case "AI_PROCESS_STREAM_ERROR":
          handleStreamError(message.payload);
          break;
        case "AGENT_RUN_STATUS":
          // Set lightweight runId so useAgentRunEvents can hydrate.
          // The hook manages its own events/run detail state.
          if (message.payload?.run) {
            const run = message.payload.run;
            if (run.mode === "browser-action") {
              setBrowserActionRunId(run.runId);
            } else if (run.mode === "deep-research") {
              setDeepResearchRunId(run.runId);
            }
          }
          break;
        case "POCKET_SELECTION_REQUEST": {
          const payload = message.payload || {};
          setPendingSelectionRequest({
            requestId: payload.requestId,
            pockets: payload.pockets || [],
            selectionText: payload.selectionText,
            preview: payload.preview,
            sourceUrl: payload.sourceUrl,
          });
          break;
        }
        case "POCKET_SELECTION_RESPONSE": {
          const payload = message.payload || {};
          if (
            pendingSelectionRequest &&
            payload.requestId === pendingSelectionRequest.requestId
          ) {
            setPendingSelectionRequest(null);
          }
          break;
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [
    handleStreamStart,
    handleStreamChunk,
    handleStreamReasoning,
    handleStreamEnd,
    handleStreamError,
    pendingSelectionRequest,
  ]);

  // Load conversations on mount
  React.useEffect(() => {
    loadConversations();
    void loadSettingsSnapshot();
  }, [loadSettingsSnapshot]);

  React.useEffect(() => {
    if (!showProviderSettings) {
      void loadSettingsSnapshot();
    }
  }, [loadSettingsSnapshot, showProviderSettings]);

  React.useEffect(() => {
    if (browserActionError && !browserActionRequiresExplicitModel) {
      setBrowserActionError(null);
    }
  }, [browserActionError, browserActionRequiresExplicitModel]);

  // Initialize Konami code listener for Zork Easter egg
  React.useEffect(() => {
    const handleKonamiCode = () => {
      // Open Zork game in a new window
      const zorkUrl = chrome.runtime.getURL("src/pages/zork/index.html");
      window.open(zorkUrl, "_blank", "width=1024,height=768");
    };

    initKonamiCode(handleKonamiCode);

    return () => {
      stopKonamiCode();
    };
  }, []);

  const handleSubmit = async (text: string, files?: File[]) => {
    const hasText = Boolean(text?.trim());
    const hasFiles = Array.isArray(files) && files.length > 0;

    if (!hasText && !hasFiles) {
      return;
    }

    if (isLoading) {
      return;
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text || (hasFiles ? "Sent with attachments" : ""),
      timestamp: Date.now(),
      files: hasFiles ? files : undefined,
    };

    const pendingAssistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, pendingAssistantMessage]);
    setIsLoading(true);

    // Generate or use existing conversation ID
    const requestId = crypto.randomUUID();
    const conversationId = currentConversationId || crypto.randomUUID();

    if (!currentConversationId) {
      setCurrentConversationId(conversationId);
    }

    // Save conversation immediately after user message (don't wait for AI response)
    // This ensures conversations are saved even if AI doesn't respond
    setTimeout(async () => {
      try {
        console.log("💾 Saving conversation after user message...");
        // Create a temporary messages array with the user message
        const tempMessages = [...messages, userMessage];

        // Transform to IndexedDB format
        const dbMessages = tempMessages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          source: "gemini-nano" as const,
          metadata: { tokensUsed: 0 },
        }));

        // Check if conversation exists
        const existingResponse = await chrome.runtime.sendMessage({
          kind: "CONVERSATION_GET",
          requestId: crypto.randomUUID(),
          payload: { conversationId },
        });

        if (existingResponse.success && existingResponse.data.conversation) {
          // Update existing - add the user message
          const lastMessage = dbMessages[dbMessages.length - 1];
          if (lastMessage) {
            await chrome.runtime.sendMessage({
              kind: "CONVERSATION_UPDATE",
              requestId: crypto.randomUUID(),
              payload: {
                conversationId,
                message: lastMessage,
              },
            });
            console.log("✅ User message added to existing conversation");
          }
        } else {
          // Create new conversation
          await chrome.runtime.sendMessage({
            kind: "CONVERSATION_CREATE",
            requestId: crypto.randomUUID(),
            payload: {
              conversationId,
              messages: dbMessages,
              model: mapSelectedToConversationModel(selectedChatModel),
              pocketId: undefined,
            },
          });
          console.log("✅ New conversation created with user message");

          // Attach pockets if any were selected
          if (attachedPocketIds.length > 0) {
            try {
              for (const pocketId of attachedPocketIds) {
                await attachPocketToConversation(conversationId, pocketId);
                console.log(
                  `✅ Pocket ${pocketId} attached to new conversation`,
                );
              }
            } catch (error) {
              console.error(
                "Failed to attach pockets to new conversation:",
                error,
              );
            }
          }
        }

        // Refresh conversation list
        await loadConversations();
      } catch (error) {
        console.error(
          "❌ Failed to save conversation after user message:",
          error,
        );
      }
    }, 100);

    // Emit context gathering started event
    try {
      await chrome.runtime.sendMessage({
        kind: "CONTEXT_PROGRESS",
        requestId: crypto.randomUUID(),
        payload: {
          type: "CONTEXT_GATHERING_STARTED",
          conversationId,
        },
      });
    } catch (error) {
      // Non-critical, continue
    }

    // Send request to service worker with mode information
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "AI_PROCESS_STREAM_START",
        requestId,
        payload: {
          prompt: text || "Sent with attachment",
          conversationId,
          preferLocal: mapSelectedToPreferLocal(selectedChatModel),
          ...(selectedChatModel.value === "auto"
            ? { model: "auto" as const }
            : {}),
          ...(selectedChatModel.providerId
            ? { providerId: selectedChatModel.providerId }
            : {}),
          ...(selectedChatModel.modelId
            ? { modelId: selectedChatModel.modelId }
            : {}),
          mode: currentMode, // Include current mode
          autoContext, // Use state variable for automatic context inclusion
        },
      });

      if (response.success) {
        setCurrentRequestId(requestId);
      } else {
        handleStreamError({ error: "Failed to start AI processing" });
      }
    } catch (error) {
      handleStreamError({ error: "Failed to send message" });
    }
  };

  const handleCancel = async () => {
    if (currentRequestId) {
      await chrome.runtime.sendMessage({
        kind: "AI_PROCESS_CANCEL",
        requestId: crypto.randomUUID(),
        payload: {
          requestId: currentRequestId,
        },
      });
      setCurrentRequestId(null);
      setIsLoading(false);
    }
  };

  const handleBrowserActionLaunch = React.useCallback(async (task: string) => {
    if (!task.trim()) {
      return;
    }

    if (
      !browserActionResolvedModel.providerId ||
      !browserActionResolvedModel.providerType ||
      !browserActionResolvedModel.modelId
    ) {
      setBrowserActionError(
        "Choose a configured model from the workflow model selector before launching.",
      );
      return;
    }

    setBrowserActionError(null);

    const conversationId = currentConversationId || crypto.randomUUID();
    if (!currentConversationId) {
      setCurrentConversationId(conversationId);
    }

    try {
      const tabContext = await getActiveTabContext();
      const payload = {
        mode: "browser-action" as const,
        task,
        providerId: browserActionResolvedModel.providerId,
        providerType: browserActionResolvedModel.providerType,
        modelId: browserActionResolvedModel.modelId,
        conversationId,
        ...tabContext,
        metadata: {
          currentIntent: task,
        },
      };

      const response = await chrome.runtime.sendMessage({
        kind: "AGENT_RUN_START",
        requestId: crypto.randomUUID(),
        payload,
      });

      if (!response?.success || !response.run) {
        setBrowserActionError(response?.error || "Failed to launch browser action.");
        return;
      }

      // Set the runId — the useAgentRunEvents hook will hydrate automatically
      setBrowserActionRunId(response.run.runId);
    } catch (error) {
      setBrowserActionError(
        error instanceof Error ? error.message : "Failed to launch browser action.",
      );
    }
  }, [
    currentConversationId,
    getActiveTabContext,
    browserActionResolvedModel.modelId,
    browserActionResolvedModel.providerId,
    browserActionResolvedModel.providerType,
  ]);

  const handleDeepResearchLaunch = React.useCallback(async (topic: string, goal: string) => {
    if (!topic.trim() || !goal.trim()) {
      return;
    }

    if (
      !deepResearchResolvedModel.providerId ||
      !deepResearchResolvedModel.providerType ||
      !deepResearchResolvedModel.modelId
    ) {
      setDeepResearchError(
        "Choose a configured model from the workflow model selector before launching.",
      );
      return;
    }

    setDeepResearchError(null);

    const conversationId = currentConversationId || crypto.randomUUID();
    if (!currentConversationId) {
      setCurrentConversationId(conversationId);
    }

    try {
      const tabContext = await getActiveTabContext();
      const response = await chrome.runtime.sendMessage({
        kind: "AGENT_RUN_START",
        requestId: crypto.randomUUID(),
        payload: {
          mode: "deep-research" as const,
          topic,
          goal,
          providerId: deepResearchResolvedModel.providerId,
          providerType: deepResearchResolvedModel.providerType,
          modelId: deepResearchResolvedModel.modelId,
          conversationId,
          ...tabContext,
          metadata: {
            currentIntent: `Plan research for ${topic}`,
          },
        },
      });

      if (!response?.success || !response.run) {
        setDeepResearchError(response?.error || "Failed to launch deep research.");
        return;
      }

      // Set the runId — the useAgentRunEvents hook will hydrate automatically
      setDeepResearchRunId(response.run.runId);
    } catch (error) {
      setDeepResearchError(
        error instanceof Error ? error.message : "Failed to launch deep research.",
      );
    }
  }, [
    currentConversationId,
    getActiveTabContext,
    deepResearchResolvedModel.modelId,
    deepResearchResolvedModel.providerId,
    deepResearchResolvedModel.providerType,
  ]);

  const handleApprovalResolve = React.useCallback(
    async (runId: string, approvalId: string, resolution: "approved" | "rejected") => {
      try {
        await chrome.runtime.sendMessage({
          kind: "AGENT_RUN_APPROVAL_RESOLVE",
          requestId: crypto.randomUUID(),
          payload: {
            runId,
            approvalId,
            resolution,
          },
        });
      } catch (error) {
        console.error("Failed to resolve approval:", error);
      }
    },
    [],
  );

  const handleRunControl = React.useCallback(
    async (action: "pause" | "resume" | "cancel") => {
      if (!browserActionStream.run) return;

      try {
        await chrome.runtime.sendMessage({
          kind: "AGENT_RUN_CONTROL",
          requestId: crypto.randomUUID(),
          payload: {
            runId: browserActionStream.run.runId,
            action,
          },
        });
      } catch (error) {
        console.error(`Failed to ${action} run:`, error);
      }
    },
    [browserActionStream.run],
  );

  const handleDeepResearchRunControl = React.useCallback(
    async (action: "pause" | "resume" | "cancel") => {
      if (!deepResearchStream.run) return;

      try {
        await chrome.runtime.sendMessage({
          kind: "AGENT_RUN_CONTROL",
          requestId: crypto.randomUUID(),
          payload: {
            runId: deepResearchStream.run.runId,
            action,
          },
        });
      } catch (error) {
        console.error("Failed to control deep research run:", error);
      }
    },
    [deepResearchStream.run],
  );

  // ── Historical Run Review Handlers (Phase 13-02) ─────────────────────────

  const handleOpenRunHistory = React.useCallback(async () => {
    setIsRunHistoryOpen(true);
    setIsRunHistoryLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "AGENT_RUN_HISTORY_LIST",
        requestId: crypto.randomUUID(),
        payload: {},
      });
      if (response?.success) {
        setRunHistoryList(response.runs ?? []);
      }
    } catch (error) {
      console.error("Failed to load run history:", error);
    } finally {
      setIsRunHistoryLoading(false);
    }
  }, []);

  const handleCloseRunHistory = React.useCallback(() => {
    setIsRunHistoryOpen(false);
  }, []);

  const handleSelectHistoricalRun = React.useCallback(async (runId: string) => {
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "AGENT_RUN_HISTORY_DETAIL",
        requestId: crypto.randomUUID(),
        payload: { runId },
      });
      if (response?.success) {
        const rawEvents: AgentRunEvent[] = response.events ?? [];
        setSelectedHistoricalRun(response.run);
        setSelectedHistoricalTimeline(selectAgentTimeline(rawEvents));
        setIsHistoricalReviewOpen(true);
        setIsRunHistoryOpen(false);
      }
    } catch (error) {
      console.error("Failed to load run detail:", error);
    }
  }, []);

  const handleCloseHistoricalReview = React.useCallback(() => {
    setIsHistoricalReviewOpen(false);
    setSelectedHistoricalRun(null);
    setSelectedHistoricalTimeline([]);
  }, []);

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    // Could add a toast notification here
  };

  const handleRegenerate = async (messageId: string) => {
    // Find the user message before this assistant message
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex > 0) {
      const userMessage = messages[messageIndex - 1];
      if (userMessage && userMessage.role === "user") {
        // Remove the assistant message and resend
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        // Resend the user message
        const prevFiles = userMessage.files;
        handleSubmit(userMessage.content, prevFiles);
      }
    }
  };

  const handleShare = () => {
    if (messages.length === 0) {
      alert("No messages to share");
      return;
    }
    setShowShareModal(true);
  };

  const handleExportAll = (format: "markdown" | "json" | "pdf") => {
    if (messages.length === 0) {
      alert("No messages to export");
      return;
    }
    try {
      switch (format) {
        case "markdown":
          exportToMarkdown(messages);
          break;
        case "json":
          exportToJSON(messages);
          break;
        case "pdf":
          exportToPDF(messages);
          break;
      }
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export conversation. Please try again.");
    }
  };

  const handleExportMessage = (
    message: ChatMessage,
    format: "markdown" | "json" | "pdf",
  ) => {
    try {
      switch (format) {
        case "markdown":
          exportMessageToMarkdown(message);
          break;
        case "json":
          exportMessageToJSON(message);
          break;
        case "pdf":
          exportMessageToPDF(message);
          break;
      }
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export message. Please try again.");
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentConversationId(null);
    setAttachedPocketIds([]);
    setAttachedPockets([]);
  };

  // Handle pocket attachment
  const handleAttachPocket = async (pocketId: string) => {
    if (!currentConversationId) {
      // Store for when conversation is created - add to list if not already present
      if (!attachedPocketIds.includes(pocketId)) {
        try {
          // Fetch pocket details to display in UI
          const response = await chrome.runtime.sendMessage({
            kind: "POCKET_GET",
            requestId: crypto.randomUUID(),
            payload: { pocketId },
          });

          if (response.success && response.data?.pocket) {
            const pocket = response.data.pocket;
            setAttachedPocketIds([...attachedPocketIds, pocketId]);
            setAttachedPockets([
              ...attachedPockets,
              {
                id: pocket.id,
                name: pocket.name,
                description: pocket.description,
                color: pocket.color,
              },
            ]);
          }
        } catch (error) {
          console.error("Failed to fetch pocket details:", error);
        }
      }
      return;
    }

    try {
      await attachPocketToConversation(currentConversationId, pocketId);

      // Reload attached pockets
      const result = await getAttachedPocket(currentConversationId);
      setAttachedPocketIds(result.attachedPocketIds || []);
      setAttachedPockets(result.pockets || []);

      console.log(
        `✅ Pocket ${pocketId} attached to conversation ${currentConversationId}`,
      );
    } catch (error) {
      console.error("Failed to attach pocket:", error);
      alert("Failed to attach pocket. Please try again.");
    }
  };

  const handleDetachPocket = async (pocketId?: string) => {
    if (!currentConversationId) {
      if (pocketId) {
        setAttachedPocketIds(attachedPocketIds.filter((id) => id !== pocketId));
        setAttachedPockets(attachedPockets.filter((p) => p.id !== pocketId));
      } else {
        setAttachedPocketIds([]);
        setAttachedPockets([]);
      }
      return;
    }

    try {
      await detachPocketFromConversation(currentConversationId, pocketId);

      // Reload attached pockets
      const result = await getAttachedPocket(currentConversationId);
      setAttachedPocketIds(result.attachedPocketIds || []);
      setAttachedPockets(result.pockets || []);

      console.log(
        `✅ Pocket ${pocketId || "all"} detached from conversation ${currentConversationId}`,
      );
    } catch (error) {
      console.error("Failed to detach pocket:", error);
      alert("Failed to detach pocket. Please try again.");
    }
  };

  const handleNewPocket = () => {
    if (pocketManagerRef.current) {
      pocketManagerRef.current.handleNewPocket();
    }
  };

  const handleImportPocket = () => {
    // Create a file input element
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".zip";
    fileInput.multiple = false;

    fileInput.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        console.log("Importing pocket from:", file.name);
        await importPocket(file);

        // Reload pocket list
        if (pocketManagerRef.current) {
          pocketManagerRef.current.reload();
        }

        alert(`Successfully imported pocket from ${file.name}`);
      } catch (error) {
        console.error("Import failed:", error);
        alert(
          `Failed to import pocket: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    };

    // Trigger file selection
    fileInput.click();
  };

  const handleInsidePocketChange = (isInside: boolean) => {
    setIsInsidePocket(isInside);
    if (!isInside) {
      setCurrentPocketId(null);
      setCurrentPocketName(null);
      setLatestPocketReport(null);
      setPocketReportError(null);
      setIsGeneratingPocketReport(false);
    }
  };

  const openPocketReport = React.useCallback(
    (input: { reportId?: string; pocketId?: string; generate?: boolean }) => {
      const url = buildReportViewerUrl(chrome.runtime.getURL("/"), input);
      chrome.tabs.create({ url });
    },
    [],
  );

  const handleOpenPocketReport = React.useCallback(() => {
    if (latestPocketReport?.reportId) {
      openPocketReport({ reportId: latestPocketReport.reportId });
      return;
    }

    if (currentPocketId) {
      openPocketReport({ pocketId: currentPocketId, generate: true });
    }
  }, [currentPocketId, latestPocketReport?.reportId, openPocketReport]);

  const handleGeneratePocketReport = React.useCallback(async () => {
    if (!currentPocketId || isGeneratingPocketReport) {
      return;
    }

    setIsGeneratingPocketReport(true);
    setPocketReportError(null);

    try {
      const response = await chrome.runtime.sendMessage({
        kind: "GENERATE_REPORT",
        requestId: crypto.randomUUID(),
        payload: { pocketId: currentPocketId },
      });

      if (!response?.success || !response?.data?.reportId) {
        throw new Error(response?.error || "Report generation failed");
      }

      const nextReport = {
        reportId: response.data.reportId,
        pocketId: response.data.pocketId,
        generatedAt: response.data.generatedAt,
        title: response.data.title,
      } satisfies PocketReportSummary;

      setLatestPocketReport(nextReport);
      openPocketReport({ reportId: nextReport.reportId, pocketId: currentPocketId });
    } catch (error) {
      setPocketReportError(
        error instanceof Error ? error.message : "Report generation failed",
      );
    } finally {
      setIsGeneratingPocketReport(false);
    }
  }, [currentPocketId, isGeneratingPocketReport, openPocketReport]);

  const handleAddNote = async () => {
    setShowNoteEditor(true);
  };

  const handleSaveNote = async (noteData: any) => {
    if (!currentPocketId) {
      alert("No pocket selected");
      return;
    }

    setIsSavingNote(true);
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "CAPTURE_REQUEST",
        requestId: crypto.randomUUID(),
        payload: {
          mode: "note",
          pocketId: currentPocketId,
          content: noteData.content,
          metadata: {
            title: noteData.title,
            tags: noteData.tags || [],
            category: noteData.category,
          },
        },
      });

      if (response.success) {
        console.log("Note saved successfully");
        setShowNoteEditor(false);
        // Optionally reload content list
      } else {
        console.error("Failed to save note:", response.error);
        alert("Failed to save note. Please try again.");
      }
    } catch (error) {
      console.error("Error saving note:", error);
      alert("Error saving note. Please try again.");
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleAddFile = async () => {
    if (!currentPocketId) {
      alert("No pocket selected. Please select a pocket first.");
      return;
    }

    // Create a file input element
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pdf,.doc,.docx,.xls,.xlsx,.txt,.md";
    fileInput.multiple = false;

    fileInput.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        console.log("Uploading file:", file.name, file.type, file.size);

        // Read file as base64
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64Data = event.target?.result as string;

          try {
            const response = await chrome.runtime.sendMessage({
              kind: "FILE_UPLOAD",
              requestId: crypto.randomUUID(),
              payload: {
                pocketId: currentPocketId,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                fileData: base64Data,
              },
            });

            if (response?.status === "success") {
              console.log("File uploaded successfully:", response.contentId);
            } else {
              console.error("Upload failed:", response?.error);
              alert("Failed to upload file. Please try again.");
            }
          } catch (error) {
            console.error("Error uploading file:", error);
            alert("Error uploading file. Please try again.");
          }
        };

        reader.onerror = () => {
          alert("Error reading file. Please try again.");
        };

        reader.readAsDataURL(file);
      } catch (error) {
        console.error("Error processing file:", error);
        alert("Error processing file. Please try again.");
      }
    };

    // Trigger file selection
    fileInput.click();
  };

  const handleSelectConversation = async (id: string) => {
    try {
      // Load full conversation with messages from IndexedDB
      const response = await chrome.runtime.sendMessage({
        kind: "CONVERSATION_GET",
        requestId: crypto.randomUUID(),
        payload: { conversationId: id },
      });

      if (response.success && response.data.conversation) {
        const conversation = response.data.conversation;
        setCurrentConversationId(id);

        // Transform IndexedDB Message[] to ChatMessage[] format
        const chatMessages: ChatMessage[] = conversation.messages.map(
          (msg: any) => ({
            id: msg.id || crypto.randomUUID(),
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            isStreaming: false,
            source: msg.source,
            metadata: msg.metadata,
          }),
        );

        setMessages(chatMessages);

        // Load attached pockets if any
        try {
          const pocketResult = await getAttachedPocket(id);
          setAttachedPocketIds(pocketResult.attachedPocketIds || []);
          setAttachedPockets(pocketResult.pockets || []);
          if (
            pocketResult.attachedPocketIds &&
            pocketResult.attachedPocketIds.length > 0
          ) {
            console.log(
              `📎 Loaded ${pocketResult.attachedPocketIds.length} attached pocket(s)`,
            );
          }
        } catch (error) {
          console.error("Failed to load attached pockets:", error);
          setAttachedPocketIds([]);
          setAttachedPockets([]);
        }
      } else {
        console.error("Failed to load conversation:", response.error);
        // Fallback to empty conversation
        setCurrentConversationId(id);
        setMessages([]);
        setAttachedPocketIds([]);
        setAttachedPockets([]);
      }
    } catch (error) {
      console.error("Error loading conversation:", error);
      setCurrentConversationId(id);
      setMessages([]);
      setAttachedPocketIds([]);
      setAttachedPockets([]);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      // Delete from IndexedDB via service worker
      const response = await chrome.runtime.sendMessage({
        kind: "CONVERSATION_DELETE",
        requestId: crypto.randomUUID(),
        payload: { conversationId: id },
      });

      if (response.success) {
        // Update local state
        setConversations((prev) => prev.filter((c) => c.id !== id));

        if (currentConversationId === id) {
          setMessages([]);
          setCurrentConversationId(null);
        }
      } else {
        console.error("Failed to delete conversation:", response.error);
      }
    } catch (error) {
      console.error("Error deleting conversation:", error);
    }
  };

  const saveConversation = React.useCallback(async () => {
    if (!currentConversationId || messages.length === 0) {
      console.log("⚠️ Skipping save - no conversation ID or messages");
      return;
    }

    console.log(
      `💾 Saving conversation ${currentConversationId} with ${messages.length} messages`,
    );

    try {
      // Transform ChatMessage[] to IndexedDB Message[] format
      const dbMessages = messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        source: msg.source || ("gemini-nano" as const),
        metadata:
          msg.metadata ||
          ({
            tokensUsed: 0,
          } satisfies MessageMetadata),
      }));

      console.log("🔍 Checking if conversation exists in database...");

      // Check if conversation exists
      const existingResponse = await chrome.runtime.sendMessage({
        kind: "CONVERSATION_GET",
        requestId: crypto.randomUUID(),
        payload: { conversationId: currentConversationId },
      });

      if (existingResponse.success && existingResponse.data.conversation) {
        console.log("📝 Updating existing conversation");
        // Update existing conversation - add the last message
        const lastMessage = dbMessages[dbMessages.length - 1];
        if (lastMessage) {
          const updateResponse = await chrome.runtime.sendMessage({
            kind: "CONVERSATION_UPDATE",
            requestId: crypto.randomUUID(),
            payload: {
              conversationId: currentConversationId,
              message: lastMessage,
            },
          });
          console.log("Update response:", updateResponse);
        }
      } else {
        console.log(
          "✨ Creating new conversation with",
          dbMessages.length,
          "messages",
        );
        // Create new conversation with all messages
        const createResponse = await chrome.runtime.sendMessage({
          kind: "CONVERSATION_CREATE",
          requestId: crypto.randomUUID(),
          payload: {
            conversationId: currentConversationId,
            messages: dbMessages,
            model: "gemini-nano",
            pocketId: undefined, // Could link to a pocket if needed
          },
        });
        console.log("Create response:", createResponse);
      }

      // Update local conversation list
      console.log("🔄 Refreshing conversation list...");
      await loadConversations();
      console.log("✅ Conversation saved and list refreshed");
    } catch (error) {
      console.error("❌ Failed to save conversation:", error);
    }
  }, [currentConversationId, messages]);

  // Keep the ref updated with the latest saveConversation function
  React.useEffect(() => {
    saveConversationRef.current = saveConversation;
  }, [saveConversation]);

  const handleSuggestionClick = (suggestion: string) => {
    // Submit the suggestion directly
    handleSubmit(suggestion);
  };

  const handleModeChange = (mode: Mode) => {
    console.log(`🔄 Switching mode from ${currentMode} to ${mode}`);
    setCurrentMode(mode);

    // Preserve conversation context - no need to clear messages or state
    // The mode switch is just a UI state change that affects how the AI responds
    // Future enhancement: Could adjust AI behavior based on mode

    // Store mode preference
    localStorage.setItem("ai-pocket-mode", mode);
  };

  // Load mode and autoContext preferences on mount
  React.useEffect(() => {
    const savedMode = localStorage.getItem("ai-pocket-mode") as Mode;
    if (savedMode && (savedMode === "ask" || savedMode === "ai-pocket")) {
      setCurrentMode(savedMode);
    }

    const savedAutoContext = localStorage.getItem("ai-pocket-auto-context");
    if (savedAutoContext !== null) {
      setAutoContext(savedAutoContext === "true");
    }
  }, []);

  // Save autoContext preference when it changes
  React.useEffect(() => {
    localStorage.setItem("ai-pocket-auto-context", String(autoContext));
  }, [autoContext]);

  // Floating mode switcher removed; add top buffer behavior
  const handleScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    // Toggle top buffer based on scroll position
    const atTop = e.currentTarget.scrollTop <= 0;
    if (atTop !== isAtTop) {
      setIsAtTop(atTop);
    }
  };

  const selectionPreviewText = pendingSelectionRequest
    ? (pendingSelectionRequest.preview ?? pendingSelectionRequest.selectionText)
    : undefined;

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <TopBar
          onOpenHistory={() => setIsHistoryOpen(true)}
          onNewChat={handleNewChat}
          onNewPocket={handleNewPocket}
          onImportPocket={handleImportPocket}
          onAddNote={handleAddNote}
          onAddFile={handleAddFile}
          onExportChat={handleExportAll}
          onOpenProviderSettings={() => setShowProviderSettings(true)}
          currentMode={currentMode}
          onModeChange={handleModeChange}
          isInsidePocket={isInsidePocket}
          hasMessages={messages.length > 0}
        />

        <HistoryPanel
          conversations={conversations}
          currentConversationId={currentConversationId}
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onNewConversation={handleNewChat}
        />

        <div className="flex flex-1 flex-col overflow-hidden relative bg-transparent">
          {/* Content Area */}
          <div className="flex flex-1 flex-col overflow-hidden bg-transparent">
            {currentMode === "ask" && (
              <div className="px-4 pt-20 pb-3 space-y-3">
                <WorkflowLauncher
                  activeWorkflowMode={activeWorkflowMode}
                  onWorkflowModeChange={setActiveWorkflowMode}
                  browserActionModel={browserActionModel}
                  deepResearchModel={deepResearchModel}
                  onBrowserActionModelChange={setBrowserActionModel}
                  onDeepResearchModelChange={setDeepResearchModel}
                  settingsSnapshot={settingsSnapshot}
                  browserActionRun={browserActionStream.run}
                  browserActionEvents={browserActionTimeline}
                  browserActionError={browserActionError}
                  browserActionPanel={browserActionPanel}
                  onBrowserActionLaunch={(task) => void handleBrowserActionLaunch(task)}
                  onBrowserActionPause={() => void handleRunControl("pause")}
                  onBrowserActionResume={() => void handleRunControl("resume")}
                  onBrowserActionCancel={() => void handleRunControl("cancel")}
                  onBrowserActionApprovalResolve={(approvalId, resolution) =>
                    void handleApprovalResolve(browserActionStream.run!.runId, approvalId, resolution)
                  }
                  deepResearchRun={deepResearchStream.run}
                  deepResearchEvents={deepResearchTimeline}
                  deepResearchError={deepResearchError}
                  deepResearchPanel={deepResearchPanel}
                  onDeepResearchLaunch={(topic, goal) => void handleDeepResearchLaunch(topic, goal)}
                  onDeepResearchPause={() => void handleDeepResearchRunControl("pause")}
                  onDeepResearchResume={() => void handleDeepResearchRunControl("resume")}
                  onDeepResearchCancel={() => void handleDeepResearchRunControl("cancel")}
                  onDeepResearchApprovalResolve={(approvalId, resolution) =>
                    void handleApprovalResolve(deepResearchStream.run!.runId, approvalId, resolution)
                  }
                  onOpenResearchPocket={(pocketId) => {
                    setLinkedResearchPocketToOpen(pocketId);
                    setCurrentMode("ai-pocket");
                  }}
                  disabled={isLoading}
                />

                {/* Run History Entry Point */}
                {!isRunHistoryOpen && !isHistoricalReviewOpen && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                      onClick={() => void handleOpenRunHistory()}
                    >
                      View run history
                    </button>
                  </div>
                )}

                {isRunHistoryOpen && (
                  <RunHistoryPanel
                    runs={runHistoryList}
                    isLoading={isRunHistoryLoading}
                    onSelectRun={(runId) => void handleSelectHistoricalRun(runId)}
                    onClose={handleCloseRunHistory}
                  />
                )}

                {isHistoricalReviewOpen && (
                  <RunReviewPanel
                    run={selectedHistoricalRun}
                    timeline={selectedHistoricalTimeline}
                    onClose={handleCloseHistoricalReview}
                    onOpenPocket={(pocketId) => {
                      setLinkedResearchPocketToOpen(pocketId);
                      setCurrentMode("ai-pocket");
                    }}
                  />
                )}
              </div>
            )}
            {currentMode === "ai-pocket" ? (
              <div className="flex flex-1 flex-col overflow-hidden">
                {currentPocketId && (
                  <div className="px-4 pt-16 pb-2">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-3 backdrop-blur">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">
                          {currentPocketName || "Selected pocket"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {isGeneratingPocketReport
                            ? "Generating report..."
                            : pocketReportError
                              ? "Report generation failed"
                              : latestPocketReport
                                ? `Open report • ${new Date(latestPocketReport.generatedAt).toLocaleString([], {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}`
                                : "Generate a citation-backed report for this pocket"}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant={latestPocketReport ? "secondary" : "default"}
                        size="sm"
                        onClick={
                          latestPocketReport
                            ? handleOpenPocketReport
                            : handleGeneratePocketReport
                        }
                        disabled={isGeneratingPocketReport}
                      >
                        {isGeneratingPocketReport
                          ? "Generating report..."
                          : latestPocketReport
                            ? "Open report"
                            : "Generate report"}
                      </Button>
                    </div>
                  </div>
                )}
                <PocketManager
                  ref={pocketManagerRef}
                  onInsidePocketChange={handleInsidePocketChange}
                  onAddNote={handleAddNote}
                  onAddFile={handleAddFile}
                  initialPocketId={linkedResearchPocketToOpen}
                  onSelectPocket={(pocket) => {
                    setCurrentPocketId(pocket.id);
                    setCurrentPocketName(pocket.name);
                    setPocketReportError(null);
                  }}
                />
              </div>
            ) : messages.length === 0 ? (
              <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
            ) : (
              <>
                {/* Indexing Warning Banner for Ask mode */}
                {currentMode === "ask" &&
                  (indexingStatus.status.isAnyIndexing ||
                    indexingStatus.status.failedContentIds.size > 0) && (
                    <div className="px-4 pt-20 pb-2">
                      <IndexingWarningBanner
                        indexingCount={
                          indexingStatus.status.indexingContentIds.size
                        }
                        failedCount={
                          indexingStatus.status.failedContentIds.size
                        }
                        onRetry={() => {
                          indexingStatus.status.failedContentIds.forEach(
                            (contentId) => {
                              indexingStatus.retryFailedIndexing(contentId);
                            },
                          );
                        }}
                      />
                    </div>
                  )}
                <Conversation className="overflow-hidden">
                  <ConversationContent
                    ref={conversationContentRef}
                    onScroll={handleScroll}
                    className={cn("pt-16")}
                    forceAutoScroll={
                      messages[messages.length - 1]?.isStreaming ?? false
                    }
                  >
                    {useVirtualizedMessages ? (
                      <div
                        style={{
                          height: rowVirtualizer.getTotalSize(),
                          position: "relative",
                        }}
                      >
                        {rowVirtualizer.getVirtualItems().map((vi) => {
                          const message = messages[vi.index];
                          if (!message) return null;
                          return (
                            <div
                              key={message.id}
                              data-index={vi.index}
                              ref={(el) => {
                                if (el) rowVirtualizer.measureElement(el);
                              }}
                              className="pb-4"
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                transform: `translateY(${vi.start}px)`,
                              }}
                            >
                              {/* Show context gathering indicator before assistant's first streaming message */}
                              {message.role === "assistant" &&
                                message.isStreaming &&
                                vi.index === messages.length - 1 &&
                                isGathering && (
                                  <div className="px-4 mb-2">
                                    <ContextGatheringIndicator
                                      steps={contextSteps}
                                    />
                                  </div>
                                )}

                              <Message key={message.id} from={message.role}>
                                <MessageAvatar
                                  src={message.role === "user" ? "" : ""}
                                  name={
                                    message.role === "user"
                                      ? "You"
                                      : message.role === "assistant"
                                        ? "AI"
                                        : "System"
                                  }
                                />
                                <MessageContent>
                                  {/* Display file attachments if present */}
                                  {message.files &&
                                    message.files.length > 0 && (
                                      <div
                                        className={cn(
                                          "mb-2 flex flex-wrap gap-2",
                                          message.role === "user" &&
                                            "justify-end",
                                        )}
                                      >
                                        {message.files.map((file, idx) => (
                                          <div
                                            key={idx}
                                            className={cn(
                                              "flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm",
                                              message.role === "user" &&
                                                "bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600",
                                            )}
                                          >
                                            {file.type?.startsWith("image/") ? (
                                              <svg
                                                className="h-4 w-4"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                                />
                                              </svg>
                                            ) : (
                                              <svg
                                                className="h-4 w-4"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                                />
                                              </svg>
                                            )}
                                            <span className="truncate max-w-[150px]">
                                              {file.name || "File"}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  {message.role === "assistant" &&
                                    getAssistantProvenance(message, providerNameLookup) && (
                                      <div className="mb-2 text-xs text-muted-foreground">
                                        <div>
                                          {
                                            getAssistantProvenance(message, providerNameLookup)
                                              ?.providerLabel
                                          }
                                        </div>
                                        {getAssistantProvenance(message, providerNameLookup)
                                          ?.fallbackLabel && (
                                          <div>
                                            {
                                              getAssistantProvenance(message, providerNameLookup)
                                                ?.fallbackLabel
                                            }
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  {message.role === "assistant" && message.reasoning && (
                                    <ThinkingBlock reasoning={message.reasoning} />
                                  )}
                                  <div
                                    className={cn(
                                      "inline-block max-w-[85%] break-words",
                                      message.role === "user" &&
                                        "bg-gray-200 text-gray-900 rounded-2xl rounded-br-sm px-4 py-2 ml-auto text-right dark:bg-gray-700 dark:text-gray-100",
                                    )}
                                    style={{ overflowWrap: "anywhere" }}
                                  >
                                    <Response
                                      className={cn(
                                        "prose prose-sm dark:prose-invert max-w-full",
                                        "prose-p:leading-relaxed prose-pre:p-0",
                                        message.role === "user" &&
                                          "prose-p:text-gray-900 prose-p:m-0 prose-p:text-right prose-headings:text-gray-900 prose-code:text-gray-900 prose-pre:text-gray-900 dark:prose-p:text-gray-100 dark:prose-headings:text-gray-100 dark:prose-code:text-gray-100 dark:prose-pre:text-gray-100",
                                      )}
                                    >
                                      {message.content}
                                    </Response>
                                  </div>
                                  {message.role === "assistant" &&
                                    !message.isStreaming && (
                                      <Actions>
                                        <ActionButton
                                          onClick={() =>
                                            handleCopy(message.content)
                                          }
                                          title="Copy to clipboard"
                                        >
                                          <svg
                                            className="size-3"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2M8 16h8a2 2 0 002-2V8m-6 8h2m-2 0V6"
                                            />
                                          </svg>
                                          Copy
                                        </ActionButton>
                                        <ActionButton
                                          onClick={() =>
                                            handleRegenerate(message.id)
                                          }
                                          title="Regenerate this response"
                                        >
                                          <svg
                                            className="size-3"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                            />
                                          </svg>
                                          Regenerate
                                        </ActionButton>
                                        <div className="relative">
                                          <ActionButton
                                            onClick={() =>
                                              setExportMenuOpenForMessage(
                                                exportMenuOpenForMessage ===
                                                  message.id
                                                  ? null
                                                  : message.id,
                                              )
                                            }
                                            title="Export this response"
                                          >
                                            <svg
                                              className="size-3"
                                              fill="none"
                                              stroke="currentColor"
                                              viewBox="0 0 24 24"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                              />
                                            </svg>
                                            Export
                                          </ActionButton>
                                          {exportMenuOpenForMessage ===
                                            message.id && (
                                            <div className="absolute bottom-full left-0 mb-2 bg-gray-900/90 dark:bg-gray-950/90 backdrop-blur-xl border border-gray-700/50 dark:border-gray-800/50 rounded-lg shadow-2xl overflow-hidden min-w-[180px] z-50">
                                              <button
                                                className="w-full text-left px-4 py-2 text-xs text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 transition-colors flex items-center gap-2"
                                                onClick={() => {
                                                  handleExportMessage(
                                                    message,
                                                    "markdown",
                                                  );
                                                  setExportMenuOpenForMessage(
                                                    null,
                                                  );
                                                }}
                                              >
                                                <svg
                                                  className="w-3 h-3"
                                                  fill="none"
                                                  stroke="currentColor"
                                                  viewBox="0 0 24 24"
                                                >
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                                                  />
                                                </svg>
                                                Markdown
                                              </button>
                                              <button
                                                className="w-full text-left px-4 py-2 text-xs text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 transition-colors flex items-center gap-2"
                                                onClick={() => {
                                                  handleExportMessage(
                                                    message,
                                                    "json",
                                                  );
                                                  setExportMenuOpenForMessage(
                                                    null,
                                                  );
                                                }}
                                              >
                                                <svg
                                                  className="w-3 h-3"
                                                  fill="none"
                                                  stroke="currentColor"
                                                  viewBox="0 0 24 24"
                                                >
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                                                  />
                                                </svg>
                                                JSON
                                              </button>
                                              <button
                                                className="w-full text-left px-4 py-2 text-xs text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 transition-colors flex items-center gap-2"
                                                onClick={() => {
                                                  handleExportMessage(
                                                    message,
                                                    "pdf",
                                                  );
                                                  setExportMenuOpenForMessage(
                                                    null,
                                                  );
                                                }}
                                              >
                                                <svg
                                                  className="w-3 h-3"
                                                  fill="none"
                                                  stroke="currentColor"
                                                  viewBox="0 0 24 24"
                                                >
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                                                  />
                                                </svg>
                                                PDF
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </Actions>
                                    )}
                                  {message.isStreaming && (
                                    <div className="mt-2">
                                      <Loader />
                                    </div>
                                  )}
                                </MessageContent>
                              </Message>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      messages.map((message) => (
                        <Message key={message.id} from={message.role}>
                          <MessageAvatar
                            src={message.role === "user" ? "" : ""}
                            name={
                              message.role === "user"
                                ? "You"
                                : message.role === "assistant"
                                  ? "AI"
                                  : "System"
                            }
                          />
                          <MessageContent>
                            {/* Display file attachments if present */}
                            {message.files && message.files.length > 0 && (
                              <div
                                className={cn(
                                  "mb-2 flex flex-wrap gap-2",
                                  message.role === "user" && "justify-end",
                                )}
                              >
                                {message.files.map((file, idx) => (
                                  <div
                                    key={idx}
                                    className={cn(
                                      "flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm",
                                      message.role === "user" &&
                                        "bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600",
                                    )}
                                  >
                                    {file.type?.startsWith("image/") ? (
                                      <svg
                                        className="h-4 w-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                        />
                                      </svg>
                                    ) : (
                                      <svg
                                        className="h-4 w-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                        />
                                      </svg>
                                    )}
                                    <span className="truncate max-w-[150px]">
                                      {file.name || "File"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {message.role === "assistant" &&
                              getAssistantProvenance(message, providerNameLookup) && (
                                <div className="mb-2 text-xs text-muted-foreground">
                                  <div>
                                    {
                                      getAssistantProvenance(message, providerNameLookup)
                                        ?.providerLabel
                                    }
                                  </div>
                                  {getAssistantProvenance(message, providerNameLookup)
                                    ?.fallbackLabel && (
                                    <div>
                                      {
                                        getAssistantProvenance(message, providerNameLookup)
                                          ?.fallbackLabel
                                      }
                                    </div>
                                  )}
                                </div>
                              )}
                            {message.role === "assistant" &&
                              message.reasoning && (
                                <ThinkingBlock reasoning={message.reasoning} />
                              )}
                            <div
                              className={cn(
                                "inline-block max-w-[85%] break-words",
                                message.role === "user" &&
                                  "bg-gray-200 text-gray-900 rounded-2xl rounded-br-sm px-4 py-2 ml-auto text-right dark:bg-gray-700 dark:text-gray-100",
                              )}
                              style={{ overflowWrap: "anywhere" }}
                            >
                              <Response
                                className={cn(
                                  "prose prose-sm dark:prose-invert max-w-full",
                                  "prose-p:leading-relaxed prose-pre:p-0",
                                  message.role === "user" &&
                                    "prose-p:text-gray-900 prose-p:m-0 prose-p:text-right prose-headings:text-gray-900 prose-code:text-gray-900 prose-pre:text-gray-900 dark:prose-p:text-gray-100 dark:prose-headings:text-gray-100 dark:prose-code:text-gray-100 dark:prose-pre:text-gray-100",
                                )}
                              >
                                {message.content}
                              </Response>
                            </div>
                            {message.role === "assistant" &&
                              !message.isStreaming && (
                                <Actions>
                                  <ActionButton
                                    onClick={() => handleCopy(message.content)}
                                    title="Copy to clipboard"
                                  >
                                    <svg
                                      className="size-3"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                      />
                                    </svg>
                                    Copy
                                  </ActionButton>
                                  <ActionButton
                                    onClick={() => handleRegenerate(message.id)}
                                    title="Regenerate response"
                                  >
                                    <svg
                                      className="size-3"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                      />
                                    </svg>
                                    Regenerate
                                  </ActionButton>
                                  <div className="relative">
                                    <ActionButton
                                      onClick={() =>
                                        setExportMenuOpenForMessage(
                                          exportMenuOpenForMessage ===
                                            message.id
                                            ? null
                                            : message.id,
                                        )
                                      }
                                      title="Export this response"
                                    >
                                      <svg
                                        className="size-3"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                        />
                                      </svg>
                                      Export
                                    </ActionButton>
                                    {exportMenuOpenForMessage ===
                                      message.id && (
                                      <div className="absolute bottom-full left-0 mb-2 bg-gray-900/90 dark:bg-gray-950/90 backdrop-blur-xl border border-gray-700/50 dark:border-gray-800/50 rounded-lg shadow-2xl overflow-hidden min-w-[180px] z-50">
                                        <button
                                          className="w-full text-left px-4 py-2 text-xs text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 transition-colors flex items-center gap-2"
                                          onClick={() => {
                                            handleExportMessage(
                                              message,
                                              "markdown",
                                            );
                                            setExportMenuOpenForMessage(null);
                                          }}
                                        >
                                          <svg
                                            className="w-3 h-3"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                                            />
                                          </svg>
                                          Markdown
                                        </button>
                                        <button
                                          className="w-full text-left px-4 py-2 text-xs text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 transition-colors flex items-center gap-2"
                                          onClick={() => {
                                            handleExportMessage(
                                              message,
                                              "json",
                                            );
                                            setExportMenuOpenForMessage(null);
                                          }}
                                        >
                                          <svg
                                            className="w-3 h-3"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                                            />
                                          </svg>
                                          JSON
                                        </button>
                                        <button
                                          className="w-full text-left px-4 py-2 text-xs text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 transition-colors flex items-center gap-2"
                                          onClick={() => {
                                            handleExportMessage(message, "pdf");
                                            setExportMenuOpenForMessage(null);
                                          }}
                                        >
                                          <svg
                                            className="w-3 h-3"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                                            />
                                          </svg>
                                          PDF
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </Actions>
                              )}
                            {message.isStreaming && (
                              <div className="mt-2">
                                <Loader />
                              </div>
                            )}
                          </MessageContent>
                        </Message>
                      ))
                    )}
                  </ConversationContent>
                </Conversation>
              </>
            )}
          </div>
        </div>

        {/* Fixed Bottom Input Bar (floating, no background) - Only show in ask mode */}
        {currentMode === "ask" && (
          <div className="fixed bottom-4 left-0 right-0 z-50 bg-transparent pointer-events-none">
            {currentRequestId ? (
              <div className="max-w-xl mx-auto pointer-events-auto">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleCancel}
                  className="w-full h-10"
                  title="Cancel generation"
                >
                  <svg
                    className="size-5 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  Cancel Generation
                </Button>
              </div>
            ) : (
              <div className="pointer-events-auto">
                <AIInputWithFile
                  onSubmit={handleSubmit}
                  placeholder={
                    isLoading
                      ? "Processing..."
                      : "Ask anything about captured content"
                  }
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  maxFileSize={10}
                  disabled={isLoading}
                  className="mx-auto p-0 sm:p-0 py-0 px-0 max-w-[92vw] sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
                  model={selectedModel}
                  modelOptions={chatModelOptions}
                  onModelChange={setSelectedModel}
                  autoContext={autoContext}
                  onAutoContextChange={setAutoContext}
                  attachedPocketIds={attachedPocketIds}
                  attachedPockets={attachedPockets}
                  onAttachPocket={handleAttachPocket}
                  onDetachPocket={handleDetachPocket}
                />
              </div>
            )}
          </div>
        )}

        {/* Note Editor - Full Page */}
        {showNoteEditor && (
          <div className="fixed inset-0 z-[100]">
            <NoteEditorPage
              {...(currentPocketId
                ? {
                    note: {
                      pocketId: currentPocketId,
                      title: "",
                      content: "",
                      tags: [],
                    },
                  }
                : {})}
              onSave={handleSaveNote}
              onCancel={() => setShowNoteEditor(false)}
              isLoading={isSavingNote}
            />
          </div>
        )}

        {/* Share Modal */}
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          onExport={handleExportAll}
        />

        {pendingSelectionRequest && (
          <PocketSelectionModal
            pockets={pendingSelectionRequest.pockets}
            selectionText={pendingSelectionRequest.selectionText}
            preview={pendingSelectionRequest.preview}
            sourceUrl={pendingSelectionRequest.sourceUrl}
            onSelect={handlePocketSelectionConfirm}
            onCancel={handlePocketSelectionCancel}
          />
        )}

        {/* Provider Settings Sheet */}
        <ProviderSettingsSheet
          isOpen={showProviderSettings}
          onClose={() => setShowProviderSettings(false)}
        />
      </div>
    </TooltipProvider>
  );
}
