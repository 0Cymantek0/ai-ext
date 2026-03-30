import * as React from "react";
import { Button } from "@/components/ui/button";
import { Settings, X, Loader2 } from "lucide-react";
import { SettingsTabs, type TabId } from "./settings/SettingsTabs";
import { ProviderOverviewTab } from "./settings/ProviderOverviewTab";
import { buildProviderCards } from "./settings/settings-state";
import { SpeechSettingsSection } from "./SpeechSettingsSection";
import type { ProviderSettingsSnapshot } from "../../shared/types";

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
      if (response?.success && response.data) {
        setSnapshot(response.data as ProviderSettingsSnapshot);
      } else {
        setError("Failed to load settings snapshot");
      }
    } catch {
      setError("Failed to load settings snapshot");
    } finally {
      setIsLoading(false);
    }
  };

  const handleProviderSelect = (providerId: string) => {
    // Placeholder for when provider details are implemented
    console.log("Selected provider:", providerId);
  };

  const providerCards = React.useMemo(
    () => buildProviderCards(snapshot),
    [snapshot],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Provider Settings</h2>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close settings"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col">
        <SettingsTabs activeTab={activeTab} onChange={setActiveTab} />

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 mb-4">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1">
            {activeTab === "providers" && (
              <ProviderOverviewTab
                providers={providerCards}
                onAddClick={() => console.log("Add provider clicked")}
                onSelect={handleProviderSelect}
              />
            )}

            {activeTab === "routing" && (
              <div className="text-sm text-muted-foreground text-center py-8">
                Routing settings coming soon.
              </div>
            )}

            {activeTab === "speech" && <SpeechSettingsSection />}
          </div>
        )}
      </div>
    </div>
  );
}
