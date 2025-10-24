import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface IndexingWarningBannerProps {
  indexingCount: number;
  failedCount: number;
  onRetry?: () => void;
  className?: string;
}

export function IndexingWarningBanner({
  indexingCount,
  failedCount,
  onRetry,
  className,
}: IndexingWarningBannerProps) {
  const isIndexing = indexingCount > 0;
  const hasFailed = failedCount > 0;

  if (!isIndexing && !hasFailed) {
    return null;
  }

  return (
    <div
      className={cn(
        "px-4 py-3 rounded-lg border",
        isIndexing && "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200",
        hasFailed && !isIndexing && "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          {isIndexing && (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          )}
          {hasFailed && !isIndexing && (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {isIndexing && (
            <>
              <h4 className="text-sm font-semibold mb-1">
                Indexing content for search
              </h4>
              <p className="text-xs opacity-90">
                {indexingCount} item{indexingCount !== 1 ? "s" : ""} are being indexed. Pocket-scoped search may have incomplete results until indexing completes.
              </p>
            </>
          )}
          {hasFailed && (
            <>
              <h4 className={`text-sm font-semibold ${isIndexing ? 'mt-2' : 'mb-1'}`}>
                Indexing failed for some content
              </h4>
              <p className="text-xs opacity-90 mb-2">
                {failedCount} item{failedCount !== 1 ? "s" : ""} failed to index. Retry indexing or contact support if the issue persists.
              </p>
              {onRetry && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onRetry}
                  className="text-xs h-7"
                >
                  Retry Indexing
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
