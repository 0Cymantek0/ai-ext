import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PocketData } from "./PocketCard";

interface PocketDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    pocket: Omit<PocketData, "id" | "createdAt" | "updatedAt" | "contentIds">,
  ) => void;
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

const PRESET_ICONS = [
  "📁",
  "📚",
  "💼",
  "🎨",
  "🔬",
  "💡",
  "🎯",
  "🌟",
  "🚀",
  "📊",
];

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
    } as any);

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
    <div className="fixed inset-0 z-50 bg-[rgba(17,25,40,0.98)] backdrop-blur-xl text-white overflow-y-auto">
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[rgba(17,25,40,0.95)] backdrop-blur-xl border-b border-white/10">
          <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
            <h2 className="text-2xl font-semibold">
              {editingPocket ? "Edit Pocket" : "Create New Pocket"}
            </h2>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors p-2"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
          <div className="space-y-8">
            {/* Name */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <label className="block text-base font-medium mb-3">
                Pocket Name <span className="text-red-400">*</span>
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter a descriptive name for your pocket"
                className="bg-white/10 border-white/10 text-white placeholder-white/50 h-12 text-base"
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <label className="block text-base font-medium mb-3">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description to help you remember what this pocket is for (optional)"
                className={cn(
                  "w-full px-4 py-3 rounded-lg border bg-white/10 border-white/10 text-white placeholder-white/50",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50",
                  "resize-none text-base",
                )}
                rows={4}
              />
            </div>

            {/* Icon */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <label className="block text-base font-medium mb-4">
                Choose an Icon
              </label>
              <div className="flex gap-3 flex-wrap">
                {PRESET_ICONS.map((presetIcon) => (
                  <button
                    key={presetIcon}
                    type="button"
                    onClick={() => setIcon(presetIcon)}
                    className={cn(
                      "w-14 h-14 rounded-xl flex items-center justify-center text-2xl",
                      "border-2 transition-all hover:scale-105",
                      icon === presetIcon
                        ? "border-primary bg-primary/20 shadow-lg shadow-primary/20"
                        : "border-white/10 hover:border-white/30 bg-white/5",
                    )}
                  >
                    {presetIcon}
                  </button>
                ))}
              </div>
            </div>

            {/* Color */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <label className="block text-base font-medium mb-4">
                Choose a Color
              </label>
              <div className="flex gap-3 flex-wrap">
                {PRESET_COLORS.map((presetColor) => (
                  <button
                    key={presetColor}
                    type="button"
                    onClick={() => setColor(presetColor)}
                    className={cn(
                      "w-14 h-14 rounded-xl border-2 transition-all hover:scale-105",
                      color === presetColor
                        ? "border-white scale-110 shadow-lg"
                        : "border-white/20 hover:border-white/40",
                    )}
                    style={{ backgroundColor: presetColor }}
                    title={presetColor}
                  />
                ))}
              </div>
            </div>

            {/* Tags */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <label className="block text-base font-medium mb-3">Tags</label>
              <div className="flex gap-2 mb-4">
                <Input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add tags to organize your pocket"
                  className="bg-white/10 border-white/10 text-white placeholder-white/50 h-12 text-base"
                />
                <Button
                  type="button"
                  onClick={handleAddTag}
                  className="h-12 px-6"
                >
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-4 py-2 rounded-full bg-primary/20 border border-primary/30 text-sm flex items-center gap-2"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-red-400 transition-colors text-lg"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-[rgba(17,25,40,0.95)] backdrop-blur-xl border-t border-white/10">
          <div className="max-w-3xl mx-auto px-6 py-4 flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="h-12 px-8 text-base"
            >
              Cancel
            </Button>
            <Button onClick={handleSave} className="h-12 px-8 text-base">
              {editingPocket ? "Save Changes" : "Create Pocket"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
