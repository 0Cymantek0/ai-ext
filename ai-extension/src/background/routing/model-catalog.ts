import type { ModelCapabilities, ModelSheetEntry, ModelTier } from './types';

/**
 * Default capabilities for unknown/unrecognized models (D-05).
 * These are safe, conservative defaults.
 */
export const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsVision: false,
  contextWindow: 4096,
  maxOutputTokens: 2048,
  supportsImageAnalysis: false,
  supportsVideoAnalysis: false,
  supportsAudioAnalysis: false,
  supportsTranscription: false,
  supportsTranslation: false,
  supportsAudioInput: false,
  supportsWordTimestamps: false,
};

/**
 * Default tier for unknown models.
 */
export const DEFAULT_TIER: ModelTier = {
  cost: 'medium',
  speed: 'medium',
  quality: 'basic',
};

/**
 * Hardcoded capability metadata overlay (D-03, D-04).
 * Keyed by modelId for O(1) lookup during catalog merge.
 * Must include the latest models from all major providers.
 */
export const HARDCODED_CAPABILITIES: Record<string, {
  capabilities: ModelCapabilities;
  tier: ModelTier;
}> = {
  // --- OpenAI ---
  'gpt-4o': {
    capabilities: { supportsVision: true, contextWindow: 128000, maxOutputTokens: 16384, supportsImageAnalysis: true, supportsVideoAnalysis: false, supportsAudioAnalysis: true, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: true, supportsWordTimestamps: false },
    tier: { cost: 'medium', speed: 'fast', quality: 'expert' },
  },
  'gpt-4o-mini': {
    capabilities: { supportsVision: true, contextWindow: 128000, maxOutputTokens: 16384, supportsImageAnalysis: true, supportsVideoAnalysis: false, supportsAudioAnalysis: false, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: false, supportsWordTimestamps: false },
    tier: { cost: 'low', speed: 'fast', quality: 'advanced' },
  },
  'gpt-4.1': {
    capabilities: { supportsVision: true, contextWindow: 1047576, maxOutputTokens: 32768, supportsImageAnalysis: true, supportsVideoAnalysis: false, supportsAudioAnalysis: false, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: false, supportsWordTimestamps: false },
    tier: { cost: 'medium', speed: 'medium', quality: 'expert' },
  },
  'gpt-4.1-mini': {
    capabilities: { supportsVision: true, contextWindow: 1047576, maxOutputTokens: 32768, supportsImageAnalysis: true, supportsVideoAnalysis: false, supportsAudioAnalysis: false, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: false, supportsWordTimestamps: false },
    tier: { cost: 'low', speed: 'fast', quality: 'advanced' },
  },
  'gpt-4.1-nano': {
    capabilities: { supportsVision: true, contextWindow: 1047576, maxOutputTokens: 32768, supportsImageAnalysis: true, supportsVideoAnalysis: false, supportsAudioAnalysis: false, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: false, supportsWordTimestamps: false },
    tier: { cost: 'low', speed: 'fast', quality: 'basic' },
  },
  'o3': {
    capabilities: { supportsVision: true, contextWindow: 200000, maxOutputTokens: 100000, supportsImageAnalysis: true, supportsVideoAnalysis: false, supportsAudioAnalysis: false, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: false, supportsWordTimestamps: false },
    tier: { cost: 'high', speed: 'slow', quality: 'expert' },
  },
  'o4-mini': {
    capabilities: { supportsVision: true, contextWindow: 200000, maxOutputTokens: 100000, supportsImageAnalysis: true, supportsVideoAnalysis: false, supportsAudioAnalysis: false, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: false, supportsWordTimestamps: false },
    tier: { cost: 'medium', speed: 'medium', quality: 'expert' },
  },
  'text-embedding-3-large': {
    capabilities: { supportsVision: false, contextWindow: 8191, maxOutputTokens: 3072, supportsImageAnalysis: false, supportsVideoAnalysis: false, supportsAudioAnalysis: false, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: false, supportsWordTimestamps: false },
    tier: { cost: 'low', speed: 'fast', quality: 'advanced' },
  },
  'text-embedding-3-small': {
    capabilities: { supportsVision: false, contextWindow: 8191, maxOutputTokens: 1536, supportsImageAnalysis: false, supportsVideoAnalysis: false, supportsAudioAnalysis: false, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: false, supportsWordTimestamps: false },
    tier: { cost: 'low', speed: 'fast', quality: 'basic' },
  },

  // --- Anthropic ---
  'claude-sonnet-4-20250514': {
    capabilities: { supportsVision: true, contextWindow: 200000, maxOutputTokens: 64000, supportsImageAnalysis: true, supportsVideoAnalysis: false, supportsAudioAnalysis: false, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: false, supportsWordTimestamps: false },
    tier: { cost: 'medium', speed: 'medium', quality: 'expert' },
  },
  'claude-3-7-sonnet-20250219': {
    capabilities: { supportsVision: true, contextWindow: 200000, maxOutputTokens: 128000, supportsImageAnalysis: true, supportsVideoAnalysis: false, supportsAudioAnalysis: false, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: false, supportsWordTimestamps: false },
    tier: { cost: 'medium', speed: 'medium', quality: 'expert' },
  },
  'claude-3-5-sonnet-20241022': {
    capabilities: { supportsVision: true, contextWindow: 200000, maxOutputTokens: 8192, supportsImageAnalysis: true, supportsVideoAnalysis: false, supportsAudioAnalysis: false, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: false, supportsWordTimestamps: false },
    tier: { cost: 'medium', speed: 'fast', quality: 'advanced' },
  },
  'claude-3-5-haiku-20241022': {
    capabilities: { supportsVision: true, contextWindow: 200000, maxOutputTokens: 8192, supportsImageAnalysis: true, supportsVideoAnalysis: false, supportsAudioAnalysis: false, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: false, supportsWordTimestamps: false },
    tier: { cost: 'low', speed: 'fast', quality: 'advanced' },
  },
  'claude-3-opus-20240229': {
    capabilities: { supportsVision: true, contextWindow: 200000, maxOutputTokens: 4096, supportsImageAnalysis: true, supportsVideoAnalysis: false, supportsAudioAnalysis: false, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: false, supportsWordTimestamps: false },
    tier: { cost: 'high', speed: 'slow', quality: 'expert' },
  },

  // --- Google ---
  'gemini-2.5-flash': {
    capabilities: { supportsVision: true, contextWindow: 1048576, maxOutputTokens: 65536, supportsImageAnalysis: true, supportsVideoAnalysis: true, supportsAudioAnalysis: true, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: true, supportsWordTimestamps: false },
    tier: { cost: 'low', speed: 'fast', quality: 'advanced' },
  },
  'gemini-2.5-pro': {
    capabilities: { supportsVision: true, contextWindow: 1048576, maxOutputTokens: 65536, supportsImageAnalysis: true, supportsVideoAnalysis: true, supportsAudioAnalysis: true, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: true, supportsWordTimestamps: false },
    tier: { cost: 'medium', speed: 'medium', quality: 'expert' },
  },
  'gemini-2.0-flash': {
    capabilities: { supportsVision: true, contextWindow: 1048576, maxOutputTokens: 8192, supportsImageAnalysis: true, supportsVideoAnalysis: true, supportsAudioAnalysis: true, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: true, supportsWordTimestamps: false },
    tier: { cost: 'low', speed: 'fast', quality: 'advanced' },
  },
  'gemini-1.5-pro': {
    capabilities: { supportsVision: true, contextWindow: 2097152, maxOutputTokens: 8192, supportsImageAnalysis: true, supportsVideoAnalysis: true, supportsAudioAnalysis: true, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: true, supportsWordTimestamps: false },
    tier: { cost: 'medium', speed: 'medium', quality: 'expert' },
  },
  'gemini-1.5-flash': {
    capabilities: { supportsVision: true, contextWindow: 1048576, maxOutputTokens: 8192, supportsImageAnalysis: true, supportsVideoAnalysis: true, supportsAudioAnalysis: true, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: true, supportsWordTimestamps: false },
    tier: { cost: 'low', speed: 'fast', quality: 'advanced' },
  },
  'text-embedding-004': {
    capabilities: { supportsVision: false, contextWindow: 2048, maxOutputTokens: 768, supportsImageAnalysis: false, supportsVideoAnalysis: false, supportsAudioAnalysis: false, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: false, supportsWordTimestamps: false },
    tier: { cost: 'free', speed: 'fast', quality: 'basic' },
  },

  // --- Gemini Nano (local, no API) ---
  'gemini-nano': {
    capabilities: { supportsVision: false, contextWindow: 4096, maxOutputTokens: 2048, supportsImageAnalysis: false, supportsVideoAnalysis: false, supportsAudioAnalysis: false, supportsTranscription: false, supportsTranslation: false, supportsAudioInput: false, supportsWordTimestamps: false },
    tier: { cost: 'free', speed: 'fast', quality: 'basic' },
  },
};

/**
 * API endpoints for fetching available models per provider type.
 * Anthropic and gemini-nano are NOT included -- they use overlay only.
 */
export const MODEL_LIST_ENDPOINTS: Record<string, {
  url: (baseUrl: string) => string;
  extractModels: (response: any) => { id: string; name?: string }[];
}> = {
  openai: {
    url: (baseUrl) => `${baseUrl}/v1/models`,
    extractModels: (res) => res.data?.map((m: any) => ({ id: m.id, name: m.id })) ?? [],
  },
  openrouter: {
    url: (baseUrl) => `${baseUrl}/api/v1/models`,
    extractModels: (res) => res.data?.map((m: any) => ({ id: m.id, name: m.name ?? m.id })) ?? [],
  },
  groq: {
    url: (baseUrl) => `${baseUrl}/openai/v1/models`,
    extractModels: (res) => res.data?.map((m: any) => ({ id: m.id, name: m.id })) ?? [],
  },
  ollama: {
    url: (baseUrl) => `${baseUrl}/api/tags`,
    extractModels: (res) => res.models?.map((m: any) => ({ id: m.name, name: m.name })) ?? [],
  },
  nvidia: {
    url: (baseUrl) => `${baseUrl}/v1/models`,
    extractModels: (res) => res.data?.map((m: any) => ({ id: m.id, name: m.id })) ?? [],
  },
};

/** Provider types that use hardcoded overlay only (no API model list) */
const OVERLAY_ONLY_TYPES = new Set(['anthropic', 'gemini-nano']);

/** Default base URLs for provider types */
const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com',
  openrouter: 'https://openrouter.ai',
  groq: 'https://api.groq.com',
  ollama: 'http://localhost:11434',
  nvidia: 'https://integrate.api.nvidia.com',
};

/**
 * Storage keys (re-exported for consistency with settings-manager)
 */
export const MODEL_SHEET_KEY = 'ai_pocket_model_sheet';
export const CATALOG_VERSION_KEY = 'ai_pocket_catalog_version';

/**
 * Merge a model ID with the hardcoded overlay data.
 * If the model is in the overlay, returns its capabilities and tier.
 * If not found, returns DEFAULT_CAPABILITIES and DEFAULT_TIER.
 *
 * Both cases: enabled=true, providerType='', providerId=''
 * (caller must set providerId and providerType)
 */
export function mergeWithOverlay(modelId: string): ModelSheetEntry {
  const overlay = HARDCODED_CAPABILITIES[modelId];
  if (overlay) {
    return {
      modelId,
      providerId: '',
      providerType: '',
      enabled: true,
      capabilities: { ...overlay.capabilities },
      tier: { ...overlay.tier },
    };
  }
  return {
    modelId,
    providerId: '',
    providerType: '',
    enabled: true,
    capabilities: { ...DEFAULT_CAPABILITIES },
    tier: { ...DEFAULT_TIER },
  };
}

/**
 * Seed the model catalog from all enabled providers.
 *
 * D-01: Dynamic API-fetched model catalog
 * D-02: Fetch only from enabled providers with API keys (or gemini-nano)
 * D-06: Model catalog seeds on first use
 *
 * @param configManager - ProviderConfigManager instance
 * @returns Complete model sheet keyed by modelId
 */
export async function seedModelCatalog(configManager: any): Promise<Record<string, ModelSheetEntry>> {
  const providers = await configManager.listProviders();
  const sheet: Record<string, ModelSheetEntry> = {};

  // Filter to enabled providers with API keys, plus gemini-nano (always included)
  const eligible = providers.filter(
    (p: any) => (p.enabled && p.apiKeyId) || p.type === 'gemini-nano'
  );

  for (const provider of eligible) {
    if (OVERLAY_ONLY_TYPES.has(provider.type)) {
      // Use hardcoded overlay entries for this provider type
      for (const [modelId, data] of Object.entries(HARDCODED_CAPABILITIES)) {
        // Only include models matching this provider type
        const modelProviderType = inferProviderType(modelId);
        if (modelProviderType !== provider.type) continue;

        sheet[modelId] = {
          modelId,
          providerId: provider.id,
          providerType: provider.type,
          enabled: true,
          capabilities: { ...data.capabilities },
          tier: { ...data.tier },
        };
      }
    } else {
      // Attempt API fetch for this provider
      const endpoint = MODEL_LIST_ENDPOINTS[provider.type];
      if (!endpoint) continue;

      try {
        const apiKey = await configManager.getDecryptedApiKey(provider.id);
        const baseUrl = DEFAULT_BASE_URLS[provider.type] || 'https://api.example.com';
        const url = endpoint.url(baseUrl);

        const headers: Record<string, string> = {};
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(url, { headers });
        if (!response.ok) {
          // Fall back to overlay entries for this provider type
          addOverlayEntriesForType(sheet, provider);
          continue;
        }

        const json = await response.json();
        const models = endpoint.extractModels(json);

        for (const model of models) {
          const entry = mergeWithOverlay(model.id);
          entry.providerId = provider.id;
          entry.providerType = provider.type;
          sheet[model.id] = entry;
        }
      } catch {
        // API fetch failed, fall back to overlay entries for this provider type
        addOverlayEntriesForType(sheet, provider);
      }
    }
  }

  return sheet;
}

/**
 * Infer provider type from model ID patterns.
 */
function inferProviderType(modelId: string): string {
  if (modelId.startsWith('gpt-') || modelId.startsWith('o3') || modelId.startsWith('o4-') || modelId.startsWith('text-embedding-')) return 'openai';
  if (modelId.startsWith('claude-')) return 'anthropic';
  if (modelId.startsWith('gemini-') || modelId === 'gemini-nano') return 'gemini-nano';
  if (modelId.startsWith('text-embedding-00')) return 'google';
  return '';
}

/**
 * Add hardcoded overlay entries for a specific provider type as fallback.
 */
function addOverlayEntriesForType(
  sheet: Record<string, ModelSheetEntry>,
  provider: any
): void {
  for (const [modelId, data] of Object.entries(HARDCODED_CAPABILITIES)) {
    const modelProviderType = inferProviderType(modelId);
    if (modelProviderType !== provider.type) continue;

    sheet[modelId] = {
      modelId,
      providerId: provider.id,
      providerType: provider.type,
      enabled: true,
      capabilities: { ...data.capabilities },
      tier: { ...data.tier },
    };
  }
}
