import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionController } from '../src/session-controller.js';
import { SessionStore } from '../src/session-store.js';

describe('SessionController Edge Cases', () => {
  let controller: SessionController;
  let mockStore: SessionStore;

  beforeEach(() => {
    mockStore = {
      save: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
      ensureDir: vi.fn().mockResolvedValue(undefined),
    } as any;

    controller = new SessionController(mockStore);
  });

  describe('Rapid State Transitions', () => {
    it('should handle rapid start-stop cycles', async () => {
      await controller.start();
      await controller.stop();

      await controller.start();
      await controller.stop();

      await controller.start();
      const session = await controller.stop();

      expect(session).toBeDefined();
      expect(controller.getState()).toBe('stopped');
    });

    it('should handle rapid pause-resume cycles', async () => {
      await controller.start();

      await controller.pause();
      await controller.resume();

      await controller.pause();
      await controller.resume();

      await controller.pause();
      await controller.resume();

      expect(controller.getState()).toBe('recording');
    });
  });

  describe('Timing Edge Cases', () => {
    it('should handle immediate pause after start', async () => {
      await controller.start();
      await controller.pause();

      expect(controller.getState()).toBe('paused');
      expect(controller.getUptime()).toBeGreaterThanOrEqual(0);
    });

    it('should handle immediate stop after pause', async () => {
      await controller.start();
      await controller.pause();
      const session = await controller.stop();

      expect(session.metadata.endTime).toBeDefined();
      expect(controller.getState()).toBe('stopped');
    });

    it('should calculate uptime correctly with multiple pause cycles', async () => {
      await controller.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      await controller.pause();
      const uptimeDuringPause1 = controller.getUptime();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const uptimeDuringPause2 = controller.getUptime();

      expect(uptimeDuringPause2).toBeCloseTo(uptimeDuringPause1, -1);

      await controller.resume();
      await new Promise((resolve) => setTimeout(resolve, 50));

      await controller.pause();
      const uptimeAfterSecondPause = controller.getUptime();
      expect(uptimeAfterSecondPause).toBeGreaterThan(uptimeDuringPause1 + 30);
    });
  });

  describe('Metadata Edge Cases', () => {
    it('should handle empty metadata', async () => {
      await controller.start({});
      const session = controller.getCurrentSession();

      expect(session?.metadata.extensionId).toBe('unknown');
      expect(session?.metadata.platform).toBeDefined();
    });

    it('should handle null/undefined values in config', async () => {
      await controller.start({
        extensionId: undefined,
        extensionVersion: undefined,
        chromeVersion: undefined,
        chromeProfile: undefined,
      });

      const session = controller.getCurrentSession();
      expect(session?.metadata.extensionId).toBe('unknown');
    });

    it('should preserve custom flags in metadata', async () => {
      await controller.start({
        flags: {
          customFlag1: 'value1',
          customFlag2: true,
          customFlag3: 42,
        },
      });

      const status = controller.getStatus();
      expect(status.config.flags).toEqual({
        customFlag1: 'value1',
        customFlag2: true,
        customFlag3: 42,
      });
    });
  });

  describe('Error Handling', () => {
    it('should emit error event on start failure', async () => {
      const errorHandler = vi.fn();
      controller.on('error', errorHandler);

      mockStore.save = vi.fn().mockRejectedValue(new Error('Save failed'));

      await expect(controller.start()).rejects.toThrow('Save failed');
      expect(errorHandler).toHaveBeenCalled();
      expect(controller.getState()).toBe('idle');
    });

    it('should maintain state on stop failure', async () => {
      await controller.start();
      mockStore.save = vi.fn().mockRejectedValue(new Error('Save failed'));

      await expect(controller.stop()).rejects.toThrow('Save failed');
    });
  });

  describe('Concurrent Operations', () => {
    it('should reject start when already recording', async () => {
      await controller.start();
      await expect(controller.start()).rejects.toThrow('Cannot start session: current state is recording');
      await controller.stop();
    });

    it('should reject operations on stopped session', async () => {
      await controller.start();
      await controller.stop();

      await expect(controller.pause()).rejects.toThrow();
      await expect(controller.resume()).rejects.toThrow();
    });
  });

  describe('Session ID Generation', () => {
    it('should generate unique session IDs', async () => {
      const id1 = await controller.start();
      await controller.stop();

      const id2 = await controller.start();
      await controller.stop();

      const id3 = await controller.start();
      await controller.stop();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should generate valid session ID format', async () => {
      const sessionId = await controller.start();
      expect(sessionId).toMatch(/^session-\d+-[a-z0-9]{6}$/);
    });
  });

  describe('Shutdown Edge Cases', () => {
    it('should handle shutdown with no active session', async () => {
      await expect(controller.shutdown()).resolves.not.toThrow();
      expect(controller.getState()).toBe('idle');
    });

    it('should handle multiple shutdown calls', async () => {
      await controller.start();
      await controller.shutdown();
      await controller.shutdown();
      await controller.shutdown();

      expect(controller.getState()).toBe('stopped');
    });

    it('should preserve stopped session data after shutdown', async () => {
      const sessionId = await controller.start({
        extensionId: 'test-id',
        flags: { test: true },
      });

      await controller.shutdown();

      const status = controller.getStatus();
      expect(controller.getState()).toBe('stopped');
      expect(status.sessionId).toBe(sessionId);
      expect(status.session).toBeDefined();
    });

    it('should allow starting new session after shutdown', async () => {
      await controller.start();
      await controller.shutdown();

      const newSessionId = await controller.start();
      expect(controller.getState()).toBe('recording');
      expect(newSessionId).toBeDefined();
    });
  });
});
