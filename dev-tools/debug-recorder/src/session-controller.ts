import { EventEmitter } from 'node:events';
import { SessionStore } from './session-store.js';
import type { Session, SessionMetadata } from './types.js';

export type SessionState = 'idle' | 'recording' | 'paused' | 'stopped';

export interface SessionConfig {
  extensionId?: string;
  extensionVersion?: string;
  chromeVersion?: string;
  platform?: string;
  chromeProfile?: string;
  flags?: Record<string, unknown>;
  includeScreenshots?: boolean;
  includeStorage?: boolean;
  includeMetrics?: boolean;
}

export interface SessionControllerEvents {
  stateChange: (state: SessionState, previousState: SessionState) => void;
  sessionStart: (sessionId: string) => void;
  sessionPause: () => void;
  sessionResume: () => void;
  sessionStop: () => void;
  error: (error: Error) => void;
}

export class SessionController extends EventEmitter {
  private state: SessionState = 'idle';
  private currentSession: Session | null = null;
  private sessionStore: SessionStore;
  private startTime: number = 0;
  private pausedTime: number = 0;
  private totalPausedDuration: number = 0;
  private config: SessionConfig = {};

  constructor(sessionStore?: SessionStore) {
    super();
    this.sessionStore = sessionStore || new SessionStore();
  }

  getState(): SessionState {
    return this.state;
  }

  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  getSessionId(): string | null {
    return this.currentSession?.metadata.sessionId || null;
  }

  getUptime(): number {
    if (this.state === 'idle' || !this.startTime) {
      return 0;
    }

    const currentTime = Date.now();
    const elapsed = currentTime - this.startTime - this.totalPausedDuration;

    if (this.state === 'paused' && this.pausedTime) {
      return elapsed - (currentTime - this.pausedTime);
    }

    return elapsed;
  }

  async start(config: SessionConfig = {}): Promise<string> {
    if (this.state !== 'idle' && this.state !== 'stopped') {
      throw new Error(`Cannot start session: current state is ${this.state}`);
    }

    // Reset state if starting from stopped state
    if (this.state === 'stopped') {
      this.reset();
    }

    this.config = config;
    const previousState = this.state;

    try {
      const sessionId = this.generateSessionId();
      this.startTime = Date.now();
      this.totalPausedDuration = 0;
      this.pausedTime = 0;

      const metadata: SessionMetadata = {
        sessionId,
        startTime: this.startTime,
        extensionId: config.extensionId || 'unknown',
        extensionVersion: config.extensionVersion,
        chromeVersion: config.chromeVersion,
        platform: config.platform || process.platform,
        recordingOptions: {
          includeScreenshots: config.includeScreenshots || false,
          includeStorage: config.includeStorage || false,
          includeMetrics: config.includeMetrics || false,
          includePII: false,
        },
      };

      this.currentSession = {
        metadata,
        interactions: [],
        errors: [],
        snapshots: [],
      };

      await this.sessionStore.save(this.currentSession);

      this.state = 'recording';
      this.emit('stateChange', this.state, previousState);
      this.emit('sessionStart', sessionId);

      return sessionId;
    } catch (error) {
      this.state = previousState;
      this.emit('error', error as Error);
      throw error;
    }
  }

  async pause(): Promise<void> {
    if (this.state !== 'recording') {
      throw new Error(`Cannot pause session: current state is ${this.state}`);
    }

    const previousState = this.state;
    this.pausedTime = Date.now();
    this.state = 'paused';

    await this.persistSession();

    this.emit('stateChange', this.state, previousState);
    this.emit('sessionPause');
  }

  async resume(): Promise<void> {
    if (this.state !== 'paused') {
      throw new Error(`Cannot resume session: current state is ${this.state}`);
    }

    const previousState = this.state;

    if (this.pausedTime) {
      this.totalPausedDuration += Date.now() - this.pausedTime;
      this.pausedTime = 0;
    }

    this.state = 'recording';

    this.emit('stateChange', this.state, previousState);
    this.emit('sessionResume');
  }

  async stop(): Promise<Session> {
    if (this.state === 'idle' || this.state === 'stopped') {
      throw new Error('Cannot stop session: no active session');
    }

    const previousState = this.state;

    if (!this.currentSession) {
      throw new Error('No current session to stop');
    }

    if (this.state === 'paused' && this.pausedTime) {
      this.totalPausedDuration += Date.now() - this.pausedTime;
      this.pausedTime = 0;
    }

    this.currentSession.metadata.endTime = Date.now();
    await this.sessionStore.save(this.currentSession);

    const session = this.currentSession;

    this.state = 'stopped';
    this.emit('stateChange', this.state, previousState);
    this.emit('sessionStop');

    // Note: reset() is now called in start() to allow inspection of stopped state
    // The controller can be reused by calling start() again

    return session;
  }

  async shutdown(): Promise<void> {
    if (this.state === 'recording' || this.state === 'paused') {
      await this.stop();
    }
  }

  getStatus() {
    return {
      state: this.state,
      sessionId: this.getSessionId(),
      uptime: this.getUptime(),
      config: this.config,
      startTime: this.startTime,
      isPaused: this.state === 'paused',
      session: this.currentSession,
    };
  }

  private reset(): void {
    this.state = 'idle';
    this.currentSession = null;
    this.startTime = 0;
    this.pausedTime = 0;
    this.totalPausedDuration = 0;
    this.config = {};
  }

  private async persistSession(): Promise<void> {
    if (this.currentSession) {
      await this.sessionStore.save(this.currentSession);
    }
  }

  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return `session-${timestamp}-${random}`;
  }
}
