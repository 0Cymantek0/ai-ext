import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

const mockSendMessage = vi.fn();
let runtimeMessageListener:
  | ((message: { kind: string; payload: any }) => void)
  | null = null;

vi.mock("@/lib/utils", () => ({
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
}));

vi.mock("@/components/ai/conversation", () => ({
  Conversation: ({ children }: any) => <div>{children}</div>,
  ConversationContent: React.forwardRef<HTMLDivElement, any>(
    ({ children, forceAutoScroll: _forceAutoScroll, ...props }, ref) => (
      <div ref={ref} {...props}>
        {children}
      </div>
    ),
  ),
}));

vi.mock("@/components/ai/message", () => ({
  Message: ({ children }: any) => <div>{children}</div>,
  MessageAvatar: ({ name }: { name: string }) => <span>{name}</span>,
  MessageContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ai/response", () => ({
  Response: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/ai-input-with-file", () => ({
  AIInputWithFile: () => <div>input</div>,
}));

vi.mock("@/components/ai/loader", () => ({
  Loader: () => <div>loading</div>,
}));

vi.mock("@/components/ai/actions", () => ({
  Actions: ({ children }: any) => <div>{children}</div>,
  ActionButton: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/TopBar", () => ({
  TopBar: () => <div>topbar</div>,
}));

vi.mock("@/components/WelcomeScreen", () => ({
  WelcomeScreen: () => <div>welcome</div>,
}));

vi.mock("@/components/HistoryPanel", () => ({
  HistoryPanel: () => <div>history</div>,
}));

vi.mock("@/sidepanel/components/ProviderSettingsSheet", () => ({
  ProviderSettingsSheet: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/animate-ui/components/animate/tooltip", () => ({
  TooltipProvider: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/pockets", () => ({
  PocketManager: React.forwardRef(() => <div>pockets</div>),
  PocketSelectionModal: () => null,
}));

vi.mock("@/components/notes/NoteEditorPage", () => ({
  NoteEditorPage: () => null,
}));

vi.mock("@/components/ShareModal", () => ({
  ShareModal: () => null,
}));

vi.mock("@/hooks/useIndexingStatus", () => ({
  useIndexingStatus: () => ({
    status: {
      isAnyIndexing: false,
      failedContentIds: new Set(),
      indexingContentIds: new Set(),
    },
    retryFailedIndexing: vi.fn(),
  }),
}));

vi.mock("@/hooks/useContextProgress", () => ({
  useContextProgress: () => ({
    steps: [],
    isGathering: false,
  }),
}));

vi.mock("@/components/IndexingWarningBanner", () => ({
  IndexingWarningBanner: () => null,
}));

vi.mock("@/components/ai/ContextGatheringIndicator", () => ({
  ContextGatheringIndicator: () => null,
}));

vi.mock("@/shared/conversation-pocket-api", () => ({
  attachPocketToConversation: vi.fn(),
  detachPocketFromConversation: vi.fn(),
  getAttachedPocket: vi.fn().mockResolvedValue({
    attachedPocketIds: [],
    pockets: [],
  }),
}));

vi.mock("@/lib/export-utils", () => ({
  exportToMarkdown: vi.fn(),
  exportToJSON: vi.fn(),
  exportToPDF: vi.fn(),
  exportMessageToMarkdown: vi.fn(),
  exportMessageToJSON: vi.fn(),
  exportMessageToPDF: vi.fn(),
}));

vi.mock("@/lib/pocket-export-service", () => ({
  importPocket: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getTotalSize: () => 0,
    getVirtualItems: () => [],
    measureElement: vi.fn(),
  }),
}));

vi.mock("@/devtools/instrumentation", () => ({
  getDevInstrumentation: () => null,
}));

vi.mock("@/utils/konami-code-listener", () => ({
  initKonamiCode: vi.fn(),
  stopKonamiCode: vi.fn(),
}));

import { ChatApp } from "@/sidepanel/ChatApp";

const settingsSnapshot = {
  providers: [
    {
      id: "provider-openai",
      type: "openai",
      name: "OpenAI",
      enabled: true,
      modelId: "gpt-4.1-mini",
    },
  ],
  modelSheet: {
    "provider-openai::gpt-4.1-mini": {
      modelId: "gpt-4.1-mini",
      providerId: "provider-openai",
      providerType: "openai",
      name: "GPT-4.1 mini",
      enabled: true,
    },
  },
  routingPreferences: {
    chat: null,
    embeddings: null,
    speech: null,
    fallbackChain: [],
    routingMode: "auto",
    triggerWords: {},
    providerParameters: {},
  },
  speechSettings: {
    provider: { providerId: "", modelId: "" },
    language: "en",
    timestampGranularity: "none",
  },
};

describe("deep research timeline", () => {
  beforeEach(() => {
    runtimeMessageListener = null;
    mockSendMessage.mockReset();
    mockSendMessage.mockImplementation(async (message: { kind: string }) => {
      switch (message.kind) {
        case "CONVERSATION_LIST":
          return { success: true, data: { conversations: [] } };
        case "SETTINGS_SNAPSHOT_LOAD":
          return { success: true, data: settingsSnapshot };
        default:
          return { success: true, data: {} };
      }
    });

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: mockSendMessage,
        onMessage: {
          addListener: vi.fn(
            (listener: (message: { kind: string; payload: any }) => void) => {
              runtimeMessageListener = listener;
            },
          ),
          removeListener: vi.fn(),
        },
        getURL: vi.fn(() => "chrome-extension://test/zork.html"),
      },
      tabs: {
        query: vi.fn().mockResolvedValue([]),
      },
    });
  });

  it("renders readable deep-research progress, gaps, and timeline output", async () => {
    render(<ChatApp />);

    await waitFor(() => {
      expect(runtimeMessageListener).toBeTruthy();
    });

    await act(async () => {
      runtimeMessageListener?.({
        kind: "AGENT_RUN_STATUS",
        payload: {
          run: {
            runId: "run-deep-research",
            mode: "deep-research",
            status: "running",
            phase: "executing",
            createdAt: 100,
            updatedAt: 200,
            todoItems: [
              {
                id: "todo-1",
                label: "Review existing evidence",
                done: false,
                createdAt: 100,
                updatedAt: 200,
              },
            ],
            pendingApproval: null,
            artifactRefs: [],
            latestCheckpointId: "cp-1",
            terminalOutcome: null,
            metadata: {
              topic: "Deep research timeline",
              goal: "Render progress",
              providerId: "provider-openai",
              providerType: "openai",
              modelId: "gpt-4.1-mini",
              questionsTotal: 3,
              questionsAnswered: 1,
              openGapCount: 1,
              activeQuestionId: "question-2",
              latestSynthesis: "First synthesis complete.",
              questions: [
                {
                  id: "question-1",
                  question: "What is already known?",
                  status: "answered",
                  order: 0,
                  createdAt: 100,
                  updatedAt: 150,
                },
                {
                  id: "question-2",
                  question: "What evidence supports the topic?",
                  status: "active",
                  order: 1,
                  createdAt: 100,
                  updatedAt: 200,
                },
              ],
              gaps: [
                {
                  id: "gap-1",
                  note: "Need another source",
                  status: "open",
                  createdAt: 190,
                  updatedAt: 190,
                },
              ],
            },
          },
          events: [
            {
              eventId: "evt-1",
              runId: "run-deep-research",
              timestamp: 150,
              type: "run.phase_changed",
              fromPhase: "planning",
              toPhase: "executing",
              detail: "Activate research question",
            },
            {
              eventId: "evt-2",
              runId: "run-deep-research",
              timestamp: 180,
              type: "tool.completed",
              toolName: "deep_research_collect",
              result: { findingsCount: 2 },
              durationMs: 10,
            },
          ],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Deep research timeline")).toBeTruthy();
    });

    expect(screen.getByText("Render progress")).toBeTruthy();
    expect(screen.getByText("Active question")).toBeTruthy();
    expect(screen.getByText("First synthesis complete.")).toBeTruthy();
    expect(screen.getByText("Need another source")).toBeTruthy();
    expect(screen.getByText("Tool completed: deep_research_collect")).toBeTruthy();
  });
});
