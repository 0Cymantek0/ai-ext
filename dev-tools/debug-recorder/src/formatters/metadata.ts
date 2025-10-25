import { SessionMetadata } from '../types.js';
import { normalizeTimestamp, formatDuration } from '../utils/timestamp.js';

export function formatMetadata(metadata: SessionMetadata): string {
  const lines = [
    '# Debug Session Report',
    '',
    `**Session ID**: \`${metadata.sessionId}\``,
    `**Start Time**: ${normalizeTimestamp(metadata.startTime)}`,
  ];

  if (metadata.endTime) {
    lines.push(`**End Time**: ${normalizeTimestamp(metadata.endTime)}`);
    const duration = metadata.endTime - metadata.startTime;
    lines.push(`**Duration**: ${formatDuration(duration)}`);
  } else {
    lines.push('**Status**: 🔴 In Progress');
  }

  lines.push('');

  if (metadata.extensionId) {
    lines.push('## Extension Information');
    lines.push('');
    lines.push(`- **Extension ID**: \`${metadata.extensionId}\``);

    if (metadata.extensionVersion) {
      lines.push(`- **Version**: ${metadata.extensionVersion}`);
    }

    if (metadata.chromeVersion) {
      lines.push(`- **Chrome Version**: ${metadata.chromeVersion}`);
    }

    if (metadata.platform) {
      lines.push(`- **Platform**: ${metadata.platform}`);
    }

    lines.push('');
  }

  if (metadata.recordingOptions) {
    lines.push('## Recording Options');
    lines.push('');
    const options = metadata.recordingOptions;
    lines.push(`- Screenshots: ${options.includeScreenshots ? '✅' : '❌'}`);
    lines.push(`- Storage Data: ${options.includeStorage ? '✅' : '❌'}`);
    lines.push(`- Performance Metrics: ${options.includeMetrics ? '✅' : '❌'}`);
    lines.push(`- PII Included: ${options.includePII ? '⚠️ Yes' : '❌ No'}`);
    if (options.maxLogSize) {
      lines.push(`- Max Log Size: ${options.maxLogSize} bytes`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}
