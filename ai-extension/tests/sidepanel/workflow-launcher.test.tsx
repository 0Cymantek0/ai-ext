/**
 * Integration tests for the WorkflowLauncher system (Plan 13-03).
 *
 * Covers UX-01 (workflow-specific model selection) and UX-03 (clear workflow
 * choice via tab-based launcher).
 *
 * These tests exercise WorkflowTabs, ModelSelector, and WorkflowLauncher as a
 * unit. They are designed to be satisfied incrementally as Tasks 1-4 are
 * completed.
 */
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { WorkflowTabs } from "@/sidepanel/components/WorkflowTabs";
import type { ProviderSettingsSnapshot } from "@/shared/types/index.d";
import type { AgentRunMode } from "@/shared/agent-runtime/contracts";

// ── Mocks ──────────────────────────────────────────────────────────────────────

// cn utility mock
vi.mock("@/lib/utils", () => ({
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
}));

// Select component mock -- simplified for testing
vi.mock("@/components/ui/select", () => {
  return {
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
      <option value={value} {...props}>
        {children}
      </option>
    ),
    SelectValue: ({ children }: any) => <span>{children}</span>,
    SelectGroup: ({ children }: any) => <div>{children}</div>,
  };
});

// AgentPanelLayout mock
vi.mock("@/sidepanel/components/AgentPanelLayout", () => ({
  AgentPanelLayout: ({ children, header }: any) => (
    <div data-testid="agent-panel-layout">
      <div data-testid="panel-header">{header}</div>
      {children}
    </div>
  ),
}));

// AgentRunStatusBadge mock
vi.mock("@/sidepanel/components/AgentRunStatusBadge", () => ({
  AgentRunStatusBadge: ({ status }: any) => (
    <span data-testid="status-badge">{status}</span>
  ),
}));

// AgentRunControls mock
vi.mock("@/sidepanel/components/AgentRunControls", () => ({
  AgentRunControls: () => <div data-testid="run-controls" />,
}));

// AgentApprovalCard mock
vi.mock("@/sidepanel/components/AgentApprovalCard", () => ({
  AgentApprovalCard: () => <div data-testid="approval-card" />,
}));

// AgentTimeline mock
vi.mock("@/sidepanel/components/AgentTimeline", () => ({
  AgentTimeline: ({ entries }: any) => (
    <div data-testid="agent-timeline">
      {entries.length} event(s)
    </div>
  ),
}));

// ── Test fixtures ──────────────────────────────────────────────────────────────

const MOCK_SNAPSHOT: ProviderSettingsSnapshot = {
  providers: [
    {
      id: "prov-openai",
      type: "openai",
      name: "OpenAI",
      enabled: true,
      modelId: "gpt-4o",
      status: "connected",
    },
    {
      id: "prov-google",
      type: "google",
      name: "Google",
      enabled: true,
      modelId: "gemini-2.5-flash",
      status: "connected",
    },
    {
      id: "prov-disabled",
      type: "openai",
      name: "Disabled Provider",
      enabled: false,
      modelId: "old-model",
      status: "disconnected",
    },
  ],
  modelSheet: {
    "prov-openai::gpt-4o": {
      modelId: "gpt-4o",
      providerId: "prov-openai",
      providerType: "openai",
      enabled: true,
      name: "GPT-4o",
    },
    "prov-google::gemini-2.5-flash": {
      modelId: "gemini-2.5-flash",
      providerId: "prov-google",
      providerType: "google",
      enabled: true,
      name: "Gemini 2.5 Flash",
    },
  },
  routingPreferences: {
    chat: "prov-google::gemini-2.5-flash",
    embeddings: null,
    speech: null,
    fallbackChain: [],
    routingMode: "manual",
    triggerWords: [],
    providerParameters: {},
  },
  speechSettings: {
    provider: "browser",
    language: "en-US",
    timestampGranularity: "word",
  },
};

// ── WorkflowTabs tests ─────────────────────────────────────────────────────────

describe("WorkflowTabs", () => {
  it("renders both browser-action and deep-research tabs", () => {
    const onChange = vi.fn();
    render(
      <WorkflowTabs activeMode="browser-action" onChange={onChange} />,
    );

    expect(screen.getByText("Browser Action")).toBeTruthy();
    expect(screen.getByText("Deep Research")).toBeTruthy();
  });

  it("renders tab descriptions", () => {
    const onChange = vi.fn();
    render(
      <WorkflowTabs activeMode="browser-action" onChange={onChange} />,
    );

    expect(screen.getByText("Automate browser tasks")).toBeTruthy();
    expect(screen.getByText("Research with evidence")).toBeTruthy();
  });

  it("calls onChange with 'deep-research' when Deep Research tab is clicked", () => {
    const onChange = vi.fn();
    render(
      <WorkflowTabs activeMode="browser-action" onChange={onChange} />,
    );

    fireEvent.click(screen.getByText("Deep Research"));
    expect(onChange).toHaveBeenCalledWith("deep-research");
  });

  it("calls onChange with 'browser-action' when Browser Action tab is clicked", () => {
    const onChange = vi.fn();
    render(
      <WorkflowTabs activeMode="deep-research" onChange={onChange} />,
    );

    fireEvent.click(screen.getByText("Browser Action"));
    expect(onChange).toHaveBeenCalledWith("browser-action");
  });

  it("disables tab clicks when disabled=true", () => {
    const onChange = vi.fn();
    render(
      <WorkflowTabs
        activeMode="browser-action"
        onChange={onChange}
        disabled={true}
      />,
    );

    const deepResearchTab = screen.getByText("Deep Research").closest("button");
    expect(deepResearchTab?.hasAttribute("disabled")).toBe(true);
  });
});

// ── ModelSelector tests ───────────────────────────────────────────────────────
// These tests are satisfied by Task 2. Import is deferred so the module
// only needs to exist when the ModelSelector describe block actually runs.

describe("ModelSelector", () => {
  // Lazy import: only resolves when the module exists (Task 2)
  let ModelSelector: any;
  beforeAll(async () => {
    const mod = await import("@/sidepanel/components/ModelSelector");
    ModelSelector = mod.ModelSelector;
  });

  it("renders with auto as default selection", () => {
    const onSelect = vi.fn();
    render(
      <ModelSelector
        workflowMode="browser-action"
        selectedModel="auto"
        settingsSnapshot={MOCK_SNAPSHOT}
        onSelect={onSelect}
      />,
    );

    const selectEl = screen.getByTestId("model-select");
    expect(selectEl.getAttribute("data-value")).toBe("auto");
  });

  it("shows configured model options from the snapshot", () => {
    const onSelect = vi.fn();
    render(
      <ModelSelector
        workflowMode="browser-action"
        selectedModel="auto"
        settingsSnapshot={MOCK_SNAPSHOT}
        onSelect={onSelect}
      />,
    );

    // Auto option should be present
    expect(screen.getByText("Auto")).toBeTruthy();
  });

  it("calls onSelect when a model is selected", () => {
    const onSelect = vi.fn();
    render(
      <ModelSelector
        workflowMode="browser-action"
        selectedModel="auto"
        settingsSnapshot={MOCK_SNAPSHOT}
        onSelect={onSelect}
      />,
    );

    const nativeSelect = screen.getByTestId("model-select-native");
    fireEvent.change(nativeSelect, { target: { value: "prov-openai::gpt-4o" } });
    expect(onSelect).toHaveBeenCalledWith("prov-openai::gpt-4o");
  });

  it("is disabled when disabled=true", () => {
    const onSelect = vi.fn();
    render(
      <ModelSelector
        workflowMode="browser-action"
        selectedModel="auto"
        settingsSnapshot={MOCK_SNAPSHOT}
        onSelect={onSelect}
        disabled={true}
      />,
    );

    const selectEl = screen.getByTestId("model-select");
    expect(selectEl.getAttribute("data-disabled")).toBe("true");
  });

  it("shows disabled state when settingsSnapshot is null", () => {
    const onSelect = vi.fn();
    render(
      <ModelSelector
        workflowMode="browser-action"
        selectedModel="auto"
        settingsSnapshot={null}
        onSelect={onSelect}
      />,
    );

    const selectEl = screen.getByTestId("model-select");
    expect(selectEl.getAttribute("data-disabled")).toBe("true");
  });
});

// ── WorkflowLauncher integration tests ─────────────────────────────────────────
// These tests are satisfied by Task 3. Lazy import for same reason.

describe("WorkflowLauncher", () => {
  let WorkflowLauncher: any;

  beforeAll(async () => {
    const mod = await import("@/sidepanel/components/WorkflowLauncher");
    WorkflowLauncher = mod.WorkflowLauncher;
  });

  const defaultProps = {
    activeWorkflowMode: "browser-action" as AgentRunMode,
    onWorkflowModeChange: vi.fn(),
    browserActionModel: "auto",
    deepResearchModel: "auto",
    onBrowserActionModelChange: vi.fn(),
    onDeepResearchModelChange: vi.fn(),
    settingsSnapshot: MOCK_SNAPSHOT,
    browserActionRun: null,
    browserActionEvents: [],
    browserActionError: null,
    browserActionPanel: null,
    onBrowserActionLaunch: vi.fn(),
    onBrowserActionPause: vi.fn(),
    onBrowserActionResume: vi.fn(),
    onBrowserActionCancel: vi.fn(),
    onBrowserActionApprovalResolve: vi.fn(),
    deepResearchRun: null,
    deepResearchEvents: [],
    deepResearchError: null,
    deepResearchPanel: null,
    onDeepResearchLaunch: vi.fn(),
    onDeepResearchPause: vi.fn(),
    onDeepResearchResume: vi.fn(),
    onDeepResearchCancel: vi.fn(),
    onDeepResearchApprovalResolve: vi.fn(),
    onOpenResearchPocket: vi.fn(),
    disabled: false,
  };

  it("renders WorkflowTabs at the top", () => {
    render(<WorkflowLauncher {...defaultProps} />);
    expect(screen.getByText("Browser Action")).toBeTruthy();
    expect(screen.getByText("Deep Research")).toBeTruthy();
  });

  it("renders ModelSelector below tabs", () => {
    render(<WorkflowLauncher {...defaultProps} />);
    expect(screen.getByTestId("model-select")).toBeTruthy();
  });

  it("renders BrowserActionPanel when active mode is browser-action", () => {
    render(
      <WorkflowLauncher {...defaultProps} activeWorkflowMode="browser-action" />,
    );
    // BrowserActionPanel renders a textarea with placeholder
    expect(
      screen.getByPlaceholderText(
        "Open the current page, inspect the checkout flow, and report blockers.",
      ),
    ).toBeTruthy();
  });

  it("renders DeepResearchPanel when active mode is deep-research", () => {
    render(
      <WorkflowLauncher {...defaultProps} activeWorkflowMode="deep-research" />,
    );
    // DeepResearchPanel renders a topic input
    expect(screen.getByPlaceholderText("Deep research topic")).toBeTruthy();
  });

  it("switches panels when mode changes", () => {
    const { rerender } = render(
      <WorkflowLauncher {...defaultProps} activeWorkflowMode="browser-action" />,
    );

    // Initially shows browser action panel
    expect(
      screen.getByPlaceholderText(
        "Open the current page, inspect the checkout flow, and report blockers.",
      ),
    ).toBeTruthy();

    // Switch to deep-research mode
    rerender(
      <WorkflowLauncher {...defaultProps} activeWorkflowMode="deep-research" />,
    );

    // Now shows deep research panel
    expect(screen.getByPlaceholderText("Deep research topic")).toBeTruthy();
  });

  it("passes workflow-specific model selection to ModelSelector", () => {
    const { rerender } = render(
      <WorkflowLauncher
        {...defaultProps}
        activeWorkflowMode="browser-action"
        browserActionModel="prov-openai::gpt-4o"
      />,
    );

    // Browser action model should be used
    let selectEl = screen.getByTestId("model-select");
    expect(selectEl.getAttribute("data-value")).toBe("prov-openai::gpt-4o");

    // Switch to deep-research with different model
    rerender(
      <WorkflowLauncher
        {...defaultProps}
        activeWorkflowMode="deep-research"
        deepResearchModel="prov-google::gemini-2.5-flash"
      />,
    );

    selectEl = screen.getByTestId("model-select");
    expect(selectEl.getAttribute("data-value")).toBe(
      "prov-google::gemini-2.5-flash",
    );
  });

  it("preserves inactive workflow model choice when switching modes", () => {
    const onBAModelChange = vi.fn();
    const onDRModelChange = vi.fn();

    const { rerender } = render(
      <WorkflowLauncher
        {...defaultProps}
        activeWorkflowMode="browser-action"
        browserActionModel="prov-openai::gpt-4o"
        deepResearchModel="prov-google::gemini-2.5-flash"
        onBrowserActionModelChange={onBAModelChange}
        onDeepResearchModelChange={onDRModelChange}
      />,
    );

    // Model selector shows browser-action model
    let selectEl = screen.getByTestId("model-select");
    expect(selectEl.getAttribute("data-value")).toBe("prov-openai::gpt-4o");

    // Switch to deep-research mode
    rerender(
      <WorkflowLauncher
        {...defaultProps}
        activeWorkflowMode="deep-research"
        browserActionModel="prov-openai::gpt-4o"
        deepResearchModel="prov-google::gemini-2.5-flash"
        onBrowserActionModelChange={onBAModelChange}
        onDeepResearchModelChange={onDRModelChange}
      />,
    );

    // Model selector now shows deep-research model
    selectEl = screen.getByTestId("model-select");
    expect(selectEl.getAttribute("data-value")).toBe(
      "prov-google::gemini-2.5-flash",
    );

    // Switch back to browser-action -- browser-action model should still be gpt-4o
    rerender(
      <WorkflowLauncher
        {...defaultProps}
        activeWorkflowMode="browser-action"
        browserActionModel="prov-openai::gpt-4o"
        deepResearchModel="prov-google::gemini-2.5-flash"
        onBrowserActionModelChange={onBAModelChange}
        onDeepResearchModelChange={onDRModelChange}
      />,
    );

    selectEl = screen.getByTestId("model-select");
    expect(selectEl.getAttribute("data-value")).toBe("prov-openai::gpt-4o");
  });
});
