import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { CapturedContent, ContentMetadata } from "@/background/indexeddb-manager";

export interface ContentCardProps {
  content: CapturedContent;
  viewMode: "list" | "grid";
  onPreview: (content: CapturedContent) => void;
  onDelete: (id: string) => void;
}

export function ContentCard({
  content,
  viewMode,
  onPreview,
  onDelete,
}: ContentCardProps) {
  const [showActions, setShowActions] = React.useState(false);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const getContentIcon = (type: string) => {
    switch (type) {
      case "text":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case "image":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case "video":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        );
      case "audio":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        );
      case "page":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
        );
      case "element":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        );
      case "note":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        );
    }
  };

  const getContentPreview = (content: CapturedContent): string => {
    if (typeof content.content === "string") {
      return content.content.substring(0, 150);
    }
    return `Binary content (${content.type})`;
  };

  const getContentTitle = (content: CapturedContent): string => {
    return content.metadata.title || content.metadata.domain || "Untitled";
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this content? This action cannot be undone.")) {
      onDelete(content.id);
    }
  };

  if (viewMode === "list") {
    return (
      <div
        className={cn(
          "group relative flex items-start gap-4 p-4 rounded-lg border",
          "hover:bg-accent/50 cursor-pointer transition-colors",
          "bg-card"
        )}
        onClick={() => onPreview(content)}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* Icon */}
        <div className="shrink-0 mt-1 text-muted-foreground">
          {getContentIcon(content.type)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate mb-1">
            {getContentTitle(content)}
          </h3>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
            {getContentPreview(content)}
          </p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="capitalize">{content.type}</span>
            <span>•</span>
            <span>{formatDate(content.capturedAt)}</span>
            <span>•</span>
            <span className="truncate max-w-[200px]">{content.sourceUrl}</span>
          </div>
        </div>

        {/* Actions */}
        <div
          className={cn(
            "flex items-center gap-2 transition-opacity",
            showActions ? "opacity-100" : "opacity-0"
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            title="Delete content"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </Button>
        </div>
      </div>
    );
  }

  // Grid view
  return (
    <div
      className={cn(
        "group relative flex flex-col p-3 rounded-lg border",
        "hover:bg-accent/50 cursor-pointer transition-colors",
        "bg-card h-full"
      )}
      onClick={() => onPreview(content)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Icon/Preview */}
      <div className="w-full h-24 rounded-md flex items-center justify-center bg-accent/30 mb-2 text-muted-foreground">
        {getContentIcon(content.type)}
      </div>

      {/* Content */}
      <div className="flex-1">
        <h3 className="font-semibold text-xs truncate mb-1">
          {getContentTitle(content)}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {getContentPreview(content)}
        </p>
        <div className="text-xs text-muted-foreground">
          <div className="capitalize">{content.type}</div>
          <div>{formatDate(content.capturedAt)}</div>
        </div>
      </div>

      {/* Actions */}
      <div
        className={cn(
          "mt-2 flex gap-1 justify-end transition-opacity",
          showActions ? "opacity-100" : "opacity-0"
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          title="Delete content"
          className="h-7 w-7 p-0"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </Button>
      </div>
    </div>
  );
}
