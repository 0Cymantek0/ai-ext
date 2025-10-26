import type { ErrorEntry } from '../types.js';
import { normalizeTimestamp } from '../utils/timestamp.js';
import { sanitizeMarkdown, truncateText } from '../utils/text.js';
import { truncateToTokenLimit } from '../utils/token-aware.js';

export function formatErrorDigests(errors: ErrorEntry[], maxTokens = 3000): string {
  if (!errors.length) {
    return '## Error Digests\n\n_No errors recorded._\n\n---\n';
  }

  const lines: string[] = ['## Error Digests', ''];
  const tokensPerError = Math.max(150, Math.floor(maxTokens / errors.length));

  for (const error of errors) {
    const timestamp = normalizeTimestamp(error.timestamp);
    const message = sanitizeMarkdown(truncateText(error.message, 300));
    lines.push(`### ${timestamp}`);
    lines.push('');
    lines.push(`- **Message**: ${message}`);
    if (error.source) {
      lines.push(`- **Source**: \`${error.source}\``);
    }
    if (error.code) {
      lines.push(`- **Code**: \`${error.code}\``);
    }
    if (error.context && Object.keys(error.context).length > 0) {
      lines.push('- **Context**:');
      lines.push('');
      lines.push('```json');
      lines.push(
        truncateToTokenLimit(
          JSON.stringify(error.context, null, 2),
          Math.floor(tokensPerError * 0.3)
        )
      );
      lines.push('```');
    }
    if (error.stack) {
      lines.push('- **Stack**:');
      lines.push('');
      lines.push('```text');
      lines.push(truncateToTokenLimit(error.stack, Math.floor(tokensPerError * 0.6)));
      lines.push('```');
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}
