import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProviderSettingsSnapshot } from "../../shared/types";
import { motion } from "framer-motion";

interface SpeechSettingsSectionProps {
  className?: string;
  snapshot: ProviderSettingsSnapshot;
  onUpdate?: () => void;
}

export function SpeechSettingsSection({
  className,
  snapshot,
  onUpdate,
}: SpeechSettingsSectionProps) {
  const [settings, setSettings] = React.useState({
    provider: { providerId: "", modelId: "" },
    language: "en",
    timestampGranularity: "segment" as "none" | "segment" | "word",
    advancedOptions: {} as Record<string, unknown>,
  });
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  // Load current settings on mount
  React.useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "SPEECH_SETTINGS_LOAD",
        payload: {},
      });
      if (response?.success && response.data?.settings) {
        setSettings(response.data.settings);
      }
    } catch {
      // Use defaults
    } finally {
      setIsLoading(false);
    }
  };

  const speechProviders = React.useMemo(() => {
    const modelEntries = Object.values(snapshot.modelSheet);

    return snapshot.providers
      .filter((provider) => provider.enabled)
      .map((provider) => {
        const providerModels = modelEntries.filter(
          (model) =>
            model.providerId === provider.id &&
            (model.capabilities?.supportsTranscription ||
              model.modelId === snapshot.speechSettings.provider.modelId),
        );

        const supportsTranslation =
          provider.type === "openai" || provider.type === "groq";
        const supportsDiarization = provider.type === "nvidia";
        const supportsWordTimestamps = providerModels.some(
          (model) => model.capabilities?.supportsWordTimestamps,
        );

        return {
          providerId: provider.id,
          providerType: provider.type,
          label: provider.name,
          models: providerModels.map((model) => model.modelId),
          supportsTranslation,
          supportsWordTimestamps,
          supportsDiarization,
        };
      })
      .filter(
        (provider) =>
          provider.models.length > 0 ||
          provider.providerId === settings.provider.providerId,
      );
  }, [snapshot, settings.provider.providerId]);

  const selectedProvider = speechProviders.find(
    (provider) => provider.providerId === settings.provider.providerId,
  );

  const handleProviderChange = (providerId: string) => {
    const provider = speechProviders.find((p) => p.providerId === providerId);
    setSettings((prev) => ({
      ...prev,
      provider: {
        providerId,
        modelId: provider?.models[0] ?? "",
      },
    }));
    setSaved(false);
  };

  const handleModelChange = (modelId: string) => {
    setSettings((prev) => ({
      ...prev,
      provider: { ...prev.provider, modelId },
    }));
    setSaved(false);
  };

  const handleLanguageChange = (language: string) => {
    setSettings((prev) => ({ ...prev, language }));
    setSaved(false);
  };

  const handleTimestampGranularityChange = (
    granularity: "none" | "segment" | "word",
  ) => {
    setSettings((prev) => ({ ...prev, timestampGranularity: granularity }));
    setSaved(false);
  };

  const handleAdvancedOption = (key: string, value: unknown) => {
    setSettings((prev) => ({
      ...prev,
      advancedOptions: { ...prev.advancedOptions, [key]: value },
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "SPEECH_SETTINGS_SAVE",
        payload: settings,
      });
      if (response?.success) {
        setSaved(true);
        onUpdate?.();
      } else {
        setError(response?.error?.message ?? "Failed to save speech settings");
      }
    } catch {
      setError("Failed to save speech settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <motion.div 
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: {
            staggerChildren: 0.05,
          },
        },
      }}
    >
      <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Speech Intelligence
        </h3>
      </motion.div>

      <div className="space-y-3">
        <motion.div 
          variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
          className="grid grid-cols-1 gap-4"
        >
          {/* STT Header Card */}
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5 shadow-sm space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-tight mb-2">
                Provider & Model
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  value={settings.provider.providerId || "none"}
                  onValueChange={(val) => handleProviderChange(val === "none" ? "" : val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select provider</SelectItem>
                    {speechProviders.map((p) => (
                      <SelectItem key={p.providerId} value={p.providerId}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedProvider && (
                  <Select
                    value={settings.provider.modelId || "none"}
                    onValueChange={(val) => handleModelChange(val === "none" ? "" : val)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select model</SelectItem>
                      {selectedProvider.models.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>

          {/* Configuration Card */}
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5 shadow-sm space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-tight mb-2">
                  Language
                </label>
                <Input
                  value={settings.language}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  placeholder="en"
                  className="h-10 text-sm rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-tight mb-2">
                  Granularity
                </label>
                <Select
                  value={settings.timestampGranularity}
                  onValueChange={(val) =>
                    handleTimestampGranularityChange(
                      val as "none" | "segment" | "word",
                    )
                  }
                >
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue placeholder="Granularity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="segment">Segment</SelectItem>
                    <SelectItem value="word">Word-level</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Advanced Card */}
          {selectedProvider && (selectedProvider.supportsTranslation || selectedProvider.supportsDiarization) && (
            <div className="rounded-2xl border border-border/60 bg-card/40 p-5 shadow-sm space-y-4">
              <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-tight">
                Advanced Features
              </label>
              <div className="space-y-3">
                {selectedProvider.supportsTranslation && (
                  <label className="group flex items-center justify-between p-3 rounded-xl border border-border/40 hover:bg-accent/30 transition-all cursor-pointer">
                    <span className="text-sm font-medium">Auto-translation (to English)</span>
                    <input
                      type="checkbox"
                      checked={(settings.advancedOptions as Record<string, unknown>)?.enableTranslation === true}
                      onChange={(e) => handleAdvancedOption("enableTranslation", e.target.checked)}
                      className="size-4 rounded-md border-input accent-primary"
                    />
                  </label>
                )}
                {selectedProvider.supportsDiarization && (
                  <label className="group flex items-center justify-between p-3 rounded-xl border border-border/40 hover:bg-accent/30 transition-all cursor-pointer">
                    <span className="text-sm font-medium">Speaker Diarization</span>
                    <input
                      type="checkbox"
                      checked={(settings.advancedOptions as Record<string, unknown>)?.enableDiarization === true}
                      onChange={(e) => handleAdvancedOption("enableDiarization", e.target.checked)}
                      className="size-4 rounded-md border-input accent-primary"
                    />
                  </label>
                )}
              </div>
            </div>
          )}
        </motion.div>

        {/* Status Messaging */}
        <div className="px-2">
          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3"
            >
              <p className="text-xs text-destructive font-medium">{error}</p>
            </motion.div>
          )}

          {saved && (
            <motion.p 
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[11px] text-emerald-600 font-bold uppercase tracking-widest text-center"
            >
              ✓ Preferences Synchronized
            </motion.p>
          )}
        </div>

        {/* Primary Action */}
        <div className="pt-4">
          <Button
            type="button"
            size="lg"
            onClick={handleSave}
            disabled={isSaving || !settings.provider.providerId}
            className="w-full rounded-2xl h-12 shadow-lg shadow-primary/20 transition-all active:scale-[0.98] hover:shadow-xl hover:shadow-primary/30"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Updating Engine...
              </>
            ) : (
              "Save Speech Configuration"
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
