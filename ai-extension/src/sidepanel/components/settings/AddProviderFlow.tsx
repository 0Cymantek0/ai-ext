import * as React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { CustomEndpointForm } from "../CustomEndpointForm";
import type { CustomEndpointFormValues } from "../CustomEndpointForm";

interface AddProviderFlowProps {
  onBack: () => void;
  onComplete: () => void;
}

export function AddProviderFlow({ onBack, onComplete }: AddProviderFlowProps) {
  const [selectedType, setSelectedType] = React.useState<string | null>(null);
  const [isSubmittingBuiltin, setIsSubmittingBuiltin] = React.useState(false);

  const presets = [
    { value: "gemini-nano", label: "Gemini Nano" },
    { value: "openai", label: "OpenAI" },
    { value: "anthropic", label: "Anthropic" },
    { value: "google", label: "Google Gemini" },
    { value: "openrouter", label: "OpenRouter" },
    { value: "groq", label: "Groq" },
    { value: "nvidia", label: "NVIDIA NIM" },
    { value: "ollama", label: "Ollama (Local)" },
    { value: "custom", label: "Custom (OpenAI-compatible)" },
  ];

  const handleSubmit = async (values: CustomEndpointFormValues) => {
    await chrome.runtime.sendMessage({
      kind: "PROVIDER_SETTINGS_SAVE",
      payload: {
        type: values.providerType,
        name: values.name,
        baseUrl: values.baseUrl,
        apiKey: values.apiKey,
        endpointMode: values.endpointMode,
        enabled: true,
      },
    });
    onComplete();
  };

  const handlePresetSelect = async (type: string) => {
    if (type !== "gemini-nano") {
      setSelectedType(type);
      return;
    }

    setIsSubmittingBuiltin(true);
    try {
      await chrome.runtime.sendMessage({
        kind: "PROVIDER_SETTINGS_SAVE",
        payload: {
          type: "gemini-nano",
          name: "Gemini Nano",
          enabled: true,
          modelId: "gemini-nano",
        },
      });
      onComplete();
    } finally {
      setIsSubmittingBuiltin(false);
    }
  };

  if (!selectedType) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="icon-sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-sm font-semibold">Choose a Provider</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((p) => (
            <Button
              key={p.value}
              variant="outline"
              className="justify-start h-12"
              disabled={isSubmittingBuiltin}
              onClick={() => void handlePresetSelect(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setSelectedType(null)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold">Configure Provider</h3>
      </div>
      <CustomEndpointForm
        initialValues={{
          providerType: selectedType,
          name: presets.find((p) => p.value === selectedType)?.label ?? "",
        }}
        showTypeSelector={false}
        onSubmit={handleSubmit}
        onCancel={() => setSelectedType(null)}
      />
    </div>
  );
}
