import * as React from "react"
import { cn } from "@/lib/utils"

const PromptInput = React.forwardRef<
  HTMLFormElement,
  React.FormHTMLAttributes<HTMLFormElement>
>(({ className, ...props }, ref) => (
  <form
    ref={ref}
    className={cn("relative flex flex-shrink-0 items-center gap-2 border-t bg-background p-4", className)}
    {...props}
  />
))
PromptInput.displayName = "PromptInput"

const PromptInputTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`
    }
  }, [props.value])

  return (
    <textarea
      ref={(node) => {
        textareaRef.current = node
        if (typeof ref === "function") {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      }}
      className={cn(
        "flex-1 resize-none bg-transparent px-4 py-2",
        "min-h-[40px] max-h-[150px]",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "rounded-md border border-input",
        className
      )}
      rows={1}
      {...props}
    />
  )
})
PromptInputTextarea.displayName = "PromptInputTextarea"

const PromptInputSubmit = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { status?: string }
>(({ className, status, disabled, ...props }, ref) => (
  <button
    ref={ref}
    type="submit"
    disabled={disabled || status === "loading"}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md px-4 py-2",
      "bg-primary text-primary-foreground hover:bg-primary/90",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      "disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  >
    {status === "loading" ? "Sending..." : "Send"}
  </button>
))
PromptInputSubmit.displayName = "PromptInputSubmit"

export { PromptInput, PromptInputTextarea, PromptInputSubmit }

