import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ModeSwitcher } from "@/components/ModeSwitcher";
import type { Mode } from "@/components/ModeSwitcher";

interface TopBarProps {
  onOpenHistory: () => void;
  onNewChat: () => void;
  onNewPocket?: () => void;
  onImportPocket?: () => void;
  onAddNote?: () => void;
  onAddFile?: () => void;
  onExportChat?: (format: "markdown" | "json" | "pdf") => void;
  // Pocket-specific menu removed from main page
  currentMode?: Mode;
  onModeChange?: (mode: Mode) => void;
  className?: string;
  isInsidePocket?: boolean;
  hasMessages?: boolean;
}

export function TopBar({ 
  onOpenHistory, 
  onNewChat, 
  onNewPocket,
  onImportPocket,
  onAddNote,
  onAddFile,
  onExportChat,
  
  currentMode = "ask", 
  onModeChange, 
  className,
  isInsidePocket = false,
  hasMessages = false
}: TopBarProps) {
  const [showAddMenu, setShowAddMenu] = React.useState(false);
  const [showPocketMenu, setShowPocketMenu] = React.useState(false);
  const [showExportMenu, setShowExportMenu] = React.useState(false);
  const addMenuRef = React.useRef<HTMLDivElement>(null);
  const pocketMenuRef = React.useRef<HTMLDivElement>(null);
  const exportMenuRef = React.useRef<HTMLDivElement>(null);

  // Close add menu dropdown when clicking outside
  React.useEffect(() => {
    if (!showAddMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAddMenu]);

  // Close pocket menu dropdown when clicking outside
  React.useEffect(() => {
    if (!showPocketMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pocketMenuRef.current && !pocketMenuRef.current.contains(e.target as Node)) {
        setShowPocketMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPocketMenu]);

  // Close export menu dropdown when clicking outside
  React.useEffect(() => {
    if (!showExportMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu]);


  const handleExport = (format: "markdown" | "json" | "pdf") => {
    setShowExportMenu(false);
    onExportChat?.(format);
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

      {/* Right pill: export + new */}
      <div
        className={cn(
          "flex h-8 items-center gap-2 rounded-full px-3",
          "bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/40",
          "border border-border shadow-sm",
        )}
        style={{ pointerEvents: "auto" }}
      >
        {/* In chat mode: Export Chat Button with dropdown - only show when there are messages */}
        {currentMode !== "ai-pocket" && hasMessages && (
          <div className="relative" ref={exportMenuRef}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowExportMenu(!showExportMenu)}
              aria-label="Export conversation"
              title="Export Chat"
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </Button>
            
            {/* Export format dropdown menu */}
            {showExportMenu && (
              <div 
                className="absolute top-full right-0 mt-2 bg-gray-900/90 dark:bg-gray-950/90 backdrop-blur-xl border border-gray-700/50 dark:border-gray-800/50 rounded-lg shadow-2xl overflow-hidden min-w-[180px] z-50"
                style={{ pointerEvents: "auto" }}
              >
                <Button
                  variant="ghost"
                  className="w-full justify-start px-4 py-3 h-auto text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 rounded-none"
                  onClick={() => handleExport("markdown")}
                >
                  <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Export as Markdown
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start px-4 py-3 h-auto text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 rounded-none"
                  onClick={() => handleExport("json")}
                >
                  <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Export as JSON
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start px-4 py-3 h-auto text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 rounded-none"
                  onClick={() => handleExport("pdf")}
                >
                  <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Export as PDF
                </Button>
              </div>
            )}
          </div>
        )}


        {/* New Chat/Pocket Button with dropdown */}
        {currentMode === "ai-pocket" && !isInsidePocket ? (
          <div className="relative" ref={pocketMenuRef}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowPocketMenu(!showPocketMenu)}
              aria-label="Pocket actions"
              title="Pocket Actions"
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
            
            {/* Dropdown menu for pocket actions */}
            {showPocketMenu && (
              <div 
                className="absolute top-full right-0 mt-2 bg-gray-900/90 dark:bg-gray-950/90 backdrop-blur-xl border border-gray-700/50 dark:border-gray-800/50 rounded-lg shadow-2xl overflow-hidden min-w-[180px] z-50"
                style={{ pointerEvents: "auto" }}
              >
                <Button
                  variant="ghost"
                  className="w-full justify-start px-4 py-3 h-auto text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 rounded-none"
                  onClick={() => {
                    setShowPocketMenu(false);
                    onNewPocket?.();
                  }}
                >
                  <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create New Pocket
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start px-4 py-3 h-auto text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 rounded-none"
                  onClick={() => {
                    setShowPocketMenu(false);
                    onImportPocket?.();
                  }}
                >
                  <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Import Pocket
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="relative" ref={addMenuRef}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                if (currentMode === "ai-pocket" && isInsidePocket) {
                  setShowAddMenu(!showAddMenu);
                } else {
                  onNewChat();
                }
              }}
              aria-label={
                currentMode === "ai-pocket" && isInsidePocket
                  ? "Add content"
                  : "Start new conversation"
              }
              title={
                currentMode === "ai-pocket" && isInsidePocket
                  ? "Add Content"
                  : "New Chat"
              }
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
            
            {/* Dropdown menu for add options */}
            {showAddMenu && currentMode === "ai-pocket" && isInsidePocket && (
              <div 
                className="absolute top-full right-0 mt-2 bg-gray-900/90 dark:bg-gray-950/90 backdrop-blur-xl border border-gray-700/50 dark:border-gray-800/50 rounded-lg shadow-2xl overflow-hidden min-w-[180px] z-50"
                style={{ pointerEvents: "auto" }}
              >
                <Button
                  variant="ghost"
                  className="w-full justify-start px-4 py-3 h-auto text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 rounded-none"
                  onClick={() => {
                    setShowAddMenu(false);
                    onAddFile?.();
                  }}
                >
                  <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Add file
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start px-4 py-3 h-auto text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 rounded-none"
                  onClick={() => {
                    setShowAddMenu(false);
                    onAddNote?.();
                  }}
                >
                  <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Add note
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
