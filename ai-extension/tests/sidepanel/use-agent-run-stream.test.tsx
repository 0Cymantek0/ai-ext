/**
 * Wave 0 tests for useAgentRunEvents hook — UX-05
 *
 * Tests the bounded per-run subscription hook that will be implemented
 * in Task 1. These tests define the contract the hook must satisfy:
 *
 * - Immediate hydration on run selection via AGENT_RUN_STATUS
 * - Per-event streaming updates via AGENT_RUN_EVENT
 * - Event deduplication by eventId
 * - Bounded retention (MAX_EVENTS = 200)
 * - Selector-driven timeline projection via selectAgentTimeline
 * - Clean state reset when runId becomes null
 */

import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { AgentRun, AgentRunEvent } from "@/shared/agent-runtime/contracts";
import type {
  AgentRunStatusPayload,
  AgentRunEventPayload,
} from "@/shared/types/index.d";

// ── Chrome API mock ─────────────────────────────────────────────────────────

let runtimeMessageListener:
  | ((message: { kind: string; payload: any }, ...args: any[]) => void)
  | null = null;

const mockSendMessage = vi.fn();

beforeEach(() => {
  runtimeMessageListener = null;
  mockSendMessage.mockReset();

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
  });
});

// ── Test fixtures ────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    runId: "run-1",
    mode: "browser-action",
    status: "running",
    phase: "planning",
    createdAt: 100,
    updatedAt: 200,
    todoItems: [],
    pendingApproval: null,
    artifactRefs: [],
    latestCheckpointId: null,
    terminalOutcome: null,
    metadata: { task: "Test task" },
    ...overrides,
  };
}

function makeEvent(
  overrides: Partial<AgentRunEvent> & { type: AgentRunEvent["type"] },
): AgentRunEvent {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2, 8)}`,
    runId: "run-1",
    timestamp: Date.now(),
    ...overrides,
  } as AgentRunEvent;
}

const seedEvents: AgentRunEvent[] = [
  makeEvent({
    eventId: "evt-seed-1",
    type: "run.started",
    mode: "browser-action",
    timestamp: 100,
  }),
  makeEvent({
    eventId: "evt-seed-2",
    type: "run.phase_changed",
    fromPhase: "init",
    toPhase: "planning",
    timestamp: 150,
  }),
];

// ── Test Suite ───────────────────────────────────────────────────────────────

describe("useAgentRunEvents hook (UX-05 bounded streaming)", () => {
  it("hydrates run and events immediately on runId change", async () => {
    // When runId becomes non-null, the hook requests existing status/detail.
    // The AGENT_RUN_STATUS response seeds both run and events.
    const run = makeRun();
    mockSendMessage.mockImplementation(async (message: { kind: string }) => {
      if (message.kind === "AGENT_RUN_STATUS") {
        return {
          success: true,
          run,
          events: seedEvents,
        };
      }
      return { success: true };
    });

    const { useAgentRunEvents } = await import(
      "@/sidepanel/hooks/useAgentRunEvents"
    );

    const { result } = renderHook(
      ({ runId }) => useAgentRunEvents(runId),
      { initialProps: { runId: null as string | null } },
    );

    // Initially empty
    expect(result.current.run).toBeNull();
    expect(result.current.events).toEqual([]);
    expect(result.current.timeline).toEqual([]);
    expect(result.current.error).toBeNull();

    // Switch to active run
    renderHook(
      ({ runId }) => useAgentRunEvents(runId),
      { initialProps: { runId: "run-1" } },
    );

    // The hook should request status for run-1
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "AGENT_RUN_STATUS",
          payload: expect.objectContaining({ runId: "run-1" }),
        }),
      );
    });
  });

  it("appends matching AGENT_RUN_EVENT messages immediately without batching", async () => {
    const run = makeRun();
    mockSendMessage.mockImplementation(async (message: { kind: string }) => {
      if (message.kind === "AGENT_RUN_STATUS") {
        return { success: true, run, events: seedEvents };
      }
      return { success: true };
    });

    const { useAgentRunEvents } = await import(
      "@/sidepanel/hooks/useAgentRunEvents"
    );

    const { result } = renderHook(
      ({ runId }) => useAgentRunEvents(runId),
      { initialProps: { runId: "run-1" } },
    );

    // Wait for hydration
    await waitFor(() => {
      expect(result.current.run).not.toBeNull();
    });

    // Simulate a streaming event arriving
    const newEvent = makeEvent({
      eventId: "evt-stream-1",
      type: "tool.called",
      toolName: "click_element",
      toolArgs: { selector: "#btn" },
      timestamp: 300,
    });

    act(() => {
      runtimeMessageListener!({
        kind: "AGENT_RUN_EVENT",
        payload: { event: newEvent },
      });
    });

    await waitFor(() => {
      // The new event should appear immediately
      const hasNewEvent = result.current.events.some(
        (e) => e.eventId === "evt-stream-1",
      );
      expect(hasNewEvent).toBe(true);
    });
  });

  it("deduplicates events by eventId", async () => {
    const run = makeRun();
    // Seed with an event that will be sent again
    const duplicateSeed = makeEvent({
      eventId: "evt-dup",
      type: "run.started",
      mode: "browser-action",
      timestamp: 100,
    });

    mockSendMessage.mockImplementation(async (message: { kind: string }) => {
      if (message.kind === "AGENT_RUN_STATUS") {
        return { success: true, run, events: [duplicateSeed] };
      }
      return { success: true };
    });

    const { useAgentRunEvents } = await import(
      "@/sidepanel/hooks/useAgentRunEvents"
    );

    const { result } = renderHook(
      ({ runId }) => useAgentRunEvents(runId),
      { initialProps: { runId: "run-1" } },
    );

    await waitFor(() => {
      expect(result.current.run).not.toBeNull();
    });

    // Send the same event again via AGENT_RUN_EVENT
    act(() => {
      runtimeMessageListener!({
        kind: "AGENT_RUN_EVENT",
        payload: { event: duplicateSeed },
      });
    });

    await waitFor(() => {
      // Should not duplicate
      const dupCount = result.current.events.filter(
        (e) => e.eventId === "evt-dup",
      ).length;
      expect(dupCount).toBe(1);
    });
  });

  it("bounds event storage to MAX_EVENTS and discards oldest", async () => {
    const run = makeRun();
    // Create 201 events to exceed the bound
    const manyEvents: AgentRunEvent[] = [];
    for (let i = 0; i < 201; i++) {
      manyEvents.push(
        makeEvent({
          eventId: `evt-bound-${i}`,
          type: "tool.called",
          toolName: "test_tool",
          toolArgs: {},
          timestamp: 100 + i,
        }),
      );
    }

    mockSendMessage.mockImplementation(async (message: { kind: string }) => {
      if (message.kind === "AGENT_RUN_STATUS") {
        return { success: true, run, events: manyEvents };
      }
      return { success: true };
    });

    const { useAgentRunEvents } = await import(
      "@/sidepanel/hooks/useAgentRunEvents"
    );

    const { result } = renderHook(
      ({ runId }) => useAgentRunEvents(runId),
      { initialProps: { runId: "run-1" } },
    );

    await waitFor(() => {
      expect(result.current.run).not.toBeNull();
    });

    // The hook should have trimmed to 200 events, dropping the oldest
    await waitFor(() => {
      expect(result.current.events.length).toBeLessThanOrEqual(200);
    });

    // The oldest event (evt-bound-0) should have been discarded
    const hasOldest = result.current.events.some(
      (e) => e.eventId === "evt-bound-0",
    );
    expect(hasOldest).toBe(false);

    // The newest event (evt-bound-200) should still be present
    const hasNewest = result.current.events.some(
      (e) => e.eventId === "evt-bound-200",
    );
    expect(hasNewest).toBe(true);
  });

  it("derives timeline from events using selectAgentTimeline", async () => {
    const run = makeRun();
    mockSendMessage.mockImplementation(async (message: { kind: string }) => {
      if (message.kind === "AGENT_RUN_STATUS") {
        return { success: true, run, events: seedEvents };
      }
      return { success: true };
    });

    const { useAgentRunEvents } = await import(
      "@/sidepanel/hooks/useAgentRunEvents"
    );

    const { result } = renderHook(
      ({ runId }) => useAgentRunEvents(runId),
      { initialProps: { runId: "run-1" } },
    );

    await waitFor(() => {
      expect(result.current.timeline.length).toBeGreaterThan(0);
    });

    // Timeline entries should have projected fields (label, type, timestamp)
    const firstEntry = result.current.timeline[0];
    expect(firstEntry).toHaveProperty("eventId");
    expect(firstEntry).toHaveProperty("label");
    expect(firstEntry).toHaveProperty("type");
    expect(firstEntry).toHaveProperty("timestamp");
    expect(firstEntry.runId).toBe("run-1");
  });

  it("clears all state when runId becomes null", async () => {
    const run = makeRun();
    mockSendMessage.mockImplementation(async (message: { kind: string }) => {
      if (message.kind === "AGENT_RUN_STATUS") {
        return { success: true, run, events: seedEvents };
      }
      return { success: true };
    });

    const { useAgentRunEvents } = await import(
      "@/sidepanel/hooks/useAgentRunEvents"
    );

    const { result, rerender } = renderHook(
      ({ runId }) => useAgentRunEvents(runId),
      { initialProps: { runId: "run-1" as string | null } },
    );

    await waitFor(() => {
      expect(result.current.run).not.toBeNull();
      expect(result.current.events.length).toBeGreaterThan(0);
    });

    // Clear the run
    rerender({ runId: null });

    expect(result.current.run).toBeNull();
    expect(result.current.events).toEqual([]);
    expect(result.current.timeline).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("updates run state on AGENT_RUN_STATUS for the same runId", async () => {
    const run = makeRun();
    mockSendMessage.mockImplementation(async (message: { kind: string }) => {
      if (message.kind === "AGENT_RUN_STATUS") {
        return { success: true, run, events: seedEvents };
      }
      return { success: true };
    });

    const { useAgentRunEvents } = await import(
      "@/sidepanel/hooks/useAgentRunEvents"
    );

    const { result } = renderHook(
      ({ runId }) => useAgentRunEvents(runId),
      { initialProps: { runId: "run-1" } },
    );

    await waitFor(() => {
      expect(result.current.run).not.toBeNull();
    });

    // Simulate a status update (e.g., phase change)
    const updatedRun = makeRun({ phase: "executing", status: "running" });

    act(() => {
      runtimeMessageListener!({
        kind: "AGENT_RUN_STATUS",
        payload: { run: updatedRun },
      });
    });

    await waitFor(() => {
      expect(result.current.run?.phase).toBe("executing");
    });
  });

  it("sets error when status request fails", async () => {
    mockSendMessage.mockImplementation(async (message: { kind: string }) => {
      if (message.kind === "AGENT_RUN_STATUS") {
        return { success: false, error: "Run not found" };
      }
      return { success: true };
    });

    const { useAgentRunEvents } = await import(
      "@/sidepanel/hooks/useAgentRunEvents"
    );

    const { result } = renderHook(
      ({ runId }) => useAgentRunEvents(runId),
      { initialProps: { runId: "run-nonexistent" } },
    );

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.run).toBeNull();
  });

  it("ignores events for different runIds", async () => {
    const run = makeRun();
    mockSendMessage.mockImplementation(async (message: { kind: string }) => {
      if (message.kind === "AGENT_RUN_STATUS") {
        return { success: true, run, events: seedEvents };
      }
      return { success: true };
    });

    const { useAgentRunEvents } = await import(
      "@/sidepanel/hooks/useAgentRunEvents"
    );

    const { result } = renderHook(
      ({ runId }) => useAgentRunEvents(runId),
      { initialProps: { runId: "run-1" } },
    );

    await waitFor(() => {
      expect(result.current.run).not.toBeNull();
    });

    const initialCount = result.current.events.length;

    // Send an event for a different run
    const otherEvent = makeEvent({
      eventId: "evt-other",
      runId: "run-other",
      type: "tool.called",
      toolName: "other_tool",
      toolArgs: {},
      timestamp: 500,
    });

    act(() => {
      runtimeMessageListener!({
        kind: "AGENT_RUN_EVENT",
        payload: { event: otherEvent },
      });
    });

    // Should not have added the event
    expect(result.current.events.length).toBe(initialCount);
    const hasOther = result.current.events.some(
      (e) => e.eventId === "evt-other",
    );
    expect(hasOther).toBe(false);
  });
});
