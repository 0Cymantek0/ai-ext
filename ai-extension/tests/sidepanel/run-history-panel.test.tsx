/**
 * Wave 0 tests for RunHistoryPanel + RunHistoryItem.
 *
 * These tests define the contract that:
 * - RunHistoryPanel loads completed runs through the typed message handler
 * - Supports mode filtering (browser-action vs deep-research)
 * - Renders RunHistoryItem for each run with mode, status, summary, duration, timestamp
 * - Fires selection callbacks with the selected run ID
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import type { AgentRun } from "@/shared/agent-runtime/contracts";
import { RunHistoryPanel } from "@/sidepanel/components/RunHistoryPanel";
import { RunHistoryItem } from "@/sidepanel/components/RunHistoryItem";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    runId: `run-${Math.random().toString(36).slice(2, 8)}`,
    mode: "browser-action",
    status: "completed",
    phase: "finalizing",
    createdAt: Date.now() - 60000,
    updatedAt: Date.now(),
    todoItems: [],
    pendingApproval: null,
    artifactRefs: [],
    latestCheckpointId: null,
    terminalOutcome: {
      status: "completed",
      reason: "Task completed successfully",
      finishedAt: Date.now(),
    },
    metadata: {
      task: "Test browser action task",
    },
    ...overrides,
  };
}

const completedBrowserActionRun = makeAgentRun({
  runId: "run-ba-1",
  mode: "browser-action",
  status: "completed",
  metadata: { task: "Fill out the login form" },
});

const completedDeepResearchRun = makeAgentRun({
  runId: "run-dr-1",
  mode: "deep-research",
  status: "completed",
  metadata: {
    topic: "AI safety landscape",
    goal: "Understand current approaches",
  },
});

const failedRun = makeAgentRun({
  runId: "run-failed-1",
  mode: "browser-action",
  status: "failed",
  terminalOutcome: {
    status: "failed",
    reason: "Element not found after 3 retries",
    finishedAt: Date.now(),
  },
});

const runs = [completedBrowserActionRun, completedDeepResearchRun, failedRun];

// ─── RunHistoryItem Tests ──────────────────────────────────────────────────────

describe("RunHistoryItem", () => {
  it("renders run mode label", () => {
    render(<RunHistoryItem run={completedBrowserActionRun} onSelect={vi.fn()} />);
    expect(screen.getByText(/browser.action/i)).toBeInTheDocument();
  });

  it("renders deep-research mode label for research runs", () => {
    render(<RunHistoryItem run={completedDeepResearchRun} onSelect={vi.fn()} />);
    expect(screen.getByText(/deep.research/i)).toBeInTheDocument();
  });

  it("renders status indicator", () => {
    render(<RunHistoryItem run={completedBrowserActionRun} onSelect={vi.fn()} />);
    // Status badge should be visible
    expect(screen.getByText(/Done|Completed/i)).toBeTruthy();
  });

  it("renders timestamp", () => {
    render(<RunHistoryItem run={completedBrowserActionRun} onSelect={vi.fn()} />);
    const tsEl = screen.getByTestId("run-history-item-timestamp");
    expect(tsEl).toBeTruthy();
    expect(tsEl.textContent).toBeTruthy();
  });

  it("renders summary text from run metadata", () => {
    render(<RunHistoryItem run={completedBrowserActionRun} onSelect={vi.fn()} />);
    expect(screen.getByText("Fill out the login form")).toBeInTheDocument();
  });

  it("renders duration for completed run", () => {
    render(<RunHistoryItem run={completedBrowserActionRun} onSelect={vi.fn()} />);
    const durationEl = screen.getByTestId("run-history-item-duration");
    expect(durationEl).toBeTruthy();
    expect(durationEl.textContent).toBeTruthy();
  });

  it("fires onSelect with runId when clicked", () => {
    const onSelect = vi.fn();
    render(<RunHistoryItem run={completedBrowserActionRun} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("run-history-item"));
    expect(onSelect).toHaveBeenCalledWith(completedBrowserActionRun.runId);
  });

  it("renders failed status for failed runs", () => {
    render(<RunHistoryItem run={failedRun} onSelect={vi.fn()} />);
    expect(screen.getByText(/Failed/i)).toBeTruthy();
  });
});

// ─── RunHistoryPanel Tests ─────────────────────────────────────────────────────

describe("RunHistoryPanel", () => {
  it("renders list of runs", () => {
    render(
      <RunHistoryPanel
        runs={runs}
        onSelectRun={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Fill out the login form")).toBeInTheDocument();
    expect(screen.getByText("AI safety landscape")).toBeInTheDocument();
  });

  it("renders empty state when no runs", () => {
    render(
      <RunHistoryPanel
        runs={[]}
        onSelectRun={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/no completed runs/i)).toBeInTheDocument();
  });

  it("supports mode filtering to browser-action only", () => {
    render(
      <RunHistoryPanel
        runs={runs}
        onSelectRun={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Find and click the browser-action filter
    const filterBtn = screen.getByTestId("filter-browser-action");
    fireEvent.click(filterBtn);
    // Deep research run should not be visible
    expect(screen.queryByText("AI safety landscape")).not.toBeInTheDocument();
    // Browser action run should still be visible
    expect(screen.getByText("Fill out the login form")).toBeInTheDocument();
  });

  it("supports mode filtering to deep-research only", () => {
    render(
      <RunHistoryPanel
        runs={runs}
        onSelectRun={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const filterBtn = screen.getByTestId("filter-deep-research");
    fireEvent.click(filterBtn);
    expect(screen.queryByText("Fill out the login form")).not.toBeInTheDocument();
    expect(screen.getByText("AI safety landscape")).toBeInTheDocument();
  });

  it("supports showing all runs again after filtering", () => {
    render(
      <RunHistoryPanel
        runs={runs}
        onSelectRun={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Filter to browser-action
    fireEvent.click(screen.getByTestId("filter-browser-action"));
    expect(screen.queryByText("AI safety landscape")).not.toBeInTheDocument();
    // Reset filter
    fireEvent.click(screen.getByTestId("filter-all"));
    expect(screen.getByText("AI safety landscape")).toBeInTheDocument();
    expect(screen.getByText("Fill out the login form")).toBeInTheDocument();
  });

  it("fires onSelectRun with runId when a run item is clicked", () => {
    const onSelectRun = vi.fn();
    render(
      <RunHistoryPanel
        runs={runs}
        onSelectRun={onSelectRun}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Fill out the login form"));
    expect(onSelectRun).toHaveBeenCalledWith(completedBrowserActionRun.runId);
  });

  it("fires onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <RunHistoryPanel
        runs={runs}
        onSelectRun={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId("run-history-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows loading state when isLoading is true", () => {
    render(
      <RunHistoryPanel
        runs={[]}
        onSelectRun={vi.fn()}
        onClose={vi.fn()}
        isLoading={true}
      />,
    );
    expect(screen.getByTestId("run-history-loading")).toBeInTheDocument();
  });
});
