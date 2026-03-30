import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Settings, X, Loader2 } from "lucide-react";
import { SettingsTabs, type TabId } from "./settings/SettingsTabs";
import { ProviderOverviewTab } from "./settings/ProviderOverviewTab";
import { AddProviderFlow } from "./settings/AddProviderFlow";
import { ProviderDetailView } from "./settings/ProviderDetailView";
import { RoutingSettingsTab } from "./settings/RoutingSettingsTab";
import { SpeechSettingsTab } from "./settings/SpeechSettingsTab";
import { buildProviderCards } from "./settings/settings-state";
import type { ProviderSettingsSnapshot } from "../../shared/types";
import { motion, AnimatePresence } from "framer-motion";

interface ProviderSettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProviderSettingsSheet({
  isOpen,
  onClose,
}: ProviderSettingsSheetProps) {
  const [activeTab, setActiveTab] = React.useState<TabId>("providers");
  const [snapshot, setSnapshot] =
    React.useState<ProviderSettingsSnapshot | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isAddingProvider, setIsAddingProvider] = React.useState(false);
  const [selectedProviderId, setSelectedProviderId] = React.useState<
    string | null
  >(null);

  React.useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "SETTINGS_SNAPSHOT_LOAD",
        payload: {},
      });
      const snapshotData =
        response?.success && response.data ? response.data : response;

      if (
        snapshotData &&
        Array.isArray(snapshotData.providers) &&
        snapshotData.modelSheet &&
        snapshotData.routingPreferences &&
        snapshotData.speechSettings
      ) {
        setSnapshot(snapshotData as ProviderSettingsSnapshot);
      } else {
        setError("Failed to load settings snapshot");
      }
    } catch {
      setError("Failed to load settings snapshot");
    } finally {
      setIsLoading(false);
    }
  };

  const providerCards = React.useMemo(
    () => buildProviderCards(snapshot),
    [snapshot],
  );

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-md">
      <div className="absolute inset-0 bg-background/95" />
      <div className="relative z-10 flex h-full flex-col text-foreground">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b bg-background/50 px-5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 rounded-lg bg-primary/10 items-center justify-center">
              <Settings className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-sm font-semibold">Provider Settings</h2>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close settings"
            className="hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
          <SettingsTabs activeTab={activeTab} onChange={setActiveTab} />

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 mb-4">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          {isLoading && !snapshot ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex-1 relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={
                    activeTab === "providers"
                      ? isAddingProvider
                        ? "add-provider"
                        : selectedProviderId
                          ? "provider-detail"
                          : "provider-overview"
                      : activeTab
                  }
                  initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="h-full"
                >
                  {activeTab === "providers" &&
                    (isAddingProvider ? (
                      <AddProviderFlow
                        onBack={() => setIsAddingProvider(false)}
                        onComplete={() => {
                          setIsAddingProvider(false);
                          loadSettings();
                        }}
                      />
                    ) : selectedProviderId &&
                      snapshot?.providers.find(
                        (p) => p.id === selectedProviderId,
                      ) ? (
                      <ProviderDetailView
                        provider={
                          snapshot.providers.find(
                            (p) => p.id === selectedProviderId,
                          )!
                        }
                        modelSheet={snapshot?.modelSheet || {}}
                        onBack={() => setSelectedProviderId(null)}
                        onUpdate={loadSettings}
                      />
                    ) : (
                      <ProviderOverviewTab
                        providers={providerCards}
                        onAddClick={() => setIsAddingProvider(true)}
                        onSelect={setSelectedProviderId}
                      />
                    ))}

                  {activeTab === "routing" && snapshot && (
                    <RoutingSettingsTab
                      snapshot={snapshot}
                      onUpdate={loadSettings}
                    />
                  )}

                  {activeTab === "speech" && snapshot && (
                    <SpeechSettingsTab
                      snapshot={snapshot}
                      onUpdate={loadSettings}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
