import { describe, it, expect } from 'vitest';
import { normalizeSession } from '../src/normalizer.js';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturePath = join(__dirname, 'fixtures', 'sample-capture.json');

describe('normalizeSession', () => {
  it('normalizes raw capture data into session model', async () => {
    const contents = await readFile(fixturePath, 'utf-8');
    const raw = JSON.parse(contents);

    const session = normalizeSession(raw);

    expect(session.metadata.sessionId).toBe('test-session-001');
    expect(session.interactions).toHaveLength(4);
    expect(session.interactions[0].logs?.length).toBeGreaterThan(0);
    expect(session.interactions[2].logs).toHaveLength(3);
    expect(session.interactions[3].errors).toHaveLength(1);
    expect(session.interactions[0].screenshot).toBeDefined();
    expect(session.errors).toHaveLength(1);
    expect(session.snapshots).toHaveLength(2);
  });

  it('throws when metadata is missing', () => {
    expect(() => normalizeSession({} as any)).toThrowError('Missing session metadata');
  });

  it('handles orphan logs by creating synthetic interactions', () => {
    const raw = {
      session: {
        sessionId: 'test',
        startTime: 1704470400000,
        extensionId: 'test-ext',
      },
      logs: [
        {
          entries: [
            {
              timestamp: 1704470400100,
              level: 'info',
              source: 'worker',
              message: 'Orphan log entry',
            },
          ],
        },
      ],
    };

    const session = normalizeSession(raw as any);
    expect(session.interactions).toHaveLength(1);
    expect(session.interactions[0].description).toBe('Orphan logs');
    expect(session.interactions[0].status).toBe('warning');
  });
});
