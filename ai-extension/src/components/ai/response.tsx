import * as React from "react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./markdown-renderer";

interface ResponseProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const Response = React.forwardRef<HTMLDivElement, ResponseProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "prose prose-sm dark:prose-invert max-w-full break-words",
          "prose-p:leading-relaxed prose-pre:p-0",
          className,
        )}
        {...props}
      >
        {typeof children === "string" ? (
          <MarkdownRenderer content={children} />
        ) : (
          children
        )}
      </div>
    );
  },
);
Response.displayName = "Response";

export { Response };
