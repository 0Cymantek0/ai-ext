/**
 * ModelSelector stub — Task 2 will provide the full implementation.
 * This stub exists so the integration test file can resolve the import.
 */
import * as React from "react";

export interface ModelSelectorProps {
  workflowMode: "browser-action" | "deep-research";
  selectedModel: string;
  settingsSnapshot: any;
  onSelect: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelSelector(_props: ModelSelectorProps): React.ReactNode {
  return null;
}
