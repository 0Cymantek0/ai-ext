import { describe, it, expect } from 'vitest';
import { truncateText, chunkText, sanitizeMarkdown } from '../src/utils/text.js';

describe('text utilities', () => {
  describe('truncateText', () => {
    it('truncates text to max length', () => {
      const result = truncateText('Hello, world!', 5);
      expect(result).toBe('He...');
    });

    it('returns original when shorter than max length', () => {
      const result = truncateText('Hi', 10);
      expect(result).toBe('Hi');
    });
  });

  describe('chunkText', () => {
    it('chunks text into equal parts', () => {
      const text = 'abcdefghij';
      const chunks = chunkText(text, 3);

      expect(chunks).toEqual(['abc', 'def', 'ghi', 'j']);
    });
  });

  describe('sanitizeMarkdown', () => {
    it('escapes backticks and dollar signs', () => {
      const text = 'Value is `$100`';
      const sanitized = sanitizeMarkdown(text);

      expect(sanitized).toBe('Value is \\`\\$100\\`');
    });
  });
});
