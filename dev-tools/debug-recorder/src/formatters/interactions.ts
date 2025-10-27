import type { Interaction, LogEntry } from '../types.js';
import { normalizeStatus } from '../utils/status.js';
import { normalizeTimestamp, formatDuration } from '../utils/timestamp.js';
import { truncateToTokenLimit } from '../utils/token-aware.js';
import { sanitizeMarkdown } from '../utils/text.js';

export function formatDetailedInteractions(
  interactions: Interaction[],
  maxTokens = 5000,
  collapseLogs = true
): string {
  if (!interactions.length) {
    return '';
  }

  const lines: string[] = ['## Detailed Interaction Chronology', ''];

  const tokensPerInteraction = Math.floor(maxTokens / interactions.length);

  for (const [index, interaction] of interactions.entries()) {
    const status = normalizeStatus(interaction.status);

    lines.push(`<details>`);
    lines.push(
      `<summary><strong>#${index + 1} — ${interaction.type}</strong> | ${status} | ${interaction.description}</summary>`
    );
    lines.push('');
    lines.push(`- **ID**: \`${interaction.id}\``);
    lines.push(`- **Timestamp**: ${normalizeTimestamp(interaction.timestamp)}`);
    lines.push(`- **Status**: ${status}`);
    if (interaction.duration !== undefined) {
      lines.push(`- **Duration**: ${formatDuration(interaction.duration)}`);
    }
    lines.push('');

    if (interaction.context && Object.keys(interaction.context).length > 0) {
      lines.push('### Context');
      lines.push('');
      lines.push('```json');
      const contextJson = JSON.stringify(interaction.context, null, 2);
      lines.push(truncateToTokenLimit(contextJson, Math.floor(tokensPerInteraction * 0.3)));
      lines.push('```');
      lines.push('');
    }

    if (interaction.logs && interaction.logs.length > 0) {
      lines.push('### Logs');
      lines.push('');
      const logsText = formatLogs(interaction.logs);
      if (collapseLogs && logsText.length > 500) {
        lines.push('<details>');
        lines.push('<summary>View logs</summary>');
        lines.push('');
        lines.push(truncateToTokenLimit(logsText, Math.floor(tokensPerInteraction * 0.4)));
        lines.push('');
        lines.push('</details>');
      } else {
        lines.push(truncateToTokenLimit(logsText, Math.floor(tokensPerInteraction * 0.4)));
      }
      lines.push('');
    }

    if (interaction.errors && interaction.errors.length > 0) {
      lines.push('### Errors');
      lines.push('');
      for (const error of interaction.errors) {
        lines.push(
          `- **[${normalizeTimestamp(error.timestamp)}]** ${sanitizeMarkdown(error.message)}`
        );
        if (error.source) {
          lines.push(`  - Source: \`${error.source}\``);
        }
        if (error.code) {
          lines.push(`  - Code: \`${error.code}\``);
        }
        if (error.recovered) {
          lines.push(`  - ✅ Recovered`);
        }
      }
      lines.push('');
    }

    lines.push('</details>');
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

function formatLogs(logs: LogEntry[]): string {
  return logs
    .map((log) => {
      const level = log.level.toUpperCase().padEnd(5);
      const time = normalizeTimestamp(log.timestamp);
      const message = sanitizeMarkdown(log.message);
      return `[${time}] ${level} [${log.source}] ${message}`;
    })
    .join('\n');
}
