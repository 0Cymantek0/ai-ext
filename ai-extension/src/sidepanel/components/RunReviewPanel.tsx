/**
 * RunReviewPanel — hydrated review surface for a selected completed run.
 *
 * Shows sections: summary/status, timeline, artifact refs, evidence, terminal outcome.
 * Accepts hydrated data from ChatApp as props (not fetching on its own).
 *
 * @module sidepanel/components/RunReviewPanel
 */

import React from "react";
import { cn } from "@/lib/utils";
import type {
  AgentRun,
  AgentArtifactRef,
} from "@/shared/agent-runtime/contracts";
import type {
  AgentTimelineEntry,
} from "@/shared/agent-runtime/selectors";
import { AgentTimeline } from "@/sidepanel/components/AgentTimeline";
import { AgentRunStatusBadge } from "@/sidepanel/components/AgentRunStatusBadge";
import {
  X,
  Globe,
  FlaskConical,
  FileText,
  Eye,
  CheckCircle,
  XCircle,
  Ban,
  ExternalLink,
} from "lucide-react";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(from: number, to: number): string {
  const diffMs = Math.max(0, to - from);
  if (diffMs < 1000) return "<1s";
  if (diffMs < 60000) return `${Math.round(diffMs / 1000)}s`;
  if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m`;
  return `${(diffMs / 3600000).toFixed(1)}h`;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface RunReviewPanelProps {
  /** The run to review. Null means the run was not found. */
  run: AgentRun | null;
  /** Projected timeline entries for the run. */
  timeline: AgentTimelineEntry[];
  /** Callback to close the review panel. */
  onClose: () => void;
  /** Optional callback to open a linked pocket. */
  onOpenPocket?: (pocketId: string) => void;
  /** Additional class name. */
  className?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function RunReviewPanel({
  run,
  timeline,
  onClose,
  onOpenPocket,
  className,
}: RunReviewPanelProps) {
  // ── Missing run error state ────────────────────────────────────────────
  if (!run) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm backdrop-blur-sm",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-sm font-semibold text-foreground">Run review</p>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
            onClick={onClose}
            data-testid="run-review-close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-4 text-center text-xs text-red-700 dark:text-red-300">
          Run not found. It may have been deleted or the ID is invalid.
        </div>
      </div>
    );
  }

  const metadata = run.metadata ?? {};
  const isDeepResearch = run.mode === "deep-research";
  const ModeIcon = isDeepResearch ? FlaskConical : Globe;
  const modeLabel = isDeepResearch ? "Deep research" : "Browser action";
  const outcome = run.terminalOutcome;
  const duration = formatDuration(
    run.createdAt,
    outcome?.finishedAt ?? run.updatedAt,
  );

  // Deep-research specific data
  const findings = isDeepResearch
    ? (metadata.findings as Array<{
        id: string;
        summary: string;
        excerpt?: string;
        source: { sourceUrl: string; title?: string; capturedAt: number };
        createdAt: number;
        evidenceId?: string;
        duplicateCount?: number;
      }> | undefined)
    : undefined;

  const topic = isDeepResearch ? (metadata.topic as string | undefined) : undefined;
  const goal = isDeepResearch ? (metadata.goal as string | undefined) : undefined;
  const task = !isDeepResearch ? (metadata.task as string | undefined) : undefined;

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-5 items-center justify-center rounded-full bg-muted/40">
            <ModeIcon className="h-3 w-3 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">Run review</p>
        </div>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
          onClick={onClose}
          data-testid="run-review-close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-4">
        {/* ── Summary/Status Section ──────────────────────────────────────── */}
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AgentRunStatusBadge status={run.status} />
            <span className="text-xs text-muted-foreground">{modeLabel}</span>
            <span className="text-xs text-muted-foreground ml-auto">{duration}</span>
          </div>

          {task && (
            <p className="text-sm text-foreground">{task}</p>
          )}

          {topic && (
            <div>
              <p className="text-sm font-medium text-foreground">{topic}</p>
              {goal && (
                <p className="text-xs text-muted-foreground mt-0.5">{goal}</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
            <span>Created {formatTimestamp(run.createdAt)}</span>
            <span>Updated {formatTimestamp(run.updatedAt)}</span>
          </div>
        </div>

        {/* ── Timeline Section ────────────────────────────────────────────── */}
        <AgentTimeline
          entries={timeline}
          title="Timeline"
          emptyMessage="No events recorded for this run"
        />

        {/* ── Artifacts Section ───────────────────────────────────────────── */}
        {run.artifactRefs.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
              Artifacts
            </p>
            <div className="space-y-1.5">
              {run.artifactRefs.map((artifact) => (
                <ArtifactItem
                  key={artifact.artifactId}
                  artifact={artifact}
                  onOpenPocket={onOpenPocket}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Evidence Section (deep-research only) ────────────────────────── */}
        {isDeepResearch && findings && findings.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
              Evidence ({findings.length})
            </p>
            <div className="space-y-1.5">
              {findings.map((finding) => (
                <EvidenceItem key={finding.id} finding={finding} />
              ))}
            </div>
          </div>
        )}

        {/* ── Terminal Outcome Section ─────────────────────────────────────── */}
        {outcome && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
              Outcome
            </p>
            <OutcomeCard outcome={outcome} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────────

function ArtifactItem({
  artifact,
  onOpenPocket,
}: {
  artifact: AgentArtifactRef;
  onOpenPocket: ((pocketId: string) => void) | undefined;
}) {
  const isPocket = artifact.artifactType === "pocket";
  const canOpen = isPocket && artifact.targetId && onOpenPocket;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background px-2.5 py-1.5">
      <FileText className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
      <span className="text-xs text-foreground truncate flex-1">
        {artifact.label}
      </span>
      {canOpen && (
        <button
          type="button"
          className="shrink-0 flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-600"
          onClick={() => onOpenPocket(artifact.targetId!)}
        >
          <ExternalLink className="h-3 w-3" />
          Open
        </button>
      )}
    </div>
  );
}

function EvidenceItem({
  finding,
}: {
  finding: {
    id: string;
    summary: string;
    excerpt?: string;
    source: { sourceUrl: string; title?: string; capturedAt: number };
    createdAt: number;
  };
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-background px-2.5 py-1.5">
      <div className="flex items-start gap-2">
        <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-500" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-foreground">{finding.summary}</p>
          {finding.source.title && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {finding.source.title}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function OutcomeCard({
  outcome,
}: {
  outcome: NonNullable<AgentRun["terminalOutcome"]>;
}) {
  const isSuccess = outcome.status === "completed";
  const isFailed = outcome.status === "failed";
  const isCancelled = outcome.status === "cancelled";

  const Icon = isSuccess ? CheckCircle : isFailed ? XCircle : Ban;
  const iconColor = isSuccess
    ? "text-green-500"
    : isFailed
      ? "text-red-500"
      : "text-muted-foreground";
  const borderColor = isSuccess
    ? "border-green-500/30"
    : isFailed
      ? "border-red-500/30"
      : "border-border/40";
  const bgColor = isSuccess
    ? "bg-green-500/5"
    : isFailed
      ? "bg-red-500/5"
      : "bg-muted/20";

  return (
    <div className={cn("rounded-lg border px-3 py-2", borderColor, bgColor)}>
      <div className="flex items-start gap-2">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconColor)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground">
            {outcome.reason ?? `Run ${outcome.status}`}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {formatTimestamp(outcome.finishedAt)}
          </p>
        </div>
      </div>
    </div>
  );
}
