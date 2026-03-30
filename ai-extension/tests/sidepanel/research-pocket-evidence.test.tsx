import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContentType, ProcessingStatus } from "@/background/indexeddb-manager";

vi.mock("@/lib/utils", () => ({
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ai/response", () => ({
  Response: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/pockets/ImageViewer", () => ({
  ImageViewer: () => null,
}));

import { ContentCard } from "@/components/pockets/ContentCard";
import { ContentPreview } from "@/components/pockets/ContentPreview";

const createEvidenceContent = () => ({
  id: "content-evidence-1",
  pocketId: "pocket-1",
  type: ContentType.TEXT,
  content: "Captured excerpt about the evidence pipeline.",
  metadata: {
    timestamp: 100,
    updatedAt: 120,
    title: "Evidence source",
    tags: ["research-evidence", "grounded"],
    category: "research-evidence",
    researchEvidence: {
      evidenceId: "evidence-1",
      runId: "run-1",
      pocketId: "pocket-1",
      capturedAt: 100,
      firstCapturedAt: 100,
      lastSeenAt: 120,
      fingerprint: "abc12345",
      duplicateCount: 2,
      source: {
        url: "https://example.com/evidence",
        normalizedUrl: "https://example.com/evidence",
        title: "Evidence source",
        type: "web" as const,
        domain: "example.com",
      },
      context: {
        topic: "Pocket evidence",
        question: "What evidence supports the topic?",
        tags: ["grounded"],
      },
      excerpt: "Captured excerpt about the evidence pipeline.",
      claim: "Evidence is preserved in the pocket UI.",
    },
  },
  sourceUrl: "https://example.com/evidence",
  capturedAt: 100,
  processingStatus: ProcessingStatus.COMPLETED,
});

describe("research pocket evidence UI", () => {
  it("renders evidence-specific card treatment with source context and duplicate state", () => {
    render(
      <ContentCard
        content={createEvidenceContent()}
        viewMode="list"
        onPreview={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Evidence")).toBeTruthy();
    expect(screen.getByText("example.com")).toBeTruthy();
    expect(screen.getByText("Duplicate x2")).toBeTruthy();
    expect(screen.getByText(/Captured excerpt about the evidence pipeline/)).toBeTruthy();
  });

  it("renders evidence provenance in the content preview", () => {
    render(
      <ContentPreview
        content={createEvidenceContent()}
        isOpen
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Evidence provenance")).toBeTruthy();
    expect(screen.getByText("Research evidence")).toBeTruthy();
    expect(screen.getByText("Pocket evidence")).toBeTruthy();
    expect(screen.getByText("Evidence is preserved in the pocket UI.")).toBeTruthy();
  });
});

describe("research pocket evidence sidepanel", () => {
  const mockSendMessage = vi.fn();
  let runtimeMessageListener:
    | ((message: { kind: string; payload: any }) => void)
    | null = null;

  vi.mock("@/components/ai/conversation", () => ({
    Conversation: ({ children }: any) => <div>{children}</div>,
    ConversationContent: React.forwardRef<HTMLDivElement, any>(
      ({ children, ...props }, ref) => (
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

  vi.mock("@/components/animate-ui/components/animate/tooltip", () => ({
    TooltipProvider: ({ children }: any) => <div>{children}</div>,
  }));

  vi.mock("@/components/pockets", () => ({
    PocketManager: React.forwardRef(({ initialPocketId }: any) => (
      <div>pockets:{initialPocketId || "none"}</div>
    )),
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

  const settingsSnapshot = {
    providers: [],
    modelSheet: {},
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
        create: vi.fn(),
      },
    });
  });

  it("renders live evidence accumulation and linked pocket controls from runtime data", async () => {
    const { ChatApp } = await import("@/sidepanel/ChatApp");
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
            todoItems: [],
            pendingApproval: null,
            artifactRefs: [
              {
                artifactId: "artifact-pocket-1",
                artifactType: "pocket",
                label: "Research pocket",
                targetId: "pocket-1",
                createdAt: 100,
              },
            ],
            latestCheckpointId: "cp-1",
            terminalOutcome: null,
            metadata: {
              topic: "Pocket evidence",
              goal: "Inspect live evidence",
              providerId: "provider-openai",
              providerType: "openai",
              modelId: "gpt-4.1-mini",
              pocketId: "pocket-1",
              questionsTotal: 1,
              questionsAnswered: 0,
              openGapCount: 0,
              findings: [
                {
                  id: "finding-1",
                  summary: "Evidence captured",
                  supportedQuestionIds: ["question-1"],
                  source: {
                    sourceUrl: "https://example.com/evidence",
                    title: "Evidence source",
                    capturedAt: 100,
                  },
                  createdAt: 100,
                  evidenceId: "evidence-1",
                  duplicateCount: 2,
                },
              ],
            },
          },
          events: [
            {
              eventId: "evt-evidence",
              runId: "run-deep-research",
              timestamp: 180,
              type: "evidence.recorded",
              evidence: {
                runId: "run-deep-research",
                pocketId: "pocket-1",
                contentId: "content-1",
                evidenceId: "evidence-1",
                fingerprint: "abc12345",
                disposition: "updated-as-duplicate",
                duplicateCount: 2,
                capturedAt: 100,
                lastSeenAt: 180,
                sourceUrl: "https://example.com/evidence",
                sourceTitle: "Evidence source",
              },
            },
          ],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Open linked pocket")).toBeTruthy();
    });

    expect(screen.getByText("1 evidence item captured")).toBeTruthy();
    expect(screen.getByText("Evidence updated as duplicate")).toBeTruthy();

    fireEvent.click(screen.getByText("Open linked pocket"));
    await waitFor(() => {
      expect(screen.getByText("pockets:pocket-1")).toBeTruthy();
    });
  });
});
