import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ProviderSettingsSheet } from '../src/sidepanel/components/ProviderSettingsSheet';
import * as React from 'react';

const mockSendMessage = vi.fn();
(global as any).chrome = {
  runtime: {
    sendMessage: mockSendMessage,
  },
};

describe('ProviderSettingsSheet shell', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
    mockSendMessage.mockResolvedValue({
      success: true,
      data: {
        providers: [],
        modelSheet: {},
        routingPreferences: {},
        speechSettings: {},
      }
    });
  });

  it('renders top-level tabs named Providers, Routing, and Speech', async () => {
    render(<ProviderSettingsSheet isOpen={true} onClose={() => {}} />);
    
    await waitFor(() => {
      expect(screen.getByText(/Providers/i)).toBeInTheDocument();
      expect(screen.getByText(/Routing/i)).toBeInTheDocument();
      expect(screen.getByText(/Speech/i)).toBeInTheDocument();
    });
  });

  it('requests one typed snapshot payload SETTINGS_SNAPSHOT_LOAD', async () => {
    render(<ProviderSettingsSheet isOpen={true} onClose={() => {}} />);
    
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'SETTINGS_SNAPSHOT_LOAD'
      }));
    });
  });
});
