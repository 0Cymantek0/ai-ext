import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IndexingWarningBanner } from '../IndexingWarningBanner';

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

describe('IndexingWarningBanner', () => {
  it('renders nothing when no indexing or failures', () => {
    const { container } = render(
      <IndexingWarningBanner indexingCount={0} failedCount={0} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('shows indexing message when items are indexing', () => {
    render(
      <IndexingWarningBanner indexingCount={2} failedCount={0} />
    );

    expect(screen.getByText('Indexing content for search')).toBeInTheDocument();
    expect(screen.getByText(/2 items are being indexed/i)).toBeInTheDocument();
  });

  it('shows failed message and retry button', () => {
    const onRetry = vi.fn();
    render(
      <IndexingWarningBanner indexingCount={0} failedCount={3} onRetry={onRetry} />
    );

    expect(screen.getByText('Indexing failed for some content')).toBeInTheDocument();
    expect(screen.getByText('Retry Indexing')).toBeInTheDocument();
  });
});
