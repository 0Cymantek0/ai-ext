import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pause, Play, X } from "lucide-react";
import type { AgentRunStatus } from "@/shared/agent-runtime/contracts";
import { isTerminalStatus } from "@/shared/agent-runtime/selectors";

interface AgentRunControlsProps {
  status: AgentRunStatus;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function AgentRunControls({ status, onPause, onResume, onCancel, disabled }: AgentRunControlsProps) {
  if (isTerminalStatus(status)) return null;

  const showPause = status === "running";
  const showResume = status === "paused" || status === "waiting_approval";
  const showCancel = status === "running" || status === "paused" || status === "waiting_approval";

  if (!showPause && !showResume && !showCancel) return null;

  return (
    <div className="flex items-center gap-2 mt-2">
      {showPause && (
        <Button
          size="sm"
          variant="outline"
          onClick={onPause}
          disabled={disabled}
          className="text-xs gap-1"
        >
          <Pause className="h-3 w-3" />
          Pause
        </Button>
      )}
      {showResume && (
        <Button
          size="sm"
          variant="outline"
          onClick={onResume}
          disabled={disabled}
          className="text-xs gap-1"
        >
          <Play className="h-3 w-3" />
          Resume
        </Button>
      )}
      {showCancel && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          disabled={disabled}
          className="text-xs gap-1 text-red-500 hover:text-red-600 hover:bg-red-500/10"
        >
          <X className="h-3 w-3" />
          Cancel
        </Button>
      )}
    </div>
  );
}
