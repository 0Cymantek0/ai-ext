/**
 * Selectors Tests — Phase 09-02
 *
 * Tests for status display mapping, terminal status detection,
 * timeline event labeling, and panel state projection.
 */

import { describe, it, expect } from "vitest";
import {
  selectAgentPanelState,
  selectAgentTimeline,
  selectLatestAgentApproval,
  isActiveRun,
  STATUS_DISPLAY,
  isTerminalStatus,
} from "../selectors.js";
import type { AgentRun, AgentRunEvent } from "../contracts.js";
import { createAgentRun } from "../reducer.js";

// ─── STATUS_DISPLAY ──────────────────────────────────────────────────────────

describe("STATUS_DISPLAY", () => {
  it("contains entries for all 7 AgentRunStatus values", () => {
    const keys = Object.keys(STATUS_DISPLAY);
    expect(keys).toHaveLength(7);
    expect(keys).toContain("pending");
    expect(keys).toContain("running");
    expect(keys).toContain("paused");
    expect(keys).toContain("waiting_approval");
    expect(keys).toContain("completed");
    expect(keys).toContain("failed");
    expect(keys).toContain("cancelled");
  });

  it("each entry has label, color, and icon", () => {
    for (const entry of Object.values(STATUS_DISPLAY)) {
      expect(typeof entry.label).toBe("string");
      expect(entry.label.length).toBeGreaterThan(0);
      expect(typeof entry.color).toBe("string");
      expect(entry.color.length).toBeGreaterThan(0);
      expect(typeof entry.icon).toBe("string");
      expect(entry.icon.length).toBeGreaterThan(0);
    }
  });

  it("waiting_approval has icon ShieldAlert and color containing orange", () => {
    expect(STATUS_DISPLAY.waiting_approval.icon).toBe("ShieldAlert");
    expect(STATUS_DISPLAY.waiting_approval.color).toContain("orange");
  });
});

// ─── isTerminalStatus ─────────────────────────────────────────────────────────

describe("isTerminalStatus", () => {
  it("returns true for completed", () => {
    expect(isTerminalStatus("completed")).toBe(true);
  });

  it("returns true for failed", () => {
    expect(isTerminalStatus("failed")).toBe(true);
  });

  it("returns true for cancelled", () => {
    expect(isTerminalStatus("cancelled")).toBe(true);
  });

  it("returns false for pending", () => {
    expect(isTerminalStatus("pending")).toBe(false);
  });

  it("returns false for running", () => {
    expect(isTerminalStatus("running")).toBe(false);
  });

  it("returns false for paused", () => {
    expect(isTerminalStatus("paused")).toBe(false);
  });

  it("returns false for waiting_approval", () => {
    expect(isTerminalStatus("waiting_approval")).toBe(false);
  });
});

// ─── selectAgentTimeline — Approval Events ───────────────────────────────────

describe("selectAgentTimeline", () => {
  it("maps approval.requested event to label Approval required with approval reason as detail", () => {
    const events: AgentRunEvent[] = [
      {
        type: "approval.requested",
        eventId: "evt-1",
        runId: "run-1",
        timestamp: 1000,
        approval: {
          approvalId: "apr-1",
          reason: "Click submit button",
          requestedAt: 1000,
        },
      },
    ];

    const timeline = selectAgentTimeline(events);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].label).toBe("Approval required");
    expect(timeline[0].detail).toBe("Click submit button");
  });

  it("maps approval.resolved with approved to label Approval granted", () => {
    const events: AgentRunEvent[] = [
      {
        type: "approval.resolved",
        eventId: "evt-2",
        runId: "run-1",
        timestamp: 2000,
        approvalId: "apr-1",
        resolution: "approved",
      },
    ];

    const timeline = selectAgentTimeline(events);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].label).toBe("Approval granted");
    expect(timeline[0].detail).toBe("Request approved");
  });

  it("maps approval.resolved with rejected to label Approval rejected", () => {
    const events: AgentRunEvent[] = [
      {
        type: "approval.resolved",
        eventId: "evt-3",
        runId: "run-1",
        timestamp: 3000,
        approvalId: "apr-1",
        resolution: "rejected",
      },
    ];

    const timeline = selectAgentTimeline(events);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].label).toBe("Approval rejected");
    expect(timeline[0].detail).toBe("Request rejected");
  });

  it("maps run.cancelled to label Run cancelled with outcome reason as detail", () => {
    const events: AgentRunEvent[] = [
      {
        type: "run.cancelled",
        eventId: "evt-4",
        runId: "run-1",
        timestamp: 4000,
        outcome: {
          status: "cancelled",
          reason: "User requested cancellation",
          finishedAt: 4000,
        },
      },
    ];

    const timeline = selectAgentTimeline(events);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].label).toBe("Run cancelled");
    expect(timeline[0].detail).toBe("User requested cancellation");
  });

  it("maps run.failed to label Run failed with error reason as detail", () => {
    const events: AgentRunEvent[] = [
      {
        type: "run.failed",
        eventId: "evt-5",
        runId: "run-1",
        timestamp: 5000,
        outcome: {
          status: "failed",
          reason: "Model rate limit exceeded",
          finishedAt: 5000,
        },
      },
    ];

    const timeline = selectAgentTimeline(events);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].label).toBe("Run failed");
    expect(timeline[0].detail).toBe("Model rate limit exceeded");
  });

  it("maps run.completed to label Run completed with reason as detail", () => {
    const events: AgentRunEvent[] = [
      {
        type: "run.completed",
        eventId: "evt-6",
        runId: "run-1",
        timestamp: 6000,
        outcome: {
          status: "completed",
          reason: "All tasks finished",
          finishedAt: 6000,
        },
      },
    ];

    const timeline = selectAgentTimeline(events);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].label).toBe("Run completed");
    expect(timeline[0].detail).toBe("All tasks finished");
  });
});

// ─── selectAgentPanelState ────────────────────────────────────────────────────

describe("selectAgentPanelState", () => {
  it("computes isTerminal=true for status completed", () => {
    const run = createAgentRun("run-1", "browser-action");
    run.status = "completed";
    run.terminalOutcome = {
      status: "completed",
      reason: "Done",
      finishedAt: Date.now(),
    };

    const state = selectAgentPanelState(run);
    expect(state.isTerminal).toBe(true);
  });

  it("computes isTerminal=false for status waiting_approval", () => {
    const run = createAgentRun("run-1", "browser-action");
    run.status = "waiting_approval";
    run.pendingApproval = {
      approvalId: "apr-1",
      reason: "Approve action",
      requestedAt: Date.now(),
    };

    const state = selectAgentPanelState(run);
    expect(state.isTerminal).toBe(false);
  });
});
