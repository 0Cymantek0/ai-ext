import * as React from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  from: "user" | "assistant" | "system";
}

const Message = React.forwardRef<HTMLDivElement, MessageProps>(
  ({ className, from, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "group flex gap-3 py-4",
          from === "user" && "flex-row-reverse",
          from === "system" && "justify-center",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
Message.displayName = "Message";

const MessageAvatar = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof Avatar> & { src?: string; name?: string }
>(({ src, name, className, ...props }, ref) => {
  const initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "AI";

  return (
    <Avatar ref={ref} className={cn("h-8 w-8", className)} {...props}>
      {src ? <AvatarImage src={src} alt={name || "Avatar"} /> : null}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
});
MessageAvatar.displayName = "MessageAvatar";

const MessageContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-1 flex-col gap-2 text-sm min-w-0", className)}
    {...props}
  />
));
MessageContent.displayName = "MessageContent";

export { Message, MessageAvatar, MessageContent };
