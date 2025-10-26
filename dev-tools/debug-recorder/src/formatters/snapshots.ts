import type { StateSnapshot } from '../types.js';
import { normalizeTimestamp } from '../utils/timestamp.js';

export function formatStateSnapshots(snapshots: StateSnapshot[]): string {
  if (!snapshots.length) {
    return '## State Snapshots\n\n_No state snapshots captured._\n\n---\n';
  }

  const lines: string[] = ['## State Snapshots', ''];

  for (const [index, snapshot] of snapshots.entries()) {
    lines.push(`### Snapshot #${index + 1} — ${normalizeTimestamp(snapshot.timestamp)}`);
    lines.push('');

    if (snapshot.storageUsage) {
      lines.push('**Storage Usage:**');
      if (snapshot.storageUsage.indexedDB !== undefined) {
        lines.push(`- IndexedDB: ${formatBytes(snapshot.storageUsage.indexedDB)}`);
      }
      if (snapshot.storageUsage.localStorage !== undefined) {
        lines.push(`- LocalStorage: ${formatBytes(snapshot.storageUsage.localStorage)}`);
      }
      if (snapshot.storageUsage.chromeStorage !== undefined) {
        lines.push(`- Chrome Storage: ${formatBytes(snapshot.storageUsage.chromeStorage)}`);
      }
      lines.push('');
    }

    if (snapshot.aiState) {
      lines.push('**AI State:**');
      if (snapshot.aiState.activeModels && snapshot.aiState.activeModels.length > 0) {
        lines.push(`- Active Models: ${snapshot.aiState.activeModels.join(', ')}`);
      }
      if (snapshot.aiState.pendingRequests !== undefined) {
        lines.push(`- Pending Requests: ${snapshot.aiState.pendingRequests}`);
      }
      if (snapshot.aiState.tokenUsage !== undefined) {
        lines.push(`- Token Usage: ${snapshot.aiState.tokenUsage.toLocaleString()}`);
      }
      lines.push('');
    }

    if (snapshot.performance) {
      lines.push('**Performance:**');
      if (snapshot.performance.memory !== undefined) {
        lines.push(`- Memory: ${formatBytes(snapshot.performance.memory)}`);
      }
      if (snapshot.performance.cpu !== undefined) {
        lines.push(`- CPU: ${snapshot.performance.cpu.toFixed(1)}%`);
      }
      lines.push('');
    }

    if (snapshot.breadcrumbs && snapshot.breadcrumbs.length > 0) {
      lines.push('**Breadcrumbs:**');
      for (const breadcrumb of snapshot.breadcrumbs) {
        lines.push(`- ${breadcrumb}`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
