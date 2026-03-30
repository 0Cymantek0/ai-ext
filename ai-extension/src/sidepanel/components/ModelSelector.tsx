import * as React from "react";
import { Sparkles, Cpu, Zap, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProviderSettingsSnapshot } from "@/shared/types/index.d";
import type { AgentRunMode } from "@/shared/agent-runtime/contracts";

export interface ModelSelectorProps {
  /** Which workflow this selector is operating for. */
  workflowMode: AgentRunMode;
  /** Currently selected model value (e.g. "auto" or "prov-id::model-id"). */
  selectedModel: string;
  /** Provider settings snapshot containing model sheet data. */
  settingsSnapshot: ProviderSettingsSnapshot | null;
  /** Called when user selects a model. */
  onSelect: (modelId: string) => void;
  /** Whether the selector is disabled. */
  disabled?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

type ModelIconType = "auto" | "local" | "fast" | "cloud";

interface ModelEntry {
  value: string;
  label: string;
  description: string;
  icon: ModelIconType;
  providerId: string;
  providerType: string;
  modelId: string;
}

function getModelIcon(iconType: ModelIconType): React.ReactNode {
  switch (iconType) {
    case "local":
      return <Cpu className="w-3.5 h-3.5" />;
    case "fast":
      return <Zap className="w-3.5 h-3.5" />;
    case "cloud":
      return <Cloud className="w-3.5 h-3.5" />;
    default:
      return <Sparkles className="w-3.5 h-3.5" />;
  }
}

function getProviderIcon(providerType: string): ModelIconType {
  if (providerType === "gemini-nano" || providerType === "ollama") return "local";
  if (providerType === "google" || providerType === "openai") return "cloud";
  return "fast";
}

/**
 * Build model options from the settings snapshot, matching the same logic
 * as buildChatModelOptions in ChatApp.tsx but returning a leaner shape
 * suited for the model selector dropdown.
 */
function buildModelOptions(
  snapshot: ProviderSettingsSnapshot | null,
): ModelEntry[] {
  if (!snapshot?.providers) {
    return [
      {
        value: "auto",
        label: "Auto",
        description: "Uses routing preferences",
        icon: "auto",
        providerId: "",
        providerType: "",
        modelId: "",
      },
    ];
  }

  const configuredOptions: ModelEntry[] = snapshot.providers
    .filter((provider) => provider.enabled)
    .flatMap((provider) => {
      const providerEntries = Object.values(snapshot.modelSheet)
        .filter(
          (entry) =>
            entry.providerId === provider.id &&
            entry.enabled !== false &&
            !entry.capabilities?.supportsTranscription &&
            !entry.modelId.toLowerCase().includes("embedding"),
        )
        .sort((a, b) => a.modelId.localeCompare(b.modelId));

      if (
        provider.modelId &&
        !providerEntries.some((entry) => entry.modelId === provider.modelId)
      ) {
        providerEntries.unshift({
          modelId: provider.modelId,
          providerId: provider.id,
          providerType: provider.type,
          name: provider.modelId,
        });
      }

      return providerEntries.map((entry) => ({
        value: `${provider.id}::${entry.modelId}`,
        label: `${provider.name} \u2022 ${entry.name || entry.modelId}`,
        description: `${provider.type} \u2022 ${entry.modelId}`,
        icon: getProviderIcon(provider.type),
        providerId: provider.id,
        providerType: provider.type,
        modelId: entry.modelId,
      }));
    });

  return [
    {
      value: "auto",
      label: "Auto",
      description: "Uses routing preferences",
      icon: "auto",
      providerId: "",
      providerType: "",
      modelId: "",
    },
    ...configuredOptions,
  ];
}

/**
 * ModelSelector provides a dropdown of configured models for a specific workflow.
 *
 * It builds model options from the ProviderSettingsSnapshot, showing an "Auto"
 * option (uses routing preferences) at the top, followed by all enabled
 * provider models. The workflowMode prop allows for future per-workflow model
 * recommendation or filtering.
 */
export function ModelSelector({
  workflowMode,
  selectedModel,
  settingsSnapshot,
  onSelect,
  disabled = false,
}: ModelSelectorProps) {
  const modelOptions = React.useMemo(
    () => buildModelOptions(settingsSnapshot),
    [settingsSnapshot],
  );

  const currentOption = React.useMemo(
    () =>
      modelOptions.find((opt) => opt.value === selectedModel) ?? {
        value: selectedModel,
        label: selectedModel === "auto" ? "Auto" : selectedModel,
        icon: "auto" as ModelIconType,
      },
    [modelOptions, selectedModel],
  );

  const isDisabled = disabled || !settingsSnapshot;

  const handleValueChange = React.useCallback(
    (value: string) => {
      onSelect(value);
    },
    [onSelect],
  );

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedModel}
        onValueChange={handleValueChange}
        disabled={isDisabled}
      >
        <SelectTrigger
          size="sm"
          className={cn(
            "h-8 min-w-0 max-w-full rounded-xl border border-border/50 bg-background/50 text-sm",
            "hover:bg-accent/50 transition-colors",
            isDisabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <SelectValue>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {getModelIcon(currentOption.icon)}
              <span className="truncate">{currentOption.label}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start">
          {modelOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="inline-flex items-center gap-2">
                {getModelIcon(option.icon)}
                <span>{option.label}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">
        Model for {workflowMode === "browser-action" ? "browser action" : "deep research"}
      </span>
    </div>
  );
}
