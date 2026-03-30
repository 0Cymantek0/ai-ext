import React, { useEffect, useRef, useState } from "react";
import type { ColorScheme } from "../types";

interface OutputLine {
  text: string;
  type: "command" | "response" | "error" | "system";
  timestamp: number;
}

interface TerminalProps {
  onCommand: (command: string) => void;
  output: OutputLine[];
  isProcessing: boolean;
  colorScheme: ColorScheme;
}

export const Terminal: React.FC<TerminalProps> = ({
  onCommand,
  output,
  isProcessing,
  colorScheme,
}) => {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new output appears
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [output]);

  useEffect(() => {
    // Focus input on mount and when processing completes
    if (!isProcessing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isProcessing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      onCommand(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle special keys if needed
    if (e.key === "Tab") {
      e.preventDefault();
      // Could implement auto-complete here
    }
  };

  return (
    <div className="terminal-content" ref={contentRef}>
      {output.map((line, index) => (
        <div
          key={`${line.timestamp}-${index}`}
          className={`output-line ${line.type}`}
        >
          {line.type === "command" && "> "}
          {line.text}
        </div>
      ))}

      {isProcessing && (
        <div className="output-line system">
          <span className="loading">Thinking</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="command-input-container">
        <span className="command-prompt">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          className="command-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
        <span className="cursor" />
      </form>
    </div>
  );
};

export type { OutputLine };
