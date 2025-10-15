import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: "markdown" | "json" | "pdf") => void;
}

export function ShareModal({ isOpen, onClose, onExport }: ShareModalProps) {
  if (!isOpen) return null;

  const handleExport = (format: "markdown" | "json" | "pdf") => {
    onExport(format);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-background rounded-lg shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Export Conversation</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <svg
              className="size-5"
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
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          Choose a format to export your conversation
        </p>

        <div className="space-y-3">
          <Button
            onClick={() => handleExport("markdown")}
            variant="outline"
            className="w-full justify-start h-auto py-4"
          >
            <div className="flex items-start gap-3">
              <svg
                className="size-5 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <div className="text-left">
                <div className="font-medium">Markdown (.md)</div>
                <div className="text-xs text-muted-foreground">
                  Plain text format with formatting
                </div>
              </div>
            </div>
          </Button>

          <Button
            onClick={() => handleExport("json")}
            variant="outline"
            className="w-full justify-start h-auto py-4"
          >
            <div className="flex items-start gap-3">
              <svg
                className="size-5 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
              <div className="text-left">
                <div className="font-medium">JSON (.json)</div>
                <div className="text-xs text-muted-foreground">
                  Structured data format for developers
                </div>
              </div>
            </div>
          </Button>

          <Button
            onClick={() => handleExport("pdf")}
            variant="outline"
            className="w-full justify-start h-auto py-4"
          >
            <div className="flex items-start gap-3">
              <svg
                className="size-5 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <div className="text-left">
                <div className="font-medium">PDF (.pdf)</div>
                <div className="text-xs text-muted-foreground">
                  Portable document format for sharing
                </div>
              </div>
            </div>
          </Button>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
