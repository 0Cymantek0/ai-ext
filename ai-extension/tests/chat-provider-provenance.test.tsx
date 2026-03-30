import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatApp } from '../src/sidepanel/ChatApp';
import * as React from 'react';

// Mock dependencies to avoid rendering issues with complex hooks
vi.mock('../src/hooks/useIndexingStatus', () => ({
  useIndexingStatus: () => ({ status: { isAnyIndexing: false, failedContentIds: new Set(), indexingContentIds: new Set() } }),
}));
vi.mock('../src/hooks/useContextProgress', () => ({
  useContextProgress: () => ({ steps: [], isGathering: false }),
}));

describe('ChatApp Provider Provenance', () => {
  it('renders provider provenance and fallback label', async () => {
    // Mock chrome.runtime.sendMessage to return a conversation with provenance metadata
    (global as any).chrome = {
      runtime: {
        sendMessage: vi.fn().mockImplementation((req) => {
          if (req.kind === 'SETTINGS_SNAPSHOT_LOAD') {
            return Promise.resolve({
              success: true,
              data: {
                providers: [
                  {
                    id: 'provider-0',
                    type: 'groq',
                    name: 'Groq Primary',
                    enabled: true,
                  },
                  {
                    id: 'provider-1',
                    type: 'openai',
                    name: 'OpenAI Fallback',
                    enabled: true,
                  },
                ],
                modelSheet: {},
                routingPreferences: { chat: null, embeddings: null, speech: null, fallbackChain: [], routingMode: 'auto', triggerWords: {}, providerParameters: {} },
                speechSettings: { provider: { providerId: '', modelId: '' }, language: 'en', timestampGranularity: 'none' },
              },
            });
          }
          if (req.kind === 'CONVERSATION_LIST') {
            return Promise.resolve({
              success: true,
              data: {
                conversations: [{
                  id: 'conv-1',
                  updatedAt: Date.now(),
                  messages: [{
                    id: '1',
                    role: 'assistant',
                    content: 'Hello World',
                    timestamp: Date.now(),
                    metadata: {
                      providerExecution: {
                        providerId: 'provider-1',
                        providerType: 'openai',
                        modelId: 'model-1',
                        attemptedProviderIds: ['provider-0', 'provider-1'],
                        fallbackOccurred: true,
                        fallbackFromProviderId: 'provider-0'
                      }
                    }
                  }]
                }]
              }
            });
          }
          if (req.kind === 'CONVERSATION_GET') {
            return Promise.resolve({
              success: true,
              data: {
                conversation: {
                  id: 'conv-1',
                  messages: [{
                    id: '1',
                    role: 'assistant',
                    content: 'Hello World',
                    timestamp: Date.now(),
                    metadata: {
                      providerExecution: {
                        providerId: 'provider-1',
                        providerType: 'openai',
                        modelId: 'model-1',
                        attemptedProviderIds: ['provider-0', 'provider-1'],
                        fallbackOccurred: true,
                        fallbackFromProviderId: 'provider-0'
                      }
                    }
                  }]
                }
              }
            });
          }
          return Promise.resolve({ success: true, data: {} });
        }),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        },
        getURL: vi.fn().mockReturnValue('mock-url')
      }
    };

    render(<ChatApp />);

    // Trigger history panel open and select conversation
    // Wait for the history panel toggle to be visible
    const historyButton = await screen.findByRole('button', { name: /History/i, hidden: true }).catch(() => null);
    if (historyButton) {
      historyButton.click();
    }

    // Wait for the conversation list item
    const convItem = await screen.findByText('Hello World');
    convItem.click();

    await waitFor(() => {
      // Provider name from lookup: "OpenAI Fallback", not raw provider-1
      expect(screen.getByText('OpenAI Fallback • model-1')).toBeInTheDocument();
      // Fallback label uses provider name from lookup: "Groq Primary"
      expect(screen.getByText(/Fallback from Groq Primary/i)).toBeInTheDocument();
    });
  });
});
