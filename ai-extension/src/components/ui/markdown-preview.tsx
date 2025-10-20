import React from "react";
import { MarkdownRenderer } from "@/components/ai/markdown-renderer";
import { cn } from "@/lib/utils";

interface MarkdownPreviewProps {
  content: string;
  className?: string;
  theme?: "light" | "dark";
  showRaw?: boolean;
}

export function MarkdownPreview({
  content,
  className,
  theme = "dark",
  showRaw = false,
}: MarkdownPreviewProps) {
  const [isRawView, setIsRawView] = React.useState(showRaw);

  return (
    <div className={cn("markdown-preview-container", className)}>
      {/* Toggle button for raw/preview */}
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setIsRawView(!isRawView)}
          className="text-xs px-3 py-1 rounded bg-muted hover:bg-muted/80 transition-colors"
        >
          {isRawView ? "Preview" : "Raw"}
        </button>
      </div>

      {/* Content area */}
      {isRawView ? (
        <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm font-mono whitespace-pre-wrap">
          {content}
        </pre>
      ) : (
        <MarkdownRenderer content={content} theme={theme} />
      )}
    </div>
  );
}
