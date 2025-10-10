import * as React from "react";
import { cn } from "@/lib/utils";

const PromptInput = React.forwardRef<
  HTMLFormElement,
  React.FormHTMLAttributes<HTMLFormElement>
>(({ className, ...props }, ref) => (
  <form
    ref={ref}
    className={cn(
      "fixed bottom-0 left-0 right-0 flex flex-shrink-0 items-end gap-2 border-t bg-background p-3",
      className,
    )}
    {...props}
  />
));
PromptInput.displayName = "PromptInput";

interface PromptInputTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  onAttachment?: () => void;
  onVoice?: () => void;
}

const PromptInputTextarea = React.forwardRef<
  HTMLTextAreaElement,
  PromptInputTextareaProps
>(({ className, onAttachment, onVoice, onKeyDown, ...props }, ref) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [props.value]);

  // Handle Enter to send, Shift+Enter for new line
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Trigger form submit
      const form = e.currentTarget.closest("form");
      if (form) {
        form.requestSubmit();
      }
    }

    // Call parent onKeyDown if provided
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <div className="flex flex-1 items-end gap-2 rounded-lg border border-input bg-background px-3 py-2">
      {/* Attachment Button */}
      <button
        type="button"
        onClick={onAttachment}
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md",
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "transition-colors",
        )}
        title="Attach file"
        aria-label="Attach file"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
          />
        </svg>
      </button>

      {/* Auto-resizing Textarea */}
      <textarea
        ref={(node) => {
          textareaRef.current = node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        className={cn(
          "flex-1 resize-none bg-transparent",
          "min-h-[32px] max-h-[150px]",
          "focus:outline-none",
          "text-sm leading-relaxed",
          className,
        )}
        rows={1}
        onKeyDown={handleKeyDown}
        {...props}
      />

      {/* Voice Button (placeholder for future implementation) */}
      <button
        type="button"
        onClick={onVoice}
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md",
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "transition-colors",
        )}
        title="Voice input (coming soon)"
        aria-label="Voice input"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
      </button>
    </div>
  );
});
PromptInputTextarea.displayName = "PromptInputTextarea";

const PromptInputSubmit = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { status?: string }
>(({ className, status, disabled, ...props }, ref) => (
  <button
    ref={ref}
    type="submit"
    disabled={disabled || status === "loading"}
    className={cn(
      "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md",
      "bg-primary text-primary-foreground hover:bg-primary/90",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      "disabled:pointer-events-none disabled:opacity-50",
      "transition-colors",
      className,
    )}
    title={status === "loading" ? "Sending..." : "Send message"}
    aria-label={status === "loading" ? "Sending..." : "Send message"}
    {...props}
  >
    {/* Send Icon (arrow) */}
    <svg
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 7l5 5m0 0l-5 5m5-5H6"
      />
    </svg>
  </button>
));
PromptInputSubmit.displayName = "PromptInputSubmit";

export { PromptInput, PromptInputTextarea, PromptInputSubmit };
