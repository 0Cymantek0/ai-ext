import type { ProviderSettingsSnapshot } from "../../../shared/types";

export interface ProviderCardState {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  hasSavedKey: boolean;
  modelLabel?: string;
  status?: string;
}

export function buildProviderCards(
  snapshot: ProviderSettingsSnapshot | null,
): ProviderCardState[] {
  if (!snapshot || !snapshot.providers) return [];

  return snapshot.providers.map((p) => {
    let modelLabel: string | undefined;
    // Attempt to extract a model if we can from routing/modelsheet
    if (snapshot.routingPreferences?.chat?.providerId === p.id) {
      const modelId = snapshot.routingPreferences.chat.modelId;
      if (modelId && snapshot.modelSheet?.[modelId]) {
        modelLabel = snapshot.modelSheet[modelId].name || modelId;
      }
    }

    const card: ProviderCardState = {
      id: p.id,
      type: p.type,
      name: p.name,
      enabled: p.enabled,
      hasSavedKey: !!p.apiKeyId,
    };
    if (modelLabel !== undefined) {
      card.modelLabel = modelLabel;
    }
    return card;
  });
}
