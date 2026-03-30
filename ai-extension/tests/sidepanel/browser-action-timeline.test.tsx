import { describe, expect, it } from "vitest";
import {
  selectAgentPanelState,
  selectAgentTimeline,
  selectAgentTodo,
} from "@/shared/agent-runtime/selectors";
import type { AgentRun, AgentRunEvent } from "@/shared/agent-runtime/contracts";

describe("browser action timeline", () => {
  it("projects canonical browser-action timeline, current intent, and todo state", () => {
    const run: AgentRun = {
      runId: "run-browser-action",
      mode: "browser-action",
      status: "running",
      phase: "planning",
      createdAt: 100,
      updatedAt: 400,
      todoItems: [
        {
          id: "todo-plan",
          label: "Create execution plan",
          done: true,
          createdAt: 100,
          updatedAt: 150,
        },
        {
          id: "todo-inspect",
          label: "Inspect pricing table",
          done: false,
          createdAt: 160,
          updatedAt: 300,
        },
      ],
      pendingApproval: null,
      artifactRefs: [],
      latestCheckpointId: "cp-1",
      terminalOutcome: null,
      metadata: {
        task: "Inspect pricing table",
        currentIntent: "Retry click_element",
      },
    };

    const events: AgentRunEvent[] = [
      {
        eventId: "evt-start",
        runId: "run-browser-action",
        timestamp: 100,
        type: "run.started",
        mode: "browser-action",
      },
      {
        eventId: "evt-tool-failed",
        runId: "run-browser-action",
        timestamp: 300,
        type: "tool.failed",
        toolName: "click_element",
        error: "Selector not found",
        durationMs: 20,
        blockedByPolicy: false,
        recoverable: true,
      },
      {
        eventId: "evt-checkpoint",
        runId: "run-browser-action",
        timestamp: 350,
        type: "checkpoint.created",
        checkpointId: "cp-1",
        boundary: "retry-planned",
      },
    ];

    const panel = selectAgentPanelState(run, events);
    const timeline = selectAgentTimeline(events);
    const todo = selectAgentTodo(run);

    expect(panel.currentIntent).toBe("Retry click_element");
    expect(panel.progress).toBe(50);
    expect(todo[0]?.label).toBe("Inspect pricing table");
    expect(todo[1]?.label).toBe("Create execution plan");

    expect(timeline).toHaveLength(3);
    expect(timeline[1]).toMatchObject({
      label: "Tool failed: click_element",
      detail: "Selector not found (recoverable)",
    });
    expect(timeline[2]).toMatchObject({
      label: "Checkpoint created",
      detail: "Boundary: retry-planned",
    });
  });

  it("surfaces blocked sensitive actions in the projected timeline", () => {
    const run: AgentRun = {
      runId: "run-blocked",
      mode: "browser-action",
      status: "running",
      phase: "planning",
      createdAt: 100,
      updatedAt: 500,
      todoItems: [],
      pendingApproval: null,
      artifactRefs: [],
      latestCheckpointId: "cp-blocked",
      terminalOutcome: null,
      metadata: {
        task: "Fill checkout form",
      },
    };

    const events: AgentRunEvent[] = [
      {
        eventId: "evt-blocked",
        runId: "run-blocked",
        timestamp: 500,
        type: "tool.failed",
        toolName: "type_text",
        error: "Blocked pending approval for type_text",
        durationMs: 0,
        blockedByPolicy: true,
        recoverable: true,
      },
    ];

    const panel = selectAgentPanelState(run, events);
    const timeline = selectAgentTimeline(events);

    expect(panel.currentIntent).toBe("Blocked on type_text");
    expect(timeline[0]).toMatchObject({
      label: "Action blocked: type_text",
      detail: "Blocked pending approval for type_text (blocked by policy, recoverable)",
    });
  });
});
