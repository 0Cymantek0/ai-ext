import * as React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

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
  HistoryPanel: ({ conversations, onSelectConversation }: any) => (
    <div>
      history
      {conversations?.[0] && (
        <button
          type="button"
          onClick={() => onSelectConversation(conversations[0].id)}
        >
          load-conversation
        </button>
      )}
    </div>
  ),
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

describe("ChatApp provider metadata", () => {
  beforeEach(() => {
    runtimeMessageListener = null;
    mockSendMessage.mockReset();
    mockSendMessage.mockImplementation(async (message: { kind: string }) => {
      switch (message.kind) {
        case "CONVERSATION_LIST":
          return { success: true, data: { conversations: [] } };
        case "CONVERSATION_GET":
          return { success: false, error: "missing" };
        case "CONVERSATION_UPDATE":
        case "CONVERSATION_CREATE":
        case "CONVERSATION_DELETE":
        case "AI_PROCESS_STREAM_START":
          return { success: true };
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
    });

    vi.stubGlobal("open", vi.fn());
    vi.stubGlobal("alert", vi.fn());
  });

  it("renders provider/model provenance from live stream events without a blocking warning flow", async () => {
    render(<ChatApp />);

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "CONVERSATION_LIST" }),
      );
    });

    expect(runtimeMessageListener).not.toBeNull();

    act(() => {
      runtimeMessageListener?.({
        kind: "AI_PROCESS_STREAM_START",
        payload: {
          requestId: "req-1",
          messageId: "assistant-1",
          providerId: "openai-primary",
          providerType: "openai",
          modelId: "gpt-4.1-mini",
          attemptedProviderIds: ["openai-primary"],
          fallbackOccurred: false,
        },
      });
    });

    expect(await screen.findByText("openai-primary • gpt-4.1-mini")).toBeTruthy();

    act(() => {
      runtimeMessageListener?.({
        kind: "AI_PROCESS_STREAM_END",
        payload: {
          requestId: "req-1",
          totalTokens: 42,
          processingTime: 55,
          source: "gemini-flash",
          providerId: "anthropic-fallback",
          providerType: "anthropic",
          modelId: "claude-3.7-sonnet",
          attemptedProviderIds: ["openai-primary", "anthropic-fallback"],
          fallbackFromProviderId: "openai-primary",
          fallbackOccurred: true,
        },
      });
    });

    expect(
      await screen.findByText("anthropic-fallback • claude-3.7-sonnet"),
    ).toBeTruthy();
    expect(await screen.findByText("Fallback from openai-primary")).toBeTruthy();
    expect(screen.queryByText(/warning|modal/i)).toBeNull();
  });

  it("hydrates persisted provider metadata while leaving legacy conversation turns readable", async () => {
    mockSendMessage.mockReset();
    mockSendMessage.mockImplementation(async (message: { kind: string }) => {
      switch (message.kind) {
        case "CONVERSATION_LIST":
          return {
            success: true,
            data: {
              conversations: [
                {
                  id: "conv-hydrated",
                  createdAt: 1,
                  updatedAt: 2,
                  messages: [
                    { role: "assistant", content: "legacy conversation answer" },
                    { role: "assistant", content: "fallback answer" },
                  ],
                },
              ],
            },
          };
        case "CONVERSATION_GET":
          return {
            success: true,
            data: {
              conversation: {
                id: "conv-hydrated",
                messages: [
                  {
                    id: "legacy-message",
                    role: "assistant",
                    content: "legacy conversation answer",
                    timestamp: 100,
                    source: "gemini-nano",
                    metadata: {
                      tokensUsed: 5,
                    },
                  },
                  {
                    id: "fallback-message",
                    role: "assistant",
                    content: "fallback answer",
                    timestamp: 200,
                    source: "gemini-flash",
                    metadata: {
                      providerExecution: {
                        providerId: "anthropic-fallback",
                        providerType: "anthropic",
                        modelId: "claude-3.7-sonnet",
                        attemptedProviderIds: [
                          "openai-primary",
                          "anthropic-fallback",
                        ],
                        fallbackFromProviderId: "openai-primary",
                        fallbackOccurred: true,
                      },
                    },
                  },
                ],
              },
            },
          };
        default:
          return { success: true, data: {} };
      }
    });

    render(<ChatApp />);

    expect(await screen.findByText("load-conversation")).toBeTruthy();

    act(() => {
      screen.getByText("load-conversation").click();
    });

    expect(await screen.findByText("legacy conversation answer")).toBeTruthy();
    expect(await screen.findByText("fallback answer")).toBeTruthy();
    expect(
      await screen.findByText("anthropic-fallback • claude-3.7-sonnet"),
    ).toBeTruthy();
    expect(await screen.findByText("Fallback from openai-primary")).toBeTruthy();
  });
});
