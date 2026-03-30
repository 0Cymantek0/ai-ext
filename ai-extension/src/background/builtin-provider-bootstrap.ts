import type { ProviderConfigManager } from "./provider-config-manager.js";

const BUILTIN_GEMINI_NANO_NAME = "Gemini Nano";
const BUILTIN_GEMINI_NANO_MODEL_ID = "gemini-nano";

export async function ensureGeminiNanoProvider(
  configManager: ProviderConfigManager,
): Promise<boolean> {
  const providers = await configManager.listProviders();
  const existing = providers.find((provider) => provider.type === "gemini-nano");

  if (existing) {
    return false;
  }

  await configManager.addProvider({
    type: "gemini-nano",
    name: BUILTIN_GEMINI_NANO_NAME,
    enabled: true,
    modelId: BUILTIN_GEMINI_NANO_MODEL_ID,
  });

  return true;
}
