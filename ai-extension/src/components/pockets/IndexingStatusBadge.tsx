import * as React from "react";
import { cn } from "@/lib/utils";
import type { IndexingProgress } from "@/hooks/useIndexingStatus";

interface IndexingStatusBadgeProps {
  progress: IndexingProgress;
  className?: string;
  showProgress?: boolean;
}

export function IndexingStatusBadge({
  progress,
  className,
  showProgress = true,
}: IndexingStatusBadgeProps) {
  const getStatusIcon = () => {
    switch (progress.status) {
      case "pending":
        return (
          <svg
            className="w-3 h-3 animate-pulse"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      case "processing":
        return (
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        );
      case "completed":
        return (
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        );
      case "failed":
        return (
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        );
    }
  };

  const getStatusColor = () => {
    switch (progress.status) {
      case "pending":
        return "text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-950 dark:border-yellow-800";
      case "processing":
        return "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950 dark:border-blue-800";
      case "completed":
        return "text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800";
      case "failed":
        return "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800";
    }
  };

  const getStatusText = () => {
    switch (progress.status) {
      case "pending":
        return "Queued";
      case "processing":
        return showProgress && progress.chunksTotal > 0
          ? `Indexing ${progress.chunksProcessed}/${progress.chunksTotal}`
          : "Indexing";
      case "completed":
        return "Indexed";
      case "failed":
        return "Failed";
    }
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border",
        getStatusColor(),
        className,
      )}
      title={progress.error || undefined}
    >
      {getStatusIcon()}
      <span>{getStatusText()}</span>
    </div>
  );
}

interface PocketIndexingStatusProps {
  indexingCount: number;
  failedCount: number;
  completedCount: number;
  totalContent: number;
  className?: string;
  onRetry?: () => void;
}

export function PocketIndexingStatus({
  indexingCount,
  failedCount,
  completedCount,
  totalContent,
  className,
  onRetry,
}: PocketIndexingStatusProps) {
  if (totalContent === 0) {
    return null;
  }

  const isIndexing = indexingCount > 0;
  const hasFailed = failedCount > 0;

  return (
    <div className={cn("flex items-center gap-2 text-xs", className)}>
      {isIndexing && (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-blue-600 bg-blue-50 border border-blue-200 dark:text-blue-400 dark:bg-blue-950 dark:border-blue-800">
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>
            Indexing {indexingCount} of {totalContent}
          </span>
        </div>
      )}

      {hasFailed && (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-red-600 bg-red-50 border border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800">
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          <span>{failedCount} failed</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="ml-1 underline hover:no-underline"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {!isIndexing && !hasFailed && completedCount > 0 && (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-green-600 bg-green-50 border border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800">
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span>All indexed</span>
        </div>
      )}
    </div>
  );
}
