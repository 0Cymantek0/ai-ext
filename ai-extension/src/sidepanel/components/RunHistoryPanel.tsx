/**
 * RunHistoryPanel — browse/filter surface for completed runs.
 *
 * Supports mode filtering (browser-action vs deep-research vs all),
 * renders RunHistoryItem for each run, and fires selection/close callbacks.
 *
 * @module sidepanel/components/RunHistoryPanel
 */

import React from "react";
import { cn } from "@/lib/utils";
import type { AgentRun } from "@/shared/agent-runtime/contracts";
import { RunHistoryItem } from "@/sidepanel/components/RunHistoryItem";
import { Loader, X, Globe, FlaskConical, LayoutGrid } from "lucide-react";

// ─── Filter Types ───────────────────────────────────────────────────────────────

type FilterMode = "all" | "browser-action" | "deep-research";

// ─── Component ─────────────────────────────────────────────────────────────────

export interface RunHistoryPanelProps {
  /** List of runs to display. */
  runs: AgentRun[];
  /** Callback fired when a run is selected. */
  onSelectRun: (runId: string) => void;
  /** Callback fired when the panel is closed. */
  onClose: () => void;
  /** Whether the panel is currently loading runs. */
  isLoading?: boolean;
  /** Additional class name for the outer container. */
  className?: string;
}

export function RunHistoryPanel({
  runs,
  onSelectRun,
  onClose,
  isLoading = false,
  className,
}: RunHistoryPanelProps) {
  const [filter, setFilter] = React.useState<FilterMode>("all");

  const filteredRuns = React.useMemo(() => {
    if (filter === "all") return runs;
    return runs.filter((run) => run.mode === filter);
  }, [runs, filter]);

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm font-semibold text-foreground">Run history</p>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
          onClick={onClose}
          data-testid="run-history-close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-3 rounded-lg bg-muted/30 p-1">
        <FilterButton
          active={filter === "all"}
          onClick={() => setFilter("all")}
          data-testid="filter-all"
        >
          <LayoutGrid className="h-3 w-3" />
          All
        </FilterButton>
        <FilterButton
          active={filter === "browser-action"}
          onClick={() => setFilter("browser-action")}
          data-testid="filter-browser-action"
        >
          <Globe className="h-3 w-3" />
          Browser action
        </FilterButton>
        <FilterButton
          active={filter === "deep-research"}
          onClick={() => setFilter("deep-research")}
          data-testid="filter-deep-research"
        >
          <FlaskConical className="h-3 w-3" />
          Research
        </FilterButton>
      </div>

      {/* Content */}
      {isLoading ? (
        <div
          className="flex flex-col items-center justify-center py-8 text-muted-foreground"
          data-testid="run-history-loading"
        >
          <Loader className="h-5 w-5 animate-spin mb-2" />
          <p className="text-xs">Loading runs...</p>
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
          {runs.length === 0
            ? "No completed runs yet. Run a browser action or deep research to see history here."
            : "No runs match this filter."}
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {filteredRuns.map((run) => (
            <RunHistoryItem key={run.runId} run={run} onSelect={onSelectRun} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Filter Button ─────────────────────────────────────────────────────────────

interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  ["data-testid"]?: string;
}

function FilterButton({ active, onClick, children, className, ...rest }: FilterButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
      onClick={onClick}
      data-testid={rest["data-testid"]}
    >
      {children}
    </button>
  );
}
