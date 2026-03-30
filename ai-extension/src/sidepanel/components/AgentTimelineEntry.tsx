/**
 * AgentTimelineEntry — single timeline row renderer for projected AgentTimelineEntry data.
 *
 * Accepts only projected AgentTimelineEntry data from selectAgentTimeline().
 * Uses entry.type for icon/color selection but renders display text from entry.label and entry.detail.
 * Does NOT parse raw event payloads — that projection belongs to selectAgentTimeline().
 *
 * @module sidepanel/components/AgentTimelineEntry
 */

import React from "react";
import { cn } from "@/lib/utils";
import type { AgentTimelineEntry as AgentTimelineEntryType } from "@/shared/agent-runtime/selectors";
import {
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  Loader,
  FileText,
  Clock,
  Eye,
  GitBranch,
  ListTodo,
  Zap,
  Ban,
} from "lucide-react";

// ─── Icon/Tone Mapping ─────────────────────────────────────────────────────────

interface ToneConfig {
  icon: React.ComponentType<{ className?: string }>;
  dotColor: string;
  bgColor: string;
}

const TYPE_TONES: Record<string, ToneConfig> = {
  "run.started":           { icon: Play,         dotColor: "text-blue-500",          bgColor: "bg-blue-500/10" },
  "run.imported":          { icon: GitBranch,    dotColor: "text-purple-500",        bgColor: "bg-purple-500/10" },
  "run.phase_changed":     { icon: Clock,        dotColor: "text-sky-500",           bgColor: "bg-sky-500/10" },
  "todo.replaced":         { icon: ListTodo,     dotColor: "text-indigo-500",        bgColor: "bg-indigo-500/10" },
  "todo.item_upserted":    { icon: ListTodo,     dotColor: "text-indigo-500",        bgColor: "bg-indigo-500/10" },
  "tool.called":           { icon: Zap,          dotColor: "text-amber-500",         bgColor: "bg-amber-500/10" },
  "tool.completed":        { icon: CheckCircle,  dotColor: "text-emerald-500",       bgColor: "bg-emerald-500/10" },
  "tool.failed":           { icon: XCircle,      dotColor: "text-red-500",           bgColor: "bg-red-500/10" },
  "approval.requested":    { icon: ShieldAlert,  dotColor: "text-orange-500",        bgColor: "bg-orange-500/10" },
  "approval.resolved":     { icon: ShieldAlert,  dotColor: "text-green-500",         bgColor: "bg-green-500/10" },
  "artifact.projected":    { icon: FileText,     dotColor: "text-cyan-500",          bgColor: "bg-cyan-500/10" },
  "evidence.recorded":     { icon: Eye,          dotColor: "text-teal-500",          bgColor: "bg-teal-500/10" },
  "checkpoint.created":    { icon: GitBranch,    dotColor: "text-slate-500",         bgColor: "bg-slate-500/10" },
  "run.completed":         { icon: CheckCircle,  dotColor: "text-green-600",         bgColor: "bg-green-500/10" },
  "run.failed":            { icon: XCircle,      dotColor: "text-red-600",           bgColor: "bg-red-500/10" },
  "run.cancelled":         { icon: Ban,          dotColor: "text-muted-foreground",  bgColor: "bg-muted/50" },
};

const DEFAULT_TONE: ToneConfig = {
  icon: Loader,
  dotColor: "text-muted-foreground",
  bgColor: "bg-muted/30",
};

function getToneForType(type: string): ToneConfig {
  return TYPE_TONES[type] ?? DEFAULT_TONE;
}

// ─── Timestamp Formatting ──────────────────────────────────────────────────────

function formatTimelineTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Component ─────────────────────────────────────────────────────────────────

export interface AgentTimelineEntryProps {
  entry: AgentTimelineEntryType;
  className?: string;
}

export function AgentTimelineEntry({ entry, className }: AgentTimelineEntryProps) {
  const tone = getToneForType(entry.type);
  const Icon = tone.icon;
  const formattedTime = formatTimelineTimestamp(entry.timestamp);

  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-background px-3 py-2",
        className,
      )}
      data-entry-type={entry.type}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
            tone.bgColor,
          )}
        >
          <Icon className={cn("h-3 w-3", tone.dotColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-sm text-foreground"
              data-testid="timeline-entry-label"
            >
              {entry.label}
            </span>
            {formattedTime && (
              <span
                className="shrink-0 text-[11px] text-muted-foreground"
                data-testid="timeline-entry-time"
              >
                {formattedTime}
              </span>
            )}
          </div>
          {entry.detail && (
            <p
              className="mt-1 text-xs text-muted-foreground"
              data-testid="timeline-entry-detail"
            >
              {entry.detail}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
