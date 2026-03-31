import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

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
        select-browser-model
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

// Select component mock — simplified for testing WorkflowLauncher's ModelSelector
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange, disabled }: any) => (
    <div data-testid="model-select" data-value={value} data-disabled={String(disabled ?? false)}>
      <select
        value={value}
        onChange={(e: any) => onValueChange?.(e.target.value)}
        disabled={disabled}
        data-testid="model-select-native"
      >
        {children}
      </select>
    </div>
  ),
  SelectTrigger: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value, ...props }: any) => (
    <option value={value} {...props}>{children}</option>
  ),
  SelectValue: ({ children }: any) => <span>{children}</span>,
  SelectGroup: ({ children }: any) => <div>{children}</div>,
}));

// Agent panel sub-component mocks (rendered inside BrowserActionPanel/DeepResearchPanel)
vi.mock("@/sidepanel/components/AgentPanelLayout", () => ({
  AgentPanelLayout: ({ children, header }: any) => (
    <div>
      <div>{header}</div>
      {children}
    </div>
  ),
}));

vi.mock("@/sidepanel/components/AgentRunStatusBadge", () => ({
  AgentRunStatusBadge: ({ status }: any) => (
    <span>Status: {status}</span>
  ),
}));

vi.mock("@/sidepanel/components/AgentRunControls", () => ({
  AgentRunControls: () => null,
}));

vi.mock("@/sidepanel/components/AgentApprovalCard", () => ({
  AgentApprovalCard: () => null,
}));

vi.mock("@/sidepanel/components/AgentTimeline", () => ({
  AgentTimeline: () => null,
}));

vi.mock("@/sidepanel/components/RunHistoryPanel", () => ({
  RunHistoryPanel: () => null,
}));

vi.mock("@/sidepanel/components/RunReviewPanel", () => ({
  RunReviewPanel: () => null,
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

describe("browser action launch", () => {
  beforeEach(() => {
    runtimeMessageListener = null;
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
              runId: "run-browser-action",
              mode: "browser-action",
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
                task: "Inspect the pricing table",
                providerId: "provider-openai",
                providerType: "openai",
                modelId: "gpt-4.1-mini",
                conversationId: "conv-browser",
                tabId: 77,
              },
            },
            events: [],
          };
        case "AGENT_RUN_STATUS": {
          // useAgentRunEvents hydration — return run data for known runId
          const statusPayload = (message as any).payload as { runId?: string };
          if (statusPayload?.runId === "run-browser-action") {
            return {
              success: true,
              run: {
                runId: "run-browser-action",
                mode: "browser-action",
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
                  task: "Inspect the pricing table",
                  providerId: "provider-openai",
                  providerType: "openai",
                  modelId: "gpt-4.1-mini",
                  conversationId: "conv-browser",
                  tabId: 77,
                },
              },
              events: [],
            };
          }
          return { success: true, data: {} };
        }
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
        query: vi.fn().mockResolvedValue([
          {
            id: 77,
            url: "https://example.com/pricing",
            title: "Pricing",
          },
        ]),
      },
    });
  });

  it("launches a browser-action run with canonical provider/model and tab metadata", async () => {
    render(<ChatApp />);

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "SETTINGS_SNAPSHOT_LOAD" }),
      );
    });

    // Select a model through the WorkflowLauncher's ModelSelector
    const nativeSelect = screen.getByTestId("model-select-native");
    act(() => {
      Object.defineProperty(nativeSelect, "value", {
        value: "provider-openai::gpt-4.1-mini",
        writable: true,
      });
      fireEvent.change(nativeSelect);
    });

    // Fill in the browser action task
    fireEvent.change(
      screen.getByPlaceholderText(
        "Open the current page, inspect the checkout flow, and report blockers.",
      ),
      {
        target: { value: "Inspect the pricing table" },
      },
    );

    act(() => {
      screen.getByText("Launch browser action").click();
    });

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "AGENT_RUN_START",
          payload: expect.objectContaining({
            mode: "browser-action",
            task: "Inspect the pricing table",
            providerId: "provider-openai",
            providerType: "openai",
            modelId: "gpt-4.1-mini",
            tabId: 77,
            tabUrl: "https://example.com/pricing",
            tabTitle: "Pricing",
          }),
        }),
      );
    });

    expect(screen.getByText("input")).toBeTruthy();
    expect(screen.getByText("Status: running")).toBeTruthy();
  });
});
