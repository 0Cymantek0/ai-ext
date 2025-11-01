import * as React from "react";
import { cn } from "@/lib/utils";

interface FloatingControlsProps {
  className?: string;
  children?: React.ReactNode;
}

export function FloatingPanel({ className, children }: FloatingControlsProps) {
  return (
    <div
      className={cn(
        "fixed z-40 left-0 right-0 px-4",
        "top-16 mx-auto max-w-[720px]",
        "flex flex-col items-stretch gap-2",
        className,
      )}
      aria-live="polite"
    >
      {children}
    </div>
  );
}

interface SelectorProps<T extends string> {
  label?: string;
  value: T;
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  onChange: (value: T) => void;
  className?: string;
}

export function GlassSelector<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SelectorProps<T>) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full p-1",
        "bg-background/95 backdrop-blur-sm border border-border shadow-lg",
        className,
      )}
      role="group"
      aria-label={label || "Selector"}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium",
            value === opt.value
              ? "bg-slate-100 text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-50"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
          )}
          aria-pressed={value === opt.value}
        >
          {opt.icon ? <span className="scale-75">{opt.icon}</span> : null}
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

interface SortProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
}

export function GlassSort<T extends string>({
  value,
  options,
  onChange,
  className,
}: SortProps<T>) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 rounded-full p-1 pl-2",
        "bg-background/95 backdrop-blur-sm border border-border shadow-lg",
        className,
      )}
    >
      <span className="text-xs text-muted-foreground">Sort</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={cn(
          "bg-transparent outline-none",
          "text-sm px-1 py-1 rounded-md",
          "text-foreground",
          "[&>option]:bg-background [&>option]:text-foreground",
          "dark:[&>option]:bg-slate-900 dark:[&>option]:text-slate-50",
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
