# Indexing Status and No-Result UX Feature

## Overview
This feature adds indexing status tracking and UI feedback for vector indexing operations in the AI Pocket extension's side panel, specifically for the ChatApp and pocket components.

## Implementation

### 1. Core Hook: `useIndexingStatus`
**Location:** `src/hooks/useIndexingStatus.ts`

Provides reactive state management for indexing status:
- Listens to `VECTOR_INDEXING_PROGRESS` messages from the background service worker
- Tracks indexing progress by content ID
- Provides helper methods:
  - `getContentStatus(contentId)` - Get progress for specific content
  - `isContentIndexing(contentId)` - Check if content is being indexed
  - `isContentFailed(contentId)` - Check if indexing failed
  - `getPocketIndexingStatus(contentIds[])` - Get aggregated status for a pocket
  - `retryFailedIndexing(contentId)` - Trigger retry for failed content

### 2. UI Components

#### `IndexingStatusBadge`
**Location:** `src/components/pockets/IndexingStatusBadge.tsx`

Displays status badge for individual content items with:
- Visual icons for pending, processing, completed, and failed states
- Progress indicators showing chunks processed vs total
- Color-coded states (yellow=pending, blue=processing, green=completed, red=failed)
- Error message in tooltip for failed items

#### `PocketIndexingStatus`
**Location:** `src/components/pockets/IndexingStatusBadge.tsx`

Aggregated status display for pockets showing:
- Count of items being indexed
- Count of failed items with retry button
- "All indexed" confirmation when complete
- Compact, non-intrusive design

#### `IndexingWarningBanner`
**Location:** `src/components/IndexingWarningBanner.tsx`

Warning banner for Ask mode when indexing is in progress:
- Shows when pocket content is still being indexed
- Warns that RAG search may have incomplete results
- Provides retry option for failed items
- Auto-hides when indexing completes

### 3. Integration Points

#### PocketManager Component
**Location:** `src/components/pockets/PocketManager.tsx`

- Uses `useIndexingStatus` hook
- Passes indexing status to each `PocketCard`
- Displays `PocketIndexingStatus` component for each pocket
- Provides retry handlers for failed indexing

#### PocketCard Component
**Location:** `src/components/pockets/PocketCard.tsx`

- Accepts optional `indexingStatus` prop
- Displays status below pocket metadata in both list and grid views
- Integrates seamlessly with existing pocket UI

#### ChatApp Component
**Location:** `src/sidepanel/ChatApp.tsx`

- Uses `useIndexingStatus` hook
- Can check indexing status before allowing pocket-scoped queries in Ask mode
- Prepared for future enhancement: disable search or show warning when indexing

#### SearchBar Component
**Location:** `src/components/SearchBar.tsx`

- Added optional `disabled` prop for future use
- Prevents search submission when disabled
- Visual feedback with opacity when disabled

### 4. Backend Support

#### Service Worker Handler
**Location:** `src/background/service-worker.ts`

Added `VECTOR_INDEXING_RETRY` message handler:
- Accepts `contentId` parameter
- Re-queues failed content for high-priority indexing
- Uses existing `vectorIndexingQueue` infrastructure

### 5. Test Coverage

#### Component Tests
**Location:** `src/components/pockets/__tests__/IndexingStatusBadge.test.tsx`

Tests for:
- Pending status display
- Processing status with progress
- Completed status
- Failed status with error
- Pocket-level aggregated status
- Retry button functionality

**Location:** `src/components/__tests__/IndexingWarningBanner.test.tsx`

Tests for:
- Rendering conditions (indexing, failed, none)
- Correct messages
- Retry button presence

**Location:** `src/hooks/__tests__/useIndexingStatus.test.tsx`

Tests for:
- Initial state
- Progress tracking
- Status transitions
- Failed content tracking
- Pocket status aggregation
- Retry functionality

### 6. Test Configuration
**Location:** `vitest.config.ts`

- Added path alias resolution for `@` imports
- Configured test setup file
- Enabled jsdom environment

**Location:** `src/test-setup.ts`

- Imports `@testing-library/jest-dom` for enhanced matchers

## Usage Examples

### Using the hook in a component:
```tsx
import { useIndexingStatus } from '@/hooks/useIndexingStatus';

function MyComponent() {
  const indexingStatus = useIndexingStatus();
  
  // Check if any content is indexing
  if (indexingStatus.status.isAnyIndexing) {
    console.log('Indexing in progress...');
  }
  
  // Get status for specific content
  const progress = indexingStatus.getContentStatus('content-123');
  
  // Retry failed content
  await indexingStatus.retryFailedIndexing('content-456');
}
```

### Displaying status in UI:
```tsx
import { PocketIndexingStatus } from '@/components/pockets';

function PocketDisplay({ pocket }) {
  const indexingStatus = useIndexingStatus();
  const pocketStatus = indexingStatus.getPocketIndexingStatus(pocket.contentIds);
  
  return (
    <div>
      <h2>{pocket.name}</h2>
      <PocketIndexingStatus
        indexingCount={pocketStatus.indexingCount}
        failedCount={pocketStatus.failedCount}
        completedCount={pocketStatus.completedCount}
        totalContent={pocketStatus.totalContent}
        onRetry={() => {
          pocketStatus.failedContentIds.forEach(id => {
            indexingStatus.retryFailedIndexing(id);
          });
        }}
      />
    </div>
  );
}
```

## Future Enhancements

1. **Ask Mode Search Gating**
   - Implement logic in ChatApp to check indexing status before allowing pocket-scoped queries
   - Show IndexingWarningBanner when appropriate
   - Optionally disable search input until indexing completes

2. **Progress Notifications**
   - Toast notifications for indexing completion
   - Error notifications for persistent failures

3. **Batch Retry**
   - Retry all failed content in a pocket with one action
   - Retry all failed content across all pockets

4. **Performance Metrics**
   - Track average indexing time
   - Display estimated time remaining for large batches

5. **Queue Management**
   - Allow users to prioritize certain pockets for indexing
   - Pause/resume indexing queue

## Dependencies

- React 19.2.0
- @testing-library/react
- @testing-library/jest-dom
- @testing-library/user-event
- framer-motion (for animations)
- Vitest (for testing)

## Notes

- Indexing status is tracked in-memory and reset on extension reload
- Progress events are emitted via `chrome.runtime.sendMessage` from the background worker
- The `VECTOR_INDEXING_PROGRESS` message type follows the existing pattern in `vector-indexing-queue.ts`
- All UI components use the existing design system (Tailwind CSS, shadcn UI primitives)
