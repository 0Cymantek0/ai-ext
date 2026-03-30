import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HARDCODED_CAPABILITIES,
  DEFAULT_CAPABILITIES,
  DEFAULT_TIER,
  seedModelCatalog,
  mergeWithOverlay,
  MODEL_LIST_ENDPOINTS,
} from '../src/background/routing/model-catalog';
import type { ModelSheetEntry } from '../src/background/routing/types';

describe('Model Catalog', () => {
  describe('HARDCODED_CAPABILITIES overlay data', () => {
    it('should contain entry for gpt-4o with contextWindow=128000 and supportsImageAnalysis=true', () => {
      const entry = HARDCODED_CAPABILITIES['gpt-4o'];
      expect(entry).toBeDefined();
      expect(entry.capabilities.contextWindow).toBe(128000);
      expect(entry.capabilities.supportsImageAnalysis).toBe(true);
    });

    it('should contain entry for claude-sonnet-4-20250514 with contextWindow=200000', () => {
      const entry = HARDCODED_CAPABILITIES['claude-sonnet-4-20250514'];
      expect(entry).toBeDefined();
      expect(entry.capabilities.contextWindow).toBe(200000);
    });

    it('should contain entry for gemini-2.5-flash with supportsVideoAnalysis=true and supportsAudioAnalysis=true', () => {
      const entry = HARDCODED_CAPABILITIES['gemini-2.5-flash'];
      expect(entry).toBeDefined();
      expect(entry.capabilities.supportsVideoAnalysis).toBe(true);
      expect(entry.capabilities.supportsAudioAnalysis).toBe(true);
    });
  });

  describe('DEFAULT_CAPABILITIES', () => {
    it('should have contextWindow=4096, maxOutputTokens=2048, all analysis flags false', () => {
      expect(DEFAULT_CAPABILITIES.contextWindow).toBe(4096);
      expect(DEFAULT_CAPABILITIES.maxOutputTokens).toBe(2048);
      expect(DEFAULT_CAPABILITIES.supportsVision).toBe(false);
      expect(DEFAULT_CAPABILITIES.supportsImageAnalysis).toBe(false);
      expect(DEFAULT_CAPABILITIES.supportsVideoAnalysis).toBe(false);
      expect(DEFAULT_CAPABILITIES.supportsAudioAnalysis).toBe(false);
    });
  });

  describe('DEFAULT_TIER', () => {
    it('should have cost=medium, speed=medium, quality=basic', () => {
      expect(DEFAULT_TIER.cost).toBe('medium');
      expect(DEFAULT_TIER.speed).toBe('medium');
      expect(DEFAULT_TIER.quality).toBe('basic');
    });
  });

  describe('mergeWithOverlay', () => {
    it('should return entry with DEFAULT_CAPABILITIES and DEFAULT_TIER for unknown model', () => {
      const entry = mergeWithOverlay('unknown-model-x');
      expect(entry.modelId).toBe('unknown-model-x');
      expect(entry.providerId).toBe('');
      expect(entry.providerType).toBe('');
      expect(entry.enabled).toBe(true);
      expect(entry.capabilities).toEqual(DEFAULT_CAPABILITIES);
      expect(entry.tier).toEqual(DEFAULT_TIER);
    });

    it('should return entry with HARDCODED_CAPABILITIES data for known model (gpt-4o)', () => {
      const entry = mergeWithOverlay('gpt-4o');
      expect(entry.modelId).toBe('gpt-4o');
      expect(entry.capabilities).toEqual(HARDCODED_CAPABILITIES['gpt-4o'].capabilities);
      expect(entry.tier).toEqual(HARDCODED_CAPABILITIES['gpt-4o'].tier);
      expect(entry.enabled).toBe(true);
    });
  });

  describe('seedModelCatalog', () => {
    let mockConfigManager: any;

    beforeEach(() => {
      vi.restoreAllMocks();

      mockConfigManager = {
        listProviders: vi.fn(),
        getDecryptedApiKey: vi.fn(),
      };
    });

    it('should create ModelSheetEntry for each enabled provider models, keyed by modelId', async () => {
      mockConfigManager.listProviders.mockResolvedValue([
        { id: 'p1', type: 'openai', enabled: true, apiKeyId: 'key1' },
      ]);
      mockConfigManager.getDecryptedApiKey.mockResolvedValue('sk-test-key');

      // Mock fetch to return OpenAI-style model list
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'gpt-4o', name: 'gpt-4o' },
            { id: 'gpt-4o-mini', name: 'gpt-4o-mini' },
          ],
        }),
      }));

      const sheet = await seedModelCatalog(mockConfigManager);

      expect(sheet['gpt-4o']).toBeDefined();
      expect(sheet['gpt-4o'].modelId).toBe('gpt-4o');
      expect(sheet['gpt-4o'].providerId).toBe('p1');
      expect(sheet['gpt-4o'].providerType).toBe('openai');
      expect(sheet['gpt-4o'].enabled).toBe(true);
      // Should use overlay data since gpt-4o is in HARDCODED_CAPABILITIES
      expect(sheet['gpt-4o'].capabilities.contextWindow).toBe(128000);

      expect(sheet['gpt-4o-mini']).toBeDefined();
      expect(sheet['gpt-4o-mini'].modelId).toBe('gpt-4o-mini');
    });

    it('should skip providers without API keys or with enabled=false', async () => {
      mockConfigManager.listProviders.mockResolvedValue([
        { id: 'p1', type: 'openai', enabled: false, apiKeyId: 'key1' },
        { id: 'p2', type: 'openai', enabled: true }, // no apiKeyId
        { id: 'p3', type: 'openai', enabled: true, apiKeyId: 'key3' },
      ]);
      mockConfigManager.getDecryptedApiKey.mockResolvedValue('sk-test-key');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 'gpt-4o' }] }),
      }));

      const sheet = await seedModelCatalog(mockConfigManager);

      // p1 disabled, p2 no apiKeyId - only p3 should be processed
      expect(Object.keys(sheet).length).toBeGreaterThan(0);
      // All entries should belong to p3
      for (const entry of Object.values(sheet)) {
        expect((entry as ModelSheetEntry).providerId).toBe('p3');
      }
    });

    it('should skip API fetch for anthropic and gemini-nano (use overlay only)', async () => {
      mockConfigManager.listProviders.mockResolvedValue([
        { id: 'p1', type: 'anthropic', enabled: true, apiKeyId: 'key1' },
        { id: 'p2', type: 'gemini-nano', enabled: true },
      ]);
      mockConfigManager.getDecryptedApiKey.mockResolvedValue('sk-test-key');

      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const sheet = await seedModelCatalog(mockConfigManager);

      // Should NOT call fetch for anthropic or gemini-nano
      expect(fetchSpy).not.toHaveBeenCalled();

      // Should have overlay entries for anthropic models
      expect(Object.keys(sheet).length).toBeGreaterThan(0);
      // All entries should have correct providerId
      for (const entry of Object.values(sheet)) {
        const e = entry as ModelSheetEntry;
        expect(e.providerId).toMatch(/^p[12]$/);
      }

      expect(sheet['gemini-nano']).toBeDefined();
      expect(sheet['gemini-nano'].providerId).toBe('p2');
      expect(sheet['gemini-nano'].providerType).toBe('gemini-nano');
      expect(sheet['gemini-2.5-flash']?.providerId).not.toBe('p2');
      expect(sheet['gemini-2.5-pro']?.providerId).not.toBe('p2');
    });
  });

  describe('MODEL_LIST_ENDPOINTS', () => {
    it('should have endpoints for openai, openrouter, groq, ollama, nvidia', () => {
      expect(MODEL_LIST_ENDPOINTS['openai']).toBeDefined();
      expect(MODEL_LIST_ENDPOINTS['openrouter']).toBeDefined();
      expect(MODEL_LIST_ENDPOINTS['groq']).toBeDefined();
      expect(MODEL_LIST_ENDPOINTS['ollama']).toBeDefined();
      expect(MODEL_LIST_ENDPOINTS['nvidia']).toBeDefined();
    });

    it('should NOT have endpoints for anthropic or gemini-nano', () => {
      expect(MODEL_LIST_ENDPOINTS['anthropic']).toBeUndefined();
      expect(MODEL_LIST_ENDPOINTS['gemini-nano']).toBeUndefined();
    });
  });
});
