import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export interface CustomEndpointFormValues {
  name: string;
  baseUrl: string;
  apiKey: string;
  providerType: string;
  endpointMode: "native" | "openai-compatible" | "nvidia-nim";
}

interface CustomEndpointFormProps {
  initialValues?: Partial<CustomEndpointFormValues>;
  /** Provider types that do not require an API key */
  optionalKeyTypes?: string[];
  onSubmit: (values: CustomEndpointFormValues) => Promise<void>;
  onCancel: () => void;
  /** Whether to show provider type selector */
  showTypeSelector?: boolean;
}

const PROVIDER_TYPES = [
  { value: "openai", label: "OpenAI", defaultUrl: "https://api.openai.com", requiresKey: true },
  { value: "anthropic", label: "Anthropic", defaultUrl: "https://api.anthropic.com", requiresKey: true },
  { value: "google", label: "Google Gemini", defaultUrl: "https://generativelanguage.googleapis.com", requiresKey: true },
  { value: "openrouter", label: "OpenRouter", defaultUrl: "https://openrouter.ai", requiresKey: true },
  { value: "groq", label: "Groq", defaultUrl: "https://api.groq.com", requiresKey: true },
  { value: "nvidia", label: "NVIDIA NIM", defaultUrl: "https://integrate.api.nvidia.com", requiresKey: true },
  { value: "ollama", label: "Ollama (Local)", defaultUrl: "http://localhost:11434", requiresKey: false },
  { value: "custom", label: "Custom (OpenAI-compatible)", defaultUrl: "", requiresKey: false },
];

export function CustomEndpointForm({
  initialValues,
  optionalKeyTypes = ["ollama", "custom"],
  onSubmit,
  onCancel,
  showTypeSelector = true,
}: CustomEndpointFormProps) {
  const [name, setName] = React.useState(initialValues?.name ?? "");
  const [baseUrl, setBaseUrl] = React.useState(initialValues?.baseUrl ?? "");
  const [apiKey, setApiKey] = React.useState(initialValues?.apiKey ?? "");
  const [providerType, setProviderType] = React.useState(
    initialValues?.providerType ?? "custom",
  );
  const [endpointMode, setEndpointMode] = React.useState<
    "native" | "openai-compatible" | "nvidia-nim"
  >(initialValues?.endpointMode ?? "openai-compatible");
  const [error, setError] = React.useState<string | null>(null);
  const [isValidating, setIsValidating] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const selectedTypeConfig = PROVIDER_TYPES.find((t) => t.value === providerType);
  const isApiKeyOptional = optionalKeyTypes.includes(providerType);

  // When provider type changes, set default URL if empty
  const handleTypeChange = (newType: string) => {
    setProviderType(newType);
    const typeConfig = PROVIDER_TYPES.find((t) => t.value === newType);
    if (typeConfig && !baseUrl && typeConfig.defaultUrl) {
      setBaseUrl(typeConfig.defaultUrl);
    }
    // Set endpoint mode based on provider type
    if (newType === "nvidia") {
      setEndpointMode("nvidia-nim");
    } else if (newType === "ollama" || newType === "custom") {
      setEndpointMode("openai-compatible");
    } else {
      setEndpointMode("native");
    }
    setError(null);
  };

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleValidate = async () => {
    if (!baseUrl.trim()) {
      setError("Base URL is required");
      return;
    }
    if (!validateUrl(baseUrl)) {
      setError("Invalid URL format");
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage({
        kind: "PROVIDER_SETTINGS_VALIDATE_ENDPOINT",
        payload: { baseUrl, providerType, apiKey: apiKey || undefined },
      });

      if (response?.success && response.data?.valid) {
        setError(null);
      } else {
        setError(response?.data?.error ?? "Endpoint validation failed");
      }
    } catch (err) {
      setError("Failed to validate endpoint");
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate required fields
    if (!name.trim()) {
      setError("Provider name is required");
      return;
    }
    if (!baseUrl.trim()) {
      setError("Base URL is required");
      return;
    }
    if (!validateUrl(baseUrl)) {
      setError("Invalid URL format. Please enter a valid URL.");
      return;
    }
    // API key is required for providers that need it, unless we already have one
    if (selectedTypeConfig?.requiresKey && !apiKey.trim() && !initialValues?.apiKey) {
      setError("API key is required for this provider type");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        providerType,
        endpointMode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save provider");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Provider Type */}
      {showTypeSelector && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Provider Type
          </label>
          <select
            value={providerType}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm"
          >
            {PROVIDER_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Provider Name */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Provider Name
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Custom Provider"
          className="h-9 text-sm"
        />
      </div>

      {/* Base URL */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Base URL
        </label>
        <div className="flex gap-2">
          <Input
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setError(null);
            }}
            placeholder="https://api.example.com"
            className="h-9 text-sm flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleValidate}
            disabled={isValidating || !baseUrl.trim()}
            className="h-9 px-3 shrink-0"
          >
            {isValidating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              "Test"
            )}
          </Button>
        </div>
      </div>

      {/* API Key */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          API Key {isApiKeyOptional && (
            <span className="text-muted-foreground/60">(optional)</span>
          )}
        </label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            isApiKeyOptional
              ? "Optional for local/self-hosted endpoints"
              : "Enter your API key"
          }
          className="h-9 text-sm"
        />
        {isApiKeyOptional && (
          <p className="text-xs text-muted-foreground/60 mt-1">
            This provider type supports connections without an API key
          </p>
        )}
      </div>

      {/* Endpoint Mode */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Endpoint Mode
        </label>
        <select
          value={endpointMode}
          onChange={(e) =>
            setEndpointMode(
              e.target.value as "native" | "openai-compatible" | "nvidia-nim",
            )
          }
          className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm"
        >
          <option value="native">Native API</option>
          <option value="openai-compatible">OpenAI-Compatible</option>
          <option value="nvidia-nim">NVIDIA NIM</option>
        </select>
      </div>

      {/* Error Display */}
      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || !name.trim() || !baseUrl.trim()}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Saving...
            </>
          ) : (
            "Save Provider"
          )}
        </Button>
      </div>
    </form>
  );
}
