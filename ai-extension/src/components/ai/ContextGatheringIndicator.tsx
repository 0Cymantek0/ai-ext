/**
 * Context Gathering Indicator
 *
 * Shows real-time progress when AI is gathering context from tabs and other sources
 * Similar to tool call indicators in agentic AI systems
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ContextStep {
  id: string;
  label: string;
  icon: string;
  status: "pending" | "loading" | "complete" | "error";
  detail?: string;
}

export interface ContextGatheringIndicatorProps {
  steps: ContextStep[];
  className?: string;
}

export function ContextGatheringIndicator({
  steps,
  className,
}: ContextGatheringIndicatorProps) {
  if (steps.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-border/50 bg-muted/30 p-3 mb-3 backdrop-blur-sm",
        "animate-in fade-in-0 slide-in-from-top-2 duration-300",
        className,
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs font-medium text-muted-foreground">
            Gathering context
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        {steps.map((step) => (
          <ContextStepItem key={step.id} step={step} />
        ))}
      </div>
    </div>
  );
}

function ContextStepItem({ step }: { step: ContextStep }) {
  const getStatusIcon = () => {
    switch (step.status) {
      case "loading":
        return (
          <div className="h-3 w-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        );
      case "complete":
        return (
          <svg
            className="h-3 w-3 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        );
      case "error":
        return (
          <svg
            className="h-3 w-3 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        );
      default:
        return <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />;
    }
  };

  const getTextColor = () => {
    switch (step.status) {
      case "loading":
        return "text-foreground";
      case "complete":
        return "text-muted-foreground";
      case "error":
        return "text-red-500";
      default:
        return "text-muted-foreground/50";
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs transition-all duration-200",
        step.status === "loading" &&
          "animate-in fade-in-0 slide-in-from-left-1",
      )}
    >
      <div className="flex-shrink-0">{getStatusIcon()}</div>
      <span className="flex-shrink-0">{step.icon}</span>
      <span className={cn("flex-1 truncate", getTextColor())}>
        {step.label}
      </span>
      {step.detail && (
        <span className="text-[10px] text-muted-foreground/60 truncate max-w-[100px]">
          {step.detail}
        </span>
      )}
    </div>
  );
}
