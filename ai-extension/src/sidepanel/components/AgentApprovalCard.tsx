import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ExternalLink } from "lucide-react";
import type { AgentPendingApproval } from "@/shared/agent-runtime/contracts";

interface AgentApprovalCardProps {
  approval: AgentPendingApproval;
  onResolve: (resolution: "approved" | "rejected") => void;
  disabled?: boolean;
}

function truncateMiddle(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const half = Math.floor((maxLen - 3) / 2);
  return text.slice(0, half) + "..." + text.slice(text.length - half);
}

export function AgentApprovalCard({ approval, onResolve, disabled }: AgentApprovalCardProps) {
  const ctx = approval.targetContext;

  return (
    <div className="mt-3 rounded-xl border border-orange-500/30 bg-orange-500/5 px-3 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-orange-700 dark:text-orange-300">
        <ShieldAlert className="h-4 w-4" />
        Action Requires Approval
      </div>

      <p className="mt-2 text-sm text-foreground">
        {approval.reason}
      </p>

      {approval.toolName && (
        <p className="mt-1 text-xs text-muted-foreground">
          Tool: <span className="font-mono">{approval.toolName}</span>
        </p>
      )}

      {ctx?.tabUrl && (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{truncateMiddle(ctx.tabUrl, 60)}</span>
        </p>
      )}

      {ctx?.selector && (
        <p className="mt-1 text-xs text-muted-foreground">
          Element: <span className="font-mono text-foreground/80">{ctx.selector}</span>
        </p>
      )}

      {ctx?.textPreview && (
        <p className="mt-1 text-xs text-muted-foreground">
          Text to type: <span className="font-mono text-foreground/80">{ctx.textPreview}</span>
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onResolve("rejected")}
          disabled={disabled}
          className="text-xs"
        >
          Reject
        </Button>
        <Button
          size="sm"
          onClick={() => onResolve("approved")}
          disabled={disabled}
          className="text-xs"
        >
          Approve
        </Button>
      </div>
    </div>
  );
}
