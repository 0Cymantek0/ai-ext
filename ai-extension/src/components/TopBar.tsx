import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ModeSwitcher } from "@/components/ModeSwitcher";
import type { Mode } from "@/components/ModeSwitcher";

interface TopBarProps {
  onOpenHistory: () => void;
  onNewChat: () => void;
  onNewPocket?: () => void;
  onNewNote?: () => void;
  currentMode?: Mode;
  onModeChange?: (mode: Mode) => void;
  className?: string;
}

export function TopBar({ 
  onOpenHistory, 
  onNewChat, 
  onNewPocket, 
  onNewNote,
  currentMode = "ask", 
  onModeChange, 
  className 
}: TopBarProps) {
  const [theme, setTheme] = React.useState<"light" | "dark" | "auto">("auto");

  React.useEffect(() => {
    // Load theme preference
    const savedTheme =
      (localStorage.getItem("theme") as "light" | "dark" | "auto") || "auto";
    setTheme(savedTheme);
    applyTheme(savedTheme);
  }, []);

  const applyTheme = (newTheme: "light" | "dark" | "auto") => {
    const html = document.documentElement;

    if (newTheme === "auto") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      html.classList.toggle("dark", prefersDark);
    } else {
      html.classList.toggle("dark", newTheme === "dark");
    }
  };

  const toggleTheme = () => {
    const themes: Array<"light" | "dark" | "auto"> = ["light", "dark", "auto"];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex] as "light" | "dark" | "auto";

    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    applyTheme(nextTheme);
  };

  const getThemeIcon = () => {
    switch (theme) {
      case "light":
        return (
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
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        );
      case "dark":
        return (
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
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        );
      default:
        return (
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
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        );
    }
  };

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between px-4 bg-transparent pointer-events-none",
        className,
      )}
    >
      {/* Left pill: burger + title (burger only in chat mode) */}
      <div
        className={cn(
          "flex h-8 items-center gap-2 rounded-full px-3",
          "bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/40",
          "border border-border shadow-sm",
        )}
        style={{ pointerEvents: "auto" }}
      >
        {currentMode !== "ai-pocket" && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onOpenHistory}
            aria-label="Open conversation history"
            title="History"
          >
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
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </Button>
        )}
        <h1 className="text-sm font-semibold leading-none">
          {currentMode === "ai-pocket" ? "AI Pocket" : "Chat"}
        </h1>
      </div>

      {/* Center: Mode switcher */}
      <div className="absolute left-1/2 -translate-x-1/2" style={{ pointerEvents: "auto" }}>
        <ModeSwitcher currentMode={currentMode} onModeChange={onModeChange ?? (() => {})} />
      </div>

      {/* Right pill: theme + new */}
      <div
        className={cn(
          "flex h-8 items-center gap-2 rounded-full px-3",
          "bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/40",
          "border border-border shadow-sm",
        )}
        style={{ pointerEvents: "auto" }}
      >
        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleTheme}
          aria-label={`Current theme: ${theme}`}
          title={`Theme: ${theme}`}
        >
          {getThemeIcon()}
        </Button>

        {/* New Note Button (AI Pocket mode) */}
        {currentMode === "ai-pocket" && onNewNote && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onNewNote}
            aria-label="Create new note"
            title="New Note"
          >
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </Button>
        )}

        {/* New Chat/Pocket Button */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={currentMode === "ai-pocket" ? onNewPocket : onNewChat}
          aria-label={
            currentMode === "ai-pocket"
              ? "Create new pocket"
              : "Start new conversation"
          }
          title={currentMode === "ai-pocket" ? "New Pocket" : "New Chat"}
        >
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
              d="M12 4v16m8-8H4"
            />
          </svg>
        </Button>
      </div>
    </header>
  );
}
