/**
 * Token-aware truncation for LLM optimization
 */

const APPROX_CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const maxChars = maxTokens * APPROX_CHARS_PER_TOKEN;
  if (text.length <= maxChars) {
    return text;
  }

  const truncated = text.slice(0, Math.max(0, maxChars - 20));
  const estimatedTokens = estimateTokens(truncated);
  return `${truncated}\n\n[... truncated ${estimateTokens(text) - estimatedTokens} tokens]`;
}

export function chunkByTokens(text: string, tokensPerChunk: number): string[] {
  const charsPerChunk = tokensPerChunk * APPROX_CHARS_PER_TOKEN;
  const chunks: string[] = [];

  for (let i = 0; i < text.length; i += charsPerChunk) {
    chunks.push(text.slice(i, i + charsPerChunk));
  }

  return chunks;
}

export function trimRedundantLines(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push(line);
      continue;
    }

    const last = result[result.length - 1];
    if (!last || last.trim() !== trimmed) {
      result.push(line);
    }
  }

  return result.join('\n');
}

export interface TokenBudget {
  total: number;
  metadata: number;
  summary: number;
  interactions: number;
  logs: number;
  errors: number;
  snapshots: number;
  assets: number;
}

export function allocateTokenBudget(totalTokens: number): TokenBudget {
  return {
    total: totalTokens,
    metadata: Math.floor(totalTokens * 0.05),
    summary: Math.floor(totalTokens * 0.1),
    interactions: Math.floor(totalTokens * 0.3),
    logs: Math.floor(totalTokens * 0.25),
    errors: Math.floor(totalTokens * 0.15),
    snapshots: Math.floor(totalTokens * 0.1),
    assets: Math.floor(totalTokens * 0.05),
  };
}
