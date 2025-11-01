/**
 * Modal/Dropdown to select pockets
 * Shows all user pockets with scroll, allows multi-select
 * Filters out pockets that are currently indexing
 */

import * as React from "react";
import { X, FolderOpen, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PocketInfo } from "./types";

interface PocketSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPocket: (pocket: PocketInfo) => void;
  selectedPocketIds: string[];
  disabled?: boolean;
}

export function PocketSelector({
  isOpen,
  onClose,
  onSelectPocket,
  selectedPocketIds,
  disabled = false,
}: PocketSelectorProps) {
  const [pockets, setPockets] = React.useState<PocketInfo[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const modalRef = React.useRef<HTMLDivElement>(null);

  // Fetch pockets when opened
  React.useEffect(() => {
    if (!isOpen) return;

    const fetchPockets = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await chrome.runtime.sendMessage({
          kind: "POCKET_LIST",
          requestId: crypto.randomUUID(),
          payload: {},
        });

        if (response.success && response.data?.pockets) {
          // Transform to PocketInfo format
          const pocketInfos: PocketInfo[] = response.data.pockets.map(
            (p: any) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              color: p.color,
              icon: p.icon,
              contentCount: p.contentIds?.length || 0,
              isIndexing: false, // TODO: Get indexing status from indexing service
            }),
          );

          // Filter out indexing pockets
          const availablePockets = pocketInfos.filter((p) => !p.isIndexing);
          setPockets(availablePockets);
        } else {
          setError("Failed to load pockets");
        }
      } catch (err) {
        console.error("Error fetching pockets:", err);
        setError("Error loading pockets");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPockets();
  }, [isOpen]);

  // Close on outside click
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // Close on Escape key
  React.useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        className={cn(
          "bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl",
          "w-[90vw] max-w-md max-h-[70vh] flex flex-col",
          disabled && "opacity-50 pointer-events-none",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Select Pockets</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            disabled={disabled}
          >
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-white/50 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          ) : pockets.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="w-12 h-12 text-white/30 mx-auto mb-3" />
              <p className="text-white/50 text-sm mb-2">No pockets available</p>
              <p className="text-white/30 text-xs">
                Create a pocket to get started
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {pockets.map((pocket) => {
                const isSelected = selectedPocketIds.includes(pocket.id);

                return (
                  <button
                    key={pocket.id}
                    onClick={() => onSelectPocket(pocket)}
                    className={cn(
                      "w-full text-left px-4 py-3 rounded-lg transition-all",
                      "border border-white/10 hover:border-white/20",
                      isSelected
                        ? "bg-cyan-500/20 border-cyan-500/50"
                        : "bg-white/5 hover:bg-white/10",
                    )}
                    disabled={disabled}
                  >
                    <div className="flex items-start gap-3">
                      {/* Pocket Icon/Color */}
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: pocket.color || "#6366f1" }}
                      >
                        {pocket.icon ? (
                          <span className="text-xl">{pocket.icon}</span>
                        ) : (
                          <FolderOpen className="w-5 h-5 text-white" />
                        )}
                      </div>

                      {/* Pocket Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-medium text-white truncate">
                            {pocket.name}
                          </h3>
                          {isSelected && (
                            <div className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0" />
                          )}
                        </div>
                        {pocket.description && (
                          <p className="text-xs text-white/50 line-clamp-1 mb-1">
                            {pocket.description}
                          </p>
                        )}
                        <p className="text-xs text-white/40">
                          {pocket.contentCount}{" "}
                          {pocket.contentCount === 1 ? "item" : "items"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
