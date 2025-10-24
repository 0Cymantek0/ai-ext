import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IndexingStatusBadge, PocketIndexingStatus } from '../IndexingStatusBadge';
import type { IndexingProgress } from '@/hooks/useIndexingStatus';

describe('IndexingStatusBadge', () => {
  it('shows pending status', () => {
    const progress: IndexingProgress = {
      jobId: 'job-1',
      contentId: 'content-1',
      operation: 'create',
      chunksTotal: 0,
      chunksProcessed: 0,
      status: 'pending',
    };

    render(<IndexingStatusBadge progress={progress} />);
    expect(screen.getByText('Queued')).toBeInTheDocument();
  });

  it('shows processing status with progress', () => {
    const progress: IndexingProgress = {
      jobId: 'job-1',
      contentId: 'content-1',
      operation: 'create',
      chunksTotal: 10,
      chunksProcessed: 5,
      status: 'processing',
    };

    render(<IndexingStatusBadge progress={progress} showProgress={true} />);
    expect(screen.getByText('Indexing 5/10')).toBeInTheDocument();
  });

  it('shows completed status', () => {
    const progress: IndexingProgress = {
      jobId: 'job-1',
      contentId: 'content-1',
      operation: 'create',
      chunksTotal: 10,
      chunksProcessed: 10,
      status: 'completed',
    };

    render(<IndexingStatusBadge progress={progress} />);
    expect(screen.getByText('Indexed')).toBeInTheDocument();
  });

  it('shows failed status with error message in title', () => {
    const progress: IndexingProgress = {
      jobId: 'job-1',
      contentId: 'content-1',
      operation: 'create',
      chunksTotal: 10,
      chunksProcessed: 5,
      status: 'failed',
      error: 'Rate limit exceeded',
    };

    const { container } = render(<IndexingStatusBadge progress={progress} />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    
    const badge = container.querySelector('[title="Rate limit exceeded"]');
    expect(badge).toBeInTheDocument();
  });
});

describe('PocketIndexingStatus', () => {
  it('does not render when no content', () => {
    const { container } = render(
      <PocketIndexingStatus
        indexingCount={0}
        failedCount={0}
        completedCount={0}
        totalContent={0}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows indexing status when content is being indexed', () => {
    render(
      <PocketIndexingStatus
        indexingCount={3}
        failedCount={0}
        completedCount={7}
        totalContent={10}
      />
    );
    expect(screen.getByText(/Indexing 3 of 10/)).toBeInTheDocument();
  });

  it('shows failed status with retry button', () => {
    const onRetry = vi.fn();
    render(
      <PocketIndexingStatus
        indexingCount={0}
        failedCount={2}
        completedCount={8}
        totalContent={10}
        onRetry={onRetry}
      />
    );
    
    expect(screen.getByText(/2 failed/)).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows all indexed status when complete', () => {
    render(
      <PocketIndexingStatus
        indexingCount={0}
        failedCount={0}
        completedCount={10}
        totalContent={10}
      />
    );
    expect(screen.getByText('All indexed')).toBeInTheDocument();
  });
});
