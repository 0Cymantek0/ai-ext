import * as React from "react";
import { cn } from "@/lib/utils";
import type { PocketData } from "./PocketCard";
import type { CapturedContent } from "@/background/indexeddb-manager";

type PocketResult = {
  item: PocketData;
  relevanceScore?: number;
  matchedFields?: string[];
};

type ContentResult = {
  item: CapturedContent;
  relevanceScore?: number;
  matchedFields?: string[];
};

interface BaseProps {
  open: boolean;
  query: string;
  loading?: boolean;
  onClose: () => void;
  className?: string;
}

interface PocketResultsProps extends BaseProps {
  kind: "pockets";
  results: PocketResult[];
  onSelectPocket?: (p: PocketData) => void;
}

interface ContentResultsProps extends BaseProps {
  kind: "content";
  results: ContentResult[];
  onSelectContent?: (c: CapturedContent) => void;
}

type SearchResultsPanelProps = PocketResultsProps | ContentResultsProps;

function formatScore(score?: number): string | null {
  if (typeof score !== "number") return null;
  const pct = Math.round(score * 100);
  return `${pct}%`;
}

function formatDate(ts?: number): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

export function SearchResultsPanel(props: SearchResultsPanelProps) {
  const { open, query, loading, className, onClose } = props;

  if (!open) return null;

  const isPockets = props.kind === "pockets";

  return (
    <div
      className={cn(
        // Place the panel just below the fixed TopBar (h-14)
        "absolute left-0 right-0 bottom-0 top-14 z-40",
        "p-4",
        className,
      )}
      role="region"
      aria-label="Search results"
    >
      <div
        className={cn(
          "h-full w-full overflow-hidden rounded-2xl",
          "bg-background/80 backdrop-blur-md border border-border shadow-xl",
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="size-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <div className="truncate text-sm">
              <span className="text-muted-foreground">Results for</span>{" "}
              <span className="font-medium">“{query}”</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {loading && (
              <svg className="size-4 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-full p-1 hover:bg-accent/60"
              aria-label="Close search results"
              title="Close"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="h-[calc(100%-52px)] overflow-y-auto px-4 py-3">
          {isPockets ? (
            <PocketResultsList
              results={(props as PocketResultsProps).results}
              onSelect={(p) => (props as PocketResultsProps).onSelectPocket?.(p)}
            />
          ) : (
            <ContentResultsList
              results={(props as ContentResultsProps).results}
              onSelect={(c) => (props as ContentResultsProps).onSelectContent?.(c)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PocketResultsList({
  results,
  onSelect,
}: {
  results: PocketResult[];
  onSelect?: (p: PocketData) => void;
}) {
  if (!results || results.length === 0) {
    return (
      <EmptyResults message="No pockets match your search." />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {results.map(({ item, relevanceScore, matchedFields }) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect?.(item)}
          className={cn(
            "group text-left rounded-xl border border-border bg-card/70 backdrop-blur-sm",
            "hover:border-accent hover:bg-accent/30 transition-colors",
            "p-3 flex flex-col gap-2",
          )}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="truncate font-medium text-sm">{item.name}</h3>
                {typeof relevanceScore === "number" && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    {formatScore(relevanceScore)}
                  </span>
                )}
              </div>
              {item.description && (
                <p className="line-clamp-2 text-xs text-muted-foreground mt-0.5">
                  {item.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-1">
            {item.tags?.slice(0, 4).map((tag) => (
              <span key={tag} className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                #{tag}
              </span>
            ))}
            {matchedFields && matchedFields.length > 0 && (
              <span className="text-[10px] rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5">
                semantic
              </span>
            )}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {item.contentIds?.length || 0} items · {formatDate(item.updatedAt)}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function ContentResultsList({
  results,
  onSelect,
}: {
  results: ContentResult[];
  onSelect?: (c: CapturedContent) => void;
}) {
  if (!results || results.length === 0) {
    return (
      <EmptyResults message="No content matches your search." />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {results.map(({ item, relevanceScore, matchedFields }) => {
        const title = item.metadata?.title || item.metadata?.domain || "Untitled";
        const snippet = typeof item.content === "string" ? item.content.slice(0, 220) : "";
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect?.(item)}
            className={cn(
              "group text-left rounded-xl border border-border bg-card/70 backdrop-blur-sm",
              "hover:border-accent hover:bg-accent/30 transition-colors",
              "p-3 flex flex-col gap-2",
            )}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="truncate font-medium text-sm">{title}</h3>
                  {typeof relevanceScore === "number" && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {formatScore(relevanceScore)}
                    </span>
                  )}
                </div>
                {snippet && (
                  <p className="line-clamp-3 text-xs text-muted-foreground mt-0.5">{snippet}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                {item.type}
              </span>
              {matchedFields && matchedFields.length > 0 && (
                <span className="text-[10px] rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5">
                  semantic
                </span>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {formatDate(item.capturedAt)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function EmptyResults({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-sm">
        <svg className="w-12 h-12 mx-auto mb-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <h3 className="text-lg font-semibold mb-2">No results found</h3>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}


