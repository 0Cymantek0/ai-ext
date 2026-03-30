import React from "react";
import { cn } from "@/lib/utils";
import { STATUS_DISPLAY, isTerminalStatus } from "@/shared/agent-runtime/selectors";
import type { AgentRunStatus } from "@/shared/agent-runtime/contracts";
import {
  ShieldAlert,
  Play,
  Pause,
  Loader,
  CheckCircle,
  XCircle,
  Ban,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ShieldAlert,
  Play,
  Pause,
  Loader,
  CheckCircle,
  XCircle,
  Ban,
};

interface AgentRunStatusBadgeProps {
  status: AgentRunStatus;
  className?: string;
}

export function AgentRunStatusBadge({ status, className }: AgentRunStatusBadgeProps) {
  const display = STATUS_DISPLAY[status];
  const IconComponent = ICON_MAP[display.icon] ?? Loader;
  const isWaitingApproval = status === "waiting_approval";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        display.color,
        isWaitingApproval && "animate-pulse bg-orange-500/10 border border-orange-500/30",
        !isWaitingApproval && !isTerminalStatus(status) && "bg-background border border-border/60",
        isTerminalStatus(status) && "bg-muted/50 border border-border/40",
        className,
      )}
    >
      <IconComponent className="h-3.5 w-3.5" />
      {display.label}
    </span>
  );
}
