/**
 * Normalizes timestamps for consistent formatting
 */

export function normalizeTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

export function relativeTime(fromTimestamp: number, toTimestamp: number): string {
  const diff = toTimestamp - fromTimestamp;
  return `+${formatDuration(diff)}`;
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toISOString().split('T')[1].replace('Z', '');
}
