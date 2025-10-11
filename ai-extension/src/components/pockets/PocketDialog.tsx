import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PocketData } from "./PocketCard";

interface PocketDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (pocket: Omit<PocketData, "id" | "createdAt" | "updatedAt" | "contentIds">) => void;
  editingPocket?: PocketData | null;
}

const PRESET_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f43f5e", // rose
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
];

const PRESET_ICONS = ["📁", "📚", "💼", "🎨", "🔬", "💡", "🎯", "🌟", "🚀", "📊"];

export function PocketDialog({
  isOpen,
  onClose,
  onSave,
  editingPocket,
}: PocketDialogProps) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState<string>(PRESET_COLORS[0]!);
  const [icon, setIcon] = React.useState<string>(PRESET_ICONS[0]!);
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");

  React.useEffect(() => {
    if (editingPocket) {
      setName(editingPocket.name);
      setDescription(editingPocket.description);
      setColor(editingPocket.color);
      setIcon(editingPocket.icon || PRESET_ICONS[0]!);
      setTags(editingPocket.tags);
    } else {
      setName("");
      setDescription("");
      setColor(PRESET_COLORS[0]!);
      setIcon(PRESET_ICONS[0]!);
      setTags([]);
    }
    setTagInput("");
  }, [editingPocket, isOpen]);

  const handleSave = () => {
    if (!name.trim()) {
      alert("Please enter a pocket name");
      return;
    }

    onSave({
      name: name.trim(),
      description: description.trim(),
      color,
      icon,
      tags,
    });

    onClose();
  };

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg shadow-lg w-full max-w-md p-6 m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold mb-4">
          {editingPocket ? "Edit Pocket" : "Create New Pocket"}
        </h2>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter pocket name"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description (optional)"
              className={cn(
                "w-full px-3 py-2 rounded-md border border-input bg-background",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                "resize-none"
              )}
              rows={3}
            />
          </div>

          {/* Icon */}
          <div>
            <label className="block text-sm font-medium mb-2">Icon</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_ICONS.map((presetIcon) => (
                <button
                  key={presetIcon}
                  type="button"
                  onClick={() => setIcon(presetIcon)}
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center text-xl",
                    "border-2 transition-colors",
                    icon === presetIcon
                      ? "border-primary bg-accent"
                      : "border-transparent hover:border-muted-foreground/20"
                  )}
                >
                  {presetIcon}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((presetColor) => (
                <button
                  key={presetColor}
                  type="button"
                  onClick={() => setColor(presetColor)}
                  className={cn(
                    "w-10 h-10 rounded-lg border-2 transition-all",
                    color === presetColor
                      ? "border-foreground scale-110"
                      : "border-transparent hover:scale-105"
                  )}
                  style={{ backgroundColor: presetColor }}
                  title={presetColor}
                />
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium mb-1">Tags</label>
            <div className="flex gap-2 mb-2">
              <Input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add tag and press Enter"
              />
              <Button type="button" onClick={handleAddTag} size="sm">
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full bg-accent text-sm flex items-center gap-2"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-destructive"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {editingPocket ? "Save Changes" : "Create Pocket"}
          </Button>
        </div>
      </div>
    </div>
  );
}
