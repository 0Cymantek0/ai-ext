import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AgentPanelLayout } from "@/sidepanel/components/AgentPanelLayout";
import { AgentRunStatusBadge } from "@/sidepanel/components/AgentRunStatusBadge";
import { AgentRunControls } from "@/sidepanel/components/AgentRunControls";
import { AgentApprovalCard } from "@/sidepanel/components/AgentApprovalCard";
import type {
  AgentRun,
  AgentPendingApproval,
  AgentTodoItem,
} from "@/shared/agent-runtime/contracts";
import type { AgentPanelState, AgentTimelineEntry } from "@/shared/agent-runtime/selectors";

/**
 * Format a timestamp into a short locale time string for display in timeline entries.
 */
const formatRunTimestamp = (timestamp: number): string => {
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
};

export interface BrowserActionPanelProps {
  /** Current agent run state, or null if no run is active. */
  run: AgentRun | null;
  /** Projected timeline entries for display. */
  events: AgentTimelineEntry[];
  /** Current error message, or null. */
  error: string | null;
  /** Projected panel state from selectors, or null if no run. */
  panelState: AgentPanelState | null;
  /** Whether the panel is globally disabled (e.g., during chat loading). */
  disabled: boolean;
  /** Label to display in the header badge showing the selected model. */
  modelLabel: string;
  /** Provider ID for display in the footer. */
  providerId?: string;
  /** Model ID for display in the footer. */
  modelId?: string;
  /** Whether the user needs to pick a model before launch can be enabled. */
  requiresModelSelection: boolean;
  /** Callback to launch a browser action with the given task description. */
  onLaunch: (task: string) => void;
  /** Callback to pause the current run. */
  onPause: () => void;
  /** Callback to resume the current run. */
  onResume: () => void;
  /** Callback to cancel the current run. */
  onCancel: () => void;
  /** Callback to resolve a pending approval. */
  onApprovalResolve: (approvalId: string, resolution: "approved" | "rejected") => void;
}

/**
 * BrowserActionPanel encapsulates all browser-action workflow UI:
 * task input, launch controls, run status, approval gates, todo list, and timeline.
 *
 * All state management and message passing stays in ChatApp.tsx; this component
 * receives data through props and delegates actions to callbacks.
 */
export function BrowserActionPanel({
  run,
  events,
  error,
  panelState,
  disabled,
  modelLabel,
  providerId,
  modelId,
  requiresModelSelection,
  onLaunch,
  onPause,
  onResume,
  onCancel,
  onApprovalResolve,
}: BrowserActionPanelProps) {
  const [taskInput, setTaskInput] = React.useState("");
  const [isLaunching, setIsLaunching] = React.useState(false);

  // Extract display data from run metadata
  const tabTitle = run?.metadata?.tabTitle as string | undefined;

  // Derive todo items from panelState
  const todoItems: AgentTodoItem[] = panelState?.todoItems ?? [];

  // Derive latest approval from panelState
  const pendingApproval: AgentPendingApproval | null =
    panelState?.pendingApproval ?? null;

  const handleLaunch = React.useCallback(() => {
    const task = taskInput.trim();
    if (!task || isLaunching) {
      return;
    }

    setIsLaunching(true);
    onLaunch(task);
    setTaskInput("");
    // Brief timeout to prevent double-click; the parent will set isStarting state
    setTimeout(() => setIsLaunching(false), 300);
  }, [taskInput, isLaunching, onLaunch]);

  const hasActiveRun = panelState !== null || events.length > 0;

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-foreground">
          Browser action
        </p>
        <p className="text-xs text-muted-foreground">
          Uses the same provider/model selection as chat.
        </p>
      </div>
      <div className="rounded-full border border-border/70 px-2 py-1 text-[11px] text-muted-foreground">
        {modelLabel}
      </div>
    </div>
  );

  return (
    <AgentPanelLayout header={header}>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">
          Task
        </span>
        <textarea
          value={taskInput}
          onChange={(event) => setTaskInput(event.target.value)}
          placeholder="Open the current page, inspect the checkout flow, and report blockers."
          className="min-h-[92px] w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-foreground/40"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {requiresModelSelection
            ? "Pick a configured model in the chat composer to enable launch."
            : `Provider: ${providerId} \u2022 Model: ${modelId}`}
        </span>
        <Button
          type="button"
          onClick={handleLaunch}
          disabled={
            isLaunching ||
            taskInput.trim().length === 0 ||
            requiresModelSelection ||
            disabled
          }
        >
          {isLaunching ? "Launching..." : "Launch browser action"}
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {hasActiveRun && (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {panelState && (
              <>
                <AgentRunStatusBadge status={panelState.status} />
                <span className="rounded-full bg-background px-2 py-1 text-foreground text-xs">
                  Phase: {panelState.phase}
                </span>
                <span className="rounded-full bg-background px-2 py-1 text-foreground text-xs">
                  Progress: {panelState.progress}%
                </span>
                <AgentRunControls
                  status={panelState.status}
                  onPause={onPause}
                  onResume={onResume}
                  onCancel={onCancel}
                />
              </>
            )}
            {tabTitle && (
              <span className="truncate">
                Tab: {tabTitle}
              </span>
            )}
          </div>

          {panelState?.currentIntent && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Current intent
              </p>
              <p className="mt-1 text-sm text-foreground">
                {panelState.currentIntent}
              </p>
            </div>
          )}

          {todoItems.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Todo
              </p>
              <ul className="mt-2 space-y-1">
                {todoItems.slice(0, 4).map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <span
                      className={cn(
                        "inline-flex size-5 items-center justify-center rounded-full border text-[11px]",
                        item.done
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {item.done ? "\u2713" : "\u2022"}
                    </span>
                    <span
                      className={cn(
                        item.done && "text-muted-foreground line-through",
                      )}
                    >
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pendingApproval && (
            <AgentApprovalCard
              approval={pendingApproval}
              onResolve={(resolution) =>
                onApprovalResolve(pendingApproval.approvalId, resolution)
              }
            />
          )}

          {events.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Timeline
              </p>
              <div className="mt-2 space-y-2">
                {events.slice(-5).reverse().map((entry) => (
                  <div
                    key={entry.eventId}
                    className="rounded-xl border border-border/50 bg-background px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-sm text-foreground">
                      <span>{entry.label}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatRunTimestamp(entry.timestamp)}
                      </span>
                    </div>
                    {entry.detail && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.detail}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AgentPanelLayout>
  );
}
