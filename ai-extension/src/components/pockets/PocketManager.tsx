import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PocketCard, type PocketData } from "./PocketCard";
import { PocketDialog } from "./PocketDialog";
import { ContentList } from "./ContentList";
import { SearchBar } from "@/components/SearchBar";
import { SearchResultsPanel } from "@/components/pockets/SearchResultsPanel";
import { PocketAnalytics } from "@/components/pockets/PocketAnalytics";
import { PocketExportImport } from "@/components/pockets/PocketExportImport";
import { AnimatePresence, motion } from "framer-motion";
import { GlassSelector, GlassSort, FloatingPanel } from "@/components/FloatingControls";

type ViewMode = "list" | "grid";
type SortBy = "date" | "name" | "size";

interface PocketManagerProps {
  onSelectPocket?: (pocket: PocketData) => void;
  onNewPocket?: () => void;
  onInsidePocketChange?: (isInside: boolean) => void;
  onAddNote?: () => void;
  onAddFile?: () => void;
}

export interface PocketManagerRef {
  handleNewPocket: () => void;
}

export const PocketManager = React.forwardRef<PocketManagerRef, PocketManagerProps>(
  ({ onSelectPocket, onNewPocket, onInsidePocketChange, onAddNote, onAddFile }, ref) => {
  const [pockets, setPockets] = React.useState<PocketData[]>([]);
  const [filteredPockets, setFilteredPockets] = React.useState<PocketData[]>([]);
  const [viewMode, setViewMode] = React.useState<ViewMode>("grid");
  const [sortBy, setSortBy] = React.useState<SortBy>("date");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isSearching, setIsSearching] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [isResultsOpen, setIsResultsOpen] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingPocket, setEditingPocket] = React.useState<PocketData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedPocket, setSelectedPocket] = React.useState<PocketData | null>(null);
  const [showAnalytics, setShowAnalytics] = React.useState(false);
  const [showExportImport, setShowExportImport] = React.useState(false);
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");

  // Load pockets on mount
  React.useEffect(() => {
    loadPockets();
  }, []);

  // Filter and sort pockets when dependencies change
  React.useEffect(() => {
    filterAndSortPockets();
  }, [pockets, searchQuery, sortBy, categoryFilter]);

  const loadPockets = async () => {
    setIsLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "POCKET_LIST",
        requestId: crypto.randomUUID(),
        payload: {},
      });

      if (response.success && response.data.pockets) {
        setPockets(response.data.pockets);
      } else {
        console.error("Failed to load pockets:", response.error);
        setPockets([]);
      }
    } catch (error) {
      console.error("Error loading pockets:", error);
      setPockets([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filterAndSortPockets = () => {
    let filtered = [...pockets];

    // Apply category filter
    if (categoryFilter !== "all") {
      filtered = filtered.filter((pocket) => (pocket as any).category === categoryFilter);
    }

    // Apply text-based filtering (basic search)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (pocket) =>
          pocket.name.toLowerCase().includes(query) ||
          pocket.description.toLowerCase().includes(query) ||
          pocket.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "size":
          return b.contentIds.length - a.contentIds.length;
        case "date":
        default:
          return b.updatedAt - a.updatedAt;
      }
    });

    setFilteredPockets(filtered);
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
      // Use vector-based semantic search
      const response = await chrome.runtime.sendMessage({
        kind: "POCKET_SEARCH",
        requestId: crypto.randomUUID(),
        payload: { query, limit: 50 },
      });

      if (response.success && response.data.results) {
        // Keep full result objects for the panel; also project items to list
        const results = response.data.results as any[];
        setSearchResults(results);
        const items = results.map((r: any) => r.item);
        setFilteredPockets(items);
      } else {
        console.error("Search failed:", response.error);
        // Fallback: compute deterministic local results based on current state
        const q = query.toLowerCase();
        let fallback = pockets.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.tags.some((t) => t.toLowerCase().includes(q))
        );
        // Sort like current sortBy
        fallback = [...fallback].sort((a, b) => {
          switch (sortBy) {
            case "name":
              return a.name.localeCompare(b.name);
            case "size":
              return b.contentIds.length - a.contentIds.length;
            case "date":
            default:
              return b.updatedAt - a.updatedAt;
          }
        });
        setFilteredPockets(fallback);
        setSearchResults(fallback.map((p) => ({ item: p })));
      }
    } catch (error) {
      console.error("Search error:", error);
      // Fallback: compute deterministic local results based on current state
      const q = query.toLowerCase();
      let fallback = pockets.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
      fallback = [...fallback].sort((a, b) => {
        switch (sortBy) {
          case "name":
            return a.name.localeCompare(b.name);
          case "size":
            return b.contentIds.length - a.contentIds.length;
          case "date":
          default:
            return b.updatedAt - a.updatedAt;
        }
      });
      setFilteredPockets(fallback);
      setSearchResults(fallback.map((p) => ({ item: p })));
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
        filterAndSortPockets();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isResultsOpen]);

  const handleCreatePocket = async (
    pocketData: Omit<PocketData, "id" | "createdAt" | "updatedAt" | "contentIds">
  ) => {
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "POCKET_CREATE",
        requestId: crypto.randomUUID(),
        payload: pocketData,
      });

      if (response.success) {
        await loadPockets();
      } else {
        console.error("Failed to create pocket:", response.error);
        alert("Failed to create pocket. Please try again.");
      }
    } catch (error) {
      console.error("Error creating pocket:", error);
      alert("Error creating pocket. Please try again.");
    }
  };

  const handleUpdatePocket = async (
    pocketData: Omit<PocketData, "id" | "createdAt" | "updatedAt" | "contentIds">
  ) => {
    if (!editingPocket) return;

    try {
      const response = await chrome.runtime.sendMessage({
        kind: "POCKET_UPDATE",
        requestId: crypto.randomUUID(),
        payload: {
          id: editingPocket.id,
          updates: pocketData,
        },
      });

      if (response.success) {
        await loadPockets();
        setEditingPocket(null);
      } else {
        console.error("Failed to update pocket:", response.error);
        alert("Failed to update pocket. Please try again.");
      }
    } catch (error) {
      console.error("Error updating pocket:", error);
      alert("Error updating pocket. Please try again.");
    }
  };

  const handleDeletePocket = async (id: string) => {
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "POCKET_DELETE",
        requestId: crypto.randomUUID(),
        payload: { id },
      });

      if (response.success) {
        await loadPockets();
      } else {
        console.error("Failed to delete pocket:", response.error);
        alert("Failed to delete pocket. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting pocket:", error);
      alert("Error deleting pocket. Please try again.");
    }
  };

  const handleSavePocket = (
    pocketData: Omit<PocketData, "id" | "createdAt" | "updatedAt" | "contentIds">
  ) => {
    if (editingPocket) {
      handleUpdatePocket(pocketData);
    } else {
      handleCreatePocket(pocketData);
    }
  };

  const handleEditPocket = (pocket: PocketData) => {
    setEditingPocket(pocket);
    setIsDialogOpen(true);
  };

  const handleNewPocket = () => {
    setEditingPocket(null);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPocket(null);
  };

  const handlePocketClick = (pocket: PocketData) => {
    setSelectedPocket(pocket);
    if (onSelectPocket) {
      onSelectPocket(pocket);
    }
    if (onInsidePocketChange) {
      onInsidePocketChange(true);
    }
  };

  const handleBackToPockets = () => {
    setSelectedPocket(null);
    if (onInsidePocketChange) {
      onInsidePocketChange(false);
    }
  };

  const handleSharePocket = (pocket: PocketData) => {
    const shareData = {
      version: "1.0",
      exportDate: new Date().toISOString(),
      pockets: [pocket],
      metadata: {
        totalPockets: 1,
        totalContent: pocket.contentIds.length,
      },
    };

    const shareText = JSON.stringify(shareData, null, 2);

    navigator.clipboard.writeText(shareText).then(
      () => {
        alert(`"${pocket.name}" copied to clipboard! You can share this with others.`);
      },
      (err) => {
        console.error("Failed to copy:", err);
        alert("Failed to copy to clipboard");
      }
    );
  };

  const handleImportPockets = async (importedPockets: PocketData[]) => {
    try {
      // Import each pocket
      for (const pocket of importedPockets) {
        await chrome.runtime.sendMessage({
          kind: "POCKET_CREATE",
          requestId: crypto.randomUUID(),
          payload: {
            name: pocket.name,
            description: pocket.description,
            color: pocket.color,
            icon: pocket.icon,
            category: (pocket as any).category,
            tags: pocket.tags,
          },
        });
      }
      await loadPockets();
    } catch (error) {
      console.error("Error importing pockets:", error);
      throw error;
    }
  };

  // Get unique categories for filter
  const categories = React.useMemo(() => {
    const cats = new Set<string>();
    pockets.forEach((pocket) => {
      const cat = (pocket as any).category || "Other";
      cats.add(cat);
    });
    return Array.from(cats).sort();
  }, [pockets]);

  // Expose handleNewPocket method via ref
  React.useImperativeHandle(ref, () => ({
    handleNewPocket,
  }));

  // If a pocket is selected, show the content list
  if (selectedPocket) {
    return (
      <ContentList 
        pocket={selectedPocket} 
        onBack={handleBackToPockets}
        onAddNote={onAddNote}
        onAddFile={onAddFile}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Floating Controls */}
      <FloatingPanel className="top-16">
        <div className="flex flex-col items-stretch gap-2">
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
                  placeholder="Search pockets..."
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
                  { value: "name", label: "Name" },
                  { value: "size", label: "Size" },
                ]}
              />
            </div>
          </div>
          {/* Category Filter */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={cn(
                  "flex-1 px-3 py-2 rounded-lg border text-sm",
                  "bg-white/10 border-white/10 text-white backdrop-blur-xl",
                  "focus:outline-none focus:ring-2 focus:ring-white/30"
                )}
              >
                <option value="all" className="bg-[rgba(17,25,40,0.95)]">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat} className="bg-[rgba(17,25,40,0.95)]">
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )}
          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAnalytics(true)}
              className="flex-1"
              title="View Analytics"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Analytics
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExportImport(true)}
              className="flex-1"
              title="Export/Import"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Export/Import
            </Button>
          </div>
        </div>
      </FloatingPanel>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pt-40 sm:pt-44 md:pt-48">
        {isLoading ? (
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
              <p className="text-sm text-muted-foreground">Loading pockets...</p>
            </div>
          </div>
        ) : filteredPockets.length === 0 ? (
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
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                  <h3 className="text-lg font-semibold mb-2">No pockets yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create your first pocket to start organizing content
                  </p>
                  <Button onClick={onNewPocket || handleNewPocket}>
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
                    Create Pocket
                  </Button>
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
            {filteredPockets.map((pocket) => (
              <PocketCard
                key={pocket.id}
                pocket={pocket}
                viewMode={viewMode}
                onEdit={handleEditPocket}
                onDelete={handleDeletePocket}
                onClick={handlePocketClick}
                onShare={handleSharePocket}
              />
            ))}
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
              kind="pockets"
              open
              query={searchQuery}
              loading={isSearching}
              results={searchResults}
              onSelectPocket={(pocket) => {
                setSelectedPocket(pocket);
                if (onSelectPocket) onSelectPocket(pocket);
              }}
              onClose={() => {
                setSearchQuery("");
                setSearchResults([]);
                setIsResultsOpen(false);
                filterAndSortPockets();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialog */}
      <PocketDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        onSave={handleSavePocket}
        editingPocket={editingPocket}
      />

      {/* Analytics Dialog */}
      {showAnalytics && (
        <PocketAnalytics
          pockets={pockets}
          onClose={() => setShowAnalytics(false)}
        />
      )}

      {/* Export/Import Dialog */}
      {showExportImport && (
        <PocketExportImport
          pockets={pockets}
          onImport={handleImportPockets}
          onClose={() => setShowExportImport(false)}
        />
      )}
    </div>
  );
  }
);
