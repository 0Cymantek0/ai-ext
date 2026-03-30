import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RoutingSettingsTab } from '../src/sidepanel/components/settings/RoutingSettingsTab';
import * as React from 'react';

describe('RoutingSettingsTab', () => {
  const mockSnapshot = {
    providers: [{ id: 'provider-1', name: 'Provider 1', type: 'test', enabled: true }],
    modelSheet: { 'model-1': { id: 'model-1', providerId: 'provider-1', providerType: 'test' } },
    routingPreferences: { chat: null, embeddings: null, speech: null, fallbackChain: [] },
    speechSettings: { provider: { providerId: '', modelId: '' }, language: 'en', timestampGranularity: 'segment' }
  };

  it('renders sections for chat, embeddings, and speech capability assignments', () => {
    render(<RoutingSettingsTab snapshot={mockSnapshot} onUpdate={() => {}} />);
    expect(screen.getByText(/chat/i)).toBeInTheDocument();
    expect(screen.getByText(/embeddings/i)).toBeInTheDocument();
    expect(screen.getByText(/speech/i)).toBeInTheDocument();
  });

  it('hides fallback controls by default and shows them when advanced section is expanded', async () => {
    render(<RoutingSettingsTab snapshot={mockSnapshot} onUpdate={() => {}} />);
    
    // The fallback section should be hidden
    expect(screen.queryByText(/fallback/i)).not.toBeInTheDocument();
    
    // Click advanced
    const advancedToggle = screen.getByText(/advanced/i);
    fireEvent.click(advancedToggle);
    
    // The fallback section should appear
    await waitFor(() => {
      expect(screen.getByText(/fallback/i)).toBeInTheDocument();
    });
  });
});
