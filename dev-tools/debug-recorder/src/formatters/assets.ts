import type { Interaction } from '../types.js';
import { normalizeTimestamp } from '../utils/timestamp.js';

export function formatAssets(interactions: Interaction[], collapse = true): string {
  const assets = interactions.filter((interaction) => interaction.screenshot);

  if (!assets.length) {
    return '';
  }

  const lines: string[] = ['## Captured Assets', ''];

  for (const asset of assets) {
    const title = `${asset.type} — ${normalizeTimestamp(asset.timestamp)}`;
    if (collapse) {
      lines.push('<details>');
      lines.push(`<summary>${title}</summary>`);
      lines.push('');
      lines.push('```base64');
      lines.push(asset.screenshot ?? '');
      lines.push('```');
      lines.push('');
      lines.push('</details>');
      lines.push('');
    } else {
      lines.push(`### ${title}`);
      lines.push('');
      lines.push('```base64');
      lines.push(asset.screenshot ?? '');
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}
