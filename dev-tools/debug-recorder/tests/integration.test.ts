import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore } from '../src/session-store.js';
import { ReportGenerator } from '../src/report-generator.js';
import { normalizeSession, type RawSessionCapture } from '../src/normalizer.js';
import type { Session } from '../src/types.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Integration Tests', () => {
  let tempDir: string;
  let store: SessionStore;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `integration-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    store = new SessionStore(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { force: true, recursive: true });
  });

  it('complete workflow: raw capture → normalization → session storage → report generation', async () => {
    const rawCapture: RawSessionCapture = {
      session: {
        sessionId: 'integration-test',
        startTime: 1704470400000,
        endTime: 1704471000000,
        extensionId: 'test-ext',
        extensionVersion: '1.0.0',
        chromeVersion: '122.0.0',
        platform: 'darwin',
      },
      timeline: [
        {
          id: 'int-1',
          timestamp: 1704470410000,
          type: 'navigation',
          description: 'Navigate to homepage',
          status: 'success',
          duration: 500,
          context: {
            url: 'https://example.com',
          },
        },
        {
          id: 'int-2',
          timestamp: 1704470420000,
          type: 'ai_request',
          description: 'Generate summary',
          status: 'success',
          duration: 2000,
        },
      ],
      logs: [
        {
          interactionId: 'int-2',
          entries: [
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
          source: 'test',
          stack: 'Error: Test\n  at test.ts:1',
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

    const session = normalizeSession(rawCapture);

    expect(session.metadata.sessionId).toBe('integration-test');
    expect(session.interactions).toHaveLength(2);
    expect(session.interactions[1].logs).toHaveLength(1);
    expect(session.errors).toHaveLength(1);
    expect(session.snapshots).toHaveLength(1);

    await store.save(session);

    const loaded = await store.load('integration-test');
    expect(loaded).not.toBeNull();
    expect(loaded?.interactions).toHaveLength(2);

    const generator = new ReportGenerator(session);
    const report = generator.generate();

    expect(report).toContain('# Debug Session Report');
    expect(report).toContain('integration-test');
    expect(report).toContain('Navigate to homepage');
    expect(report).toContain('Generate summary');
    expect(report).toContain('Test error');
    expect(report).toContain('Starting AI request');
    expect(report).toContain('KB');

    const reportWithAssets = generator.generate({ includeAssets: true });
    expect(reportWithAssets.length).toBeGreaterThanOrEqual(report.length);
  });

  it('handles multiple sessions concurrently', async () => {
    const sessions: Session[] = Array.from({ length: 5 }, (_, i) => ({
      metadata: {
        sessionId: `concurrent-${i}`,
        startTime: Date.now() + i * 1000,
        extensionId: 'test',
      },
      interactions: [
        {
          id: `int-${i}`,
          timestamp: Date.now() + i * 1000,
          type: 'system_event',
          description: `Test ${i}`,
          status: 'success',
        },
      ],
      errors: [],
      snapshots: [],
    }));

    await Promise.all(sessions.map((s) => store.save(s)));

    const list = await store.list();
    expect(list).toHaveLength(5);

    const reports = sessions.map((s) => new ReportGenerator(s).generate());
    expect(reports).toHaveLength(5);
    reports.forEach((report, i) => {
      expect(report).toContain(`concurrent-${i}`);
      expect(report).toContain(`Test ${i}`);
    });
  });

  it('preserves data integrity through save/load cycle', async () => {
    const session: Session = {
      metadata: {
        sessionId: 'integrity-test',
        startTime: 1704470400000,
        endTime: 1704471000000,
        extensionId: 'test',
        recordingOptions: {
          includeScreenshots: true,
          includeStorage: true,
          includeMetrics: false,
          includePII: false,
        },
      },
      interactions: [
        {
          id: 'int-1',
          timestamp: 1704470410000,
          type: 'navigation',
          description: 'Test',
          status: 'success',
          context: {
            nested: {
              deep: {
                value: 'test',
              },
            },
            array: [1, 2, 3],
          },
          logs: [
            {
              timestamp: 1704470410100,
              level: 'info',
              source: 'test',
              message: 'Log message',
              data: { key: 'value' },
            },
          ],
          errors: [
            {
              timestamp: 1704470410200,
              message: 'Error',
              source: 'test',
              recovered: true,
            },
          ],
          screenshot: 'base64data',
        },
      ],
      errors: [
        {
          timestamp: 1704470420000,
          message: 'Global error',
          source: 'global',
          code: 'ERR_001',
          stack: 'Error: Global\n  at global.ts:1',
          context: { info: 'test' },
          recovered: false,
        },
      ],
      snapshots: [
        {
          timestamp: 1704470400000,
          storageUsage: {
            indexedDB: 1000000,
            localStorage: 5000000,
            chromeStorage: 100000,
          },
          aiState: {
            activeModels: ['gemini-nano', 'gemini-flash'],
            pendingRequests: 3,
            tokenUsage: 1234,
          },
          performance: {
            memory: 150000000,
            cpu: 12.5,
          },
          breadcrumbs: ['step1', 'step2', 'step3'],
        },
      ],
    };

    await store.save(session);

    const loaded = await store.load('integrity-test');
    expect(loaded).not.toBeNull();

    expect(loaded!.metadata).toEqual(session.metadata);
    expect(loaded!.interactions).toHaveLength(1);
    expect(loaded!.interactions[0].context).toEqual(session.interactions[0].context);
    expect(loaded!.interactions[0].logs).toEqual(session.interactions[0].logs);
    expect(loaded!.interactions[0].errors).toEqual(session.interactions[0].errors);
    expect(loaded!.interactions[0].screenshot).toBe('base64data');
    expect(loaded!.errors).toEqual(session.errors);
    expect(loaded!.snapshots).toEqual(session.snapshots);
  });

  it('generates consistent reports across multiple invocations', () => {
    const session: Session = {
      metadata: {
        sessionId: 'consistency-test',
        startTime: 1704470400000,
        endTime: 1704471000000,
        extensionId: 'test',
      },
      interactions: [
        {
          id: 'int-1',
          timestamp: 1704470410000,
          type: 'navigation',
          description: 'Test',
          status: 'success',
        },
      ],
      errors: [],
      snapshots: [],
    };

    const generator = new ReportGenerator(session);
    const report1 = generator.generate();
    const report2 = generator.generate();

    expect(report1).toBe(report2);
  });

  it('truncates large reports appropriately', () => {
    const largeSession: Session = {
      metadata: {
        sessionId: 'large-truncate-test',
        startTime: Date.now(),
        extensionId: 'test',
      },
      interactions: Array.from({ length: 50 }, (_, i) => ({
        id: `int-${i}`,
        timestamp: Date.now() + i * 1000,
        type: 'system_event',
        description: 'x'.repeat(100),
        status: 'success',
        logs: [
          {
            timestamp: Date.now() + i * 1000,
            level: 'info',
            source: 'test',
            message: 'y'.repeat(200),
          },
        ],
      })),
      errors: [],
      snapshots: [],
    };

    const generator = new ReportGenerator(largeSession);
    const smallReport = generator.generate({ maxTokens: 1000 });
    const largeReport = generator.generate({ maxTokens: 20000 });

    expect(smallReport.length).toBeLessThan(largeReport.length);
    expect(smallReport).toContain('truncated');
  });
});
