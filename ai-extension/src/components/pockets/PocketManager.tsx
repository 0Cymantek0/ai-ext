import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PocketCard, type PocketData } from "./PocketCard";
import { PocketDialog } from "./PocketDialog";
import { SearchBar } from "./SearchBar";

type ViewMode = "list" | "grid";
type SortBy = "date" | "name" | "size";

interface PocketManagerProps {
  onSelectPocket?: (pocket: PocketData) => void;
}

export function PocketManager({ onSelectPocket }: PocketManagerProps) {
  const [pockets, setPockets] = React.useState<PocketData[]>([]);
  const [filteredPockets, setFilteredPockets] = React.useState<PocketData[]>([]);
  const [viewMode, setViewMode] = React.useState<ViewMode>("grid");
  const [sortBy, setSortBy] = React.useState<SortBy>("date");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isSearching, setIsSearching] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingPocket, setEditingPocket] = React.useState<PocketData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Load pockets on mount
  React.useEffect(() => {
    loadPockets();
  }, []);

  // Filter and sort pockets when dependencies change
  React.useEffect(() => {
    filterAndSortPockets();
  }, [pockets, searchQuery, sortBy]);

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
      return;
    }

    setIsSearching(true);
    setSearchQuery(query);

    // TODO: Implement vector-based semantic search
    // For now, we're using basic text filtering in filterAndSortPockets
    // Future enhancement: Generate embedding for query and perform cosine similarity search
    
    try {
      // Placeholder for vector search implementation
      // This would involve:
      // 1. Generate embedding for the search query
      // 2. Retrieve all pocket embeddings from IndexedDB
      // 3. Calculate cosine similarity between query and pocket embeddings
      // 4. Rank and filter results by similarity score
      // 5. Update filteredPockets with semantic search results
      
      console.log("Vector search not yet implemented, using text search");
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

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
    if (onSelectPocket) {
      onSelectPocket(pocket);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Pockets</h2>
          <Button onClick={handleNewPocket} size="sm">
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
            New Pocket
          </Button>
        </div>

        {/* Search */}
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          onSearch={handleSearch}
          isSearching={isSearching}
        />

        {/* Controls */}
        <div className="flex items-center justify-between">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 border rounded-md p-1">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "p-2 rounded transition-colors",
                viewMode === "list"
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              )}
              title="List view"
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
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-2 rounded transition-colors",
                viewMode === "grid"
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              )}
              title="Grid view"
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
                  d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                />
              </svg>
            </button>
          </div>

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className={cn(
              "px-3 py-1.5 rounded-md border border-input bg-background",
              "text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            )}
          >
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
            <option value="size">Sort by Size</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
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
                  <Button onClick={handleNewPocket}>
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
                ? "grid grid-cols-1 sm:grid-cols-2 gap-4"
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
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialog */}
      <PocketDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        onSave={handleSavePocket}
        editingPocket={editingPocket}
      />
    </div>
  );
}
