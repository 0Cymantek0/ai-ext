import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomEndpointForm } from "./CustomEndpointForm";
import type { CustomEndpointFormValues } from "./CustomEndpointForm";
import {
  Settings,
  X,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface ProviderEntry {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  baseUrl?: string;
  apiKeyId?: string;
  endpointMode?: string;
}

interface ProviderSettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProviderSettingsSheet({
  isOpen,
  onClose,
}: ProviderSettingsSheetProps) {
  const [providers, setProviders] = React.useState<ProviderEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [expandedProviderId, setExpandedProviderId] = React.useState<
    string | null
  >(null);
  const [error, setError] = React.useState<string | null>(null);

  // Load providers on open
  React.useEffect(() => {
    if (isOpen) {
      loadProviders();
    }
  }, [isOpen]);

  const loadProviders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "PROVIDER_SETTINGS_LOAD",
        payload: {},
      });
      if (response?.success) {
        setProviders(response.data?.providers ?? []);
      } else {
        setError("Failed to load providers");
      }
    } catch {
      setError("Failed to load providers");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddProvider = async (values: CustomEndpointFormValues) => {
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "PROVIDER_SETTINGS_SAVE",
        payload: {
          type: values.providerType,
          name: values.name,
          baseUrl: values.baseUrl,
          apiKey: values.apiKey || undefined,
          enabled: true,
          endpointMode: values.endpointMode,
        },
      });

      if (response?.success) {
        setShowAddForm(false);
        await loadProviders();
      } else {
        setError(response?.error?.message ?? "Failed to save provider");
      }
    } catch {
      setError("Failed to save provider");
    }
  };

  const handleToggleProvider = async (
    providerId: string,
    enabled: boolean,
  ) => {
    try {
      const provider = providers.find((p) => p.id === providerId);
      if (!provider) return;

      await chrome.runtime.sendMessage({
        kind: "PROVIDER_SETTINGS_SAVE",
        payload: {
          providerId,
          type: provider.type,
          name: provider.name,
          enabled,
        },
      });
      await loadProviders();
    } catch {
      setError("Failed to toggle provider");
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    // For now, disable the provider instead of full delete
    // since there's no DELETE message kind in our contract
    await handleToggleProvider(providerId, false);
  };

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
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Provider List */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Configured Providers
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
              className="h-7 text-xs gap-1"
            >
              <Plus className="h-3 w-3" />
              Add Provider
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : providers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                No providers configured yet
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Add a provider to get started
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedProviderId(
                            expandedProviderId === provider.id
                              ? null
                              : provider.id,
                          )
                        }
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {expandedProviderId === provider.id ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </button>
                      <span className="text-sm font-medium">
                        {provider.name}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {provider.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleProvider(
                            provider.id,
                            !provider.enabled,
                          )
                        }
                        className={`text-xs px-2 py-1 rounded ${
                          provider.enabled
                            ? "bg-green-500/10 text-green-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {provider.enabled ? "Enabled" : "Disabled"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProvider(provider.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Disable ${provider.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {expandedProviderId === provider.id && (
                    <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground space-y-1">
                      <p>
                        <span className="font-medium">ID:</span> {provider.id}
                      </p>
                      <p>
                        <span className="font-medium">Type:</span>{" "}
                        {provider.type}
                      </p>
                      <p>
                        <span className="font-medium">Mode:</span>{" "}
                        {provider.endpointMode ?? "native"}
                      </p>
                      {provider.baseUrl && (
                        <p>
                          <span className="font-medium">URL:</span>{" "}
                          {provider.baseUrl}
                        </p>
                      )}
                      <p>
                        <span className="font-medium">API Key:</span>{" "}
                        {provider.apiKeyId ? "Configured" : "Not set"}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Add Provider Form */}
        {showAddForm && (
          <section className="rounded-lg border border-border p-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Add New Provider
            </h3>
            <CustomEndpointForm
              onSubmit={handleAddProvider}
              onCancel={() => setShowAddForm(false)}
            />
          </section>
        )}

        {/* Error Display */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
