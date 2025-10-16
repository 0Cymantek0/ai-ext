import * as React from "react";
import { cn } from "@/lib/utils";

const Conversation = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-1 flex-col overflow-hidden", className)}
    {...props}
  />
));
Conversation.displayName = "Conversation";

const ConversationContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    bottomInsetRef?: React.RefObject<HTMLFormElement | null>;
    forceAutoScroll?: boolean;
  }
>(({ className, children, bottomInsetRef, forceAutoScroll, ...props }, ref) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [bottomInset, setBottomInset] = React.useState<number>(128); // fallback padding

  React.useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    // Only auto-scroll to bottom if user is already near the bottom.
    // This prevents jumping to the end while the user scrolls up.
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    const threshold = 12; // px tolerance for fractional scroll values
    const shouldAutoScroll = forceAutoScroll || distanceFromBottom <= threshold;
    if (shouldAutoScroll) {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    }
  }, [children, forceAutoScroll]);

  // Dynamically measure the bottom input's height so content never overlaps
  React.useEffect(() => {
    const formEl = bottomInsetRef?.current;
    if (!formEl) return;

    const measure = () => {
      const rect = formEl.getBoundingClientRect();
      // Add a small gap (16px) for visual breathing room
      setBottomInset(rect.height + 16);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(formEl);
    return () => ro.disconnect();
  }, [bottomInsetRef]);

  return (
    <div
      ref={(node) => {
        scrollRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      }}
      className={cn(
        "flex-1 space-y-4 overflow-y-auto scrollbar-custom p-4",
        className,
      )}
      style={{ paddingBottom: bottomInset }}
      {...props}
    >
      {children}
    </div>
  );
});
ConversationContent.displayName = "ConversationContent";

export { Conversation, ConversationContent };
