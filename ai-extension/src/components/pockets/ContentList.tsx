import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ContentCard } from "./ContentCard";
import { ContentPreview } from "./ContentPreview";
import { NotePreview } from "./NotePreview";
import { NoteManager } from "@/components/notes";
import { NoteEditorPage } from "@/components/notes/NoteEditorPage";
import { SearchBar } from "@/components/SearchBar";
import { SearchResultsPanel } from "@/components/pockets/SearchResultsPanel";
import { AnimatePresence, motion } from "framer-motion";
import { GlassSelector, GlassSort, FloatingPanel } from "@/components/FloatingControls";
import type { CapturedContent } from "@/background/indexeddb-manager";
import type { PocketData } from "./PocketCard";

type ViewMode = "list" | "grid";
type SortBy = "date" | "type" | "title";

interface ContentListProps {
  pocket: PocketData;
  onBack: () => void;
  onAddNote?: (() => void) | undefined;
  onAddFile?: (() => void) | undefined;
}

export function ContentList({ pocket, onBack, onAddNote, onAddFile }: ContentListProps) {
  const [contents, setContents] = React.useState<CapturedContent[]>([]);
  const [filteredContents, setFilteredContents] = React.useState<CapturedContent[]>([]);
  const [viewMode, setViewMode] = React.useState<ViewMode>("list");
  const [sortBy, setSortBy] = React.useState<SortBy>("date");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isSearching, setIsSearching] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [isResultsOpen, setIsResultsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [previewContent, setPreviewContent] = React.useState<CapturedContent | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const [showAddMenu, setShowAddMenu] = React.useState(false);
  const [showNoteTemplates, setShowNoteTemplates] = React.useState(false);
  const [contentView, setContentView] = React.useState<"files" | "notes">("files");
  const [editingNote, setEditingNote] = React.useState<any>(null);
  const [isEditorOpen, setIsEditorOpen] = React.useState(false);

  // Load contents on mount and when pocket changes
  React.useEffect(() => {
    console.log("Loading contents for pocket:", pocket.id);
    loadContents();
  }, [pocket.id]);

  // Filter and sort contents when dependencies change
  React.useEffect(() => {
    filterAndSortContents();
  }, [contents, searchQuery, sortBy]);

  // Listen for background content updates (create/update/delete)
  React.useEffect(() => {
    const onMessage = (message: any) => {
      try {
        if (!message || !message.kind) return;
        
        console.log("ContentList received message:", message.kind, message.payload);
        
        if (message.kind === "CONTENT_CREATED" && message.payload?.content) {
          const created = message.payload.content as CapturedContent;
          console.log("Content created:", created.id, "for pocket:", created.pocketId, "current pocket:", pocket.id);
          if (created.pocketId === pocket.id) {
            setContents((prev) => {
              // Check if content already exists to avoid duplicates
              const exists = prev.some(c => c.id === created.id);
              if (exists) {
                return prev.map(c => c.id === created.id ? created : c);
              }
              return [created, ...prev];
            });
            console.log("Content added to list");
          }
        } else if (message.kind === "CONTENT_UPDATED" && message.payload?.content) {
          const updated = message.payload.content as CapturedContent;
          if (updated.pocketId === pocket.id) {
            setContents((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
          }
        } else if (message.kind === "CONTENT_DELETED" && message.payload?.contentId) {
          const deletedId = message.payload.contentId as string;
          setContents((prev) => prev.filter((c) => c.id !== deletedId));
        }
      } catch (err) {
        console.error("Failed to handle content update message", err);
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [pocket.id]);

  const loadContents = async () => {
    setIsLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "CONTENT_LIST",
        requestId: crypto.randomUUID(),
        payload: { pocketId: pocket.id },
      });

      // Service worker returns { content: CapturedContent[] }
      const items = response?.data?.content || response?.data?.contents;
      if (response.success && Array.isArray(items)) {
        setContents(items);
      } else {
        console.error("Failed to load contents:", response?.error);
        setContents([]);
      }
    } catch (error) {
      console.error("Error loading contents:", error);
      setContents([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filterAndSortContents = () => {
    let filtered = [...contents];

    // Apply text-based filtering
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((content) => {
        const title = content.metadata.title?.toLowerCase() || "";
        const domain = content.metadata.domain?.toLowerCase() || "";
        const contentText = typeof content.content === "string" 
          ? content.content.toLowerCase() 
          : "";
        
        return (
          title.includes(query) ||
          domain.includes(query) ||
          contentText.includes(query) ||
          content.type.toLowerCase().includes(query)
        );
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "title":
          const titleA = a.metadata.title || a.metadata.domain || "";
          const titleB = b.metadata.title || b.metadata.domain || "";
          return titleA.localeCompare(titleB);
        case "type":
          return a.type.localeCompare(b.type);
        case "date":
        default:
          return b.capturedAt - a.capturedAt;
      }
    });

    setFilteredContents(filtered);
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchQuery("");
      setSearchResults([]);
      setIsResultsOpen(false);
      return;
    }

    setIsSearching(true);
    setSearchQuery(query);
    setIsResultsOpen(true);

    try {
      // Use vector-based semantic search within the pocket
      const response = await chrome.runtime.sendMessage({
        kind: "CONTENT_SEARCH",
        requestId: crypto.randomUUID(),
        payload: { query, pocketId: pocket.id, limit: 50 },
      });

      if (response.success && response.data.results) {
        const results = response.data.results as any[];
        setSearchResults(results);
        const items = results.map((r: any) => r.item);
        setFilteredContents(items);
      } else {
        console.error("Search failed:", response.error);
        // Fallback: compute deterministic local results based on current state
        const q = query.toLowerCase();
        let fallback = contents.filter((content) => {
          const title = content.metadata.title?.toLowerCase() || "";
          const domain = content.metadata.domain?.toLowerCase() || "";
          const contentText = typeof content.content === "string" ? content.content.toLowerCase() : "";
          return (
            title.includes(q) ||
            domain.includes(q) ||
            contentText.includes(q) ||
            content.type.toLowerCase().includes(q)
          );
        });
        fallback = [...fallback].sort((a, b) => {
          switch (sortBy) {
            case "title":
              const titleA = a.metadata.title || a.metadata.domain || "";
              const titleB = b.metadata.title || b.metadata.domain || "";
              return titleA.localeCompare(titleB);
            case "type":
              return a.type.localeCompare(b.type);
            case "date":
            default:
              return b.capturedAt - a.capturedAt;
          }
        });
        setFilteredContents(fallback);
        setSearchResults(fallback.map((c) => ({ item: c })));
      }
    } catch (error) {
      console.error("Search error:", error);
      // Fallback: compute deterministic local results based on current state
      const q = query.toLowerCase();
      let fallback = contents.filter((content) => {
        const title = content.metadata.title?.toLowerCase() || "";
        const domain = content.metadata.domain?.toLowerCase() || "";
        const contentText = typeof content.content === "string" ? content.content.toLowerCase() : "";
        return (
          title.includes(q) ||
          domain.includes(q) ||
          contentText.includes(q) ||
          content.type.toLowerCase().includes(q)
        );
      });
      fallback = [...fallback].sort((a, b) => {
        switch (sortBy) {
          case "title":
            const titleA = a.metadata.title || a.metadata.domain || "";
            const titleB = b.metadata.title || b.metadata.domain || "";
            return titleA.localeCompare(titleB);
          case "type":
            return a.type.localeCompare(b.type);
          case "date":
          default:
            return b.capturedAt - a.capturedAt;
        }
      });
      setFilteredContents(fallback);
      setSearchResults(fallback.map((c) => ({ item: c })));
    } finally {
      setIsSearching(false);
    }
  };

  // Close results on Escape
  React.useEffect(() => {
    if (!isResultsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearchQuery("");
        setSearchResults([]);
        setIsResultsOpen(false);
        filterAndSortContents();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isResultsOpen]);

  const handleDeleteContent = async (contentId: string) => {
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "CONTENT_DELETE",
        requestId: crypto.randomUUID(),
        payload: { contentId },
      });

      if (response.success) {
        await loadContents();
      } else {
        console.error("Failed to delete content:", response.error);
        alert("Failed to delete content. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting content:", error);
      alert("Error deleting content. Please try again.");
    }
  };

  const handlePreview = (content: CapturedContent) => {
    setPreviewContent(content);
    setIsPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewContent(null);
  };

  const handleEditNote = () => {
    // Close preview and open editor as full-screen overlay
    if (previewContent) {
      const noteData = {
        id: previewContent.id,
        title: previewContent.metadata?.title || "Untitled Note",
        content: typeof previewContent.content === "string" ? previewContent.content : "",
        tags: previewContent.metadata?.tags || [],
        category: previewContent.metadata?.category,
        createdAt: previewContent.capturedAt,
        updatedAt: previewContent.metadata?.updatedAt || previewContent.capturedAt,
        pocketId: previewContent.pocketId,
      };
      setEditingNote(noteData);
      setIsEditorOpen(true);
    }
    setIsPreviewOpen(false);
  };

  const handleAddNote = () => {
    setShowAddMenu(false);
    setContentView("notes");
    // Signal to NoteManager to show template selection
    setShowNoteTemplates(true);
  };

  const handleSaveNote = async (noteData: any) => {
    try {
      const targetPocketId = noteData.pocketId || pocket.id;
      
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
              contentId: editingNote.id,
            },
          },
        });

        if (!response.success) {
          throw new Error(response.error?.message || response.error || "Failed to update note");
        }
      }

      // Reload contents and close editor
      await loadContents();
      setIsEditorOpen(false);
      setEditingNote(null);
    } catch (error) {
      console.error("Error saving note:", error);
      alert("Failed to save note. Please try again.");
    }
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setEditingNote(null);
  };

  const handleAddFileClick = async () => {
    setShowAddMenu(false);
    
    // Create a file input element
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pdf,.doc,.docx,.xls,.xlsx,.txt,.md";
    fileInput.multiple = false;

    fileInput.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        console.log("Uploading file:", file.name, file.type, file.size);

        // Read file as base64
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64Data = event.target?.result as string;

          try {
            const response = await chrome.runtime.sendMessage({
              kind: "FILE_UPLOAD",
              requestId: crypto.randomUUID(),
              payload: {
                pocketId: pocket.id,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                fileData: base64Data,
              },
            });

            if (response?.status === "success") {
              console.log("File uploaded successfully:", response.contentId);
              // Reload contents after upload
              setTimeout(() => loadContents(), 500);
            } else {
              console.error("Upload failed:", response?.error);
              alert("Failed to upload file. Please try again.");
            }
          } catch (error) {
            console.error("Error uploading file:", error);
            alert("Error uploading file. Please try again.");
          }
        };

        reader.onerror = () => {
          alert("Error reading file. Please try again.");
        };

        reader.readAsDataURL(file);
      } catch (error) {
        console.error("Error processing file:", error);
        alert("Error processing file. Please try again.");
      }
    };

    // Trigger file selection
    fileInput.click();
  };



  // Close add menu when clicking outside
  React.useEffect(() => {
    if (!showAddMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-add-menu]')) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showAddMenu]);

  return (
    <>
    <div className="flex flex-col h-full overflow-hidden">
      {/* Floating Controls */}
      <FloatingPanel className="top-16">
        <div className="flex flex-col items-stretch gap-2">
          {/* Back button and pocket info */}
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="shrink-0"
            >
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back
            </Button>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-sm truncate">{pocket.name}</h2>
              <p className="text-xs text-muted-foreground truncate">
                {pocket.contentIds.length} items
              </p>
            </div>
          </div>


          <AnimatePresence initial={false}>
            {!isResultsOpen && (
              <motion.div
                key="searchbar"
                layout
                initial={{ opacity: 0, y: -6, scale: 0.98, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8, scale: 0.98, filter: "blur(8px)" }}
                transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
                style={{ willChange: "transform, filter" }}
              >
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSearch={handleSearch}
                  isSearching={isSearching}
                  placeholder="Search within this pocket..."
                />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-2">
            <GlassSelector
              label="View"
              value={viewMode}
              onChange={(v) => setViewMode(v as ViewMode)}
              options={[
                {
                  value: "list",
                  label: "List",
                  icon: (
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  ),
                },
                {
                  value: "grid",
                  label: "Grid",
                  icon: (
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h4v4H4V5zm10 0h4v4h-4V5zM4 15h4v4H4v-4zm10 0h4v4h-4v-4z" />
                    </svg>
                  ),
                },
              ]}
            />
            <div className="ml-auto">
              <GlassSort
                value={sortBy}
                onChange={(v) => setSortBy(v as SortBy)}
                options={[
                  { value: "date", label: "Date" },
                  { value: "title", label: "Title" },
                  { value: "type", label: "Type" },
                ]}
              />
            </div>
          </div>
        </div>
      </FloatingPanel>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pt-52 sm:pt-56 md:pt-60">
        {contentView === "notes" ? (
          <NoteManager 
            pocketId={pocket.id} 
            onBack={() => {
              setContentView("files");
              setShowNoteTemplates(false);
              setEditingNote(null);
            }}
            initialShowTemplates={showNoteTemplates}
            onTemplateSelectionComplete={() => setShowNoteTemplates(false)}
            initialEditNote={editingNote}
          />
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
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
              <p className="text-sm text-muted-foreground">Loading contents...</p>
            </div>
          </div>
        ) : filteredContents.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              {searchQuery ? (
                <>
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
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <h3 className="text-lg font-semibold mb-2">No results found</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Try adjusting your search query
                  </p>
                  <Button onClick={() => setSearchQuery("")} variant="outline">
                    Clear Search
                  </Button>
                </>
              ) : (
                <>
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
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                    />
                  </svg>
                  <h3 className="text-lg font-semibold mb-2">No content yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Start capturing content to see it here
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div
            className={cn(
              viewMode === "grid"
                ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
                : "space-y-3"
            )}
          >
            {filteredContents.map((content) => (
              <ContentCard
                key={content.id}
                content={content}
                viewMode={viewMode}
                onPreview={handlePreview}
                onDelete={handleDeleteContent}
              />
            ))}
          </div>
        )}
      </div>


      {/* Preview Modal - Show NotePreview for notes, ContentPreview for other content */}
      {isPreviewOpen && previewContent && (
        previewContent.type === "note" ? (
          <div className="fixed inset-0 z-50 bg-[#1A1A1A]">
            <NotePreview
              content={previewContent}
              onBack={handleClosePreview}
              onEdit={handleEditNote}
            />
          </div>
        ) : (
          <ContentPreview
            content={previewContent}
            isOpen={isPreviewOpen}
            onClose={handleClosePreview}
          />
        )
      )}

      {/* Note Editor - Full Screen Overlay */}
      {isEditorOpen && editingNote && (
        <div className="fixed inset-0 z-50">
          <NoteEditorPage
            note={editingNote}
            onSave={handleSaveNote}
            onCancel={handleCloseEditor}
            isLoading={false}
          />
        </div>
      )}
    </div>

    {/* Search Results Overlay with animation */}
    <AnimatePresence>
      {isResultsOpen && (
        <motion.div
          key="results"
          layout
          initial={{ opacity: 0, y: -8, scale: 0.98, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, scale: 0.98, filter: "blur(10px)" }}
          transition={{ type: "spring", stiffness: 460, damping: 30, mass: 0.65 }}
          style={{ willChange: "transform, filter" }}
        >
          <SearchResultsPanel
            kind="content"
            open
            query={searchQuery}
            loading={isSearching}
            results={searchResults}
            onSelectContent={(content) => {
              setPreviewContent(content);
              setIsPreviewOpen(true);
            }}
            onClose={() => {
              setSearchQuery("");
              setSearchResults([]);
              setIsResultsOpen(false);
              filterAndSortContents();
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  </>
  );
}
