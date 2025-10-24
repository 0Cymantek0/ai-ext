import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface PocketData {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  contentIds: string[];
  tags: string[];
  color: string;
  icon?: string;
}

interface PocketCardProps {
  pocket: PocketData;
  viewMode: "list" | "grid";
  onEdit: (pocket: PocketData) => void;
  onDelete: (id: string) => void;
  onClick: (pocket: PocketData) => void;
  onShare?: (pocket: PocketData) => void;
  indexingStatus?: React.ReactNode;
}

export function PocketCard({
  pocket,
  viewMode,
  onEdit,
  onDelete,
  onClick,
  onShare,
  indexingStatus,
}: PocketCardProps) {
  const [showActions, setShowActions] = React.useState(false);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(pocket);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete pocket "${pocket.name}"? This will also delete all content inside.`)) {
      onDelete(pocket.id);
    }
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onShare) {
      onShare(pocket);
    }
  };

  if (viewMode === "list") {
    return (
      <div
        className={cn(
          "group relative flex items-center gap-4 p-4 rounded-lg border",
          "hover:bg-accent/50 cursor-pointer transition-colors",
          "bg-card"
        )}
        onClick={() => onClick(pocket)}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* Icon/Color indicator */}
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl shrink-0"
          style={{ backgroundColor: pocket.color || "#6366f1" }}
        >
          {pocket.icon || "📁"}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base truncate">{pocket.name}</h3>
          <p className="text-sm text-muted-foreground truncate">
            {pocket.description || "No description"}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>{pocket.contentIds.length} items</span>
            <span>•</span>
            <span>{formatDate(pocket.updatedAt)}</span>
            {(pocket as any).category && (
              <>
                <span>•</span>
                <span className="px-2 py-0.5 rounded-full bg-primary/20 text-xs">
                  {(pocket as any).category}
                </span>
              </>
            )}
            {pocket.tags.length > 0 && (
              <>
                <span>•</span>
                <div className="flex gap-1">
                  {pocket.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full bg-accent text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                  {pocket.tags.length > 2 && (
                    <span className="px-2 py-0.5 rounded-full bg-accent text-xs">
                      +{pocket.tags.length - 2}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
          {indexingStatus && (
            <div className="mt-2">{indexingStatus}</div>
          )}
        </div>

        {/* Actions */}
        <div
          className={cn(
            "flex items-center gap-2 transition-opacity",
            showActions ? "opacity-100" : "opacity-0"
          )}
        >
          {onShare && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShare}
              title="Share pocket"
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
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEdit}
            title="Edit pocket"
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
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            title="Delete pocket"
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
  }

  // Grid view
  return (
    <div
      className={cn(
        "group relative flex flex-col p-3 rounded-lg border",
        "hover:bg-accent/50 cursor-pointer transition-colors",
        "bg-card h-full"
      )}
      onClick={() => onClick(pocket)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Icon/Color indicator */}
      <div
        className="w-full h-24 rounded-md flex items-center justify-center text-2xl mb-2"
        style={{ backgroundColor: pocket.color || "#6366f1" }}
      >
        {pocket.icon || "📁"}
      </div>

      {/* Content */}
      <div className="flex-1">
        <h3 className="font-semibold text-sm truncate mb-1">{pocket.name}</h3>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {pocket.description || "No description"}
        </p>
        <div className="text-xs text-muted-foreground">
          <div>{pocket.contentIds.length} items</div>
          <div>{formatDate(pocket.updatedAt)}</div>
        </div>
        {pocket.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {pocket.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full bg-accent text-xs truncate"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {indexingStatus && (
          <div className="mt-3">{indexingStatus}</div>
        )}
      </div>

      {/* Actions */}
      <div
        className={cn(
          "mt-2 flex gap-1 justify-end transition-opacity",
          showActions ? "opacity-100" : "opacity-0"
        )}
      >
        {onShare && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShare}
            title="Share pocket"
            className="h-7 w-7 p-0"
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
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleEdit}
          title="Edit pocket"
          className="h-7 w-7 p-0"
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
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          title="Delete pocket"
          className="h-7 w-7 p-0"
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
}
