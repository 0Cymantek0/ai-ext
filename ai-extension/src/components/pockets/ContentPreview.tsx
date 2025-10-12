import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { CapturedContent } from "@/background/indexeddb-manager";

export interface ContentPreviewProps {
  content: CapturedContent | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ContentPreview({ content, isOpen, onClose }: ContentPreviewProps) {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !content) return null;

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const renderContent = () => {
    if (content.type === "image" && content.content instanceof ArrayBuffer) {
      const blob = new Blob([content.content], { type: "image/png" });
      const url = URL.createObjectURL(blob);
      return (
        <div className="flex items-center justify-center p-4 bg-accent/10 rounded-lg">
          <img src={url} alt={content.metadata.title || "Captured image"} className="max-w-full max-h-96 rounded" />
        </div>
      );
    }

    if (typeof content.content === "string") {
      return (
        <div className="p-4 bg-accent/10 rounded-lg">
          <pre className="whitespace-pre-wrap text-sm font-mono">{content.content}</pre>
        </div>
      );
    }

    return (
      <div className="p-4 bg-accent/10 rounded-lg text-center text-muted-foreground">
        <p>Binary content preview not available</p>
        <p className="text-xs mt-2">Type: {content.type}</p>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Preview Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={cn(
            "bg-background border rounded-lg shadow-lg",
            "w-full max-w-3xl max-h-[90vh] overflow-hidden",
            "flex flex-col"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold truncate">
                {content.metadata.title || "Content Preview"}
              </h2>
              <p className="text-sm text-muted-foreground truncate">
                {content.sourceUrl}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="ml-4 shrink-0"
            >
              <svg
                className="w-5 h-5"
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
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {renderContent()}

            {/* Metadata */}
            <div className="mt-6 space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Type:</span>
                  <span className="ml-2 capitalize">{content.type}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Captured:</span>
                  <span className="ml-2">{formatDate(content.capturedAt)}</span>
                </div>
                {content.metadata.author && (
                  <div>
                    <span className="text-muted-foreground">Author:</span>
                    <span className="ml-2">{content.metadata.author}</span>
                  </div>
                )}
                {content.metadata.publishedDate && (
                  <div>
                    <span className="text-muted-foreground">Published:</span>
                    <span className="ml-2">{content.metadata.publishedDate}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Domain:</span>
                  <span className="ml-2">{content.metadata.domain}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <span className="ml-2 capitalize">{content.processingStatus}</span>
                </div>
              </div>

              {content.metadata.selectionContext && (
                <div>
                  <span className="text-muted-foreground text-sm">Context:</span>
                  <p className="mt-1 text-sm p-2 bg-accent/10 rounded">
                    {content.metadata.selectionContext}
                  </p>
                </div>
              )}

              {content.metadata.elementSelector && (
                <div>
                  <span className="text-muted-foreground text-sm">Selector:</span>
                  <code className="mt-1 block text-xs p-2 bg-accent/10 rounded font-mono">
                    {content.metadata.elementSelector}
                  </code>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 p-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
