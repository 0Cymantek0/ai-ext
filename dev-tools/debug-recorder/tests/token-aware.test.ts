import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  truncateToTokenLimit,
  chunkByTokens,
  trimRedundantLines,
  allocateTokenBudget,
} from '../src/utils/token-aware.js';

describe('Token-aware utilities', () => {
  describe('estimateTokens', () => {
    it('estimates token count from text', () => {
      const text = 'a'.repeat(400);
      const tokens = estimateTokens(text);
      expect(tokens).toBe(100);
    });
  });

  describe('truncateToTokenLimit', () => {
    it('truncates text to token limit', () => {
      const text = 'a'.repeat(4000);
      const truncated = truncateToTokenLimit(text, 500);

      expect(truncated.length).toBeLessThan(text.length);
      expect(truncated).toContain('[... truncated');
    });

    it('does not truncate when under limit', () => {
      const text = 'short text';
      const truncated = truncateToTokenLimit(text, 500);
      expect(truncated).toBe(text);
    });
  });

  describe('chunkByTokens', () => {
    it('chunks text by token count', () => {
      const text = 'a'.repeat(4000);
      const chunks = chunkByTokens(text, 250);

      expect(chunks.length).toBe(4);
      expect(chunks[0].length).toBe(1000);
    });
  });

  describe('trimRedundantLines', () => {
    it('removes consecutive duplicate lines', () => {
      const text = `Line 1
Line 1
Line 2
Line 2
Line 3`;

      const trimmed = trimRedundantLines(text);
      const lines = trimmed.split('\n');

      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('Line 1');
      expect(lines[1]).toBe('Line 2');
      expect(lines[2]).toBe('Line 3');
    });

    it('preserves non-consecutive duplicates', () => {
      const text = `Line 1
Line 2
Line 1`;

      const trimmed = trimRedundantLines(text);
      expect(trimmed.split('\n')).toHaveLength(3);
    });

    it('preserves empty lines', () => {
      const text = `Line 1

Line 2`;

      const trimmed = trimRedundantLines(text);
      expect(trimmed.split('\n')).toHaveLength(3);
    });
  });

  describe('allocateTokenBudget', () => {
    it('allocates budget proportionally', () => {
      const budget = allocateTokenBudget(10000);

      expect(budget.total).toBe(10000);
      expect(budget.metadata).toBe(500);
      expect(budget.summary).toBe(1000);
      expect(budget.interactions).toBe(3000);
      expect(budget.logs).toBe(2500);
      expect(budget.errors).toBe(1500);
      expect(budget.snapshots).toBe(1000);
      expect(budget.assets).toBe(500);
    });
  });
});
