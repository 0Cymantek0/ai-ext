import * as React from "react";
import { Globe, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentRunMode } from "@/shared/agent-runtime/contracts";

export interface WorkflowTabsProps {
  activeMode: AgentRunMode;
  onChange: (mode: AgentRunMode) => void;
  disabled?: boolean;
}

const TABS: Array<{
  mode: AgentRunMode;
  label: string;
  description: string;
  icon: React.FC<{ className?: string }>;
}> = [
  {
    mode: "browser-action",
    label: "Browser Action",
    description: "Automate browser tasks",
    icon: Globe,
  },
  {
    mode: "deep-research",
    label: "Deep Research",
    description: "Research with evidence",
    icon: Search,
  },
];

/**
 * WorkflowTabs provides a pill-shaped, two-option tab selector for choosing
 * between browser-action and deep-research workflow modes.
 *
 * Each tab displays an icon, label, and short description. Active tab has a
 * distinct visual state with background + shadow. Disabled state grays out
 * both tabs and prevents interaction.
 */
export const WorkflowTabs: React.FC<WorkflowTabsProps> = ({
  activeMode,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="flex gap-1 p-1 bg-muted/50 rounded-full">
      {TABS.map(({ mode, label, description, icon: Icon }) => {
        const isActive = activeMode === mode;
        return (
          <button
            key={mode}
            type="button"
            disabled={disabled}
            onClick={() => onChange(mode)}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-2 px-3 rounded-full text-sm font-medium transition-all",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              disabled && "opacity-50 cursor-not-allowed",
            )}
            aria-pressed={isActive}
            data-testid={`workflow-tab-${mode}`}
          >
            <span className="flex items-center gap-1.5">
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </span>
            <span className="text-xs text-muted-foreground">{description}</span>
          </button>
        );
      })}
    </div>
  );
};
