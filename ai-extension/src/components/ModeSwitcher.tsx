import * as React from "react";
import { cn } from "@/lib/utils";

export type Mode = "ask" | "ai-pocket";

interface ModeSwitcherProps {
  currentMode: Mode;
  onModeChange: (mode: Mode) => void;
  className?: string;
}

export function ModeSwitcher({
  currentMode,
  onModeChange,
  className,
}: ModeSwitcherProps) {
  const modes: Array<{ id: Mode; label: string; icon: React.ReactNode }> = [
    {
      id: "ask",
      label: "Ask",
      icon: (
        <svg
          className="size-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
      ),
    },
    {
      id: "ai-pocket",
      label: "AI Pocket",
      icon: (
        <svg
          className="size-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
      ),
    },
  ];

  return (
    <div
      className={cn(
        "mode-switcher inline-flex h-8 items-stretch gap-0.5 rounded-full bg-background/95 backdrop-blur-sm p-0.5",
        "border border-border shadow-lg",
        "transition-all duration-200",
        className,
      )}
      role="tablist"
      aria-label="Mode switcher"
    >
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="tab"
          aria-selected={currentMode === mode.id}
          aria-controls={`${mode.id}-panel`}
          onClick={() => onModeChange(mode.id)}
          className={cn(
            "relative flex h-full items-center gap-1.5 rounded-full px-3",
            "text-xs font-medium transition-all duration-200",
            "focus:outline-none",
            currentMode === mode.id
              ? "bg-slate-100 text-slate-900 shadow-md dark:bg-slate-800 dark:text-slate-100"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
          )}
        >
          <span aria-hidden="true" className="scale-75">
            {mode.icon}
          </span>
          <span className="mode-label leading-none">{mode.label}</span>
        </button>
      ))}
    </div>
  );
}
