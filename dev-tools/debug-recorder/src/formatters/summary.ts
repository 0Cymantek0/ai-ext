import type { Interaction } from '../types.js';
import { normalizeStatus } from '../utils/status.js';
import { formatDuration, formatTime, relativeTime } from '../utils/timestamp.js';

export function summarizeInteractions(interactions: Interaction[], sessionStart: number): string {
  if (!interactions.length) {
    return '## Session Summary\n\n_No recorded interactions._\n\n---\n';
  }

  const lines: string[] = ['## Session Summary', '', '| # | Type | Status | Started | Δ Time | Duration | Description |', '|---|------|--------|---------|--------|----------|-------------|'];

  interactions.forEach((interaction, index) => {
    const status = normalizeStatus(interaction.status);
    const startTime = formatTime(interaction.timestamp);
    const delta = relativeTime(sessionStart, interaction.timestamp);
    const duration = interaction.duration !== undefined ? formatDuration(interaction.duration) : '—';
    const description = interaction.description.replace(/\n/g, ' ');
    lines.push(`| ${index + 1} | ${interaction.type} | ${status} | ${startTime} | ${delta} | ${duration} | ${description} |`);
  });

  lines.push('', '---', '');

  return lines.join('\n');
}
