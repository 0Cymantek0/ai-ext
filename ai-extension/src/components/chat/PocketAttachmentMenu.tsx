/**
 * Dropdown menu for the Plus icon
 * Shows "Add File" and "Add Pocket" options
 */

import * as React from "react";
import { FileUp, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface PocketAttachmentMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFile: () => void;
  onAddPocket: () => void;
  disabled?: boolean;
}

export function PocketAttachmentMenu({
  isOpen,
  onClose,
  onAddFile,
  onAddPocket,
  disabled = false,
}: PocketAttachmentMenuProps) {
  const menuRef = React.useRef<HTMLDivElement>(null);

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

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className={cn(
        "absolute bottom-full left-0 mb-2 bg-black/90 dark:bg-gray-950/90 backdrop-blur-xl",
        "border border-white/10 rounded-lg shadow-2xl overflow-hidden min-w-[160px] z-50",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      <button
        className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-3"
        onClick={() => {
          onAddFile();
          onClose();
        }}
        disabled={disabled}
      >
        <FileUp className="w-4 h-4" />
        <span>Add File</span>
      </button>
      <button
        className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-3"
        onClick={() => {
          onAddPocket();
          onClose();
        }}
        disabled={disabled}
      >
        <FolderOpen className="w-4 h-4" />
        <span>Add Pocket</span>
      </button>
    </div>
  );
}
