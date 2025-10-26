/**
 * Log Collector for Background Service Worker
 * Receives and stores structured log envelopes from all runtimes
 * for integration with the debug recorder session system.
 */

import type { StructuredLogEnvelope } from "../shared/console-wrapper.js";
import type { LogBatch } from "../shared/log-bridge-client.js";

interface StoredLogSession {
  sessionId: string;
  startTime: number;
  logs: StructuredLogEnvelope[];
  lastUpdate: number;
}

const STORAGE_KEY = "debug_log_sessions";
const MAX_LOGS_PER_SESSION = 5000;
const SESSION_TIMEOUT_MS = 3600000; // 1 hour

export class LogCollector {
  private currentSession: StoredLogSession | null = null;
  private sessionTimeoutTimer: number | null = null;

  constructor() {
    this.loadCurrentSession();
  }

  /**
   * Start a new log collection session
   */
  async startSession(sessionId?: string): Promise<string> {
    const newSessionId = sessionId ?? this.generateSessionId();

    // Save current session if exists
    if (this.currentSession) {
      await this.saveSession(this.currentSession);
    }

    // Create new session
    this.currentSession = {
      sessionId: newSessionId,
      startTime: Date.now(),
      logs: [],
      lastUpdate: Date.now(),
    };

    await this.persistCurrentSession();
    this.startSessionTimeout();

    return newSessionId;
  }

  /**
   * Stop the current session
   */
  async stopSession(): Promise<StoredLogSession | null> {
    if (!this.currentSession) return null;

    this.stopSessionTimeout();

    const session = { ...this.currentSession };
    await this.saveSession(session);

    this.currentSession = null;
    await this.clearCurrentSession();

    return session;
  }

  /**
   * Collect a log batch from a runtime
   */
  async collectBatch(batch: LogBatch): Promise<void> {
    if (!this.currentSession) {
      // Auto-start a session if not active
      await this.startSession();
    }

    if (!this.currentSession) return;

    // Add logs to current session
    this.currentSession.logs.push(...batch.logs);
    this.currentSession.lastUpdate = Date.now();

    // Enforce max logs limit
    if (this.currentSession.logs.length > MAX_LOGS_PER_SESSION) {
      this.currentSession.logs = this.currentSession.logs.slice(-MAX_LOGS_PER_SESSION);
    }

    await this.persistCurrentSession();
    this.resetSessionTimeout();
  }

  /**
   * Collect a single log envelope
   */
  async collectLog(log: StructuredLogEnvelope): Promise<void> {
    await this.collectBatch({
      logs: [log],
      timestamp: log.timestamp,
      origin: log.origin,
    });
  }

  /**
   * Get current session logs
   */
  getCurrentSessionLogs(): StructuredLogEnvelope[] {
    return this.currentSession?.logs ?? [];
  }

  /**
   * Get current session info
   */
  getCurrentSessionInfo(): Pick<StoredLogSession, "sessionId" | "startTime" | "lastUpdate"> | null {
    if (!this.currentSession) return null;

    return {
      sessionId: this.currentSession.sessionId,
      startTime: this.currentSession.startTime,
      lastUpdate: this.currentSession.lastUpdate,
    };
  }

  /**
   * Get stored session by ID
   */
  async getSession(sessionId: string): Promise<StoredLogSession | null> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const sessions: Record<string, StoredLogSession> = result[STORAGE_KEY] || {};
      return sessions[sessionId] ?? null;
    } catch (error) {
      console.error("[LogCollector] Failed to get session:", error);
      return null;
    }
  }

  /**
   * List all stored session IDs
   */
  async listSessions(): Promise<string[]> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const sessions: Record<string, StoredLogSession> = result[STORAGE_KEY] || {};
      return Object.keys(sessions);
    } catch (error) {
      console.error("[LogCollector] Failed to list sessions:", error);
      return [];
    }
  }

  /**
   * Clear old sessions
   */
  async clearOldSessions(maxAgeMs: number = 86400000): Promise<number> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const sessions: Record<string, StoredLogSession> = result[STORAGE_KEY] || {};
      const now = Date.now();
      let cleared = 0;

      for (const [sessionId, session] of Object.entries(sessions)) {
        if (now - session.lastUpdate > maxAgeMs) {
          delete sessions[sessionId];
          cleared++;
        }
      }

      await chrome.storage.local.set({ [STORAGE_KEY]: sessions });
      return cleared;
    } catch (error) {
      console.error("[LogCollector] Failed to clear old sessions:", error);
      return 0;
    }
  }

  /**
   * Save a session to storage
   */
  private async saveSession(session: StoredLogSession): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const sessions: Record<string, StoredLogSession> = result[STORAGE_KEY] || {};
      sessions[session.sessionId] = session;
      await chrome.storage.local.set({ [STORAGE_KEY]: sessions });
    } catch (error) {
      console.error("[LogCollector] Failed to save session:", error);
    }
  }

  /**
   * Persist current session to temporary storage
   */
  private async persistCurrentSession(): Promise<void> {
    if (!this.currentSession) return;

    try {
      await chrome.storage.local.set({
        debug_current_log_session: this.currentSession,
      });
    } catch (error) {
      console.error("[LogCollector] Failed to persist current session:", error);
    }
  }

  /**
   * Load current session from storage
   */
  private async loadCurrentSession(): Promise<void> {
    try {
      const result = await chrome.storage.local.get("debug_current_log_session");
      if (result.debug_current_log_session) {
        this.currentSession = result.debug_current_log_session;
        this.startSessionTimeout();
      }
    } catch (error) {
      console.error("[LogCollector] Failed to load current session:", error);
    }
  }

  /**
   * Clear current session from storage
   */
  private async clearCurrentSession(): Promise<void> {
    try {
      await chrome.storage.local.remove("debug_current_log_session");
    } catch (error) {
      console.error("[LogCollector] Failed to clear current session:", error);
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `log-session-${timestamp}-${random}`;
  }

  /**
   * Start session timeout timer
   */
  private startSessionTimeout(): void {
    if (this.sessionTimeoutTimer !== null) return;

    this.sessionTimeoutTimer = setTimeout(() => {
      this.stopSession();
    }, SESSION_TIMEOUT_MS) as unknown as number;
  }

  /**
   * Stop session timeout timer
   */
  private stopSessionTimeout(): void {
    if (this.sessionTimeoutTimer !== null) {
      clearTimeout(this.sessionTimeoutTimer);
      this.sessionTimeoutTimer = null;
    }
  }

  /**
   * Reset session timeout timer
   */
  private resetSessionTimeout(): void {
    this.stopSessionTimeout();
    this.startSessionTimeout();
  }
}

// Global singleton instance
let globalLogCollector: LogCollector | null = null;

/**
 * Get or create the global log collector
 */
export function getLogCollector(): LogCollector {
  if (!globalLogCollector) {
    globalLogCollector = new LogCollector();
  }
  return globalLogCollector;
}
