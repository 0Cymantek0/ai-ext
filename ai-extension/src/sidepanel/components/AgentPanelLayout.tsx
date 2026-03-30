import React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared layout wrapper for agent workflow panels (browser-action, deep-research).
 *
 * Provides consistent visual structure with optional header and footer slots
 * wrapped in a card-like container matching the existing sidepanel panel styling.
 */
export interface AgentPanelLayoutProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export const AgentPanelLayout = React.forwardRef<
  HTMLDivElement,
  AgentPanelLayoutProps
>(({ children, header, footer, className }, ref) => {
  return (
    <section
      ref={ref}
      className={cn(
        "rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      {header && <div className="mb-2">{header}</div>}
      <div className="flex flex-col gap-3">{children}</div>
      {footer && <div className="mt-2">{footer}</div>}
    </section>
  );
});

AgentPanelLayout.displayName = "AgentPanelLayout";
