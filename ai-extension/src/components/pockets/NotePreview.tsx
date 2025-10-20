import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Response } from "@/components/ai/response";
import type { CapturedContent } from "@/background/indexeddb-manager";

export interface NotePreviewProps {
  content: CapturedContent;
  onBack: () => void;
  onEdit: () => void;
}

export function NotePreview({ content, onBack, onEdit }: NotePreviewProps) {
  const tags = content.metadata.tags || [];
  const contentText = typeof content.content === "string" ? content.content : "";

  return (
    <div className="flex flex-col h-full bg-[#1A1A1A] overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-[#2A2A2A] bg-[#1F1F1F]">
        <div className="flex items-center justify-between mb-4">
          {/* Back Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-9 w-9 p-0 hover:bg-[#2A2A2A] text-white"
            title="Back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Button>

          {/* Edit Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-9 w-9 p-0 hover:bg-[#2A2A2A] text-white"
            title="Edit"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </Button>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-white mb-3">
          {content.metadata.title || "Untitled Note"}
        </h1>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {tags.map((tag, index) => (
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
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="prose prose-invert max-w-none">
          <Response>{contentText || "*No content to display*"}</Response>
        </div>
      </div>
    </div>
  );
}
