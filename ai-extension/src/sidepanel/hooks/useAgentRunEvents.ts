/**
 * useAgentRunEvents — Bounded per-run subscription hook (UX-05)
 *
 * Provides isolated streaming state for a single agent run. Each hook instance
 * manages its own chrome.runtime.onMessage listener so that agent event updates
 * do not trigger re-renders in unrelated sidepanel surfaces.
 *
 * Contract:
 * - Hydrates immediately on runId change by requesting AGENT_RUN_STATUS
 * - Appends matching AGENT_RUN_EVENT messages one-by-one as they arrive
 * - No timer-based batching, interval flushes, or delayed delivery
 * - Bounded buffer (MAX_EVENTS = 200) with deduplication by eventId
 * - Derives timeline via selectAgentTimeline inside the hook
 * - Clears all state when runId becomes null
 *
 * @module sidepanel/hooks/useAgentRunEvents
 */

import * as React from "react";
import type { AgentRun, AgentRunEvent } from "@/shared/agent-runtime/contracts";
import {
  selectAgentTimeline,
  type AgentTimelineEntry,
} from "@/shared/agent-runtime/selectors";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of events retained in the buffer. Oldest events are discarded. */
const MAX_EVENTS = 200;

// ─── Return Type ──────────────────────────────────────────────────────────────

export interface AgentRunStream {
  /** Current run state, or null if no run is active. */
  run: AgentRun | null;
  /** Bounded, deduplicated raw events for this run. */
  events: AgentRunEvent[];
  /** Projected timeline entries derived from events via selectAgentTimeline. */
  timeline: AgentTimelineEntry[];
  /** Error message if hydration or streaming failed, or null. */
  error: string | null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Merge new events into existing events with deduplication by eventId.
 * Enforces MAX_EVENTS bound by discarding oldest events when the buffer
 * exceeds the limit.
 */
function mergeAndBound(
  current: AgentRunEvent[],
  incoming: AgentRunEvent[],
): AgentRunEvent[] {
  const merged = new Map<string, AgentRunEvent>();

  // Insert current events first
  for (const event of current) {
    merged.set(event.eventId, event);
  }

  // Insert/overwrite with incoming events
  for (const event of incoming) {
    merged.set(event.eventId, event);
  }

  // Sort by timestamp for consistent ordering
  const sorted = [...merged.values()].sort(
    (left, right) => left.timestamp - right.timestamp,
  );

  // Enforce bound: keep the most recent events
  if (sorted.length > MAX_EVENTS) {
    return sorted.slice(sorted.length - MAX_EVENTS);
  }

  return sorted;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Subscribe to a single agent run's events with immediate per-event updates.
 *
 * The hook adds its own chrome.runtime.onMessage listener so that agent
 * event state is isolated from the rest of ChatApp's render tree. Only
 * events matching the provided runId are accepted.
 *
 * @param runId - The run to subscribe to, or null to clear all state.
 * @returns The current run, events, projected timeline, and any error.
 */
export function useAgentRunEvents(runId: string | null): AgentRunStream {
  const [run, setRun] = React.useState<AgentRun | null>(null);
  const [events, setEvents] = React.useState<AgentRunEvent[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  // Track the active runId in a ref so the async hydration can check
  // for staleness without re-triggering.
  const activeRunIdRef = React.useRef<string | null>(null);

  // ── Hydration: request existing status when runId changes ────────────────

  React.useEffect(() => {
    activeRunIdRef.current = runId;

    if (!runId) {
      // Clear all state when runId becomes null
      setRun(null);
      setEvents([]);
      setError(null);
      return;
    }

    let cancelled = false;

    const hydrate = async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          kind: "AGENT_RUN_STATUS",
          requestId: crypto.randomUUID(),
          payload: { runId },
        });

        if (cancelled) return;

        if (!response?.success) {
          setError(response?.error || "Failed to fetch run status");
          return;
        }

        // Only apply if the runId hasn't changed during the async request
        if (activeRunIdRef.current !== runId) return;

        setRun(response.run ?? null);
        if (response.events) {
          setEvents(mergeAndBound([], response.events));
        }
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to fetch run status");
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [runId]);

  // ── Message listener: accept streaming events for the active runId ──────
  // The listener re-registers when runId changes so it always has the correct
  // runId in its closure. This avoids stale ref issues during initial setup.

  React.useEffect(() => {
    const listener = (message: { kind: string; payload: any }) => {
      if (!runId) return;

      switch (message.kind) {
        case "AGENT_RUN_STATUS": {
          const payload = message.payload as { run: AgentRun; events?: AgentRunEvent[] };
          if (!payload?.run || payload.run.runId !== runId) return;

          // Apply run update immediately
          setRun(payload.run);
          if (payload.events) {
            setEvents((prev) => mergeAndBound(prev, payload.events!));
          }
          break;
        }

        case "AGENT_RUN_EVENT": {
          const payload = message.payload as { event: AgentRunEvent };
          if (!payload?.event || payload.event.runId !== runId) return;

          // Append single event immediately — no batching
          setEvents((prev) => mergeAndBound(prev, [payload.event]));
          break;
        }
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [runId]);

  // ── Derive timeline from events via selector ─────────────────────────────

  const timeline = React.useMemo(
    () => selectAgentTimeline(events),
    [events],
  );

  return { run, events, timeline, error };
}
