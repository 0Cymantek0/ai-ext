import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PocketSummary {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

interface PocketSelectionModalProps {
  pockets: PocketSummary[];
  selectionText?: string | undefined;
  sourceUrl?: string | undefined;
  preview?: string | undefined;
  onSelect: (pocketId: string, editedTitle?: string | undefined) => void;
  onCancel: () => void;
}

export function PocketSelectionModal({
  pockets,
  selectionText,
  sourceUrl,
  preview,
  onSelect,
  onCancel,
}: PocketSelectionModalProps) {
  const [editedTitle, setEditedTitle] = React.useState(selectionText || "");
  const [showTitleEdit, setShowTitleEdit] = React.useState(false);

  // Detect if this is an image save (has preview with "Image:" prefix)
  const isImageSave = preview?.startsWith("Image:");

  React.useEffect(() => {
    // Auto-show title edit for images
    if (isImageSave) {
      setShowTitleEdit(true);
    }
  }, [isImageSave]);

  const truncatedSelection = selectionText?.trim().slice(0, 600);

  const handleSelect = (pocketId: string) => {
    if (showTitleEdit && editedTitle !== selectionText) {
      onSelect(pocketId, editedTitle);
    } else {
      onSelect(pocketId);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-white/20 bg-gray-900/70 backdrop-blur-2xl shadow-2xl">
        <div className="flex items-start justify-between border-b border-border/60 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold">Save to Pocket</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a pocket for your selected text.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-muted-foreground transition hover:text-foreground"
            aria-label="Close pocket selection"
          >
            <svg
              className="h-5 w-5"
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

        <div className="space-y-4 px-6 py-5">
          {/* Title Edit Field */}
          {showTitleEdit && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="content-title" className="text-sm font-medium">
                  {isImageSave ? "Image Title" : "Content Title"}
                </label>
                {!isImageSave && (
                  <button
                    onClick={() => setShowTitleEdit(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Hide
                  </button>
                )}
              </div>
              <Input
                id="content-title"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                placeholder={
                  isImageSave ? "Enter image title..." : "Enter title..."
                }
                className="w-full"
                autoFocus={isImageSave}
              />
            </div>
          )}

          {/* Show edit button for non-image content */}
          {!showTitleEdit && !isImageSave && selectionText && (
            <button
              onClick={() => setShowTitleEdit(true)}
              className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Edit title
            </button>
          )}

          {/* Preview */}
          {preview && (
            <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">{preview}</p>
            </div>
          )}

          {/* Selection Text Preview (for non-image content) */}
          {!isImageSave && truncatedSelection && (
            <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {truncatedSelection}
                {selectionText &&
                selectionText.length > truncatedSelection.length
                  ? "…"
                  : ""}
              </p>
            </div>
          )}

          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.172-1.172m3.656-3.656a4 4 0 015.656 0l1.172 1.172a4 4 0 010 5.656l-3 3"
                />
              </svg>
              {sourceUrl}
            </a>
          )}

          <div className="space-y-2">
            {pockets.map((pocket) => (
              <button
                key={pocket.id}
                onClick={() => handleSelect(pocket.id)}
                className={cn(
                  "w-full rounded-xl border border-border/60 bg-card px-4 py-3 text-left transition",
                  "hover:border-primary/60 hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/50",
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: pocket.color || "#3b82f6" }}
                  />
                  <div>
                    <p className="font-medium leading-tight">{pocket.name}</p>
                    {pocket.description && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {pocket.description}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border/60 px-6 py-4">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
