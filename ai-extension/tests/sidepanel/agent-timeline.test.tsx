/**
 * Wave 0 tests for AgentTimelineEntry + AgentTimeline shared components.
 *
 * These tests define the contract that:
 * - AgentTimelineEntry renders projected label/detail from selector output
 * - AgentTimeline sorts newest-first, supports maxItems, collapsible, empty state
 * - Display text comes from projected AgentTimelineEntry fields, not raw event parsing
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { selectAgentTimeline } from "@/shared/agent-runtime/selectors";
import type { AgentTimelineEntry as AgentTimelineEntryType } from "@/shared/agent-runtime/selectors";
import type { AgentRunEvent } from "@/shared/agent-runtime/contracts";
import { AgentTimeline } from "@/sidepanel/components/AgentTimeline";
import { AgentTimelineEntry } from "@/sidepanel/components/AgentTimelineEntry";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTimelineEntry(overrides: Partial<AgentTimelineEntryType> = {}): AgentTimelineEntryType {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2, 8)}`,
    runId: "run-test",
    type: "tool.called",
    timestamp: Date.now(),
    label: "Tool started: click_element",
    detail: "selector: .btn-submit",
    ...overrides,
  };
}

// ─── AgentTimelineEntry Tests ──────────────────────────────────────────────────

describe("AgentTimelineEntry", () => {
  it("renders entry label from projected field", () => {
    const entry = makeTimelineEntry({ label: "Approval granted" });
    render(<AgentTimelineEntry entry={entry} />);
    expect(screen.getByText("Approval granted")).toBeInTheDocument();
  });

  it("renders entry detail from projected field when present", () => {
    const entry = makeTimelineEntry({ label: "Tool started", detail: "selector: .btn-submit" });
    render(<AgentTimelineEntry entry={entry} />);
    expect(screen.getByText("selector: .btn-submit")).toBeInTheDocument();
  });

  it("omits detail element when detail is undefined", () => {
    const entry = makeTimelineEntry({ label: "Run started", detail: undefined });
    const { container } = render(<AgentTimelineEntry entry={entry} />);
    // The label should be present
    expect(screen.getByText("Run started")).toBeInTheDocument();
    // There should be no detail text element
    const detailEls = container.querySelectorAll("[data-testid='timeline-entry-detail']");
    expect(detailEls).toHaveLength(0);
  });

  it("uses entry.type for visual styling (icon/color), not for display text", () => {
    const entry = makeTimelineEntry({
      type: "tool.failed",
      label: "Tool failed: click_element",
      detail: "Selector not found",
    });
    const { container } = render(<AgentTimelineEntry entry={entry} />);
    // The display text must come from label/detail, not parsed from type
    expect(screen.getByText("Tool failed: click_element")).toBeInTheDocument();
    expect(screen.getByText("Selector not found")).toBeInTheDocument();
    // Type-based icon should be rendered (failure icon indicator)
    const iconEl = container.querySelector("[data-entry-type='tool.failed']");
    expect(iconEl).toBeTruthy();
  });

  it("renders timestamps in human-readable form", () => {
    const ts = new Date(2026, 0, 15, 14, 30, 0).getTime();
    const entry = makeTimelineEntry({ timestamp: ts, label: "Run started" });
    render(<AgentTimelineEntry entry={entry} />);
    // Should show some form of time display
    const timeEl = screen.getByTestId("timeline-entry-time");
    expect(timeEl).toBeTruthy();
    expect(timeEl.textContent).toBeTruthy();
  });
});

// ─── AgentTimeline Tests ───────────────────────────────────────────────────────

describe("AgentTimeline", () => {
  it("renders entries sorted newest-first", () => {
    const entries: AgentTimelineEntryType[] = [
      makeTimelineEntry({ eventId: "evt-1", timestamp: 100, label: "First event" }),
      makeTimelineEntry({ eventId: "evt-2", timestamp: 300, label: "Third event" }),
      makeTimelineEntry({ eventId: "evt-3", timestamp: 200, label: "Second event" }),
    ];
    render(<AgentTimeline entries={entries} />);
    const labels = screen.getAllByTestId("timeline-entry-label").map((el) => el.textContent);
    expect(labels).toEqual(["Third event", "Second event", "First event"]);
  });

  it("caps entries to maxItems", () => {
    const entries: AgentTimelineEntryType[] = Array.from({ length: 10 }, (_, i) =>
      makeTimelineEntry({ eventId: `evt-${i}`, timestamp: i * 100, label: `Event ${i}` }),
    );
    render(<AgentTimeline entries={entries} maxItems={3} />);
    const labels = screen.getAllByTestId("timeline-entry-label");
    // Should show only 3 entries (the 3 newest)
    expect(labels).toHaveLength(3);
  });

  it("renders title when provided", () => {
    const entries = [makeTimelineEntry({ label: "Test" })];
    render(<AgentTimeline entries={entries} title="Activity Timeline" />);
    expect(screen.getByText("Activity Timeline")).toBeInTheDocument();
  });

  it("renders empty state when entries is empty", () => {
    render(<AgentTimeline entries={[]} emptyMessage="No activity yet" />);
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
  });

  it("renders default empty state when entries is empty and no custom message", () => {
    render(<AgentTimeline entries={[]} />);
    // Should render some default empty state element
    expect(screen.getByTestId("timeline-empty")).toBeInTheDocument();
  });

  it("supports collapsible mode - starts collapsed when collapsed is true", () => {
    const entries = [
      makeTimelineEntry({ label: "Event 1" }),
      makeTimelineEntry({ label: "Event 2" }),
    ];
    render(<AgentTimeline entries={entries} collapsible collapsed={true} title="Timeline" />);
    // The entries should not be visible initially
    expect(screen.queryByText("Event 1")).not.toBeInTheDocument();
    // But the title should be visible
    expect(screen.getByText("Timeline")).toBeInTheDocument();
  });

  it("supports collapsible mode - expands on toggle click", () => {
    const entries = [
      makeTimelineEntry({ label: "Event 1" }),
      makeTimelineEntry({ label: "Event 2" }),
    ];
    const onToggle = vi.fn();
    render(
      <AgentTimeline
        entries={entries}
        collapsible
        collapsed={true}
        title="Timeline"
        onToggleCollapse={onToggle}
      />,
    );
    // Click the toggle button
    const toggleBtn = screen.getByTestId("timeline-collapse-toggle");
    fireEvent.click(toggleBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not render collapse toggle when collapsible is not set", () => {
    const entries = [makeTimelineEntry({ label: "Event 1" })];
    render(<AgentTimeline entries={entries} title="Timeline" />);
    expect(screen.queryByTestId("timeline-collapse-toggle")).not.toBeInTheDocument();
  });

  it("passes through real projected selector output end-to-end", () => {
    const rawEvents: AgentRunEvent[] = [
      {
        eventId: "evt-start",
        runId: "run-e2e",
        timestamp: 1000,
        type: "run.started",
        mode: "browser-action",
      },
      {
        eventId: "evt-tool",
        runId: "run-e2e",
        timestamp: 2000,
        type: "tool.called",
        toolName: "click_element",
        toolArgs: { selector: "#submit-btn" },
      },
      {
        eventId: "evt-complete",
        runId: "run-e2e",
        timestamp: 3000,
        type: "tool.completed",
        toolName: "click_element",
        result: "Clicked successfully",
        durationMs: 150,
      },
    ];

    const projected = selectAgentTimeline(rawEvents);
    render(<AgentTimeline entries={projected} />);

    // Newest-first: tool.completed, then tool.called, then run.started
    const labels = screen.getAllByTestId("timeline-entry-label").map((el) => el.textContent);
    expect(labels[0]).toContain("click_element");
    expect(labels[2]).toContain("Run started");

    // Detail from projected entry
    expect(screen.getByText("Clicked successfully in 150ms")).toBeInTheDocument();
  });
});
