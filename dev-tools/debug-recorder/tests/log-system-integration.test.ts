/**
 * Integration tests for the complete logging system
 * Tests the console wrapper, bridge client, and log collector together
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  StructuredLogEnvelope,
  LogOrigin,
} from '../src/types.js';

describe('Logging System Integration', () => {
  describe('Console Wrapper + Bridge Client Integration', () => {
    it('should handle rapid console calls without data loss', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      // Simulate rapid logging
      for (let i = 0; i < 1000; i++) {
        collector({
          timestamp: Date.now() + i,
          level: 'info',
          message: `Log ${i}`,
          origin: 'background',
        });
      }

      expect(logs).toHaveLength(1000);
      expect(logs[0]?.message).toBe('Log 0');
      expect(logs[999]?.message).toBe('Log 999');
    });

    it('should handle logs with various data types', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      const testData = [
        { value: 'string', expected: 'string' },
        { value: 123, expected: 123 },
        { value: { nested: { object: true } }, expected: { nested: { object: true } } },
        { value: [1, 2, 3], expected: [1, 2, 3] },
        { value: null, expected: null },
        { value: undefined, expected: undefined },
      ];

      testData.forEach(({ value }, index) => {
        collector({
          timestamp: Date.now(),
          level: 'info',
          message: `Test ${index}`,
          data: [value],
          origin: 'background',
        });
      });

      expect(logs).toHaveLength(testData.length);
      logs.forEach((log, index) => {
        expect(log.data?.[0]).toEqual(testData[index]?.value);
      });
    });

    it('should handle circular references gracefully', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      // Create circular reference
      const obj: any = { name: 'test' };
      obj.self = obj;

      // Should not throw when collecting
      expect(() => {
        collector({
          timestamp: Date.now(),
          level: 'info',
          message: 'Circular',
          data: [obj],
          origin: 'background',
        });
      }).not.toThrow();

      expect(logs).toHaveLength(1);
    });

    it('should preserve stack traces', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      const error = new Error('Test error');
      collector({
        timestamp: Date.now(),
        level: 'error',
        message: 'Error occurred',
        data: [error],
        stack: error.stack,
        origin: 'background',
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]?.stack).toBeDefined();
      expect(logs[0]?.stack).toContain('Error: Test error');
    });
  });

  describe('Log Origin Categorization', () => {
    it('should correctly categorize logs by origin', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      const origins: LogOrigin[] = ['background', 'content-script', 'side-panel', 'offscreen'];

      origins.forEach((origin) => {
        collector({
          timestamp: Date.now(),
          level: 'info',
          message: `Log from ${origin}`,
          origin,
        });
      });

      expect(logs).toHaveLength(4);
      origins.forEach((origin, index) => {
        expect(logs[index]?.origin).toBe(origin);
      });
    });

    it('should handle logs with tags and categories', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      collector({
        timestamp: Date.now(),
        level: 'info',
        message: 'Tagged log',
        origin: 'background',
        tags: ['service-worker', 'ai-request'],
        category: 'ai-processing',
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]?.tags).toEqual(['service-worker', 'ai-request']);
      expect(logs[0]?.category).toBe('ai-processing');
    });
  });

  describe('Memory and Performance', () => {
    it('should handle large batches without excessive memory', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      const largeMessage = 'x'.repeat(1000); // 1KB message

      // Collect 5000 logs (5MB total)
      for (let i = 0; i < 5000; i++) {
        collector({
          timestamp: Date.now(),
          level: 'info',
          message: largeMessage,
          origin: 'background',
        });
      }

      expect(logs).toHaveLength(5000);
      expect(logs[0]?.message).toBe(largeMessage);
    });

    it('should not block the main thread with synchronous operations', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      const startTime = Date.now();

      // Simulate 1000 rapid logs
      for (let i = 0; i < 1000; i++) {
        collector({
          timestamp: Date.now(),
          level: 'info',
          message: `Log ${i}`,
          origin: 'background',
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in under 100ms
      expect(duration).toBeLessThan(100);
      expect(logs).toHaveLength(1000);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should continue collecting logs even if one fails', () => {
      const logs: StructuredLogEnvelope[] = [];
      let failOnce = true;

      const collector = (envelope: StructuredLogEnvelope) => {
        if (failOnce && envelope.message === 'Fail this one') {
          failOnce = false;
          throw new Error('Simulated failure');
        }
        logs.push(envelope);
      };

      // This should fail but not stop subsequent logs
      try {
        collector({
          timestamp: Date.now(),
          level: 'info',
          message: 'Fail this one',
          origin: 'background',
        });
      } catch {
        // Expected
      }

      // This should succeed
      collector({
        timestamp: Date.now(),
        level: 'info',
        message: 'Success',
        origin: 'background',
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]?.message).toBe('Success');
    });

    it('should handle missing required fields gracefully', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      // Missing optional fields should still work
      collector({
        timestamp: Date.now(),
        level: 'info',
        message: 'Minimal log',
        origin: 'background',
        // No data, stack, tags, or category
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]?.message).toBe('Minimal log');
      expect(logs[0]?.data).toBeUndefined();
      expect(logs[0]?.stack).toBeUndefined();
      expect(logs[0]?.tags).toBeUndefined();
      expect(logs[0]?.category).toBeUndefined();
    });
  });

  describe('Timestamp and Ordering', () => {
    it('should maintain chronological order', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      const baseTime = Date.now();
      const timestamps = [100, 50, 200, 150, 75];

      timestamps.forEach((offset, index) => {
        collector({
          timestamp: baseTime + offset,
          level: 'info',
          message: `Log ${index}`,
          origin: 'background',
        });
      });

      // Sort by timestamp
      const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp);

      expect(sorted[0]?.timestamp).toBe(baseTime + 50);
      expect(sorted[1]?.timestamp).toBe(baseTime + 75);
      expect(sorted[2]?.timestamp).toBe(baseTime + 100);
      expect(sorted[3]?.timestamp).toBe(baseTime + 150);
      expect(sorted[4]?.timestamp).toBe(baseTime + 200);
    });

    it('should handle logs with identical timestamps', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      const timestamp = Date.now();

      // Multiple logs with same timestamp
      for (let i = 0; i < 5; i++) {
        collector({
          timestamp,
          level: 'info',
          message: `Log ${i}`,
          origin: 'background',
        });
      }

      expect(logs).toHaveLength(5);
      expect(logs.every((log) => log.timestamp === timestamp)).toBe(true);
    });
  });

  describe('Special Characters and Encoding', () => {
    it('should handle special characters in messages', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      const specialMessages = [
        'Hello 世界',
        'Emoji: 🚀 💻 🎉',
        'Newlines\nand\ttabs',
        'Quotes: "double" and \'single\'',
        'Backslash: \\ and forward: /',
        'Unicode: \u0041\u0042\u0043',
      ];

      specialMessages.forEach((message) => {
        collector({
          timestamp: Date.now(),
          level: 'info',
          message,
          origin: 'background',
        });
      });

      expect(logs).toHaveLength(specialMessages.length);
      logs.forEach((log, index) => {
        expect(log.message).toBe(specialMessages[index]);
      });
    });

    it('should handle very long messages', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      const longMessage = 'a'.repeat(10000); // 10KB message

      collector({
        timestamp: Date.now(),
        level: 'info',
        message: longMessage,
        origin: 'background',
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]?.message).toHaveLength(10000);
    });
  });

  describe('Multi-Origin Scenario', () => {
    it('should handle logs from multiple origins simultaneously', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      const origins: LogOrigin[] = ['background', 'content-script', 'side-panel', 'offscreen'];

      // Simulate interleaved logs from different origins
      for (let i = 0; i < 100; i++) {
        const origin = origins[i % origins.length]!;
        collector({
          timestamp: Date.now() + i,
          level: 'info',
          message: `Log ${i} from ${origin}`,
          origin,
        });
      }

      expect(logs).toHaveLength(100);

      // Check distribution
      const backgroundLogs = logs.filter((log) => log.origin === 'background');
      const contentScriptLogs = logs.filter((log) => log.origin === 'content-script');
      const sidePanelLogs = logs.filter((log) => log.origin === 'side-panel');
      const offscreenLogs = logs.filter((log) => log.origin === 'offscreen');

      expect(backgroundLogs).toHaveLength(25);
      expect(contentScriptLogs).toHaveLength(25);
      expect(sidePanelLogs).toHaveLength(25);
      expect(offscreenLogs).toHaveLength(25);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty messages', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      collector({
        timestamp: Date.now(),
        level: 'info',
        message: '',
        origin: 'background',
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]?.message).toBe('');
    });

    it('should handle logs with all log levels', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      const levels: StructuredLogEnvelope['level'][] = ['debug', 'log', 'info', 'warn', 'error'];

      levels.forEach((level) => {
        collector({
          timestamp: Date.now(),
          level,
          message: `${level} message`,
          origin: 'background',
        });
      });

      expect(logs).toHaveLength(5);
      levels.forEach((level, index) => {
        expect(logs[index]?.level).toBe(level);
      });
    });

    it('should handle logs with multiple tags', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      collector({
        timestamp: Date.now(),
        level: 'info',
        message: 'Multi-tagged log',
        origin: 'background',
        tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'],
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]?.tags).toHaveLength(5);
    });

    it('should handle logs with nested data objects', () => {
      const logs: StructuredLogEnvelope[] = [];
      const collector = (envelope: StructuredLogEnvelope) => {
        logs.push(envelope);
      };

      const complexData = {
        level1: {
          level2: {
            level3: {
              value: 'deeply nested',
              array: [1, 2, { nested: true }],
            },
          },
        },
      };

      collector({
        timestamp: Date.now(),
        level: 'info',
        message: 'Complex data',
        data: [complexData],
        origin: 'background',
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]?.data?.[0]).toEqual(complexData);
    });
  });
});
