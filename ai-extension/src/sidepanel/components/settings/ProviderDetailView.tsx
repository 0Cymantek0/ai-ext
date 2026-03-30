import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { CustomEndpointForm } from "../CustomEndpointForm";

interface ProviderData {
  id: string;
  name: string;
  type: string;
  modelId?: string;
  apiKeyId?: string;
  [key: string]: unknown;
}

export interface ModelData {
  providerId: string;
  modelId: string;
  name?: string;
  [key: string]: unknown;
}

interface ProviderDetailViewProps {
  provider: ProviderData;
  modelSheet: Record<string, ModelData>;
  onBack: () => void;
  onUpdate: () => void;
}

export function ProviderDetailView({
  provider,
  modelSheet,
  onBack,
  onUpdate,
}: ProviderDetailViewProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = React.useState(false);
  const [isReplacingKey, setIsReplacingKey] = React.useState(false);
  const [newKey, setNewKey] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [retesting, setRetesting] = React.useState(false);
  const [isAddingModel, setIsAddingModel] = React.useState(false);
  const [manualModelId, setManualModelId] = React.useState("");
  const [manualModelError, setManualModelError] = React.useState<string | null>(
    null,
  );
  const [isSavingModel, setIsSavingModel] = React.useState(false);
  const [removingModelId, setRemovingModelId] = React.useState<string | null>(
    null,
  );

  if (!provider) return null;

  const providerModels = React.useMemo(() => {
    const models = Object.values(modelSheet)
      .filter((m: ModelData) => m.providerId === provider.id)
      .map((m: ModelData) => ({
        ...m,
        displayName: (m as any).name || m.modelId,
      }));

    if (
      provider.modelId &&
      !models.some((model) => model.modelId === provider.modelId)
    ) {
      models.unshift({
        providerId: provider.id,
        modelId: provider.modelId,
        displayName: provider.modelId,
      });
    }

    return models;
  }, [modelSheet, provider.id, provider.modelId]);

  const handleRetest = async () => {
    setRetesting(true);
    try {
      await chrome.runtime.sendMessage({
        kind: "PROVIDER_SETTINGS_RETEST",
        payload: { providerId: provider.id },
      });
    } finally {
      setRetesting(false);
    }
  };

  const handleDeleteKey = async () => {
    await chrome.runtime.sendMessage({
      kind: "PROVIDER_SETTINGS_DELETE_KEY",
      payload: { providerId: provider.id },
    });
    onUpdate();
  };

  const handleSaveKey = async () => {
    setIsSaving(true);
    try {
      await chrome.runtime.sendMessage({
        kind: "PROVIDER_SETTINGS_SAVE",
        payload: { providerId: provider.id, apiKey: newKey },
      });
      setIsReplacingKey(false);
      setNewKey("");
      onUpdate();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefaultModel = async (modelId: string) => {
    await chrome.runtime.sendMessage({
      kind: "PROVIDER_SETTINGS_SAVE",
      payload: { providerId: provider.id, modelId },
    });
    onUpdate();
  };

  const handleAddModel = async () => {
    const trimmedModelId = manualModelId.trim();
    if (!trimmedModelId) {
      setManualModelError("Model ID is required");
      return;
    }

    setIsSavingModel(true);
    setManualModelError(null);
    try {
      await chrome.runtime.sendMessage({
        kind: "PROVIDER_SETTINGS_ADD_MODEL",
        payload: {
          providerId: provider.id,
          modelId: trimmedModelId,
          name: trimmedModelId,
        },
      });
      setIsAddingModel(false);
      setManualModelId("");
      onUpdate();
    } catch (error) {
      setManualModelError(
        error instanceof Error ? error.message : "Failed to save model",
      );
    } finally {
      setIsSavingModel(false);
    }
  };

  const handleRemoveModel = async (modelId: string) => {
    setRemovingModelId(modelId);
    try {
      await chrome.runtime.sendMessage({
        kind: "PROVIDER_SETTINGS_REMOVE_MODEL",
        payload: { providerId: provider.id, modelId },
      });
      onUpdate();
    } catch {
      // silent fail
    } finally {
      setRemovingModelId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="icon-sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold">{provider.name} Details</h3>
      </div>

      <div className="space-y-4">
        <div className="p-3 border rounded-md">
          <h4 className="text-xs font-medium mb-2">API Key</h4>
          {provider.apiKeyId && !isReplacingKey ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-green-600">API Key Saved</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsReplacingKey(true)}
              >
                Replace key
              </Button>
              <Button size="sm" variant="destructive" onClick={handleDeleteKey}>
                Delete key
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleRetest}
                disabled={retesting}
              >
                {retesting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Retest"
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  type={showKey ? "text" : "password"}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="flex-1 h-9 text-sm"
                  placeholder="Enter API Key"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? "hide" : "show"}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveKey}
                  disabled={!newKey || isSaving}
                >
                  Save Key
                </Button>
                {provider.apiKeyId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsReplacingKey(false)}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium">
              Available Models ({providerModels.length})
            </label>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => {
                setIsAddingModel(true);
                setManualModelError(null);
                setManualModelId("");
              }}
            >
              <Plus className="h-3 w-3" />
              Add Model
            </Button>
          </div>

          {isAddingModel && (
            <div className="rounded-md border p-3 space-y-2">
              <label className="text-xs font-medium">Model ID</label>
              <Input
                value={manualModelId}
                onChange={(e) => setManualModelId(e.target.value)}
                placeholder="e.g. gpt-4.1-mini or llama3.1:8b"
                className="h-9 text-sm"
              />
              {manualModelError && (
                <p className="text-xs text-destructive">{manualModelError}</p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleAddModel}
                  disabled={isSavingModel}
                >
                  {isSavingModel ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Save Model"
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsAddingModel(false);
                    setManualModelError(null);
                    setManualModelId("");
                  }}
                  disabled={isSavingModel}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {providerModels.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No models were discovered for this provider yet. Add one manually.
            </p>
          ) : (
            <div className="max-h-[280px] overflow-y-auto space-y-1 pr-1">
              {providerModels.map((m) => {
                const isDefault = m.modelId === provider.modelId;
                return (
                  <div
                    key={`${m.providerId}-${m.modelId}`}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
                      isDefault
                        ? "border-primary/40 bg-primary/5"
                        : "border-border"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{m.displayName}</div>
                      {m.displayName !== m.modelId && (
                        <div className="text-muted-foreground truncate">
                          {m.modelId}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      {isDefault && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          Default
                        </span>
                      )}
                      {!isDefault && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] px-1.5"
                          onClick={() => handleSetDefaultModel(m.modelId)}
                        >
                          Set default
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveModel(m.modelId)}
                        disabled={removingModelId === m.modelId}
                        title="Remove model"
                      >
                        {removingModelId === m.modelId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border rounded-md">
          <button
            className="w-full p-3 flex items-center justify-between text-xs font-medium"
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
          >
            Advanced
            {isAdvancedOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {isAdvancedOpen && (
            <div className="p-3 pt-0 border-t">
              <CustomEndpointForm
                initialValues={{ ...provider, providerType: provider.type }}
                showTypeSelector={false}
                onSubmit={async (vals) => {
                  await chrome.runtime.sendMessage({
                    kind: "PROVIDER_SETTINGS_SAVE",
                    payload: { providerId: provider.id, ...vals },
                  });
                  setIsAdvancedOpen(false);
                  onUpdate();
                }}
                onCancel={() => setIsAdvancedOpen(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
