import * as React from "react"
import { cn } from "@/lib/utils"

const Conversation = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-1 flex-col overflow-hidden", className)}
    {...props}
  />
))
Conversation.displayName = "Conversation"

const ConversationContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  
  React.useEffect(() => {
    const element = scrollRef.current
    if (element) {
      element.scrollTop = element.scrollHeight
    }
  }, [children])

  return (
    <div
      ref={(node) => {
        scrollRef.current = node
        if (typeof ref === "function") {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      }}
      className={cn(
        "flex-1 space-y-4 overflow-y-auto scrollbar-custom p-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
ConversationContent.displayName = "ConversationContent"

export { Conversation, ConversationContent }

