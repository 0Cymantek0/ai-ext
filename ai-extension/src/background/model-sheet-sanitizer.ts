import type { ModelSheetEntry } from "./routing/types.js";
import type { ProviderConfig } from "./provider-types.js";

export interface ModelSheetSanitizeResult {
  sheet: Record<string, ModelSheetEntry>;
  changed: boolean;
}

export function sanitizeModelSheet(
  sheet: Record<string, ModelSheetEntry>,
  providers: ProviderConfig[],
): ModelSheetSanitizeResult {
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));
  const sanitizedEntries = Object.entries(sheet).filter(([, entry]) => {
    const provider = providerMap.get(entry.providerId);

    if (!provider) {
      return false;
    }

    if (entry.providerType !== provider.type) {
      return false;
    }

    if (provider.type === "gemini-nano" && entry.modelId !== "gemini-nano") {
      return false;
    }

    return true;
  });

  const nextSheet = Object.fromEntries(sanitizedEntries);
  const changed = sanitizedEntries.length !== Object.keys(sheet).length;

  return {
    sheet: nextSheet,
    changed,
  };
}
