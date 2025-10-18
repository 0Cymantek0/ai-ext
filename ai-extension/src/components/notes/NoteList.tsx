import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type NoteData } from "./NoteEditor";
import { useVirtualizer } from "@tanstack/react-virtual";

interface NoteListProps {
  notes: NoteData[];
  isLoading: boolean;
  selectedNotes: string[];
  onSelectNotes: (noteIds: string[]) => void;
  onEditNote: (note: NoteData) => void;
  onDeleteNote: (noteId: string) => void;
  onCreateNote: () => void;
  className?: string;
}

export function NoteList({
  notes,
  isLoading,
  selectedNotes,
  onSelectNotes,
  onEditNote,
  onDeleteNote,
  onCreateNote,
  className,
}: NoteListProps) {
  const [showActions, setShowActions] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const useVirtualized = notes.length > 50;
  const rowVirtualizer = useVirtualizer({
    count: useVirtualized ? notes.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 152,
    overscan: 8,
  });

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

  const getPreview = (content: string, maxLength: number = 150) => {
    // Remove markdown formatting for preview
    const plainText = content
      .replace(/#{1,6}\s+/g, "") // Remove headers
      .replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold
      .replace(/\*(.*?)\*/g, "$1") // Remove italic
      .replace(/`(.*?)`/g, "$1") // Remove inline code
      .replace(/\[(.*?)\]\(.*?\)/g, "$1") // Remove links
      .replace(/^\s*[-*+]\s+/gm, "") // Remove list markers
      .replace(/^\s*\d+\.\s+/gm, "") // Remove numbered list markers
      .replace(/\n+/g, " ") // Replace newlines with spaces
      .trim();

    return plainText.length > maxLength 
      ? plainText.substring(0, maxLength) + "..."
      : plainText;
  };

  const handleSelectNote = (noteId: string, selected: boolean) => {
    if (selected) {
      onSelectNotes([...selectedNotes, noteId]);
    } else {
      onSelectNotes(selectedNotes.filter(id => id !== noteId));
    }
  };

  const handleSelectAll = () => {
    if (selectedNotes.length === notes.length) {
      onSelectNotes([]);
    } else {
      onSelectNotes(notes.map(note => note.id!).filter(Boolean));
    }
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center">
          <svg
            className="w-8 h-8 animate-spin mx-auto mb-2 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-sm text-muted-foreground">Loading notes...</p>
        </div>
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center max-w-sm">
          <svg
            className="w-12 h-12 mx-auto mb-4 text-muted-foreground"
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
          <h3 className="text-lg font-semibold mb-2">No notes yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first note to start organizing your thoughts
          </p>
          <Button onClick={onCreateNote}>
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Create Note
          </Button>
        </div>
      </div>
    );
  }

  const renderNoteItem = (note: NoteData) => (
    <div
      key={note.id}
      className={cn(
        "group relative flex flex-col p-3 rounded-lg border",
        "hover:bg-accent/50 cursor-pointer transition-colors",
        "bg-card border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/20",
        selectedNotes.includes(note.id!) && "ring-2 ring-amber-500"
      )}
      onMouseEnter={() => setShowActions(note.id!)}
      onMouseLeave={() => setShowActions(null)}
      onClick={() => onEditNote(note)}
    >
      {/* Note Badge */}
      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded-full text-xs font-medium text-amber-700 dark:text-amber-400">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Note
      </div>

      {/* Content */}
      <div className="flex flex-col gap-1.5">
        <h3 className="font-semibold text-base line-clamp-2 pr-16">
          {note.title || "Untitled Note"}
        </h3>

        {/* Preview */}
        <p className="text-xs text-muted-foreground/70 line-clamp-3">
          {getPreview(note.content, 100)}
        </p>
      </div>

      {/* Bottom Row: Date and Delete Button */}
      <div className="flex items-center justify-between mt-2">
        <div className="text-xs text-muted-foreground/50">
          {formatDate(note.updatedAt || note.createdAt || Date.now())}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 w-7 p-0 transition-opacity",
            showActions === note.id ? "opacity-100" : "opacity-0"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteNote(note.id!);
          }}
          title="Delete note"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </Button>
      </div>
    </div>
  );

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Selection Header */}
      {notes.length > 0 && (
        <div className="flex items-center justify-between p-4 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedNotes.length === notes.length}
              onChange={handleSelectAll}
              className="rounded"
            />
            <span className="text-sm text-muted-foreground">
              {selectedNotes.length > 0 
                ? `${selectedNotes.length} selected`
                : `${notes.length} notes`
              }
            </span>
          </div>
          {selectedNotes.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelectNotes([])}
            >
              Clear Selection
            </Button>
          )}
        </div>
      )}

      {/* Notes Grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 pt-40 sm:pt-44 md:pt-48">
        {useVirtualized ? (
          <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const note = notes[virtualRow.index]!;
              return (
                <div
                  key={note.id ?? virtualRow.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {renderNoteItem(note)}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {notes.map((note) => renderNoteItem(note))}
          </div>
        )}
      </div>
    </div>
  );
}