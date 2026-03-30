import * as React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
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
  const [selectedModelId, setSelectedModelId] = React.useState(
    provider?.modelId || "",
  );
  const [isReplacingKey, setIsReplacingKey] = React.useState(false);
  const [newKey, setNewKey] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [retesting, setRetesting] = React.useState(false);

  if (!provider) return null;

  const providerModels = Object.values(modelSheet).filter(
    (m: ModelData) => m.providerId === provider.id,
  );

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

  const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelId = e.target.value;
    setSelectedModelId(modelId);
    await chrome.runtime.sendMessage({
      kind: "PROVIDER_SETTINGS_SAVE",
      payload: { providerId: provider.id, modelId },
    });
    onUpdate();
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
                <input
                  type={showKey ? "text" : "password"}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-input bg-card px-3 text-sm"
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
          <label className="text-xs font-medium">Model</label>
          <select
            aria-label="Model"
            value={selectedModelId}
            onChange={handleModelChange}
            className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">Select a model...</option>
            {providerModels.map((m: ModelData) => (
              <option key={`${m.providerId}-${m.modelId}`} value={m.modelId}>
                {m.modelId}
              </option>
            ))}
          </select>
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
