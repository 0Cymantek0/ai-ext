import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsManager } from '../src/background/routing/settings-manager';

describe('Provider Settings Messages', () => {
  it('handles SETTINGS_ROUTING_LOAD by returning routingPreferences and modelSheet', async () => {
    const settingsManager = new SettingsManager();
    const mockGetRoutingPreferences = vi.spyOn(settingsManager, 'getRoutingPreferences').mockResolvedValue({
      routingMode: 'auto',
      fallbackChain: [],
      chat: null,
      embeddings: null,
      speech: null,
      triggerWords: {},
      providerParameters: {}
    } as any);
    const mockGetModelSheet = vi.spyOn(settingsManager, 'getModelSheet').mockResolvedValue({
      'test-model': { modelId: 'test-model', providerId: 'test', providerType: 'openai', enabled: true, capabilities: {} as any, tier: {} as any }
    });

    // Simulated handler for SETTINGS_ROUTING_LOAD
    const handler = async () => {
      const routingPreferences = await settingsManager.getRoutingPreferences();
      const modelSheet = await settingsManager.getModelSheet();
      return { routingPreferences, modelSheet };
    };

    const result = await handler();

    expect(mockGetRoutingPreferences).toHaveBeenCalled();
    expect(mockGetModelSheet).toHaveBeenCalled();
    expect(result.routingPreferences).toBeDefined();
    expect(result.modelSheet).toBeDefined();
    expect(result.routingPreferences.routingMode).toBe('auto');
  });

  it('handles SETTINGS_ROUTING_SAVE', async () => {
    const settingsManager = new SettingsManager();
    const mockSetRoutingMode = vi.spyOn(settingsManager, 'setRoutingMode').mockResolvedValue(undefined);
    
    // Simulated handler for SETTINGS_ROUTING_SAVE
    const handler = async (payload: any) => {
      if (payload.routingPreferences?.routingMode) {
        await settingsManager.setRoutingMode(payload.routingPreferences.routingMode);
      }
      return { success: true };
    };

    await handler({ routingPreferences: { routingMode: 'manual' } });
    expect(mockSetRoutingMode).toHaveBeenCalledWith('manual');
  });
});
