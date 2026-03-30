/**
 * RunHistoryItem — single row renderer for a completed run in the history list.
 *
 * Shows mode, status, summary text, duration, and timestamp.
 *
 * @module sidepanel/components/RunHistoryItem
 */

import React from "react";
import { cn } from "@/lib/utils";
import type { AgentRun } from "@/shared/agent-runtime/contracts";
import { AgentRunStatusBadge } from "@/sidepanel/components/AgentRunStatusBadge";
import { Globe, FlaskConical } from "lucide-react";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(from: number, to: number): string {
  const diffMs = Math.max(0, to - from);
  if (diffMs < 1000) return "<1s";
  if (diffMs < 60000) return `${Math.round(diffMs / 1000)}s`;
  if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m`;
  return `${(diffMs / 3600000).toFixed(1)}h`;
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60000) return "Just now";
  if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.round(diffMs / 3600000)}h ago`;
  return new Date(timestamp).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function getRunSummary(run: AgentRun): string {
  const metadata = run.metadata ?? {};

  if (run.mode === "browser-action") {
    return typeof metadata.task === "string" && metadata.task.trim()
      ? metadata.task.trim()
      : "Browser action";
  }

  if (run.mode === "deep-research") {
    return typeof metadata.topic === "string" && metadata.topic.trim()
      ? metadata.topic.trim()
      : "Deep research run";
  }

  return `Run ${run.runId}`;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export interface RunHistoryItemProps {
  run: AgentRun;
  onSelect: (runId: string) => void;
  className?: string;
}

export function RunHistoryItem({ run, onSelect, className }: RunHistoryItemProps) {
  const ModeIcon = run.mode === "deep-research" ? FlaskConical : Globe;
  const modeLabel = run.mode === "deep-research" ? "Deep research" : "Browser action";
  const summary = getRunSummary(run);
  const duration = formatDuration(run.createdAt, run.terminalOutcome?.finishedAt ?? run.updatedAt);
  const relativeTime = formatRelativeTime(run.createdAt);

  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-xl border border-border/50 bg-background px-3 py-2.5 text-left",
        "transition-colors hover:border-border hover:bg-muted/30",
        "focus:outline-none focus:ring-2 focus:ring-ring/30",
        className,
      )}
      data-testid="run-history-item"
      onClick={() => onSelect(run.runId)}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted/40">
          <ModeIcon className="h-3 w-3 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {modeLabel}
            </span>
            <span
              className="shrink-0 text-[11px] text-muted-foreground"
              data-testid="run-history-item-timestamp"
            >
              {relativeTime}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-foreground line-clamp-2">
            {summary}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <AgentRunStatusBadge status={run.status} className="text-[10px] px-1.5 py-0.5" />
            <span
              className="text-[11px] text-muted-foreground"
              data-testid="run-history-item-duration"
            >
              {duration}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
