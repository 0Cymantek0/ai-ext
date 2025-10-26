import { describe, it, expect } from 'vitest';
import { ReportGenerator } from '../src/report-generator.js';
import type { Session } from '../src/types.js';

describe('ReportGenerator', () => {
  const mockSession: Session = {
    metadata: {
      sessionId: 'test-123',
      startTime: 1704470400000,
      endTime: 1704471600000,
      extensionId: 'test-ext',
      extensionVersion: '1.0.0',
      chromeVersion: '122.0.0',
      platform: 'darwin',
    },
    interactions: [
      {
        id: 'int-1',
        timestamp: 1704470410000,
        type: 'navigation',
        description: 'Navigate to example.com',
        status: 'success',
        duration: 1200,
      },
      {
        id: 'int-2',
        timestamp: 1704470420000,
        type: 'ai_request',
        description: 'Generate summary',
        status: 'success',
        duration: 2500,
        logs: [
          {
            timestamp: 1704470420100,
            level: 'info',
            source: 'ai-manager',
            message: 'Starting AI request',
          },
        ],
      },
    ],
    errors: [
      {
        timestamp: 1704470430000,
        message: 'Test error',
        source: 'test-source',
        stack: 'Error: Test error\n  at test.ts:10',
      },
    ],
    snapshots: [
      {
        timestamp: 1704470400000,
        storageUsage: {
          indexedDB: 1000000,
        },
      },
    ],
  };

  it('generates a markdown report with all sections', () => {
    const generator = new ReportGenerator(mockSession);
    const report = generator.generate();

    expect(report).toContain('# Debug Session Report');
    expect(report).toContain('Session ID');
    expect(report).toContain('test-123');
    expect(report).toContain('Session Summary');
    expect(report).toContain('Detailed Interaction Chronology');
    expect(report).toContain('Error Digests');
    expect(report).toContain('State Snapshots');
  });

  it('respects maxTokens option', () => {
    const generator = new ReportGenerator(mockSession);
    const report = generator.generate({ maxTokens: 1000 });

    const estimatedTokens = Math.ceil(report.length / 4);
    expect(estimatedTokens).toBeLessThanOrEqual(1500);
  });

  it('includes assets when requested', () => {
    const sessionWithAssets: Session = {
      ...mockSession,
      interactions: [
        {
          id: 'int-1',
          timestamp: 1704470410000,
          type: 'navigation',
          description: 'Test',
          status: 'success',
          screenshot: 'base64data',
        },
      ],
    };

    const generator = new ReportGenerator(sessionWithAssets);
    const reportWithAssets = generator.generate({ includeAssets: true });
    const reportWithoutAssets = generator.generate({ includeAssets: false });

    expect(reportWithAssets).toContain('Captured Assets');
    expect(reportWithAssets).toContain('base64data');
    expect(reportWithoutAssets).not.toContain('Captured Assets');
  });

  it('formats duration correctly', () => {
    const generator = new ReportGenerator(mockSession);
    const report = generator.generate();

    expect(report).toContain('20m 0s');
  });

  it('includes status icons', () => {
    const generator = new ReportGenerator(mockSession);
    const report = generator.generate();

    expect(report).toContain('✅');
  });

  it('collapses logs when requested', () => {
    const generator = new ReportGenerator(mockSession);
    const reportWithCollapse = generator.generate({ collapseLogs: true });
    const reportWithoutCollapse = generator.generate({ collapseLogs: false });

    expect(reportWithCollapse).toContain('<details>');
    expect(reportWithoutCollapse).toContain('<details>');
  });

  it('trims redundant lines when requested', () => {
    const sessionWithDuplicates: Session = {
      ...mockSession,
      interactions: [
        {
          id: 'int-1',
          timestamp: 1704470410000,
          type: 'navigation',
          description: 'Test',
          status: 'success',
          logs: [
            {
              timestamp: 1704470410000,
              level: 'info',
              source: 'test',
              message: 'Duplicate log',
            },
            {
              timestamp: 1704470411000,
              level: 'info',
              source: 'test',
              message: 'Duplicate log',
            },
            {
              timestamp: 1704470412000,
              level: 'info',
              source: 'test',
              message: 'Duplicate log',
            },
          ],
        },
      ],
    };

    const generator = new ReportGenerator(sessionWithDuplicates);
    const reportWithTrim = generator.generate({ trimRedundant: true });
    const reportWithoutTrim = generator.generate({ trimRedundant: false });

    expect(reportWithTrim.length).toBeLessThanOrEqual(reportWithoutTrim.length);
  });
});
