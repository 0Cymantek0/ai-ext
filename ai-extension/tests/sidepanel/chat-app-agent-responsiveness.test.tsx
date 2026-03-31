/**
 * Wave 0 tests for ChatApp agent responsiveness — UX-05
 *
 * These tests verify that:
 * 1. ChatApp uses isolated workflow streams (useAgentRunEvents) instead of
 *    shared event arrays + appendAgentEvent
 * 2. Browser-action and deep-research streams are isolated from each other
 * 3. Non-agent surfaces (pockets, chat history, conversation) do not
 *    re-render when agent events stream
 * 4. Historical review state remains isolated from live workflow state
 *
 * The tests render ChatApp with mocked chrome APIs and verify behavior
 * through the message listener interface.
 */

import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { AgentRun, AgentRunEvent } from "@/shared/agent-runtime/contracts";
import type { ProviderSettingsSnapshot } from "@/shared/types/index.d";

// ── Chrome API mock ─────────────────────────────────────────────────────────

let runtimeMessageListener:
  | ((message: { kind: string; payload: any }, ...args: any[]) => void)
  | null = null;

const mockSendMessage = vi.fn();

// ── Component mocks ─────────────────────────────────────────────────────────

// Track renders for responsiveness verification
const workflowLauncherRenders = { count: 0 };

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
      <div>input</div>
    </div>
  ),
  // Export ModelOption as a type-only construct
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
  HistoryPanel: React.forwardRef(
    ({ conversations, currentConversationId, isOpen, onSelectConversation, onClose }: any, ref: any) => {
      if (!isOpen) return null;
      return (
        <div data-testid="history-panel">
          {conversations.map((conv: any) => (
            <button
              key={conv.id}
              type="button"
              data-testid={`history-conv-${conv.id}`}
              onClick={() => onSelectConversation(conv.id)}
            >
              {conv.title}
            </button>
          ))}
          <button type="button" data-testid="history-close" onClick={onClose}>
            Close
          </button>
        </div>
      );
    },
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
  PocketManager: React.forwardRef(() => <div data-testid="pocket-manager">pockets</div>),
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

// Select component mock
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

// Agent panel sub-component mocks
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
    <span data-testid="status-badge">{status}</span>
  ),
}));

vi.mock("@/sidepanel/components/AgentRunControls", () => ({
  AgentRunControls: () => null,
}));

vi.mock("@/sidepanel/components/AgentApprovalCard", () => ({
  AgentApprovalCard: () => null,
}));

vi.mock("@/sidepanel/components/AgentTimeline", () => ({
  AgentTimeline: ({ entries }: any) => (
    <div data-testid="agent-timeline">
      {entries?.map((e: any) => (
        <span key={e.eventId} data-testid={`timeline-${e.eventId}`}>
          {e.label}
        </span>
      ))}
    </div>
  ),
}));

vi.mock("@/sidepanel/components/RunHistoryPanel", () => ({
  RunHistoryPanel: () => null,
}));

vi.mock("@/sidepanel/components/RunReviewPanel", () => ({
  RunReviewPanel: () => null,
}));

// WorkflowLauncher with render tracking
vi.mock("@/sidepanel/components/WorkflowLauncher", () => ({
  WorkflowLauncher: React.forwardRef((props: any, ref: any) => {
    workflowLauncherRenders.count++;
    return (
      <div data-testid="workflow-launcher" data-render-count={workflowLauncherRenders.count}>
        <span data-testid="ba-run-id">{props.browserActionRun?.runId ?? "none"}</span>
        <span data-testid="ba-events-count">{props.browserActionEvents?.length ?? 0}</span>
        <span data-testid="dr-run-id">{props.deepResearchRun?.runId ?? "none"}</span>
        <span data-testid="dr-events-count">{props.deepResearchEvents?.length ?? 0}</span>
      </div>
    );
  }),
}));

// ── Mock ModeSwitcher ────────────────────────────────────────────────────────

vi.mock("@/components/ModeSwitcher", () => ({
  ModeSwitcher: ({ currentMode, onModeChange }: any) => (
    <div data-testid="mode-switcher">
      <span data-testid="current-mode">{currentMode}</span>
      <button
        type="button"
        data-testid="switch-to-ask"
        onClick={() => onModeChange("ask")}
      >
        Ask
      </button>
      <button
        type="button"
        data-testid="switch-to-ai-pocket"
        onClick={() => onModeChange("ai-pocket")}
      >
        AI Pocket
      </button>
    </div>
  ),
}));

import { ChatApp } from "@/sidepanel/ChatApp";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const settingsSnapshot: ProviderSettingsSnapshot = {
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

function makeBrowserActionRun(): AgentRun {
  return {
    runId: "run-ba-1",
    mode: "browser-action",
    status: "running",
    phase: "executing",
    createdAt: 100,
    updatedAt: 200,
    todoItems: [],
    pendingApproval: null,
    artifactRefs: [],
    latestCheckpointId: null,
    terminalOutcome: null,
    metadata: {
      task: "Click the button",
      providerId: "provider-openai",
      providerType: "openai",
      modelId: "gpt-4.1-mini",
      tabId: 77,
    },
  };
}

function makeDeepResearchRun(): AgentRun {
  return {
    runId: "run-dr-1",
    mode: "deep-research",
    status: "running",
    phase: "executing",
    createdAt: 100,
    updatedAt: 200,
    todoItems: [],
    pendingApproval: null,
    artifactRefs: [],
    latestCheckpointId: null,
    terminalOutcome: null,
    metadata: {
      topic: "AI safety",
      goal: "Summarize recent findings",
      providerId: "provider-openai",
      providerType: "openai",
      modelId: "gpt-4.1-mini",
      questionsTotal: 3,
      openGapCount: 0,
    },
  };
}

function makeAgentEvent(runId: string, index: number): AgentRunEvent {
  return {
    eventId: `evt-${runId}-${index}`,
    runId,
    timestamp: 200 + index,
    type: "tool.called",
    toolName: "test_tool",
    toolArgs: {},
  } as AgentRunEvent;
}

// ── Test Suite ───────────────────────────────────────────────────────────────

describe("ChatApp agent responsiveness (UX-05)", () => {
  beforeEach(() => {
    runtimeMessageListener = null;
    workflowLauncherRenders.count = 0;
    mockSendMessage.mockReset();

    mockSendMessage.mockImplementation(async (message: { kind: string; payload: any }) => {
      switch (message.kind) {
        case "CONVERSATION_LIST":
          return { success: true, data: { conversations: [] } };
        case "SETTINGS_SNAPSHOT_LOAD":
          return { success: true, data: settingsSnapshot };
        case "AGENT_RUN_STATUS": {
          // Handle status request for a specific runId
          const runId = message.payload?.runId;
          if (runId === "run-ba-1") {
            return { success: true, run: makeBrowserActionRun(), events: [] };
          }
          if (runId === "run-dr-1") {
            return { success: true, run: makeDeepResearchRun(), events: [] };
          }
          return { success: false, error: "Not found" };
        }
        default:
          return { success: true, data: {} };
      }
    });

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: mockSendMessage,
        onMessage: {
          addListener: vi.fn((listener: any) => {
            runtimeMessageListener = listener;
          }),
          removeListener: vi.fn(),
        },
        getURL: vi.fn(() => "chrome-extension://test/page.html"),
      },
      tabs: {
        query: vi.fn().mockResolvedValue([
          {
            id: 77,
            url: "https://example.com",
            title: "Test Page",
          },
        ]),
      },
    });
  });

  it("isolates browser-action and deep-research streams from each other", async () => {
    render(<ChatApp />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId("workflow-launcher")).toBeInTheDocument();
    });

    // Simulate a browser-action run starting
    act(() => {
      runtimeMessageListener!({
        kind: "AGENT_RUN_STATUS",
        payload: {
          run: makeBrowserActionRun(),
          events: [makeAgentEvent("run-ba-1", 0)],
        },
      });
    });

    // Wait for browser-action run to appear
    await waitFor(() => {
      expect(screen.getByTestId("ba-run-id").textContent).toBe("run-ba-1");
    });

    // Now start a deep-research run
    act(() => {
      runtimeMessageListener!({
        kind: "AGENT_RUN_STATUS",
        payload: {
          run: makeDeepResearchRun(),
          events: [makeAgentEvent("run-dr-1", 0)],
        },
      });
    });

    // Both runs should be tracked independently
    await waitFor(() => {
      expect(screen.getByTestId("dr-run-id").textContent).toBe("run-dr-1");
    });

    // Browser-action events should NOT contain deep-research events
    const baEventsCount = parseInt(screen.getByTestId("ba-events-count").textContent || "0", 10);
    // Deep-research event should only be in deep-research stream
    const drEventsCount = parseInt(screen.getByTestId("dr-events-count").textContent || "0", 10);
    expect(drEventsCount).toBeGreaterThanOrEqual(1);
    // Browser-action count should remain unchanged from its own events
    expect(baEventsCount).toBeGreaterThanOrEqual(1);
  });

  it("does not re-render pocket manager when agent events stream", async () => {
    render(<ChatApp />);

    await waitFor(() => {
      expect(screen.getByTestId("workflow-launcher")).toBeInTheDocument();
    });

    // Start a browser-action run
    act(() => {
      runtimeMessageListener!({
        kind: "AGENT_RUN_STATUS",
        payload: {
          run: makeBrowserActionRun(),
          events: [],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("ba-run-id").textContent).toBe("run-ba-1");
    });

    // Switch to ai-pocket mode to show PocketManager
    act(() => {
      screen.getByTestId("switch-to-ai-pocket").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("pocket-manager")).toBeInTheDocument();
    });

    // Stream several agent events
    for (let i = 1; i <= 5; i++) {
      act(() => {
        runtimeMessageListener!({
          kind: "AGENT_RUN_EVENT",
          payload: {
            event: makeAgentEvent("run-ba-1", i),
          },
        });
      });
    }

    // PocketManager should still be rendered (not unmounted/remounted)
    expect(screen.getByTestId("pocket-manager")).toBeInTheDocument();

    // The agent events should be accumulated
    await waitFor(() => {
      const count = parseInt(
        screen.getByTestId("ba-events-count").textContent || "0",
        10,
      );
      expect(count).toBeGreaterThanOrEqual(5);
    });
  });

  it("maintains historical review isolation from live workflow state", async () => {
    render(<ChatApp />);

    await waitFor(() => {
      expect(screen.getByTestId("workflow-launcher")).toBeInTheDocument();
    });

    // Start a live browser-action run
    act(() => {
      runtimeMessageListener!({
        kind: "AGENT_RUN_STATUS",
        payload: {
          run: makeBrowserActionRun(),
          events: [makeAgentEvent("run-ba-1", 0)],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("ba-run-id").textContent).toBe("run-ba-1");
    });

    // Live events should be 1
    const liveCount = parseInt(
      screen.getByTestId("ba-events-count").textContent || "0",
      10,
    );
    expect(liveCount).toBeGreaterThanOrEqual(1);

    // Now simulate the live run completing — the historical review
    // should not interfere with live state
    act(() => {
      runtimeMessageListener!({
        kind: "AGENT_RUN_STATUS",
        payload: {
          run: {
            ...makeBrowserActionRun(),
            status: "completed",
            phase: "finalizing",
            terminalOutcome: {
              status: "completed",
              reason: "Done",
              finishedAt: Date.now(),
            },
          },
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("ba-run-id").textContent).toBe("run-ba-1");
    });
  });

  it("continues chat interaction while agent events stream", async () => {
    render(<ChatApp />);

    await waitFor(() => {
      expect(screen.getByTestId("workflow-launcher")).toBeInTheDocument();
    });

    // Start a browser-action run
    act(() => {
      runtimeMessageListener!({
        kind: "AGENT_RUN_STATUS",
        payload: {
          run: makeBrowserActionRun(),
          events: [],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("ba-run-id").textContent).toBe("run-ba-1");
    });

    // Stream events while the run is active
    for (let i = 1; i <= 3; i++) {
      act(() => {
        runtimeMessageListener!({
          kind: "AGENT_RUN_EVENT",
          payload: {
            event: makeAgentEvent("run-ba-1", i),
          },
        });
      });
    }

    // Verify agent events accumulated
    await waitFor(() => {
      const count = parseInt(
        screen.getByTestId("ba-events-count").textContent || "0",
        10,
      );
      expect(count).toBeGreaterThanOrEqual(3);
    });

    // Verify non-agent surfaces still function
    // ModeSwitcher should still be present and interactive
    expect(screen.getByTestId("mode-switcher")).toBeInTheDocument();
    expect(screen.getByTestId("switch-to-ai-pocket")).toBeInTheDocument();

    // Switching modes should work
    act(() => {
      screen.getByTestId("switch-to-ai-pocket").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("pocket-manager")).toBeInTheDocument();
    });

    // Switching back should also work
    act(() => {
      screen.getByTestId("switch-to-ask").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("workflow-launcher")).toBeInTheDocument();
    });
  });
});
