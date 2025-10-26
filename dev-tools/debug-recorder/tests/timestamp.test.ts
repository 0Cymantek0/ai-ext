import { describe, it, expect } from 'vitest';
import {
  normalizeTimestamp,
  formatDuration,
  relativeTime,
  formatTime,
} from '../src/utils/timestamp.js';

describe('timestamp utilities', () => {
  describe('normalizeTimestamp', () => {
    it('converts timestamp to ISO string', () => {
      const result = normalizeTimestamp(1704470400000);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('formatDuration', () => {
    it('formats milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('formats seconds', () => {
      expect(formatDuration(5000)).toBe('5.00s');
    });

    it('formats minutes', () => {
      expect(formatDuration(125000)).toBe('2m 5s');
    });

    it('formats hours', () => {
      expect(formatDuration(7200000)).toBe('2h 0m');
    });
  });

  describe('relativeTime', () => {
    it('calculates relative time', () => {
      const from = 1704470400000;
      const to = 1704470405500;
      const result = relativeTime(from, to);

      expect(result).toBe('+5.50s');
    });
  });

  describe('formatTime', () => {
    it('formats time portion only', () => {
      const result = formatTime(1704470400000);
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    });
  });
});
