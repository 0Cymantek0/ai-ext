import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProviderSettingsSnapshot } from "../../../shared/types";
import { motion, AnimatePresence } from "framer-motion";

export interface RoutingSettingsTabProps {
  snapshot: ProviderSettingsSnapshot;
  onUpdate: () => void;
}

type CapabilityKey = "chat" | "embeddings" | "speech";

const CAPABILITIES: Array<{
  key: CapabilityKey;
  title: string;
  description: string;
}> = [
  {
    key: "chat",
    title: "Chat",
    description: "Primary provider for assistant responses.",
  },
  {
    key: "embeddings",
    title: "Embeddings",
    description: "Provider used for vector indexing and semantic search.",
  },
  {
    key: "speech",
    title: "Speech",
    description: "Default provider assigned for transcription workflows.",
  },
];

export function RoutingSettingsTab({
  snapshot,
  onUpdate,
}: RoutingSettingsTabProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const enabledProviders = React.useMemo(
    () => snapshot.providers.filter((provider) => provider.enabled),
    [snapshot.providers],
  );

  const providerUsage = React.useMemo(() => {
    return snapshot.providers.reduce<Record<string, string[]>>(
      (acc, provider) => {
        const usage: string[] = [];
        if (snapshot.routingPreferences.chat === provider.id)
          usage.push("chat");
        if (snapshot.routingPreferences.embeddings === provider.id) {
          usage.push("embeddings");
        }
        if (
          snapshot.routingPreferences.speech === provider.id ||
          snapshot.speechSettings.provider.providerId === provider.id
        ) {
          usage.push("speech");
        }
        acc[provider.id] = usage;
        return acc;
      },
      {},
    );
  }, [snapshot]);

  const persistRouting = React.useCallback(
    async (
      routingPreferences: ProviderSettingsSnapshot["routingPreferences"],
    ) => {
      setIsSaving(true);
      try {
        await chrome.runtime.sendMessage({
          kind: "SETTINGS_ROUTING_SAVE",
          payload: { routingPreferences },
        });
        onUpdate();
      } finally {
        setIsSaving(false);
      }
    },
    [onUpdate],
  );

  const handleCapabilityChange = async (
    capability: CapabilityKey,
    providerId: string,
  ) => {
    await persistRouting({
      ...snapshot.routingPreferences,
      [capability]: providerId || null,
    });
  };

  const toggleFallbackProvider = async (
    providerId: string,
    checked: boolean,
  ) => {
    const nextFallbackChain = checked
      ? [...snapshot.routingPreferences.fallbackChain, providerId]
      : snapshot.routingPreferences.fallbackChain.filter(
          (id) => id !== providerId,
        );
    await persistRouting({
      ...snapshot.routingPreferences,
      fallbackChain: nextFallbackChain,
    });
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Routing</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Assign providers by capability first, then open backup controls only
          when you need them.
        </p>
      </div>

      <motion.div 
        className="space-y-4"
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: {
              staggerChildren: 0.1,
            },
          },
        }}
      >
        {CAPABILITIES.map((capability) => (
          <motion.div
            key={capability.key}
            variants={{
              hidden: { opacity: 0, x: -10 },
              show: { opacity: 1, x: 0 },
            }}
            className="rounded-2xl border border-border/60 bg-card/40 p-5 shadow-sm hover:shadow-md transition-all duration-300 hover:border-primary/20"
          >
            <div className="mb-4">
              <h4 className="text-sm font-bold tracking-tight">{capability.title}</h4>
              <p className="text-[11px] leading-relaxed text-muted-foreground/80 mt-1">
                {capability.description}
              </p>
            </div>
            <Select
              value={snapshot.routingPreferences[capability.key] || "default"}
              onValueChange={(val) =>
                void handleCapabilityChange(capability.key, val === "default" ? "" : val)
              }
              disabled={isSaving}
            >
              <SelectTrigger className="w-full h-10">
                <SelectValue placeholder="Use default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Use default</SelectItem>
                {enabledProviders.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-border/30">
              <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest italic">
                {snapshot.routingPreferences[capability.key]
                  ? "explicit override"
                  : "using smart default"}
              </p>
              {snapshot.routingPreferences[capability.key] && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold border border-emerald-500/20">
                  Assigned
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </motion.div>

      <div className="rounded-lg border border-border">
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 py-3 text-sm font-medium hover:bg-accent/50 transition-colors rounded-lg"
          onClick={() => setIsAdvancedOpen((current) => !current)}
        >
          <span>Advanced</span>
          <span className="text-xs text-muted-foreground">
            {isAdvancedOpen ? "Hide" : "Show"}
          </span>
        </button>
        <AnimatePresence>
          {isAdvancedOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="border-t border-border px-3 py-3 space-y-3">
                <div>
                  <h4 className="text-sm font-medium">Fallback chain</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Choose backup providers used when the primary assignment fails.
                  </p>
                </div>
            <div className="space-y-2">
              {enabledProviders.map((provider) => (
                <label
                  key={provider.id}
                  className="flex items-start gap-2 rounded-md border border-border p-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={snapshot.routingPreferences.fallbackChain.includes(
                      provider.id,
                    )}
                    onChange={(event) =>
                      void toggleFallbackProvider(
                        provider.id,
                        event.target.checked,
                      )
                    }
                    className="mt-0.5"
                    disabled={isSaving}
                  />
                  <span className="flex-1">
                    {(() => {
                      const usage = providerUsage[provider.id] ?? [];
                      return (
                        <>
                          <span className="font-medium">{provider.name}</span>
                          <span className="block text-xs text-muted-foreground mt-1">
                            {usage.length
                              ? `Used for ${usage.join(", ")}`
                              : "Not currently assigned to chat, embeddings, or speech"}
                          </span>
                        </>
                      );
                    })()}
                  </span>
                </label>
              ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      <div className="rounded-lg border border-border p-3">
        <h4 className="text-sm font-medium">Provider usage</h4>
        <div className="mt-2 space-y-2">
          {snapshot.providers.map((provider) =>
            (() => {
              const usage = providerUsage[provider.id] ?? [];
              return (
                <div
                  key={provider.id}
                  className="flex items-center justify-between text-sm gap-3"
                >
                  <span>{provider.name}</span>
                  <span className="text-xs text-muted-foreground text-right">
                    {usage.length
                      ? `Assigned to ${usage.join(", ")}`
                      : "Not assigned"}
                  </span>
                </div>
              );
            })(),
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onUpdate}
          disabled={isSaving}
        >
          Refresh assignments
        </Button>
      </div>
    </section>
  );
}
