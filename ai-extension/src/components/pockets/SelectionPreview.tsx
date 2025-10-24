import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Response } from "@/components/ai/response";
import { Sparkles, Loader2 } from "lucide-react";
import type { CapturedContent } from "@/background/indexeddb-manager";

export interface SelectionPreviewProps {
  content: CapturedContent;
  onClose: () => void;
}

// Helper to sanitize HTML (basic approach - removes script tags and event handlers)
function sanitizeHTML(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '');
}

export function SelectionPreview({ content, onClose }: SelectionPreviewProps) {
  // Parse the content to extract text, HTML, and context
  const parsedContent = React.useMemo(() => {
    try {
      if (typeof content.content === "string") {
        const parsed = JSON.parse(content.content);
        
        // Handle nested structure: parsed.text.content vs parsed.text
        let textContent = "";
        let htmlContent = "";
        let formattedContent = "";
        let wordCount = 0;
        let characterCount = 0;
        let isAIFormatted = false;
        
        if (parsed.text && typeof parsed.text === "object") {
          // New format: { text: { content: "...", formattedContent: "...", aiFormattedContent: "...", ... } }
          textContent = parsed.text.content || "";
          htmlContent = parsed.text.formattedContent || "";
          formattedContent = parsed.text.aiFormattedContent || "";
          isAIFormatted = !!parsed.text.aiFormattedContent;
          wordCount = parsed.text.wordCount || 0;
          characterCount = parsed.text.characterCount || 0;
        } else if (typeof parsed.text === "string") {
          // Old format: { text: "..." }
          textContent = parsed.text;
          characterCount = textContent.length;
          wordCount = textContent.trim().split(/\s+/).filter(Boolean).length;
        } else if (typeof parsed === "string") {
          // Fallback: plain string
          textContent = parsed;
          characterCount = textContent.length;
          wordCount = textContent.trim().split(/\s+/).filter(Boolean).length;
        }
        
        return {
          text: textContent,
          htmlContent: htmlContent,
          formattedContent: formattedContent,
          isAIFormatted: isAIFormatted,
          wordCount,
          characterCount,
          context: parsed.context || {},
          selection: parsed.selection || {},
        };
      }
      
      // Fallback to plain content
      const text = typeof content.content === "string" ? content.content : "";
      return { 
        text, 
        htmlContent: "",
        formattedContent: "",
        isAIFormatted: false,
        wordCount: text.trim().split(/\s+/).filter(Boolean).length,
        characterCount: text.length,
        context: {}, 
        selection: {} 
      };
    } catch (error) {
      console.error("Failed to parse selection content:", error);
      const text = typeof content.content === "string" ? content.content : "";
      return { 
        text, 
        htmlContent: "",
        formattedContent: "",
        isAIFormatted: false,
        wordCount: text.trim().split(/\s+/).filter(Boolean).length,
        characterCount: text.length,
        context: {}, 
        selection: {} 
      };
    }
  }, [content.content]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getDomain = (url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  };

  // Handle ESC key to close
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Determine what content to display - prefer AI formatted, then HTML, then plain text
  const displayContent = parsedContent.formattedContent || parsedContent.htmlContent || parsedContent.text;
  const shouldRenderMarkdown = parsedContent.formattedContent || parsedContent.htmlContent;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md">
      <div className="relative w-full h-full bg-zinc-950 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-8 py-5 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-900/60">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-zinc-100">
                {content.metadata.title || "Captured Text"}
              </h1>
              {parsedContent.isAIFormatted && (
                <div className="flex items-center gap-2 text-sm text-purple-400">
                  <Sparkles className="h-4 w-4" />
                  <span>AI Formatted</span>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-10 w-10 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
              title="Close (Esc)"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>

          {/* Tags */}
          {content.metadata.tags && content.metadata.tags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {content.metadata.tags.map((tag, index) => (
                <span
                  key={`${tag}-${index}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 text-amber-500 rounded-full text-sm font-medium"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-5xl mx-auto space-y-8">
            {/* Context Before */}
            {parsedContent.context.before && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Context Before
                </div>
                <div className="p-5 bg-zinc-900/50 rounded-xl border border-zinc-800">
                  <p className="text-zinc-400 italic text-sm leading-relaxed">
                    {parsedContent.context.before}
                  </p>
                </div>
              </div>
            )}

            {/* Selected Text */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-purple-400 uppercase tracking-wider">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Captured Content
              </div>
              <div className="p-8 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl border-2 border-purple-500/30">
                {shouldRenderMarkdown ? (
                  <div className="prose prose-invert prose-lg max-w-none">
                    <Response>{displayContent || "*No content available*"}</Response>
                  </div>
                ) : (
                  <p className="text-zinc-100 text-lg leading-relaxed whitespace-pre-wrap">
                    {displayContent || "*No content available*"}
                  </p>
                )}
              </div>
            </div>

            {/* Context After */}
            {parsedContent.context.after && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Context After
                </div>
                <div className="p-5 bg-zinc-900/50 rounded-xl border border-zinc-800">
                  <p className="text-zinc-400 italic text-sm leading-relaxed">
                    {parsedContent.context.after}
                  </p>
                </div>
              </div>
            )}

            {/* Metadata Section */}
            <div className="space-y-4 pt-6 border-t border-zinc-800">
              <div className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">
                Metadata
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-zinc-900/50 rounded-xl border border-zinc-800">
                {/* Capture Time */}
                <div className="space-y-1">
                  <div className="text-xs text-zinc-500">Captured</div>
                  <div className="text-sm text-zinc-100 font-medium">
                    {formatDate(content.capturedAt)}
                  </div>
                </div>

                {/* Source Domain */}
                {content.sourceUrl && (
                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500">Source</div>
                    <div className="text-sm text-zinc-100 font-medium truncate">
                      {getDomain(content.sourceUrl)}
                    </div>
                  </div>
                )}

                {/* Character Count */}
                <div className="space-y-1">
                  <div className="text-xs text-zinc-500">Characters</div>
                  <div className="text-sm text-zinc-100 font-medium">
                    {parsedContent.characterCount.toLocaleString()}
                  </div>
                </div>

                {/* Word Count */}
                <div className="space-y-1">
                  <div className="text-xs text-zinc-500">Words</div>
                  <div className="text-sm text-zinc-100 font-medium">
                    {parsedContent.wordCount.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Full URL */}
              {content.sourceUrl && (
                <div className="space-y-2">
                  <div className="text-xs text-zinc-500">Full URL</div>
                  <a
                    href={content.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 bg-zinc-900/50 rounded-xl border border-zinc-800 hover:border-purple-500/30 transition-colors group"
                  >
                    <p className="text-sm text-purple-400 group-hover:text-purple-300 break-all flex items-center gap-2">
                      {content.sourceUrl}
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </p>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-8 py-5 border-t border-zinc-800 bg-zinc-900/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-900/60">
          <Button
            onClick={onClose}
            className="w-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 hover:from-purple-600 hover:via-pink-600 hover:to-purple-600 text-white font-semibold text-lg py-6 rounded-xl"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
