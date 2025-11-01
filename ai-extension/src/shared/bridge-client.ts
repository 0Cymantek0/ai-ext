/**
 * Debug Bridge Client
 * WebSocket client for extension contexts to send events to debug-recorder CLI.
 */

import {
  type BridgeMessage,
  type HandshakeMessage,
  type HeartbeatMessage,
  type EventMessage,
  type BatchMessage,
  type CommandMessage,
  type CommandType,
  type EventType,
  type ClientContext,
  type ClientStatus,
  ConnectionStatus,
} from "./bridge-protocol";

interface BufferedEvent {
  eventType: EventType;
  data: unknown;
  timestamp: number;
}

interface PersistedBuffer {
  events: BufferedEvent[];
  timestamp: number;
}

export interface BridgeClientConfig {
  context: ClientContext;
  extensionId: string;
  sessionId: string;
  token: string;
  port?: number;
  host?: string;
  enabled?: boolean;
  onCommand?: (command: CommandType, params?: Record<string, unknown>) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9229;
const MAX_BUFFER_SIZE = 10_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const BASE_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const RECONNECT_BACKOFF_MULTIPLIER = 2;
const BUFFER_KEY_PREFIX = "debug_bridge_buffer";
const PERSISTENCE_CONTEXTS: ClientContext[] = ["content-script", "side-panel"];

const supportsIndexedDB = typeof indexedDB !== "undefined";

type StorageArea = typeof chrome.storage.local;

class BridgeIndexedDb {
  private static instance: BridgeIndexedDb | null = null;
  private dbPromise: Promise<IDBDatabase>;

  private constructor() {
    this.dbPromise = this.open();
  }

  static getInstance(): BridgeIndexedDb | null {
    if (!supportsIndexedDB) {
      return null;
    }
    if (!this.instance) {
      this.instance = new BridgeIndexedDb();
    }
    return this.instance;
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("ai-pocket-debug-bridge", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("buffers")) {
          db.createObjectStore("buffers");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("IndexedDB error"));
    });
  }

  async write(key: string, value: PersistedBuffer): Promise<void> {
    const db = await this.dbPromise;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("buffers", "readwrite");
      const store = tx.objectStore("buffers");
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("IndexedDB transaction error"));
    });
  }

  async read(key: string): Promise<PersistedBuffer | undefined> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("buffers", "readonly");
      const store = tx.objectStore("buffers");
      const request = store.get(key);
      request.onsuccess = () =>
        resolve(request.result as PersistedBuffer | undefined);
      request.onerror = () =>
        reject(request.error ?? new Error("IndexedDB read error"));
    });
  }

  async remove(key: string): Promise<void> {
    const db = await this.dbPromise;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("buffers", "readwrite");
      const store = tx.objectStore("buffers");
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("IndexedDB transaction error"));
    });
  }
}

/**
 * Debug Bridge Client implementation.
 */
export class BridgeClient {
  private ws: WebSocket | null = null;
  private readonly context: ClientContext;
  private readonly extensionId: string;
  private sessionId: string;
  private token: string;
  private host: string;
  private port: number;
  private enabled: boolean;

  private status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private bufferedEvents: BufferedEvent[] = [];
  private isPaused = false;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private lastHeartbeat: number | null = null;
  private lastHeartbeatAck: number | null = null;

  private readonly idb = BridgeIndexedDb.getInstance();
  private readonly onCommand:
    | ((command: CommandType, params?: Record<string, unknown>) => void)
    | undefined;
  private readonly onStatusChange:
    | ((status: ConnectionStatus) => void)
    | undefined;

  constructor(config: BridgeClientConfig) {
    this.context = config.context;
    this.extensionId = config.extensionId;
    this.sessionId = config.sessionId;
    this.token = config.token;
    this.host = config.host ?? DEFAULT_HOST;
    this.port = config.port ?? DEFAULT_PORT;
    this.enabled = config.enabled !== false;
    this.onCommand = config.onCommand;
    this.onStatusChange = config.onStatusChange;
  }

  /**
   * Establish WebSocket connection if enabled and credentials are present.
   */
  async connect(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (!this.token || !this.sessionId) {
      console.warn(
        "[BridgeClient] Missing session token or ID; cannot connect",
      );
      return;
    }

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    try {
      const url = `ws://${this.host}:${this.port}`;
      this.setStatus(ConnectionStatus.CONNECTING);

      this.ws = new WebSocket(url);
      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onclose = () => this.handleClose();
      this.ws.onerror = (error) => this.handleError(error);
    } catch (error) {
      console.error("[BridgeClient] Failed to initiate connection", error);
      this.setStatus(ConnectionStatus.ERROR);
      this.scheduleReconnect();
    }
  }

  /**
   * Disable the bridge client and close connection.
   */
  async disconnect(): Promise<void> {
    await this.setEnabled(false);
  }

  /**
   * Enable or disable the bridge client.
   */
  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled === this.enabled) {
      return;
    }

    this.enabled = enabled;

    if (enabled) {
      await this.connect();
      return;
    }

    this.cleanupConnection();
    this.bufferedEvents = [];
    this.setStatus(ConnectionStatus.DISCONNECTED);
  }

  /**
   * Update connection details (token, session, host, port).
   */
  async updateConnectionDetails(
    details: Partial<
      Pick<BridgeClientConfig, "sessionId" | "token" | "host" | "port">
    >,
  ): Promise<void> {
    let credentialsChanged = false;

    if (details.token && details.token !== this.token) {
      this.token = details.token;
      credentialsChanged = true;
    }

    if (details.sessionId && details.sessionId !== this.sessionId) {
      this.sessionId = details.sessionId;
      credentialsChanged = true;
      // Reset buffered events when session changes
      this.bufferedEvents = [];
      await this.loadPersistedEvents();
    }

    if (details.host && details.host !== this.host) {
      this.host = details.host;
      credentialsChanged = true;
    }

    if (typeof details.port === "number" && details.port !== this.port) {
      this.port = details.port;
      credentialsChanged = true;
    }

    if (credentialsChanged && this.enabled) {
      this.cleanupConnection();
      await this.connect();
    }
  }

  /**
   * Send an event to the bridge server (with automatic buffering).
   */
  sendEvent(eventType: EventType, data: unknown): void {
    if (!this.enabled) {
      return;
    }

    if (this.isPaused || this.status !== ConnectionStatus.CONNECTED) {
      this.bufferEvent(eventType, data);
      return;
    }

    const message: EventMessage = {
      type: "EVENT",
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload: {
        eventType,
        data,
        context: this.context,
      },
    };

    this.send(message);
  }

  /**
   * Retrieve current client status.
   */
  getStatus(): ClientStatus {
    return {
      connected: this.status === ConnectionStatus.CONNECTED,
      status: this.status,
      context: this.context,
      sessionId: this.sessionId || null,
      bufferedEvents: this.bufferedEvents.length,
      lastHeartbeat: this.lastHeartbeat,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * Buffer event for later transmission.
   */
  private bufferEvent(eventType: EventType, data: unknown): void {
    this.bufferedEvents.push({ eventType, data, timestamp: Date.now() });
    if (this.bufferedEvents.length > MAX_BUFFER_SIZE) {
      this.bufferedEvents = this.bufferedEvents.slice(-MAX_BUFFER_SIZE);
    }

    if (this.shouldPersistBuffer()) {
      void this.persistBufferedEvents();
    }
  }

  /**
   * Flush buffered events as a batch.
   */
  private flushBufferedEvents(): void {
    if (
      this.bufferedEvents.length === 0 ||
      this.status !== ConnectionStatus.CONNECTED
    ) {
      return;
    }

    const payload: BatchMessage["payload"] = {
      events: [...this.bufferedEvents],
      context: this.context,
    };

    const firstTimestamp = this.bufferedEvents[0]?.timestamp;
    if (typeof firstTimestamp === "number") {
      payload.bufferedSince = firstTimestamp;
    }

    const batch: BatchMessage = {
      type: "BATCH",
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload,
    };

    this.send(batch);
    this.bufferedEvents = [];

    if (this.shouldPersistBuffer()) {
      void this.clearPersistedEvents();
    }
  }

  /**
   * Determine whether this context should persist buffered events.
   */
  private shouldPersistBuffer(): boolean {
    return PERSISTENCE_CONTEXTS.includes(this.context);
  }

  /**
   * Persist buffered events to storage (IndexedDB or chrome.storage.local).
   */
  private async persistBufferedEvents(): Promise<void> {
    if (!this.shouldPersistBuffer()) {
      return;
    }

    const key = this.getBufferKey();
    const payload: PersistedBuffer = {
      events: [...this.bufferedEvents],
      timestamp: Date.now(),
    };

    try {
      if (this.idb) {
        await this.idb.write(key, payload);
      } else {
        const storage = this.getStorageArea();
        if (storage) {
          await storage.set({ [key]: payload });
        }
      }
    } catch (error) {
      console.error("[BridgeClient] Failed to persist buffered events", error);
    }
  }

  /**
   * Load persisted events from storage.
   */
  async loadPersistedEvents(): Promise<void> {
    if (!this.shouldPersistBuffer()) {
      return;
    }

    const key = this.getBufferKey();
    try {
      let payload: PersistedBuffer | undefined;

      if (this.idb) {
        payload = await this.idb.read(key);
      } else {
        const storage = this.getStorageArea();
        if (storage) {
          const result = await storage.get(key);
          payload = result[key] as PersistedBuffer | undefined;
        }
      }

      if (payload?.events?.length) {
        this.bufferedEvents = payload.events.slice(-MAX_BUFFER_SIZE);
      }
    } catch (error) {
      console.error("[BridgeClient] Failed to load persisted events", error);
    }
  }

  /**
   * Clear persisted buffer from storage.
   */
  private async clearPersistedEvents(): Promise<void> {
    if (!this.shouldPersistBuffer()) {
      return;
    }

    const key = this.getBufferKey();
    try {
      if (this.idb) {
        await this.idb.remove(key);
      } else {
        const storage = this.getStorageArea();
        if (storage) {
          await storage.remove(key);
        }
      }
    } catch (error) {
      console.error("[BridgeClient] Failed to clear persisted events", error);
    }
  }

  /**
   * Handle WebSocket open event.
   */
  private handleOpen(): void {
    this.reconnectAttempts = 0;
    this.lastHeartbeat = Date.now();

    const handshake: HandshakeMessage = {
      type: "HANDSHAKE",
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload: {
        token: this.token,
        context: this.context,
        extensionId: this.extensionId,
        sessionId: this.sessionId,
      },
    };

    this.send(handshake);
  }

  /**
   * Handle handshake acknowledgement.
   */
  private async handleHandshakeAck(
    message: BridgeMessage & { type: "HANDSHAKE_ACK" },
  ): Promise<void> {
    if (!message.payload.accepted) {
      console.error(
        "[BridgeClient] Handshake rejected:",
        message.payload.error,
      );
      await this.setEnabled(false);
      return;
    }

    this.isPaused = false;
    this.setStatus(ConnectionStatus.CONNECTED);
    this.reconnectAttempts = 0;
    this.startHeartbeat();
    this.lastHeartbeatAck = Date.now();

    if (this.bufferedEvents.length === 0 && this.shouldPersistBuffer()) {
      await this.loadPersistedEvents();
    }

    this.flushBufferedEvents();
  }

  /**
   * Handle heartbeat message from server.
   */
  private handleHeartbeat(message: HeartbeatMessage): void {
    this.lastHeartbeat = Date.now();

    const ack: BridgeMessage = {
      type: "HEARTBEAT_ACK",
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload: { originalId: message.id },
    } as BridgeMessage;

    this.send(ack);
  }

  /**
   * Handle incoming command from server.
   */
  private handleCommand(message: CommandMessage): void {
    const { command, params } = message.payload;
    switch (command) {
      case "PAUSE":
        this.isPaused = true;
        this.setStatus(ConnectionStatus.PAUSED);
        break;
      case "RESUME":
        this.isPaused = false;
        this.setStatus(ConnectionStatus.CONNECTED);
        this.flushBufferedEvents();
        break;
      case "STOP":
        void this.setEnabled(false);
        break;
      case "STATUS":
        this.sendEvent("STATE_SNAPSHOT", this.getStatus());
        break;
    }

    if (this.onCommand) {
      try {
        this.onCommand(command, params);
      } catch (error) {
        console.error("[BridgeClient] onCommand handler failed", error);
      }
    }

    const ack: BridgeMessage = {
      type: "COMMAND_ACK",
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload: { commandId: message.id, success: true },
    } as BridgeMessage;

    this.send(ack);
  }

  /**
   * Handle WebSocket messages.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as BridgeMessage;
      switch (message.type) {
        case "HANDSHAKE_ACK":
          void this.handleHandshakeAck(
            message as BridgeMessage & { type: "HANDSHAKE_ACK" },
          );
          break;
        case "HEARTBEAT":
          this.handleHeartbeat(message as HeartbeatMessage);
          break;
        case "HEARTBEAT_ACK":
          this.lastHeartbeatAck = Date.now();
          break;
        case "COMMAND":
          this.handleCommand(message as CommandMessage);
          break;
        case "EVENT_ACK":
        case "BATCH_ACK":
          // Acknowledgements acknowledged implicitly
          break;
        case "ERROR":
          console.error("[BridgeClient] Server error", message.payload);
          break;
        case "DISCONNECT":
          console.info(
            "[BridgeClient] Server requested disconnect",
            message.payload,
          );
          void this.setEnabled(false);
          break;
        default:
          console.warn("[BridgeClient] Unknown message type", message.type);
      }
    } catch (error) {
      console.error("[BridgeClient] Failed to handle message", error);
    }
  }

  /**
   * Handle WebSocket close event.
   */
  private handleClose(): void {
    this.cleanupConnection();
    if (this.enabled) {
      this.setStatus(ConnectionStatus.DISCONNECTED);
      this.scheduleReconnect();
    }
  }

  /**
   * Handle WebSocket error event.
   */
  private handleError(error: Event): void {
    console.error("[BridgeClient] WebSocket error", error);
    this.setStatus(ConnectionStatus.ERROR);
  }

  /**
   * Schedule reconnection with exponential backoff.
   */
  private scheduleReconnect(): void {
    if (!this.enabled || this.reconnectTimer !== null) {
      return;
    }

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS *
        Math.pow(RECONNECT_BACKOFF_MULTIPLIER, this.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS,
    );

    console.info(
      `[BridgeClient] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts += 1;
      void this.connect();
    }, delay) as unknown as number;
  }

  /**
   * Start heartbeat monitor.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (!this.enabled || this.status !== ConnectionStatus.CONNECTED) {
        return;
      }

      if (this.ws?.readyState !== WebSocket.OPEN) {
        return;
      }

      if (
        this.lastHeartbeatAck &&
        Date.now() - this.lastHeartbeatAck > HEARTBEAT_TIMEOUT_MS
      ) {
        console.warn("[BridgeClient] Heartbeat timeout, reconnecting");
        this.cleanupConnection();
        this.setStatus(ConnectionStatus.DISCONNECTED);
        this.scheduleReconnect();
        return;
      }

      const heartbeat: HeartbeatMessage = {
        type: "HEARTBEAT",
        id: this.generateMessageId(),
        timestamp: Date.now(),
        payload: { clientId: this.context },
      };

      this.send(heartbeat);
    }, HEARTBEAT_INTERVAL_MS) as unknown as number;
  }

  /**
   * Stop heartbeat monitor.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Stop reconnection timer.
   */
  private stopReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Cleanup WebSocket connection and timers.
   */
  private cleanupConnection(): void {
    this.stopHeartbeat();
    this.stopReconnect();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  /**
   * Send message over WebSocket if possible.
   */
  private send(message: Partial<BridgeMessage>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.bufferEventFromMessage(message);
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error("[BridgeClient] Failed to send message", error);
      this.bufferEventFromMessage(message);
    }
  }

  /**
   * Buffer event if send failed.
   */
  private bufferEventFromMessage(message: Partial<BridgeMessage>): void {
    if (message.type === "EVENT") {
      const payload = (message as EventMessage).payload;
      this.bufferEvent(payload.eventType, payload.data);
    } else if (message.type === "BATCH") {
      const payload = (message as BatchMessage).payload;
      for (const event of payload.events) {
        this.bufferEvent(event.eventType, event.data);
      }
    }
  }

  /**
   * Generate unique message ID.
   */
  private generateMessageId(): string {
    return `${this.context}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Update status and notify listeners.
   */
  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    if (this.onStatusChange) {
      try {
        this.onStatusChange(status);
      } catch (error) {
        console.error("[BridgeClient] onStatusChange handler failed", error);
      }
    }
  }

  /**
   * Build persistence key for current session/context.
   */
  private getBufferKey(): string {
    return `${BUFFER_KEY_PREFIX}:${this.context}:${this.sessionId}`;
  }

  /**
   * Utility to access storage area.
   */
  private getStorageArea(): StorageArea | null {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return null;
    }
    return chrome.storage.local;
  }
}

const clientInstances: Map<ClientContext, BridgeClient> = new Map();

/**
 * Initialize bridge client for a context.
 */
export async function initializeBridgeClient(
  config: BridgeClientConfig,
): Promise<BridgeClient> {
  let client = clientInstances.get(config.context);

  if (!config.token || !config.sessionId) {
    console.warn(
      "[BridgeClient] Missing token or session ID; bridge disabled for",
      config.context,
    );
    return new BridgeClient({ ...config, enabled: false });
  }

  if (!client) {
    client = new BridgeClient(config);
    clientInstances.set(config.context, client);
    await client.loadPersistedEvents();
    if (config.enabled !== false) {
      await client.connect();
    }
    return client;
  }

  await client.updateConnectionDetails(config);
  if (config.enabled !== undefined) {
    await client.setEnabled(config.enabled);
  }

  return client;
}

/**
 * Retrieve existing bridge client for context.
 */
export function getBridgeClient(
  context: ClientContext,
): BridgeClient | undefined {
  return clientInstances.get(context);
}

/**
 * Reset bridge client for context (disconnect + remove).
 */
export async function resetBridgeClient(context: ClientContext): Promise<void> {
  const client = clientInstances.get(context);
  if (!client) {
    return;
  }
  await client.disconnect();
  clientInstances.delete(context);
}
