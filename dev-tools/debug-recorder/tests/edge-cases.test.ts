import { describe, it, expect } from 'vitest';
import { ReportGenerator } from '../src/report-generator.js';
import { normalizeSession, type RawSessionCapture } from '../src/normalizer.js';
import type { Session } from '../src/types.js';

describe('Edge Cases', () => {
  describe('Empty Session', () => {
    it('generates report for session with no interactions', () => {
      const emptySession: Session = {
        metadata: {
          sessionId: 'empty',
          startTime: Date.now(),
          endTime: Date.now() + 1000,
          extensionId: 'test',
        },
        interactions: [],
        errors: [],
        snapshots: [],
      };

      const generator = new ReportGenerator(emptySession);
      const report = generator.generate();

      expect(report).toContain('# Debug Session Report');
      expect(report).toContain('_No recorded interactions._');
      expect(report).toContain('_No errors recorded._');
      expect(report).toContain('_No state snapshots captured._');
    });
  });

  describe('Large Data', () => {
    it('handles session with many interactions', () => {
      const manyInteractions: Session = {
        metadata: {
          sessionId: 'large',
          startTime: Date.now(),
          endTime: Date.now() + 100000,
          extensionId: 'test',
        },
        interactions: Array.from({ length: 100 }, (_, i) => ({
          id: `int-${i}`,
          timestamp: Date.now() + i * 1000,
          type: 'navigation' as const,
          description: `Interaction ${i}`,
          status: 'success' as const,
          duration: 100 + i,
        })),
        errors: [],
        snapshots: [],
      };

      const generator = new ReportGenerator(manyInteractions);
      const report = generator.generate({ maxTokens: 5000 });

      expect(report).toContain('# Debug Session Report');
      expect(report.length).toBeGreaterThan(0);
    });

    it('truncates very long log messages', () => {
      const longLogSession: Session = {
        metadata: {
          sessionId: 'long-logs',
          startTime: Date.now(),
          extensionId: 'test',
        },
        interactions: [
          {
            id: 'int-1',
            timestamp: Date.now(),
            type: 'system_event',
            description: 'Test',
            status: 'success',
            logs: [
              {
                timestamp: Date.now(),
                level: 'info',
                source: 'test',
                message: 'a'.repeat(10000),
              },
            ],
          },
        ],
        errors: [],
        snapshots: [],
      };

      const generator = new ReportGenerator(longLogSession);
      const report = generator.generate({ maxTokens: 2000 });

      expect(report).toContain('truncated');
    });

    it('handles very long error stacks', () => {
      const longStackSession: Session = {
        metadata: {
          sessionId: 'long-stack',
          startTime: Date.now(),
          extensionId: 'test',
        },
        interactions: [],
        errors: [
          {
            timestamp: Date.now(),
            message: 'Test error',
            source: 'test',
            stack: 'Error: Test\n' + Array.from({ length: 100 }, (_, i) => `  at fn${i} (file.ts:${i})`).join('\n'),
          },
        ],
        snapshots: [],
      };

      const generator = new ReportGenerator(longStackSession);
      const report = generator.generate({ maxTokens: 1000 });

      expect(report).toContain('Test error');
    });
  });

  describe('Malformed Data', () => {
    it('handles missing optional fields', () => {
      const minimal: RawSessionCapture = {
        session: {
          sessionId: 'minimal',
          startTime: Date.now(),
          extensionId: 'test',
        },
      };

      const session = normalizeSession(minimal);
      expect(session.interactions).toEqual([]);
      expect(session.errors).toEqual([]);
      expect(session.snapshots).toEqual([]);
    });

    it('handles interactions without logs or errors', () => {
      const session: Session = {
        metadata: {
          sessionId: 'no-details',
          startTime: Date.now(),
          extensionId: 'test',
        },
        interactions: [
          {
            id: 'int-1',
            timestamp: Date.now(),
            type: 'click',
            description: 'Click button',
            status: 'success',
          },
        ],
        errors: [],
        snapshots: [],
      };

      const generator = new ReportGenerator(session);
      const report = generator.generate();

      expect(report).toContain('Click button');
      expect(report).not.toContain('### Logs');
      expect(report).not.toContain('### Errors');
    });

    it('handles errors without stacks', () => {
      const session: Session = {
        metadata: {
          sessionId: 'no-stack',
          startTime: Date.now(),
          extensionId: 'test',
        },
        interactions: [],
        errors: [
          {
            timestamp: Date.now(),
            message: 'Simple error',
            source: 'test',
          },
        ],
        snapshots: [],
      };

      const generator = new ReportGenerator(session);
      const report = generator.generate();

      expect(report).toContain('Simple error');
      expect(report).not.toContain('**Stack**:');
    });
  });

  describe('Special Characters', () => {
    it('escapes markdown special characters in messages', () => {
      const session: Session = {
        metadata: {
          sessionId: 'special-chars',
          startTime: Date.now(),
          extensionId: 'test',
        },
        interactions: [
          {
            id: 'int-1',
            timestamp: Date.now(),
            type: 'system_event',
            description: 'Test with `backticks` and $dollars$',
            status: 'success',
            logs: [
              {
                timestamp: Date.now(),
                level: 'info',
                source: 'test',
                message: 'Log with `code` and $var$',
              },
            ],
          },
        ],
        errors: [],
        snapshots: [],
      };

      const generator = new ReportGenerator(session);
      const report = generator.generate();

      expect(report).toContain('\\`');
      expect(report).toContain('\\$');
    });

    it('handles newlines in descriptions', () => {
      const session: Session = {
        metadata: {
          sessionId: 'newlines',
          startTime: Date.now(),
          extensionId: 'test',
        },
        interactions: [
          {
            id: 'int-1',
            timestamp: Date.now(),
            type: 'system_event',
            description: 'Multi\nline\ndescription',
            status: 'success',
          },
        ],
        errors: [],
        snapshots: [],
      };

      const generator = new ReportGenerator(session);
      const report = generator.generate();

      const tableRow = report.match(/\| 1 \|.*\|/);
      expect(tableRow).toBeTruthy();
      expect(tableRow![0]).not.toContain('\n');
    });
  });

  describe('Timestamp Edge Cases', () => {
    it('handles sessions without end time', () => {
      const session: Session = {
        metadata: {
          sessionId: 'no-end',
          startTime: Date.now(),
          extensionId: 'test',
        },
        interactions: [],
        errors: [],
        snapshots: [],
      };

      const generator = new ReportGenerator(session);
      const report = generator.generate();

      expect(report).toContain('🔴 In Progress');
      expect(report).not.toContain('End Time');
    });

    it('handles zero duration', () => {
      const session: Session = {
        metadata: {
          sessionId: 'zero-duration',
          startTime: 1000,
          endTime: 1000,
          extensionId: 'test',
        },
        interactions: [
          {
            id: 'int-1',
            timestamp: 1000,
            type: 'system_event',
            description: 'Instant',
            status: 'success',
            duration: 0,
          },
        ],
        errors: [],
        snapshots: [],
      };

      const generator = new ReportGenerator(session);
      const report = generator.generate();

      expect(report).toContain('0ms');
    });
  });

  describe('Context and Snapshots', () => {
    it('handles empty context objects', () => {
      const session: Session = {
        metadata: {
          sessionId: 'empty-context',
          startTime: Date.now(),
          extensionId: 'test',
        },
        interactions: [
          {
            id: 'int-1',
            timestamp: Date.now(),
            type: 'system_event',
            description: 'Test',
            status: 'success',
            context: {},
          },
        ],
        errors: [],
        snapshots: [],
      };

      const generator = new ReportGenerator(session);
      const report = generator.generate();

      expect(report).not.toContain('### Context');
    });

    it('handles snapshots with partial data', () => {
      const session: Session = {
        metadata: {
          sessionId: 'partial-snapshot',
          startTime: Date.now(),
          extensionId: 'test',
        },
        interactions: [],
        errors: [],
        snapshots: [
          {
            timestamp: Date.now(),
            storageUsage: {
              indexedDB: 1000,
            },
          },
          {
            timestamp: Date.now() + 1000,
            aiState: {
              activeModels: ['gemini-nano'],
            },
          },
        ],
      };

      const generator = new ReportGenerator(session);
      const report = generator.generate();

      expect(report).toContain('Storage Usage');
      expect(report).toContain('AI State');
    });
  });

  describe('Assets', () => {
    it('excludes assets when includeAssets is false', () => {
      const session: Session = {
        metadata: {
          sessionId: 'no-assets',
          startTime: Date.now(),
          extensionId: 'test',
        },
        interactions: [
          {
            id: 'int-1',
            timestamp: Date.now(),
            type: 'navigation',
            description: 'Test',
            status: 'success',
            screenshot: 'base64data',
          },
        ],
        errors: [],
        snapshots: [],
      };

      const generator = new ReportGenerator(session);
      const report = generator.generate({ includeAssets: false });

      expect(report).not.toContain('Captured Assets');
      expect(report).not.toContain('base64data');
    });

    it('includes assets when includeAssets is true', () => {
      const session: Session = {
        metadata: {
          sessionId: 'with-assets',
          startTime: Date.now(),
          extensionId: 'test',
        },
        interactions: [
          {
            id: 'int-1',
            timestamp: Date.now(),
            type: 'navigation',
            description: 'Test',
            status: 'success',
            screenshot: 'base64screenshot',
          },
        ],
        errors: [],
        snapshots: [],
      };

      const generator = new ReportGenerator(session);
      const report = generator.generate({ includeAssets: true });

      expect(report).toContain('Captured Assets');
      expect(report).toContain('base64screenshot');
    });
  });
});
