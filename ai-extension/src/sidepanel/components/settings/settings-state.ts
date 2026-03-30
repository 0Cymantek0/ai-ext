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
    if (p.modelId) {
      const modelEntry = Object.values(snapshot.modelSheet || {}).find(
        (entry) => entry.providerId === p.id && entry.modelId === p.modelId,
      );
      modelLabel = modelEntry?.name || p.modelId;
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
