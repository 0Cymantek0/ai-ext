import * as React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { ProviderCardState } from "./settings-state";
import { motion } from "framer-motion";

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
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Configured Providers
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onAddClick}
          className="h-8 text-xs gap-1 hover:bg-primary/10 hover:text-primary transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Provider
        </Button>
      </div>

      {providers.length === 0 ? (
        <div className="text-center py-12 flex flex-col items-center justify-center border border-dashed border-border rounded-xl bg-muted/20">
          <p className="text-sm font-medium text-foreground">
            No providers configured yet
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Add a provider to get started with the AI integrations.
          </p>
          <Button
            variant="default"
            size="sm"
            onClick={onAddClick}
            className="mt-4 gap-1"
          >
            <Plus className="h-4 w-4" /> Add your first provider
          </Button>
        </div>
      ) : (
        <motion.div
          className="space-y-3"
          initial="hidden"
          animate="show"
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: {
                staggerChildren: 0.08,
              },
            },
          }}
        >
          {providers.map((p) => (
            <motion.div
              key={p.id}
              variants={{
                hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
                show: { opacity: 1, y: 0, filter: "blur(0px)" },
              }}
              className="rounded-xl border border-border/80 bg-card p-4 cursor-pointer hover:border-primary/30 hover:bg-accent/30 hover:shadow-md transition-all duration-300 group"
              whileHover={{ y: -2, scale: 1.005 }}
              whileTap={{ scale: 0.985 }}
              onClick={() => onSelect(p.id)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm flex items-center gap-2">
                    {p.name}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider font-semibold">
                      {p.type}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1.5 flex gap-3">
                    <span className={p.hasSavedKey ? "text-emerald-500 font-medium" : ""}>
                      {p.hasSavedKey ? "✓ Saved Key" : "No Key"}
                    </span>
                    <span className="opacity-50">•</span>
                    <span className={p.enabled ? "text-emerald-500 font-medium" : ""}>
                      {p.enabled ? "Enabled" : "Disabled"}
                    </span>
                    {p.modelLabel && (
                      <>
                        <span className="opacity-50">•</span>
                        <span className="truncate max-w-[150px]">
                          Model: {p.modelLabel}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  );
}
