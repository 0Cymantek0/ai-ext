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
                        providerType: 'test',
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
                        providerType: 'test',
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
      expect(screen.getByText(/Fallback from/i)).toBeInTheDocument();
      expect(screen.getByText('provider-1 • model-1')).toBeInTheDocument();
    });
  });
});
