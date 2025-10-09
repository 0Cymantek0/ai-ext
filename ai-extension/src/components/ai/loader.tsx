import * as React from "react"
import { cn } from "@/lib/utils"

const Loader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center gap-2", className)}
    {...props}
  >
    <div className="flex space-x-1">
      <div className="h-2 w-2 animate-pulse rounded-full bg-primary [animation-delay:-0.3s]" />
      <div className="h-2 w-2 animate-pulse rounded-full bg-primary [animation-delay:-0.15s]" />
      <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
    </div>
  </div>
))
Loader.displayName = "Loader"

export { Loader }

