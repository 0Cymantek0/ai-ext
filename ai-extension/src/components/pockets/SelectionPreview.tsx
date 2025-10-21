import * as React from "react";
import { cn } from "@/lib/utils";
import type { CapturedContent } from "@/background/indexeddb-manager";

export interface SelectionPreviewProps {
  content: CapturedContent;
  onClose: () => void;
}

export function SelectionPreview({ content, onClose }: SelectionPreviewProps) {
  // Parse the content to extract text and context
  const parsedContent = React.useMemo(() => {
    try {
      if (typeof content.content === "string") {
        const parsed = JSON.parse(content.content);
        return {
          text: parsed.text || "",
          context: parsed.context || {},
          selection: parsed.selection || {},
        };
      }
      return { text: "", context: {}, selection: {} };
    } catch {
      return { text: content.content || "", context: {}, selection: {} };
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#8B7355]/30 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#8B7355]/20 bg-gradient-to-b from-[#2A2A2A] to-[#1A1A1A]">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white mb-1">
              {content.metadata.title || "Selected Text"}
            </h2>
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formatDate(content.capturedAt)}
              </span>
              {content.sourceUrl && (() => {
                try {
                  const domain = new URL(content.sourceUrl).hostname;
                  return (
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                      {domain}
                    </span>
                  );
                } catch {
                  return null;
                }
              })()}
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-2 rounded-lg hover:bg-[#8B7355]/20 transition-colors text-gray-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Context Before */}
          {parsedContent.context.before && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Context Before
              </div>
              <div className="p-4 bg-[#2A2A2A]/50 rounded-lg border border-[#8B7355]/10">
                <p className="text-gray-400 italic text-sm leading-relaxed">
                  {parsedContent.context.before}
                </p>
              </div>
            </div>
          )}

          {/* Selected Text */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#8B7355] uppercase tracking-wider">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Selected Text
            </div>
            <div className="p-6 bg-gradient-to-br from-[#8B7355]/10 to-[#8B7355]/5 rounded-xl border-2 border-[#8B7355]/30">
              <p className="text-white text-base leading-relaxed whitespace-pre-wrap">
                {parsedContent.text}
              </p>
            </div>
          </div>

          {/* Context After */}
          {parsedContent.context.after && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Context After
              </div>
              <div className="p-4 bg-[#2A2A2A]/50 rounded-lg border border-[#8B7355]/10">
                <p className="text-gray-400 italic text-sm leading-relaxed">
                  {parsedContent.context.after}
                </p>
              </div>
            </div>
          )}

          {/* Tags */}
          {content.metadata.tags && content.metadata.tags.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Tags
              </div>
              <div className="flex flex-wrap gap-2">
                {content.metadata.tags.map((tag, i) => (
                  <span
                    key={tag + i}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[#8B7355] text-white"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Source URL */}
          {content.sourceUrl && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Source
              </div>
              <a
                href={content.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 bg-[#2A2A2A]/50 rounded-lg border border-[#8B7355]/10 hover:border-[#8B7355]/30 transition-colors group"
              >
                <p className="text-sm text-[#8B7355] group-hover:text-[#A08968] break-all">
                  {content.sourceUrl}
                </p>
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#8B7355]/20 bg-gradient-to-t from-[#2A2A2A] to-[#1A1A1A]">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-[#8B7355] hover:bg-[#A08968] text-white font-semibold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
