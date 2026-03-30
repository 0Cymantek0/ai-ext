import * as React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { ProviderCardState } from "./settings-state";

interface ProviderOverviewTabProps {
  providers: ProviderCardState[];
  onAddClick: () => void;
  onSelect: (providerId: string) => void;
}

export function ProviderOverviewTab({
  providers,
  onAddClick,
  onSelect,
}: ProviderOverviewTabProps) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Configured Providers
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onAddClick}
          className="h-7 text-xs gap-1"
        >
          <Plus className="h-3 w-3" />
          Add Provider
        </Button>
      </div>

      {providers.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            No providers configured yet
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Add a provider to get started
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {providers.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-border p-3 cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => onSelect(p.id)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    {p.name}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wider">
                      {p.type}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                    <span className={p.hasSavedKey ? "text-green-600/80" : ""}>
                      {p.hasSavedKey ? "saved key" : "no key"}
                    </span>
                    <span>•</span>
                    <span className={p.enabled ? "text-green-600/80" : ""}>
                      {p.enabled ? "enabled" : "disabled"}
                    </span>
                    {p.modelLabel && (
                      <>
                        <span>•</span>
                        <span className="truncate max-w-[120px]">
                          model: {p.modelLabel}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
