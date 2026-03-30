import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockSendMessage = vi.fn();

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
  AIInputWithFile: ({ onModelChange, modelOptions }: any) => (
    <div>
      <button
        type="button"
        onClick={() => {
          const selectedOption = modelOptions.find(
            (option: any) => option.value !== "auto",
          );
          if (selectedOption) {
            onModelChange(selectedOption.value);
          }
        }}
      >
        select-shared-model
      </button>
      <div>input</div>
    </div>
  ),
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

describe("deep research launch", () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
    mockSendMessage.mockImplementation(async (message: { kind: string }) => {
      switch (message.kind) {
        case "CONVERSATION_LIST":
          return { success: true, data: { conversations: [] } };
        case "SETTINGS_SNAPSHOT_LOAD":
          return { success: true, data: settingsSnapshot };
        case "AGENT_RUN_START":
          return {
            success: true,
            run: {
              runId: "run-deep-research",
              mode: "deep-research",
              status: "running",
              phase: "planning",
              createdAt: Date.now(),
              updatedAt: Date.now(),
              todoItems: [],
              pendingApproval: null,
              artifactRefs: [],
              latestCheckpointId: "cp-1",
              terminalOutcome: null,
              metadata: {
                topic: "deep-research",
                goal: "Validate launch payload",
                providerId: "provider-openai",
                providerType: "openai",
                modelId: "gpt-4.1-mini",
                questionsTotal: 1,
                openGapCount: 0,
              },
            },
            events: [],
          };
        default:
          return { success: true, data: {} };
      }
    });

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: mockSendMessage,
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        getURL: vi.fn(() => "chrome-extension://test/zork.html"),
      },
      tabs: {
        query: vi.fn().mockResolvedValue([
          {
            id: 77,
            url: "https://example.com/research",
            title: "Research",
          },
        ]),
      },
    });
  });

  it("launches deep-research with topic, goal, providerId, and modelId", async () => {
    render(<ChatApp />);

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "SETTINGS_SNAPSHOT_LOAD" }),
      );
    });

    act(() => {
      screen.getByText("select-shared-model").click();
    });

    fireEvent.change(screen.getByPlaceholderText("Deep research topic"), {
      target: { value: "deep-research" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        "Research goal and what counts as a grounded answer.",
      ),
      {
        target: { value: "Validate topic and goal launch" },
      },
    );

    act(() => {
      screen.getByText("Launch deep research").click();
    });

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "AGENT_RUN_START",
          payload: expect.objectContaining({
            mode: "deep-research",
            topic: "deep-research",
            goal: "Validate topic and goal launch",
            providerId: "provider-openai",
            modelId: "gpt-4.1-mini",
          }),
        }),
      );
    });
  });
});
