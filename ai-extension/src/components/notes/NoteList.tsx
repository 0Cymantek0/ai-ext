import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type NoteData } from "./NoteEditorPage";
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
  const [viewMode, setViewMode] = React.useState<"list" | "grid">("list");
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
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (diffDays === 0) return `Today, ${timeStr}`;
    if (diffDays === 1) return `Yesterday, ${timeStr}`;
    if (diffDays < 7) return `${diffDays} days ago, ${timeStr}`;
    return `${date.toLocaleDateString()}, ${timeStr}`;
  };

  const getPreview = (content: string, maxLength: number = 140) => {
    const plainText = content
      .replace(/#{1,6}\s+/g, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/`(.*?)`/g, "$1")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/\n+/g, " ")
      .trim();
    return plainText.length > maxLength ? plainText.substring(0, maxLength) + "..." : plainText;
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

  const renderNoteItem = (note: NoteData, viewMode: "list" | "grid" = "list") => {
    const visibleTags = (note.tags || []).slice(0, 3);
    const extraCount = Math.max((note.tags?.length || 0) - visibleTags.length, 0);
    const TagChip: React.FC<{ label: string; idx?: number }> = ({ label, idx = 0 }) => {
      const palettes = [
        "bg-[#8B7355] text-white",
        "bg-[#4A7C9C] text-white",
        "bg-[#5A8B6B] text-white",
      ];
      const style = palettes[idx % palettes.length];
      return <span className={cn("px-2.5 py-1 rounded-md text-xs font-medium", style)}>{label}</span>;
    };

    if (viewMode === "list") {
      return (
        <div
          key={note.id}
          className={cn(
            "group relative flex flex-col p-4 rounded-xl border-2",
            "hover:border-[#8B7355]/80 cursor-pointer transition-all",
            "bg-[#2A2A2A] border-[#6B5D4F]",
            selectedNotes.includes(note.id!) && "ring-2 ring-amber-500"
          )}
          onMouseEnter={() => setShowActions(note.id!)}
          onMouseLeave={() => setShowActions(null)}
          onClick={() => onEditNote(note)}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 text-[#F59E0B]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg text-white truncate pr-2">
                {note.title || "Untitled Note"}
              </h3>
              <p className="mt-1.5 text-sm text-[#9CA3AF] line-clamp-2">
                {getPreview(note.content, 140)}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-transparent text-white/70 hover:text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteNote(note.id!);
                }}
                title="Delete note"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </Button>
              {visibleTags.map((t, i) => (
                <TagChip key={t + i} label={t} idx={i} />
              ))}
              {extraCount > 0 && (
                <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#3A3A3A] text-white">+{extraCount}</span>
              )}
            </div>
            <div className="text-sm text-[#9CA3AF]">
              {formatDate(note.updatedAt || note.createdAt || Date.now())}
            </div>
          </div>
        </div>
      );
    }

    // Grid view
    return (
      <div
        key={note.id}
        className={cn(
          "group relative flex flex-col p-4 rounded-xl border-2 h-full",
          "hover:border-[#8B7355]/80 cursor-pointer transition-all",
          "bg-[#2A2A2A] border-[#6B5D4F]",
          selectedNotes.includes(note.id!) && "ring-2 ring-amber-500"
        )}
        onMouseEnter={() => setShowActions(note.id!)}
        onMouseLeave={() => setShowActions(null)}
        onClick={() => onEditNote(note)}
      >
        {/* Content area - grows to fill space */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 text-[#F59E0B]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg text-white line-clamp-2 pr-2">
                {note.title || "Untitled Note"}
              </h3>
            </div>
          </div>
          
          <p className="mt-2 text-sm text-[#9CA3AF] line-clamp-3">
            {getPreview(note.content, 120)}
          </p>

          {/* Tags section */}
          {(visibleTags.length > 0 || extraCount > 0) && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {visibleTags.map((t, i) => (
                <TagChip key={t + i} label={t} idx={i} />
              ))}
              {extraCount > 0 && (
                <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#3A3A3A] text-white">+{extraCount}</span>
              )}
            </div>
          )}
        </div>

        {/* Footer - always at bottom */}
        <div className="mt-auto pt-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-transparent text-white/70 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteNote(note.id!);
            }}
            title="Delete note"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
          <div className="text-sm text-[#9CA3AF]">
            {formatDate(note.updatedAt || note.createdAt || Date.now())}
          </div>
        </div>
      </div>
    );
  };

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
          <div className="flex items-center gap-2">
            {selectedNotes.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSelectNotes([])}
              >
                Clear Selection
              </Button>
            )}
            <div className="flex items-center gap-1 border rounded-md p-1">
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode("list")}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </Button>
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode("grid")}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Grid/List */}
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
                  {renderNoteItem(note, viewMode)}
                </div>
              );
            })}
          </div>
        ) : (
          <div className={cn(
            viewMode === "grid" 
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              : "flex flex-col gap-4"
          )}>
            {notes.map((note) => renderNoteItem(note, viewMode))}
          </div>
        )}
      </div>
    </div>
  );
}