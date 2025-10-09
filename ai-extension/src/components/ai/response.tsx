import * as React from "react"
import { cn } from "@/lib/utils"

interface ResponseProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

const Response = React.forwardRef<HTMLDivElement, ResponseProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "prose prose-sm dark:prose-invert max-w-none",
          "prose-p:leading-relaxed prose-pre:p-0",
          className
        )}
        {...props}
      >
        {typeof children === "string" ? (
          <div className="whitespace-pre-wrap">{children}</div>
        ) : (
          children
        )}
      </div>
    )
  }
)
Response.displayName = "Response"

export { Response }

