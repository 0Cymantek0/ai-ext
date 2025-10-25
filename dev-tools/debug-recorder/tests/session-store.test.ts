import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore } from '../src/session-store.js';
import type { Session } from '../src/types.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('SessionStore', () => {
  let tempDir: string;
  let store: SessionStore;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `debug-recorder-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    store = new SessionStore(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const mockSession: Session = {
    metadata: {
      sessionId: 'test-123',
      startTime: Date.now(),
      extensionId: 'test-ext',
    },
    interactions: [],
    errors: [],
    snapshots: [],
  };

  describe('save', () => {
    it('saves a session to disk', async () => {
      await store.save(mockSession);

      const files = await fs.readdir(tempDir);
      expect(files).toContain('test-123.json');
    });

    it('creates directory if it does not exist', async () => {
      const newStore = new SessionStore(join(tempDir, 'nested', 'dir'));
      await newStore.save(mockSession);

      const files = await fs.readdir(join(tempDir, 'nested', 'dir'));
      expect(files).toContain('test-123.json');
    });

    it('overwrites existing session', async () => {
      await store.save(mockSession);

      const updated = {
        ...mockSession,
        metadata: {
          ...mockSession.metadata,
          endTime: Date.now(),
        },
      };

      await store.save(updated);

      const loaded = await store.load('test-123');
      expect(loaded?.metadata.endTime).toBeDefined();
    });
  });

  describe('load', () => {
    it('loads a saved session', async () => {
      await store.save(mockSession);

      const loaded = await store.load('test-123');
      expect(loaded).not.toBeNull();
      expect(loaded?.metadata.sessionId).toBe('test-123');
    });

    it('returns null for non-existent session', async () => {
      const loaded = await store.load('non-existent');
      expect(loaded).toBeNull();
    });

    it('parses JSON correctly', async () => {
      const complexSession: Session = {
        ...mockSession,
        interactions: [
          {
            id: 'int-1',
            timestamp: Date.now(),
            type: 'navigation',
            description: 'Test',
            status: 'success',
            context: {
              nested: {
                data: 'value',
              },
            },
          },
        ],
      };

      await store.save(complexSession);
      const loaded = await store.load('test-123');

      expect(loaded?.interactions).toHaveLength(1);
      expect(loaded?.interactions[0].context).toEqual({
        nested: {
          data: 'value',
        },
      });
    });
  });

  describe('list', () => {
    it('lists all saved sessions', async () => {
      await store.save(mockSession);
      await store.save({
        ...mockSession,
        metadata: { ...mockSession.metadata, sessionId: 'test-456' },
      });

      const sessions = await store.list();
      expect(sessions).toHaveLength(2);
      expect(sessions).toContain('test-123');
      expect(sessions).toContain('test-456');
    });

    it('returns empty array when no sessions exist', async () => {
      const sessions = await store.list();
      expect(sessions).toEqual([]);
    });

    it('ignores non-JSON files', async () => {
      await store.save(mockSession);
      await fs.writeFile(join(tempDir, 'readme.txt'), 'test');

      const sessions = await store.list();
      expect(sessions).toHaveLength(1);
      expect(sessions).toContain('test-123');
    });
  });

  describe('delete', () => {
    it('deletes a session', async () => {
      await store.save(mockSession);
      await store.delete('test-123');

      const loaded = await store.load('test-123');
      expect(loaded).toBeNull();

      const sessions = await store.list();
      expect(sessions).not.toContain('test-123');
    });

    it('does not throw when deleting non-existent session', async () => {
      await expect(store.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('concurrent operations', () => {
    it('handles multiple saves concurrently', async () => {
      const sessions = Array.from({ length: 10 }, (_, i) => ({
        ...mockSession,
        metadata: { ...mockSession.metadata, sessionId: `session-${i}` },
      }));

      await Promise.all(sessions.map((s) => store.save(s)));

      const list = await store.list();
      expect(list).toHaveLength(10);
    });
  });
});
