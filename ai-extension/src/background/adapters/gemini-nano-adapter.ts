import { chromeai } from 'chrome-ai';
import { generateText, type LanguageModel } from 'ai';
import type { BaseProviderAdapter } from './base-adapter.js';
import type { ProviderConfig, ProviderType } from '../provider-types.js';

export class GeminiNanoAdapter implements BaseProviderAdapter {
  providerType: ProviderType = 'gemini-nano';
  config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  getLanguageModel(modelId?: string): LanguageModel {
    // If we're not in the environment with native self.ai, chromeai will throw unless proxied
    return chromeai(modelId || 'text');
  }

  async checkAvailability(): Promise<{ available: boolean; error?: string }> {
    try {
      let ai = (self as any).ai;
      
      if (!ai || !ai.languageModel) {
        await this.setupOffscreenProxy();
        ai = (self as any).ai;
      }

      if (!ai || !ai.languageModel) {
        return { available: false, error: 'Prompt API is not available in this environment' };
      }

      const capabilities = await ai.languageModel.capabilities();
      if (capabilities.available === 'no') {
        return { available: false, error: 'Gemini Nano is not available or model needs downloading.' };
      }
      
      return { available: true };
    } catch (error: any) {
      return { available: false, error: error.message || 'Error checking availability' };
    }
  }

  async validateConnection(): Promise<{ success: boolean; error?: string }> {
    const availability = await this.checkAvailability();
    if (!availability.available) {
      return { success: false, error: availability.error };
    }

    try {
      const model = this.getLanguageModel();
      await generateText({
        model,
        prompt: 'test',
        maxTokens: 1,
      });
      return { success: true };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'Failed to generate test completion'
      };
    }
  }

  private async setupOffscreenProxy() {
    if ((self as any).__aiProxySetup || !chrome.offscreen) return;
    
    try {
      const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html';

      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
      });

      if (existingContexts.length === 0) {
        await chrome.offscreen.createDocument({
          url: OFFSCREEN_DOCUMENT_PATH,
          reasons: [chrome.offscreen.Reason.WORKERS || chrome.offscreen.Reason.DOM_PARSER],
          justification: 'Proxy AI Prompt API requests from background service worker'
        });
      }

      // Minimal proxy for capabilities. For full usage, chromeai expects a complete polyfill
      // which handles AsyncIterables. The offscreen script handles the runtime messages.
      (self as any).ai = {
        languageModel: {
          capabilities: async () => {
            return await chrome.runtime.sendMessage({ type: 'NANO_PROXY', action: 'capabilities' });
          }
          // Note: Full proxy for `create` and streaming is left to the offscreen implementation
          // if it needs to intercept LanguageModelV1 methods.
        }
      };
      (self as any).__aiProxySetup = true;
    } catch (e) {
      console.warn("Failed to setup offscreen proxy for Gemini Nano", e);
    }
  }
}
