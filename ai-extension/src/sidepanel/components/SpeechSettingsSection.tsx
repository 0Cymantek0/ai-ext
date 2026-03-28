import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

/**
 * STT provider entries available for selection.
 * In a full implementation this would come from the model catalog,
 * but for the minimal settings surface we use a static list
 * seeded from the routing types.
 */
const STT_PROVIDERS = [
  {
    providerId: "openai-stt",
    providerType: "openai",
    label: "OpenAI Whisper",
    models: ["whisper-1"],
    supportsTranslation: true,
    supportsWordTimestamps: true,
    supportsDiarization: false,
  },
  {
    providerId: "openai-stt-gpt4o",
    providerType: "openai",
    label: "OpenAI GPT-4o Transcribe",
    models: ["gpt-4o-transcribe", "gpt-4o-mini-transcribe"],
    supportsTranslation: false,
    supportsWordTimestamps: true,
    supportsDiarization: false,
  },
  {
    providerId: "groq-stt",
    providerType: "groq",
    label: "Groq Whisper",
    models: ["whisper-large-v3", "whisper-large-v3-turbo", "distil-whisper-large-v3-en"],
    supportsTranslation: true,
    supportsWordTimestamps: true,
    supportsDiarization: false,
  },
  {
    providerId: "nvidia-stt",
    providerType: "nvidia",
    label: "NVIDIA Parakeet",
    models: ["nvidia/parakeet-ctc-1.1b-asr", "nvidia/parakeet-rnnt-1.1b-asr", "nvidia/canary-1b-flash"],
    supportsTranslation: false,
    supportsWordTimestamps: true,
    supportsDiarization: true,
  },
];

interface SpeechSettingsSectionProps {
  className?: string;
}

export function SpeechSettingsSection({ className }: SpeechSettingsSectionProps) {
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

  // Get selected provider config for provider-aware controls
  const selectedProvider = STT_PROVIDERS.find(
    (p) => p.providerId === settings.provider.providerId,
  );

  const handleProviderChange = (providerId: string) => {
    const provider = STT_PROVIDERS.find((p) => p.providerId === providerId);
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
    <div className={className}>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
        Speech-to-Text Settings
      </h3>

      <div className="space-y-3">
        {/* STT Provider */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            STT Provider
          </label>
          <select
            value={settings.provider.providerId}
            onChange={(e) => handleProviderChange(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">Select a provider</option>
            {STT_PROVIDERS.map((p) => (
              <option key={p.providerId} value={p.providerId}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* STT Model */}
        {selectedProvider && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              STT Model
            </label>
            <select
              value={settings.provider.modelId}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm"
            >
              {selectedProvider.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Language */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Language
          </label>
          <Input
            value={settings.language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            placeholder="en"
            className="h-9 text-sm"
          />
        </div>

        {/* Timestamp Granularity */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Timestamp Granularity
          </label>
          <select
            value={settings.timestampGranularity}
            onChange={(e) =>
              handleTimestampGranularityChange(
                e.target.value as "none" | "segment" | "word",
              )
            }
            className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="none">None</option>
            <option value="segment">Segment</option>
            <option value="word">Word-level</option>
          </select>
        </div>

        {/* Provider-aware advanced controls */}
        {selectedProvider && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Advanced Options
            </p>

            {/* Translation - only if provider supports it */}
            {selectedProvider.supportsTranslation && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    (settings.advancedOptions as Record<string, unknown>)
                      ?.enableTranslation === true
                  }
                  onChange={(e) =>
                    handleAdvancedOption("enableTranslation", e.target.checked)
                  }
                  className="rounded border-input"
                />
                <span>Enable translation (output in English)</span>
              </label>
            )}

            {/* Diarization - only if provider supports it */}
            {selectedProvider.supportsDiarization && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    (settings.advancedOptions as Record<string, unknown>)
                      ?.enableDiarization === true
                  }
                  onChange={(e) =>
                    handleAdvancedOption("enableDiarization", e.target.checked)
                  }
                  className="rounded border-input"
                />
                <span>Enable speaker diarization</span>
              </label>
            )}

            {/* No advanced options available for this provider */}
            {!selectedProvider.supportsTranslation &&
              !selectedProvider.supportsDiarization && (
                <p className="text-xs text-muted-foreground/60">
                  No additional options for this provider
                </p>
              )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {/* Save indicator */}
        {saved && (
          <p className="text-xs text-green-600">Settings saved</p>
        )}

        {/* Save Button */}
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !settings.provider.providerId}
          className="w-full"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Saving...
            </>
          ) : (
            "Save Speech Settings"
          )}
        </Button>
      </div>
    </div>
  );
}
