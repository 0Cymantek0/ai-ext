import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PocketSummary {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

interface PocketSelectionModalProps {
  pockets: PocketSummary[];
  selectionText?: string;
  sourceUrl?: string;
  onSelect: (pocketId: string) => void;
  onCancel: () => void;
}

export function PocketSelectionModal({
  pockets,
  selectionText,
  sourceUrl,
  onSelect,
  onCancel,
}: PocketSelectionModalProps) {
  const truncatedSelection = selectionText?.trim().slice(0, 600);

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
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {truncatedSelection && (
            <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {truncatedSelection}
                {selectionText && selectionText.length > truncatedSelection.length ? "…" : ""}
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
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.172-1.172m3.656-3.656a4 4 0 015.656 0l1.172 1.172a4 4 0 010 5.656l-3 3" />
              </svg>
              {sourceUrl}
            </a>
          )}

          <div className="space-y-2">
            {pockets.map((pocket) => (
              <button
                key={pocket.id}
                onClick={() => onSelect(pocket.id)}
                className={cn(
                  "w-full rounded-xl border border-border/60 bg-card px-4 py-3 text-left transition",
                  "hover:border-primary/60 hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/50"
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
