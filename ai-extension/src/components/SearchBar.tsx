import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FloatingSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch?: (query: string) => void;
  isSearching?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchBar({
  value,
  onChange,
  onSearch,
  isSearching,
  placeholder = "Search pockets...",
  className,
  disabled = false,
}: FloatingSearchBarProps) {
  const [localValue, setLocalValue] = React.useState<string>(value || "");
  React.useEffect(() => {
    setLocalValue(value || "");
  }, [value]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    const next = localValue.trim();
    onChange(next);
    if (onSearch) onSearch(next);
  };

  const handleClear = () => {
    setLocalValue("");
    onChange("");
    if (disabled) return;
    if (onSearch) onSearch("");
  };

  return (
    <motion.form
      layoutId="pocket-search-shared"
      onSubmit={handleSubmit}
      className={cn(
        // Glassmorphism container
        "flex w-full items-center gap-2 rounded-full p-1 pl-2",
        // Liquid Glass: more translucency and stronger blur
        "bg-background/70 backdrop-blur-xl border border-border shadow-xl",
        "ring-0 focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
      role="search"
      aria-label="Search pockets"
      style={{ willChange: "transform, filter" }}
    >
      <span aria-hidden="true" className="text-muted-foreground">
        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </span>
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "bg-transparent outline-none flex-1 min-w-0",
          "placeholder:text-muted-foreground/70",
          "text-sm px-1",
          "min-w-[180px]",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled}
          className={cn(
            "inline-flex items-center justify-center",
            "rounded-full p-1 text-muted-foreground hover:text-foreground",
            "hover:bg-accent/60 transition-colors",
            disabled && "opacity-50 cursor-not-allowed",
          )}
          aria-label="Clear search"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {/* Submit button removed; use Enter to search */}
    </motion.form>
  );
}
