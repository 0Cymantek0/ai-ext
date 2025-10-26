import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionController } from '../src/session-controller.js';
import { SessionStore } from '../src/session-store.js';

describe('SessionController', () => {
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

  describe('State Machine Transitions', () => {
    it('should start in idle state', () => {
      expect(controller.getState()).toBe('idle');
    });

    it('should transition from idle to recording on start', async () => {
      const sessionId = await controller.start();

      expect(controller.getState()).toBe('recording');
      expect(sessionId).toMatch(/^session-\d+-[a-z0-9]{6}$/);
      expect(mockStore.save).toHaveBeenCalled();
    });

    it('should transition from recording to paused on pause', async () => {
      await controller.start();
      await controller.pause();

      expect(controller.getState()).toBe('paused');
    });

    it('should transition from paused to recording on resume', async () => {
      await controller.start();
      await controller.pause();
      await controller.resume();

      expect(controller.getState()).toBe('recording');
    });

    it('should transition from recording to stopped on stop', async () => {
      await controller.start();
      const session = await controller.stop();

      expect(controller.getState()).toBe('idle');
      expect(session.metadata.endTime).toBeDefined();
    });

    it('should transition from paused to stopped on stop', async () => {
      await controller.start();
      await controller.pause();
      const session = await controller.stop();

      expect(controller.getState()).toBe('idle');
      expect(session.metadata.endTime).toBeDefined();
    });

    it('should throw error when starting from non-idle state', async () => {
      await controller.start();

      await expect(controller.start()).rejects.toThrow(
        'Cannot start session: current state is recording'
      );
    });

    it('should throw error when pausing from non-recording state', async () => {
      await expect(controller.pause()).rejects.toThrow(
        'Cannot pause session: current state is idle'
      );
    });

    it('should throw error when resuming from non-paused state', async () => {
      await expect(controller.resume()).rejects.toThrow(
        'Cannot resume session: current state is idle'
      );
    });

    it('should throw error when stopping from idle state', async () => {
      await expect(controller.stop()).rejects.toThrow('Cannot stop session: no active session');
    });
  });

  describe('Session Metadata', () => {
    it('should create session with default metadata', async () => {
      await controller.start();
      const session = controller.getCurrentSession();

      expect(session).toBeDefined();
      expect(session?.metadata.sessionId).toBeDefined();
      expect(session?.metadata.startTime).toBeDefined();
      expect(session?.metadata.extensionId).toBe('unknown');
      expect(session?.metadata.platform).toBe(process.platform);
    });

    it('should create session with custom metadata', async () => {
      await controller.start({
        extensionId: 'test-ext-123',
        extensionVersion: '1.0.0',
        chromeVersion: '122.0.0',
        chromeProfile: 'Default',
        includeScreenshots: true,
      });

      const session = controller.getCurrentSession();

      expect(session?.metadata.extensionId).toBe('test-ext-123');
      expect(session?.metadata.extensionVersion).toBe('1.0.0');
      expect(session?.metadata.chromeVersion).toBe('122.0.0');
      expect(session?.metadata.recordingOptions?.includeScreenshots).toBe(true);
    });

    it('should set endTime on stop', async () => {
      await controller.start();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const session = await controller.stop();

      expect(session.metadata.endTime).toBeDefined();
      expect(session.metadata.endTime).toBeGreaterThanOrEqual(session.metadata.startTime);
    });
  });

  describe('Session Timing', () => {
    it('should track uptime correctly', async () => {
      await controller.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const uptime = controller.getUptime();
      expect(uptime).toBeGreaterThan(0);
      expect(uptime).toBeLessThan(200);
    });

    it('should not count paused time in uptime', async () => {
      await controller.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      await controller.pause();
      const uptimeBeforePause = controller.getUptime();

      await new Promise((resolve) => setTimeout(resolve, 100));
      const uptimeDuringPause = controller.getUptime();

      expect(uptimeDuringPause).toBeCloseTo(uptimeBeforePause, -1);
    });

    it('should resume uptime after resume', async () => {
      await controller.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      await controller.pause();
      await new Promise((resolve) => setTimeout(resolve, 50));

      await controller.resume();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const uptime = controller.getUptime();
      expect(uptime).toBeGreaterThan(80);
      expect(uptime).toBeLessThan(120);
    });
  });

  describe('Event Emission', () => {
    it('should emit stateChange event on start', async () => {
      const handler = vi.fn();
      controller.on('stateChange', handler);

      await controller.start();

      expect(handler).toHaveBeenCalledWith('recording', 'idle');
    });

    it('should emit sessionStart event with sessionId', async () => {
      const handler = vi.fn();
      controller.on('sessionStart', handler);

      const sessionId = await controller.start();

      expect(handler).toHaveBeenCalledWith(sessionId);
    });

    it('should emit sessionPause event on pause', async () => {
      const handler = vi.fn();
      controller.on('sessionPause', handler);

      await controller.start();
      await controller.pause();

      expect(handler).toHaveBeenCalled();
    });

    it('should emit sessionResume event on resume', async () => {
      const handler = vi.fn();
      controller.on('sessionResume', handler);

      await controller.start();
      await controller.pause();
      await controller.resume();

      expect(handler).toHaveBeenCalled();
    });

    it('should emit sessionStop event on stop', async () => {
      const handler = vi.fn();
      controller.on('sessionStop', handler);

      await controller.start();
      await controller.stop();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Session Persistence', () => {
    it('should save session on start', async () => {
      await controller.start();

      expect(mockStore.save).toHaveBeenCalled();
    });

    it('should save session on pause', async () => {
      await controller.start();
      (mockStore.save as any).mockClear();

      await controller.pause();

      expect(mockStore.save).toHaveBeenCalled();
    });

    it('should save session on stop', async () => {
      await controller.start();
      (mockStore.save as any).mockClear();

      await controller.stop();

      expect(mockStore.save).toHaveBeenCalled();
    });
  });

  describe('Shutdown Handling', () => {
    it('should gracefully shutdown recording session', async () => {
      await controller.start();
      await controller.shutdown();

      expect(controller.getState()).toBe('idle');
      expect(mockStore.save).toHaveBeenCalled();
    });

    it('should gracefully shutdown paused session', async () => {
      await controller.start();
      await controller.pause();
      await controller.shutdown();

      expect(controller.getState()).toBe('idle');
    });

    it('should handle shutdown in idle state', async () => {
      await expect(controller.shutdown()).resolves.not.toThrow();
      expect(controller.getState()).toBe('idle');
    });
  });

  describe('Status Reporting', () => {
    it('should provide status in idle state', () => {
      const status = controller.getStatus();

      expect(status.state).toBe('idle');
      expect(status.sessionId).toBeNull();
      expect(status.uptime).toBe(0);
      expect(status.isPaused).toBe(false);
    });

    it('should provide status in recording state', async () => {
      const sessionId = await controller.start();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const status = controller.getStatus();

      expect(status.state).toBe('recording');
      expect(status.sessionId).toBe(sessionId);
      expect(status.uptime).toBeGreaterThanOrEqual(0);
      expect(status.isPaused).toBe(false);
      expect(status.session).toBeDefined();
    });

    it('should provide status in paused state', async () => {
      await controller.start();
      await controller.pause();
      const status = controller.getStatus();

      expect(status.state).toBe('paused');
      expect(status.isPaused).toBe(true);
    });
  });
});
