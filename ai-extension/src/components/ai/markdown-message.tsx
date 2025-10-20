import React from "react";
import { MarkdownRenderer } from "@/components/ai/markdown-renderer";
import { cn } from "@/lib/utils";

interface MarkdownMessageProps {
  content: string;
  className?: string;
  theme?: "light" | "dark";
}

export function MarkdownMessage({
  content,
  className,
  theme = "dark",
}: MarkdownMessageProps) {
  // Detect if content is likely markdown (has markdown syntax)
  const hasMarkdownSyntax = React.useMemo(() => {
    const markdownPatterns = [
      /^#{1,6}\s/m, // Headings
      /\*\*.*\*\*/,  // Bold
      /\*.*\*/,      // Italic
      /~~.*~~/,      // Strikethrough
      /```/,         // Code blocks
      /`[^`]+`/,     // Inline code
      /^\s*[-*+]\s/m, // Unordered lists
      /^\s*\d+\.\s/m, // Ordered lists
      /^\s*>\s/m,    // Blockquotes
      /\[.*\]\(.*\)/, // Links
      /!\[.*\]\(.*\)/, // Images
      /^\s*\|.*\|/m,  // Tables
      /^\s*[-*_]{3,}\s*$/m, // Horizontal rules
    ];

    return markdownPatterns.some((pattern) => pattern.test(content));
  }, [content]);

  // If no markdown syntax detected, render as plain text
  if (!hasMarkdownSyntax) {
    return (
      <div className={cn("whitespace-pre-wrap leading-7", className)}>
        {content}
      </div>
    );
  }

  // Render with markdown
  return (
    <MarkdownRenderer
      content={content}
      className={className}
      theme={theme}
    />
  );
}
