/**
 * @ mention autocomplete dropdown
 * Shows elements from selected pockets when user types @
 * Displays icons for different content types, thumbnails for images
 */

import * as React from "react";
import {
  FileText,
  Image as ImageIcon,
  FileAudio,
  Link as LinkIcon,
  FileType,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentElement, PocketInfo } from "./types";

interface ElementMentionAutocompleteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectElement: (element: ContentElement) => void;
  selectedPockets: PocketInfo[];
  query: string;
  position?: { top: number; left: number } | undefined;
  disabled?: boolean;
}

export function ElementMentionAutocomplete({
  isOpen,
  onClose,
  onSelectElement,
  selectedPockets,
  query,
  position,
  disabled = false,
}: ElementMentionAutocompleteProps) {
  const [elements, setElements] = React.useState<ContentElement[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Fetch elements from selected pockets
  React.useEffect(() => {
    if (!isOpen || selectedPockets.length === 0) {
      setElements([]);
      return;
    }

    const fetchElements = async () => {
      setIsLoading(true);

      try {
        const allElements: ContentElement[] = [];

        // Fetch content from each selected pocket
        for (const pocket of selectedPockets) {
          const response = await chrome.runtime.sendMessage({
            kind: "CONTENT_LIST",
            requestId: crypto.randomUUID(),
            payload: { pocketId: pocket.id },
          });

          if (response.success && response.data?.contents) {
            const pocketElements: ContentElement[] = response.data.contents.map(
              (content: any) => ({
                id: content.id,
                pocketId: pocket.id,
                pocketName: pocket.name,
                type: content.type,
                title: content.metadata?.title || getDefaultTitle(content),
                preview: getPreview(content),
                thumbnail: getThumbnail(content),
                sourceUrl: content.sourceUrl,
                timestamp: content.capturedAt,
              }),
            );

            allElements.push(...pocketElements);
          }
        }

        // Filter by query
        const filtered = query
          ? allElements.filter((el) =>
              el.title.toLowerCase().includes(query.toLowerCase()),
            )
          : allElements;

        // Sort by timestamp (newest first)
        filtered.sort((a, b) => b.timestamp - a.timestamp);

        setElements(filtered);
        setSelectedIndex(0);
      } catch (err) {
        console.error("Error fetching elements:", err);
        setElements([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchElements();
  }, [isOpen, selectedPockets, query]);

  // Close on outside click
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // Keyboard navigation
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, elements.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && elements[selectedIndex]) {
        e.preventDefault();
        onSelectElement(elements[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, elements, selectedIndex, onSelectElement, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className={cn(
        "absolute bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl",
        "w-[320px] max-h-[300px] overflow-y-auto z-50",
        disabled && "opacity-50 pointer-events-none",
      )}
      style={position ? { top: position.top, left: position.left } : undefined}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/10">
        <p className="text-xs text-white/50 font-medium">
          {selectedPockets.length === 1
            ? `Elements from ${selectedPockets[0]?.name || "pocket"}`
            : `Elements from ${selectedPockets.length} pockets`}
        </p>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-white/50 animate-spin" />
        </div>
      ) : elements.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-white/50 text-sm">
            {query ? "No matching elements" : "No elements in selected pockets"}
          </p>
        </div>
      ) : (
        <div className="py-1">
          {elements.map((element, index) => (
            <button
              key={element.id}
              onClick={() => onSelectElement(element)}
              className={cn(
                "w-full text-left px-3 py-2 transition-colors flex items-center gap-3",
                index === selectedIndex ? "bg-white/15" : "hover:bg-white/10",
              )}
              disabled={disabled}
            >
              {/* Icon or Thumbnail */}
              <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
                {element.type === "image" && element.thumbnail ? (
                  <img
                    src={element.thumbnail}
                    alt=""
                    className="w-8 h-8 rounded object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center">
                    {getElementIcon(element.type)}
                  </div>
                )}
              </div>

              {/* Element Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">
                  {element.title}
                </p>
                <p className="text-xs text-white/40 truncate">
                  {element.pocketName}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper functions
function getDefaultTitle(content: any): string {
  if (content.type === "capture") {
    const text = content.content?.toString() || "";
    return text.length > 50
      ? text.slice(0, 50) + "..."
      : text || "Text Capture";
  }
  if (content.type === "note") return "Note";
  if (content.type === "pdf") return content.metadata?.title || "PDF Document";
  if (content.type === "image") return "Image";
  if (content.type === "audio") return "Audio";
  if (content.type === "link") return "Link";
  return "Content";
}

function getPreview(content: any): string | undefined {
  if (content.type === "capture" || content.type === "note") {
    const text = content.content?.toString() || "";
    return text.length > 100 ? text.slice(0, 100) + "..." : text;
  }
  return undefined;
}

function getThumbnail(content: any): string | undefined {
  if (content.type === "image" && typeof content.content === "string") {
    return content.content;
  }
  return undefined;
}

function getElementIcon(type: string) {
  switch (type) {
    case "capture":
    case "note":
      return <FileText className="w-4 h-4 text-white/70" />;
    case "pdf":
      return <FileType className="w-4 h-4 text-white/70" />;
    case "image":
      return <ImageIcon className="w-4 h-4 text-white/70" />;
    case "audio":
      return <FileAudio className="w-4 h-4 text-white/70" />;
    case "link":
      return <LinkIcon className="w-4 h-4 text-white/70" />;
    default:
      return <FileText className="w-4 h-4 text-white/70" />;
  }
}
