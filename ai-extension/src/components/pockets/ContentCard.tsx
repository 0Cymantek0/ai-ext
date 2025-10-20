import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { CapturedContent } from "@/background/indexeddb-manager";

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

    const timeStr = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });

    if (diffDays === 0) return `Today, ${timeStr}`;
    if (diffDays === 1) return `Yesterday, ${timeStr}`;
    if (diffDays < 7) return `${diffDays} days ago, ${timeStr}`;
    return `${date.toLocaleDateString()}, ${timeStr}`;
  };

  const getContentIcon = (type: string) => {
    switch (type) {
      case "pdf":
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h4" />
          </svg>
        );
      case "document":
        return (
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case "spreadsheet":
        return (
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        );
      case "file":
        return (
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        );
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
    // Handle file types
    if (content.type === "pdf" || content.type === "document" || content.type === "spreadsheet" || content.type === "file") {
      const fileSize = content.metadata.fileSize 
        ? `${(content.metadata.fileSize / 1024).toFixed(1)} KB`
        : "Unknown size";
      const fileType = content.metadata.fileExtension?.toUpperCase() || content.type.toUpperCase();
      return `${fileType} file • ${fileSize}`;
    }

    if (typeof content.content !== "string") return `Binary content (${content.type})`;
    const text = content.content
      .replace(/#{1,6}\s+/g, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/`(.*?)`/g, "$1")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/\n+/g, " ")
      .trim();
    return text.length > 160 ? text.slice(0, 160) + "..." : text;
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
    const isNote = content.type === "note";
    
    return (
      <div
        className={cn(
          "group relative flex flex-col p-4 rounded-xl border-2",
          "hover:border-[#8B7355]/80 cursor-pointer transition-all",
          isNote ? "bg-[#2A2A2A] border-[#6B5D4F]" : "bg-card border-border"
        )}
        onClick={() => onPreview(content)}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          {isNote ? (
            <div className="shrink-0 mt-0.5 text-[#F59E0B]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
          ) : (
            <div className="shrink-0 mt-0.5 text-muted-foreground">
              {getContentIcon(content.type)}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className={cn(
              "font-semibold text-lg truncate pr-2",
              isNote ? "text-white" : ""
            )}>
              {getContentTitle(content)}
            </h3>
            <p className={cn(
              "mt-1.5 text-sm line-clamp-2",
              isNote ? "text-[#9CA3AF]" : "text-muted-foreground/80"
            )}>
              {getContentPreview(content)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className={cn(
                "h-8 w-8 p-0 hover:bg-transparent",
                isNote ? "text-white/70 hover:text-white" : ""
              )}
              onClick={handleDelete} 
              title="Delete"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </Button>
            {(content.metadata.tags || []).slice(0,3).map((t, i) => (
              <span
                key={t + i}
                className={cn("px-2.5 py-1 rounded-md text-xs font-medium",
                  i === 0 ? "bg-[#8B7355] text-white" : i === 1 ? "bg-[#4A7C9C] text-white" : "bg-[#5A8B6B] text-white"
                )}
              >
                {t}
              </span>
            ))}
            {((content.metadata.tags?.length || 0) > 3) && (
              <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#3A3A3A] text-white">
                +{(content.metadata.tags!.length - 3)}
              </span>
            )}
          </div>
          <div className={cn(
            "text-sm",
            isNote ? "text-[#9CA3AF]" : "text-muted-foreground/70"
          )}>
            {formatDate(content.capturedAt)}
          </div>
        </div>
      </div>
    );
  }

  // Grid view
  const isNote = content.type === "note";
  const tags = content.metadata.tags || [];
  const visibleTags = tags.slice(0, 3);
  const extraCount = Math.max(tags.length - 3, 0);
  
  return (
    <div
      className={cn(
        "group relative flex flex-col p-4 rounded-xl border-2 h-full",
        "hover:border-[#8B7355]/80 cursor-pointer transition-all",
        isNote ? "bg-[#2A2A2A] border-[#6B5D4F]" : "bg-card border-border"
      )}
      onClick={() => onPreview(content)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Content area - grows to fill space */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-start gap-3">
          <div className={cn("mt-0.5 shrink-0", isNote ? "text-[#F59E0B]" : "text-muted-foreground")}>
            {isNote ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            ) : (
              getContentIcon(content.type)
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={cn(
              "font-semibold text-lg line-clamp-2 pr-2",
              isNote ? "text-white" : ""
            )}>
              {getContentTitle(content)}
            </h3>
          </div>
        </div>
        
        <p className={cn(
          "mt-2 text-sm line-clamp-3",
          isNote ? "text-[#9CA3AF]" : "text-muted-foreground/80"
        )}>
          {getContentPreview(content)}
        </p>

        {/* Tags section */}
        {(visibleTags.length > 0 || extraCount > 0) && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {visibleTags.map((t, i) => (
              <span
                key={t + i}
                className={cn("px-2.5 py-1 rounded-md text-xs font-medium",
                  i === 0 ? "bg-[#8B7355] text-white" : i === 1 ? "bg-[#4A7C9C] text-white" : "bg-[#5A8B6B] text-white"
                )}
              >
                {t}
              </span>
            ))}
            {extraCount > 0 && (
              <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#3A3A3A] text-white">
                +{extraCount}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer - always at bottom */}
      <div className="mt-auto pt-3 flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="sm" 
          className={cn(
            "h-8 w-8 p-0 hover:bg-transparent",
            isNote ? "text-white/70 hover:text-white" : ""
          )}
          onClick={handleDelete} 
          title="Delete"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
        <div className={cn(
          "text-sm",
          isNote ? "text-[#9CA3AF]" : "text-muted-foreground/70"
        )}>
          {formatDate(content.capturedAt)}
        </div>
      </div>
    </div>
  );
}
