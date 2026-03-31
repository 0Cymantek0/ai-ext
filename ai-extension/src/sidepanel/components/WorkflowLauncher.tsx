import * as React from "react";
import { cn } from "@/lib/utils";
import type { ProviderSettingsSnapshot } from "@/shared/types/index.d";
import type {
  AgentRun,
  AgentRunEvent,
} from "@/shared/agent-runtime/contracts";
import type {
  AgentPanelState,
  AgentTimelineEntry,
} from "@/shared/agent-runtime/selectors";
import { WorkflowTabs } from "./WorkflowTabs";
import { ModelSelector } from "./ModelSelector";
import { BrowserActionPanel } from "./BrowserActionPanel";
import { DeepResearchPanel } from "./DeepResearchPanel";
import type { AgentRunMode } from "@/shared/agent-runtime/contracts";
import type { ModelOption } from "@/components/ui/ai-input-with-file";

// ── Helpers ────────────────────────────────────────────────────────────────────

type ChatModelOption = ModelOption & {
  providerId?: string;
  providerType?: string;
  modelId?: string;
};

const AUTO_MODEL_OPTION: ChatModelOption = {
  value: "auto",
  label: "Auto",
  description: "Automatically route across your configured providers.",
  icon: "auto",
};

const isChatModelEntry = (
  entry: ProviderSettingsSnapshot["modelSheet"][string],
): boolean => {
  const normalizedModelId = entry.modelId.toLowerCase();
  if (normalizedModelId.includes("embedding")) return false;
  return !entry.capabilities?.supportsTranscription;
};

const getModelOptionIcon = (
  providerType?: string,
): NonNullable<ChatModelOption["icon"]> => {
  if (providerType === "gemini-nano" || providerType === "ollama") return "local";
  if (providerType === "google" || providerType === "openai") return "cloud";
  return "fast";
};

/**
 * Build model options from the settings snapshot, matching the same logic
 * as buildChatModelOptions in ChatApp.tsx.
 */
const buildModelOptions = (
  snapshot: ProviderSettingsSnapshot | null,
): ChatModelOption[] => {
  if (!snapshot?.providers) return [AUTO_MODEL_OPTION];

  const configuredOptions = snapshot.providers
    .filter((provider) => provider.enabled)
    .flatMap((provider) => {
      const providerEntries = Object.values(snapshot.modelSheet)
        .filter(
          (entry) =>
            entry.providerId === provider.id &&
            entry.enabled !== false &&
            (provider.type !== "gemini-nano" || entry.modelId === "gemini-nano") &&
            isChatModelEntry(entry),
        )
        .sort((left, right) => {
          if (left.modelId === provider.modelId) return -1;
          if (right.modelId === provider.modelId) return 1;
          return left.modelId.localeCompare(right.modelId);
        });

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
        icon: getModelOptionIcon(provider.type),
        providerId: provider.id,
        providerType: provider.type,
        modelId: entry.modelId,
      }));
    });

  return [AUTO_MODEL_OPTION, ...configuredOptions];
};

const resolveSelectedModel = (
  selectedValue: string,
  modelOptions: ChatModelOption[],
): ChatModelOption => {
  return (
    modelOptions.find((option) => option.value === selectedValue) ||
    AUTO_MODEL_OPTION
  );
};

// ── Props ──────────────────────────────────────────────────────────────────────

export interface WorkflowLauncherProps {
  // Workflow state
  activeWorkflowMode: AgentRunMode;
  onWorkflowModeChange: (mode: AgentRunMode) => void;
  // Model selection (separate per workflow)
  browserActionModel: string;
  deepResearchModel: string;
  onBrowserActionModelChange: (modelId: string) => void;
  onDeepResearchModelChange: (modelId: string) => void;
  settingsSnapshot: ProviderSettingsSnapshot | null;
  // Browser action props
  browserActionRun: AgentRun | null;
  browserActionEvents: AgentTimelineEntry[];
  browserActionError: string | null;
  browserActionPanel: AgentPanelState | null;
  onBrowserActionLaunch: (task: string) => void;
  onBrowserActionPause: () => void;
  onBrowserActionResume: () => void;
  onBrowserActionCancel: () => void;
  onBrowserActionApprovalResolve: (
    approvalId: string,
    resolution: "approved" | "rejected",
  ) => void;
  // Deep research props
  deepResearchRun: AgentRun | null;
  deepResearchEvents: AgentTimelineEntry[];
  deepResearchError: string | null;
  deepResearchPanel: AgentPanelState | null;
  onDeepResearchLaunch: (topic: string, goal: string) => void;
  onDeepResearchPause: () => void;
  onDeepResearchResume: () => void;
  onDeepResearchCancel: () => void;
  onDeepResearchApprovalResolve: (
    approvalId: string,
    resolution: "approved" | "rejected",
  ) => void;
  onOpenResearchPocket: (pocketId: string) => void;
  // Shared
  disabled: boolean;
}

/**
 * WorkflowLauncher unifies WorkflowTabs, ModelSelector, and the active panel
 * (BrowserActionPanel or DeepResearchPanel) into a single component.
 *
 * It maintains the concept of separate model selection per workflow mode and
 * resolves the selected model value into concrete provider/model info that
 * child panels need.
 */
export function WorkflowLauncher({
  activeWorkflowMode,
  onWorkflowModeChange,
  browserActionModel,
  deepResearchModel,
  onBrowserActionModelChange,
  onDeepResearchModelChange,
  settingsSnapshot,
  browserActionRun,
  browserActionEvents,
  browserActionError,
  browserActionPanel,
  onBrowserActionLaunch,
  onBrowserActionPause,
  onBrowserActionResume,
  onBrowserActionCancel,
  onBrowserActionApprovalResolve,
  deepResearchRun,
  deepResearchEvents,
  deepResearchError,
  deepResearchPanel,
  onDeepResearchLaunch,
  onDeepResearchPause,
  onDeepResearchResume,
  onDeepResearchCancel,
  onDeepResearchApprovalResolve,
  onOpenResearchPocket,
  disabled,
}: WorkflowLauncherProps) {
  // Build model options once from snapshot
  const modelOptions = React.useMemo(
    () => buildModelOptions(settingsSnapshot),
    [settingsSnapshot],
  );

  // Resolve the active workflow's model to a concrete ChatModelOption
  const activeModelValue =
    activeWorkflowMode === "browser-action"
      ? browserActionModel
      : deepResearchModel;

  const activeModel = React.useMemo(
    () => resolveSelectedModel(activeModelValue, modelOptions),
    [activeModelValue, modelOptions],
  );

  const requiresModelSelection =
    !activeModel.providerId ||
    !activeModel.providerType ||
    !activeModel.modelId;

  // Select handler delegates to the correct workflow callback
  const handleModelSelect = React.useCallback(
    (modelId: string) => {
      if (activeWorkflowMode === "browser-action") {
        onBrowserActionModelChange(modelId);
      } else {
        onDeepResearchModelChange(modelId);
      }
    },
    [activeWorkflowMode, onBrowserActionModelChange, onDeepResearchModelChange],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Tab navigation + model selector */}
      <div className="flex flex-col gap-2">
        <WorkflowTabs
          activeMode={activeWorkflowMode}
          onChange={onWorkflowModeChange}
          disabled={disabled}
        />
        <ModelSelector
          workflowMode={activeWorkflowMode}
          selectedModel={activeModelValue}
          settingsSnapshot={settingsSnapshot}
          onSelect={handleModelSelect}
          disabled={disabled}
        />
      </div>

      {/* Active panel */}
      {activeWorkflowMode === "browser-action" ? (
        <BrowserActionPanel
          run={browserActionRun}
          events={browserActionEvents}
          error={browserActionError}
          panelState={browserActionPanel}
          disabled={disabled}
          modelLabel={activeModel.label}
          providerId={activeModel.providerId}
          modelId={activeModel.modelId}
          requiresModelSelection={requiresModelSelection}
          onLaunch={onBrowserActionLaunch}
          onPause={onBrowserActionPause}
          onResume={onBrowserActionResume}
          onCancel={onBrowserActionCancel}
          onApprovalResolve={onBrowserActionApprovalResolve}
        />
      ) : (
        <DeepResearchPanel
          run={deepResearchRun}
          events={deepResearchEvents}
          error={deepResearchError}
          panelState={deepResearchPanel}
          disabled={disabled}
          modelLabel={activeModel.label}
          providerId={activeModel.providerId}
          modelId={activeModel.modelId}
          requiresModelSelection={requiresModelSelection}
          onLaunch={onDeepResearchLaunch}
          onPause={onDeepResearchPause}
          onResume={onDeepResearchResume}
          onCancel={onDeepResearchCancel}
          onApprovalResolve={onDeepResearchApprovalResolve}
          onOpenPocket={onOpenResearchPocket}
        />
      )}
    </div>
  );
}
