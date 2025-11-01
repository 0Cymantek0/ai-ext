/**
 * Display selected pockets as removable pills above the textbox
 */

import * as React from "react";
import { X, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PocketInfo } from "./types";

interface SelectedPocketsPillsProps {
  pockets: PocketInfo[];
  onRemove: (pocketId: string) => void;
  disabled?: boolean;
  className?: string;
}

export function SelectedPocketsPills({
  pockets,
  onRemove,
  disabled = false,
  className,
}: SelectedPocketsPillsProps) {
  if (pockets.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {pockets.map((pocket) => (
        <div
          key={pocket.id}
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-full",
            "bg-white/10 backdrop-blur-sm border border-white/20",
            "text-sm text-white",
            disabled && "opacity-50",
          )}
        >
          {/* Pocket Icon */}
          <div
            className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: pocket.color || "#6366f1" }}
          >
            {pocket.icon ? (
              <span className="text-xs">{pocket.icon}</span>
            ) : (
              <FolderOpen className="w-3 h-3 text-white" />
            )}
          </div>

          {/* Pocket Name */}
          <span className="font-medium truncate max-w-[150px]">
            {pocket.name}
          </span>

          {/* Remove Button */}
          <button
            onClick={() => onRemove(pocket.id)}
            className={cn(
              "p-0.5 rounded-full hover:bg-white/20 transition-colors",
              disabled && "pointer-events-none",
            )}
            disabled={disabled}
            title={`Remove ${pocket.name}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
