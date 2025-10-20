import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NoteEditorPage, type NoteData } from "./NoteEditorPage";
import { NoteTemplates, type NoteTemplate } from "./NoteTemplates";
import { NoteList } from "./NoteList";
import { NoteExporter } from "./NoteExporter";
import { SearchBar } from "@/components/SearchBar";
import { FloatingPanel } from "@/components/FloatingControls";
import { AnimatePresence, motion } from "framer-motion";

type ViewMode = "list" | "editorPage" | "templates";

interface NoteManagerProps {
  pocketId?: string;
  onBack?: () => void;
  className?: string;
  initialShowTemplates?: boolean;
  onTemplateSelectionComplete?: () => void;
  initialEditNote?: NoteData;
}

export function NoteManager({ 
  pocketId, 
  onBack, 
  className,
  initialShowTemplates = false,
  onTemplateSelectionComplete,
  initialEditNote
}: NoteManagerProps) {
  const [viewMode, setViewMode] = React.useState<ViewMode>(
    initialEditNote ? "editorPage" : initialShowTemplates ? "templates" : "list"
  );
  const [notes, setNotes] = React.useState<NoteData[]>([]);
  const [filteredNotes, setFilteredNotes] = React.useState<NoteData[]>([]);
  const [editingNote, setEditingNote] = React.useState<NoteData | null>(initialEditNote || null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSearching, setIsSearching] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState<string>("all");
  const [showExporter, setShowExporter] = React.useState(false);
  const [selectedNotes, setSelectedNotes] = React.useState<string[]>([]);

  // Load notes on mount
  React.useEffect(() => {
    loadNotes();
  }, [pocketId]);

  // Filter notes when dependencies change
  React.useEffect(() => {
    filterNotes();
  }, [notes, searchQuery, selectedCategory]);

  // Listen for background content update events to keep the list fresh
  React.useEffect(() => {
    const onMessage = (message: any) => {
      try {
        if (!message || !message.kind) return;
        if (message.kind === "CONTENT_CREATED" && message.payload?.content) {
          const created = message.payload.content as any;
          if (created.type === "note" && (!pocketId || created.pocketId === pocketId)) {
            const newNote: NoteData = {
              id: created.id,
              title: created.metadata?.title || "Untitled Note",
              content: created.content || "",
              tags: created.metadata?.tags || [],
              category: created.metadata?.category,
              createdAt: created.capturedAt,
              updatedAt: created.metadata?.updatedAt || created.capturedAt,
              pocketId: created.pocketId,
            };
            setNotes((prev) => [newNote, ...prev.filter((n) => n.id !== newNote.id)]);
          }
        } else if (message.kind === "CONTENT_UPDATED" && message.payload?.content) {
          const updated = message.payload.content as any;
          if (updated.type === "note" && (!pocketId || updated.pocketId === pocketId)) {
            const updatedNote: NoteData = {
              id: updated.id,
              title: updated.metadata?.title || "Untitled Note",
              content: updated.content || "",
              tags: updated.metadata?.tags || [],
              category: updated.metadata?.category,
              createdAt: updated.capturedAt,
              updatedAt: updated.metadata?.updatedAt || updated.capturedAt,
              pocketId: updated.pocketId,
            };
            setNotes((prev) => prev.map((n) => (n.id === updatedNote.id ? updatedNote : n)));
          }
        } else if (message.kind === "CONTENT_DELETED" && message.payload?.contentId) {
          const deletedId = message.payload.contentId as string;
          setNotes((prev) => prev.filter((n) => n.id !== deletedId));
        }
      } catch (err) {
        console.error("Failed to handle note update message", err);
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [pocketId]);

  const loadNotes = async () => {
    setIsLoading(true);
    try {
      console.log("Loading notes for pocketId:", pocketId || "(all)");
      // Load notes from the specified pocket or all pockets
      const response = await chrome.runtime.sendMessage({
        kind: "CONTENT_LIST",
        requestId: crypto.randomUUID(),
        payload: { pocketId: pocketId || "" },
      });

      console.log("CONTENT_LIST response:", response);

      if (response.success && response.data.content) {
        // Filter only note-type content
        const noteContent = response.data.content
          .filter((item: any) => item.type === "note")
          .map((item: any) => ({
            id: item.id,
            title: item.metadata?.title || "Untitled Note",
            content: item.content || "",
            tags: item.metadata?.tags || [],
            category: item.metadata?.category,
            createdAt: item.capturedAt,
            updatedAt: item.metadata?.updatedAt || item.capturedAt,
            pocketId: item.pocketId,
          }));

        console.log("Loaded notes:", noteContent.length, "notes", noteContent);
        setNotes(noteContent);
      } else {
        console.error("Failed to load notes:", response.error);
        setNotes([]);
      }
    } catch (error) {
      console.error("Error loading notes:", error);
      setNotes([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filterNotes = () => {
    let filtered = [...notes];

    // Apply text-based filtering
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (note) =>
          note.title.toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query) ||
          note.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          (note.category && note.category.toLowerCase().includes(query))
      );
    }

    // Apply category filtering
    if (selectedCategory !== "all") {
      filtered = filtered.filter(note => note.category === selectedCategory);
    }

    // Sort by updated date (newest first)
    filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    setFilteredNotes(filtered);
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchQuery("");
      return;
    }

    setIsSearching(true);
    setSearchQuery(query);

    try {
      // Use semantic search for notes
      const response = await chrome.runtime.sendMessage({
        kind: "CONTENT_SEARCH",
        requestId: crypto.randomUUID(),
        payload: { 
          query, 
          pocketId: pocketId || undefined,
          limit: 50 
        },
      });

      if (response.success && response.data.results) {
        // Filter only note-type results
        const noteResults = response.data.results
          .filter((result: any) => result.item.type === "note")
          .map((result: any) => ({
            id: result.item.id,
            title: result.item.metadata?.title || "Untitled Note",
            content: result.item.content || "",
            tags: result.item.metadata?.tags || [],
            category: result.item.metadata?.category,
            createdAt: result.item.capturedAt,
            updatedAt: result.item.metadata?.updatedAt || result.item.capturedAt,
            pocketId: result.item.pocketId,
          }));

        setFilteredNotes(noteResults);
      } else {
        // Fallback to local filtering
        filterNotes();
      }
    } catch (error) {
      console.error("Search error:", error);
      filterNotes();
    } finally {
      setIsSearching(false);
    }
  };

  const handleCreateNote = (template?: NoteTemplate) => {
    const newNote: NoteData = {
      title: template?.name || "",
      content: template?.content || "",
      tags: template?.tags || [],
    };
    
    if (template?.category) {
      newNote.category = template.category;
    }
    
    if (pocketId) {
      newNote.pocketId = pocketId;
    }
    
    setEditingNote(newNote);
    setViewMode("editorPage");
  };

  const handleEditNote = (note: NoteData) => {
    setEditingNote(note);
    setViewMode("editorPage");
  };

  const handleSaveNote = async (noteData: Omit<NoteData, "id" | "createdAt" | "updatedAt">) => {
    setIsLoading(true);
    try {
      const targetPocketId = noteData.pocketId || pocketId || "";
      console.log("Saving note:", { 
        isUpdate: !!editingNote?.id, 
        noteData,
        pocketId: targetPocketId,
        propPocketId: pocketId
      });

      if (editingNote?.id) {
        // Update existing note
        const response = await chrome.runtime.sendMessage({
          kind: "CAPTURE_REQUEST",
          requestId: crypto.randomUUID(),
          payload: {
            mode: "note",
            pocketId: targetPocketId,
            content: noteData.content,
            metadata: {
              title: noteData.title,
              tags: noteData.tags,
              category: noteData.category,
              updatedAt: Date.now(),
              contentId: editingNote.id, // For updates
            },
          },
        });

        console.log("Update response:", response);

        if (!response.success) {
          const errorMsg = response.error?.message || response.error || "Failed to update note";
          throw new Error(errorMsg);
        }
      } else {
        // Create new note
        const response = await chrome.runtime.sendMessage({
          kind: "CAPTURE_REQUEST",
          requestId: crypto.randomUUID(),
          payload: {
            mode: "note",
            pocketId: targetPocketId,
            content: noteData.content,
            metadata: {
              title: noteData.title,
              tags: noteData.tags,
              category: noteData.category,
              createdAt: Date.now(),
            },
          },
        });

        console.log("Create response:", response, "pocketId used:", targetPocketId);

        if (!response.success) {
          const errorMsg = response.error?.message || response.error || "Failed to create note";
          throw new Error(errorMsg);
        }
      }

      // Reload notes and return to list
      await loadNotes();
      setViewMode("list");
      setEditingNote(null);
    } catch (error) {
      console.error("Error saving note:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to save note. Please try again.";
      alert(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm("Are you sure you want to delete this note?")) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        kind: "CONTENT_DELETE",
        requestId: crypto.randomUUID(),
        payload: { contentId: noteId },
      });

      if (response.success) {
        await loadNotes();
      } else {
        throw new Error(response.error || "Failed to delete note");
      }
    } catch (error) {
      console.error("Error deleting note:", error);
      alert("Failed to delete note. Please try again.");
    }
  };

  const handleSelectTemplate = (template: NoteTemplate) => {
    handleCreateNote(template);
    onTemplateSelectionComplete?.();
  };

  const handleCancel = () => {
    setEditingNote(null);
    setViewMode("list");
  };

  const categories = React.useMemo(() => {
    const cats = new Set(notes.map(n => n.category).filter(Boolean) as string[]);
    return ["all", ...Array.from(cats)];
  }, [notes]);

  if (viewMode === "editorPage") {
    return (
      <NoteEditorPage
        {...(editingNote && { note: editingNote })}
        onSave={handleSaveNote}
        onCancel={handleCancel}
        isLoading={isLoading}
        {...(className && { className })}
      />
    );
  }

  if (viewMode === "templates") {
    return (
      <NoteTemplates
        onSelectTemplate={handleSelectTemplate}
        onClose={() => {
          setViewMode("list");
          onTemplateSelectionComplete?.();
        }}
        {...(className && { className })}
      />
    );
  }

  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
          )}
          <h2 className="text-lg font-semibold">Notes</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExporter(true)}
            disabled={selectedNotes.length === 0}
          >
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode("templates")}
          >
            Templates
          </Button>
          <Button size="sm" onClick={() => handleCreateNote()}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Note
          </Button>
        </div>
      </div>

      {/* Floating Controls */}
      <FloatingPanel className="top-16">
        <div className="flex flex-col items-stretch gap-2">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            onSearch={handleSearch}
            isSearching={isSearching}
            placeholder="Search notes..."
          />
          
          {categories.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {categories.map(category => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category || "all")}
                >
                  {category === "all" ? "All" : (category || "").charAt(0).toUpperCase() + (category || "").slice(1)}
                </Button>
              ))}
            </div>
          )}
        </div>
      </FloatingPanel>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <NoteList
          notes={filteredNotes}
          isLoading={isLoading}
          selectedNotes={selectedNotes}
          onSelectNotes={setSelectedNotes}
          onEditNote={handleEditNote}
          onDeleteNote={handleDeleteNote}
          onCreateNote={() => handleCreateNote()}
        />
      </div>

      {/* Export Dialog */}
      <AnimatePresence>
        {showExporter && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowExporter(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-background border rounded-lg shadow-lg max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <NoteExporter
                notes={notes.filter(note => selectedNotes.includes(note.id!))}
                onClose={() => setShowExporter(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}