/**
 * AgentTimeline — shared timeline container for live and historical run review.
 *
 * Accepts projected AgentTimelineEntry[], supports maxItems, title, collapsible,
 * and empty state. Sorts newest-first for display and caps items when maxItems is set.
 *
 * @module sidepanel/components/AgentTimeline
 */

import React from "react";
import { cn } from "@/lib/utils";
import type { AgentTimelineEntry as AgentTimelineEntryType } from "@/shared/agent-runtime/selectors";
import { AgentTimelineEntry } from "@/sidepanel/components/AgentTimelineEntry";
import { ChevronDown, ChevronRight } from "lucide-react";

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface AgentTimelineProps {
  /** Projected timeline entries from selectAgentTimeline(). */
  entries: AgentTimelineEntryType[];
  /** Optional section title. */
  title?: string;
  /** Maximum number of entries to display. Undefined = show all. */
  maxItems?: number;
  /** Whether the timeline can be collapsed. */
  collapsible?: boolean;
  /** Whether the timeline is currently collapsed. Only meaningful when collapsible is true. */
  collapsed?: boolean;
  /** Callback fired when collapse state is toggled. */
  onToggleCollapse?: () => void;
  /** Custom empty state message. */
  emptyMessage?: string;
  /** Additional class name for the outer container. */
  className?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function AgentTimeline({
  entries,
  title,
  maxItems,
  collapsible = false,
  collapsed = false,
  onToggleCollapse,
  emptyMessage = "No timeline events",
  className,
}: AgentTimelineProps) {
  // Sort newest-first
  const sorted = React.useMemo(
    () => [...entries].sort((a, b) => b.timestamp - a.timestamp),
    [entries],
  );

  // Cap items if maxItems is provided
  const displayed = React.useMemo(
    () => (maxItems !== undefined ? sorted.slice(0, maxItems) : sorted),
    [sorted, maxItems],
  );

  const isEmpty = entries.length === 0;

  // ── Empty state ──────────────────────────────────────────────────────────

  if (isEmpty) {
    return (
      <div className={cn("space-y-2", className)}>
        {title && (
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
        )}
        <div
          className="rounded-xl border border-border/40 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground"
          data-testid="timeline-empty"
        >
          {emptyMessage}
        </div>
      </div>
    );
  }

  // ── Collapsed header-only state ──────────────────────────────────────────

  if (collapsible && collapsed) {
    return (
      <div className={cn("space-y-2", className)}>
        {title && (
          <button
            type="button"
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            onClick={onToggleCollapse}
            data-testid="timeline-collapse-toggle"
          >
            <ChevronRight className="h-3 w-3" />
            {title}
            <span className="normal-case tracking-normal">
              ({entries.length})
            </span>
          </button>
        )}
      </div>
    );
  }

  // ── Full timeline ────────────────────────────────────────────────────────

  return (
    <div className={cn("space-y-2", className)}>
      {title && (
        <div className="flex items-center gap-1.5">
          {collapsible ? (
            <button
              type="button"
              className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
              onClick={onToggleCollapse}
              data-testid="timeline-collapse-toggle"
            >
              <ChevronDown className="h-3 w-3" />
              {title}
            </button>
          ) : (
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {title}
            </p>
          )}
        </div>
      )}
      <div className="space-y-2">
        {displayed.map((entry) => (
          <AgentTimelineEntry key={entry.eventId} entry={entry} />
        ))}
      </div>
      {maxItems !== undefined && sorted.length > maxItems && (
        <p className="text-center text-[11px] text-muted-foreground">
          Showing {maxItems} of {sorted.length} events
        </p>
      )}
    </div>
  );
}
