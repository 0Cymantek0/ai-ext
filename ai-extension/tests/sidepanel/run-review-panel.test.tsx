/**
 * Wave 0 tests for RunReviewPanel.
 *
 * These tests define the contract that:
 * - RunReviewPanel renders hydrated details for a selected completed run
 * - Shows sections: summary/status, timeline, artifact refs, evidence, terminal outcome
 * - Accepts hydrated data from parent (ChatApp) as props, not fetching on its own
 * - Handles missing/empty run data with clear empty/error state
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { AgentRun, AgentRunEvent, AgentArtifactRef } from "@/shared/agent-runtime/contracts";
import type {
  AgentTimelineEntry,
  AgentPanelState,
} from "@/shared/agent-runtime/selectors";
import { RunReviewPanel } from "@/sidepanel/components/RunReviewPanel";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeCompletedRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    runId: "run-review-test",
    mode: "browser-action",
    status: "completed",
    phase: "finalizing",
    createdAt: Date.now() - 120000,
    updatedAt: Date.now() - 5000,
    todoItems: [
      { id: "todo-1", label: "Navigate to page", done: true, createdAt: 100, updatedAt: 200 },
      { id: "todo-2", label: "Fill form", done: true, createdAt: 200, updatedAt: 300 },
    ],
    pendingApproval: null,
    artifactRefs: [
      {
        artifactId: "artifact-1",
        artifactType: "pocket",
        label: "Captured form state",
        uri: "pocket://pocket-1",
        targetId: "pocket-1",
        createdAt: Date.now() - 10000,
      },
    ],
    latestCheckpointId: "cp-final",
    terminalOutcome: {
      status: "completed",
      reason: "Browser action completed successfully. Form was filled and submitted.",
      finishedAt: Date.now() - 5000,
    },
    metadata: {
      task: "Fill out the login form on example.com",
    },
    ...overrides,
  };
}

function makeTimelineEntries(count: number): AgentTimelineEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    eventId: `evt-${i}`,
    runId: "run-review-test",
    type: i === 0 ? "run.started" : i === count - 1 ? "run.completed" : "tool.called",
    timestamp: 1000 + i * 500,
    label: i === 0 ? "Run started" : i === count - 1 ? "Run completed" : `Tool: step-${i}`,
    detail: i === 0 ? "Browser action run launched" : i === count - 1 ? "Completed successfully" : `Executing step ${i}`,
  }));
}

const baseRun = makeCompletedRun();
const baseTimeline = makeTimelineEntries(5);

// ─── Summary & Status Section ──────────────────────────────────────────────────

describe("RunReviewPanel - Summary/Status", () => {
  it("renders run status badge", () => {
    render(
      <RunReviewPanel
        run={baseRun}
        timeline={baseTimeline}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/Done/i)).toBeTruthy();
  });

  it("renders run mode label", () => {
    render(
      <RunReviewPanel
        run={baseRun}
        timeline={baseTimeline}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/browser.action/i)).toBeInTheDocument();
  });

  it("renders task description from metadata for browser-action runs", () => {
    render(
      <RunReviewPanel
        run={baseRun}
        timeline={baseTimeline}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Fill out the login form on example.com")).toBeInTheDocument();
  });

  it("renders topic and goal for deep-research runs", () => {
    const researchRun = makeCompletedRun({
      mode: "deep-research",
      metadata: {
        topic: "AI safety landscape",
        goal: "Understand current approaches",
      },
    });
    render(
      <RunReviewPanel
        run={researchRun}
        timeline={baseTimeline}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("AI safety landscape")).toBeInTheDocument();
    expect(screen.getByText("Understand current approaches")).toBeInTheDocument();
  });
});

// ─── Timeline Section ──────────────────────────────────────────────────────────

describe("RunReviewPanel - Timeline", () => {
  it("renders projected timeline entries", () => {
    render(
      <RunReviewPanel
        run={baseRun}
        timeline={baseTimeline}
        onClose={vi.fn()}
      />,
    );
    // All timeline entries should be rendered
    expect(screen.getByText("Run started")).toBeInTheDocument();
    expect(screen.getByText("Run completed")).toBeInTheDocument();
  });

  it("renders timeline with full mode (not capped)", () => {
    const longTimeline = makeTimelineEntries(20);
    render(
      <RunReviewPanel
        run={baseRun}
        timeline={longTimeline}
        onClose={vi.fn()}
      />,
    );
    // All 20 entries should be present (full mode for review)
    const labels = screen.getAllByTestId("timeline-entry-label");
    expect(labels).toHaveLength(20);
  });
});

// ─── Artifact Refs Section ─────────────────────────────────────────────────────

describe("RunReviewPanel - Artifacts", () => {
  it("renders artifact references when present", () => {
    render(
      <RunReviewPanel
        run={baseRun}
        timeline={baseTimeline}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Captured form state")).toBeInTheDocument();
  });

  it("hides artifacts section when no artifacts", () => {
    const runNoArtifacts = makeCompletedRun({ artifactRefs: [] });
    render(
      <RunReviewPanel
        run={runNoArtifacts}
        timeline={baseTimeline}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Artifacts/i)).not.toBeInTheDocument();
  });
});

// ─── Evidence Section ──────────────────────────────────────────────────────────

describe("RunReviewPanel - Evidence", () => {
  it("renders evidence section for deep-research runs with findings", () => {
    const researchRun = makeCompletedRun({
      mode: "deep-research",
      metadata: {
        topic: "AI safety",
        goal: "Survey approaches",
        findings: [
          {
            id: "finding-1",
            summary: "RLHF is the dominant alignment technique",
            supportedQuestionIds: ["q-1"],
            source: {
              sourceUrl: "https://example.com/paper",
              capturedAt: Date.now() - 50000,
              title: "Alignment Research Paper",
            },
            createdAt: Date.now() - 50000,
            evidenceId: "ev-1",
            duplicateCount: 0,
          },
        ],
      },
    });
    render(
      <RunReviewPanel
        run={researchRun}
        timeline={baseTimeline}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("RLHF is the dominant alignment technique")).toBeInTheDocument();
  });

  it("hides evidence section when no findings", () => {
    const researchRun = makeCompletedRun({
      mode: "deep-research",
      metadata: {
        topic: "AI safety",
        goal: "Survey approaches",
        findings: [],
      },
    });
    render(
      <RunReviewPanel
        run={researchRun}
        timeline={baseTimeline}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Evidence/i)).not.toBeInTheDocument();
  });
});

// ─── Terminal Outcome Section ──────────────────────────────────────────────────

describe("RunReviewPanel - Terminal Outcome", () => {
  it("renders terminal outcome reason for completed run", () => {
    render(
      <RunReviewPanel
        run={baseRun}
        timeline={baseTimeline}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Browser action completed successfully. Form was filled and submitted."),
    ).toBeInTheDocument();
  });

  it("renders failure reason for failed run", () => {
    const failedRun = makeCompletedRun({
      status: "failed",
      terminalOutcome: {
        status: "failed",
        reason: "Element not found after 3 retries",
        finishedAt: Date.now(),
      },
    });
    render(
      <RunReviewPanel
        run={failedRun}
        timeline={baseTimeline}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Element not found after 3 retries")).toBeInTheDocument();
  });

  it("renders cancellation reason for cancelled run", () => {
    const cancelledRun = makeCompletedRun({
      status: "cancelled",
      terminalOutcome: {
        status: "cancelled",
        reason: "User cancelled the run",
        finishedAt: Date.now(),
      },
    });
    render(
      <RunReviewPanel
        run={cancelledRun}
        timeline={baseTimeline}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("User cancelled the run")).toBeInTheDocument();
  });
});

// ─── Close & Error Handling ────────────────────────────────────────────────────

describe("RunReviewPanel - Close and Error Handling", () => {
  it("fires onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <RunReviewPanel
        run={baseRun}
        timeline={baseTimeline}
        onClose={onClose}
      />,
    );
    screen.getByTestId("run-review-close").click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders error state when run is null", () => {
    render(
      <RunReviewPanel
        run={null}
        timeline={[]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/run not found/i)).toBeInTheDocument();
  });

  it("renders empty timeline when timeline is empty", () => {
    render(
      <RunReviewPanel
        run={baseRun}
        timeline={[]}
        onClose={vi.fn()}
      />,
    );
    // Should show empty timeline state, not crash
    expect(screen.getByTestId("timeline-empty")).toBeInTheDocument();
  });
});
