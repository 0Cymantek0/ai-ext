/**
 * Debug Bridge Client
 * WebSocket client for extension contexts to send events to debug-recorder CLI
 */

import type {
  BridgeMessage,
  HandshakeMessage,
  HeartbeatMessage,
  EventMessage,
  BatchMessage,
  CommandMessage,
  CommandType,
  EventType,
  ClientContext,
  ClientStatus,
  ConnectionStatus,
  BridgeConfig,
} from './bridge-protocol.ts';

interface BufferedEvent {
  eventType: EventType;
  data: unknown;
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

/**
 * Debug Bridge Client
 */
export class BridgeClient {
  private ws: WebSocket | null = null;
  private context: ClientContext;
  private extensionId: string;
  private sessionId: string;
  private token: string;
  private host: string;
  private port: number;
  private enabled: boolean;
  
  private status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private bufferedEvents: BufferedEvent[] = [];
  private isPaused: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private lastHeartbeat: number | null = null;
  
  private readonly maxBufferSize: number = 10000;
  private readonly maxReconnectDelay: number = 30000;
  private readonly reconnectBackoff: number = 2;
  private readonly heartbeatInterval: number = 30000;
  
  private onCommand?: (command: CommandType, params?: Record<string, unknown>) => void;
  private onStatusChange?: (status: ConnectionStatus) => void;

  constructor(config: BridgeClientConfig) {
    this.context = config.context;
    this.extensionId = config.extensionId;
    this.sessionId = config.sessionId;
    this.token = config.token;
    this.host = config.host || '127.0.0.1';
    this.port = config.port || 9229;
    this.enabled = config.enabled !== false;
    this.onCommand = config.onCommand;
    this.onStatusChange = config.onStatusChange;
  }

  /**
   * Connect to the bridge server
   */
  async connect(): Promise<void> {
    if (!this.enabled) {
      console.debug('[BridgeClient] Bridge client is disabled');
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.debug('[BridgeClient] Already connected');
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
      console.error('[BridgeClient] Failed to connect:', error);
      this.setStatus(ConnectionStatus.ERROR);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the bridge server
   */
  disconnect(): void {
    this.enabled = false;
    this.stopHeartbeat();
    this.stopReconnect();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.setStatus(ConnectionStatus.DISCONNECTED);
  }

  /**
   * Send an event to the bridge server
   */
  sendEvent(eventType: EventType, data: unknown): void {
    if (!this.enabled) return;

    // If paused or not connected, buffer the event
    if (this.isPaused || this.status !== ConnectionStatus.CONNECTED) {
      this.bufferEvent(eventType, data);
      return;
    }

    const message: EventMessage = {
      type: 'EVENT',
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
   * Buffer an event for later transmission
   */
  private bufferEvent(eventType: EventType, data: unknown): void {
    this.bufferedEvents.push({
      eventType,
      data,
      timestamp: Date.now(),
    });

    // Enforce buffer size limit (FIFO)
    if (this.bufferedEvents.length > this.maxBufferSize) {
      this.bufferedEvents = this.bufferedEvents.slice(-this.maxBufferSize);
    }

    // For content/sidepanel, persist to IndexedDB
    if (this.context === 'content-script' || this.context === 'side-panel') {
      this.persistBufferedEvents();
    }
  }

  /**
   * Flush buffered events
   */
  private flushBufferedEvents(): void {
    if (this.bufferedEvents.length === 0) return;

    const batch: BatchMessage = {
      type: 'BATCH',
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload: {
        events: [...this.bufferedEvents],
        context: this.context,
        bufferedSince: this.bufferedEvents[0]?.timestamp,
      },
    };

    this.send(batch);
    this.bufferedEvents = [];
    
    // Clear persisted events
    if (this.context === 'content-script' || this.context === 'side-panel') {
      this.clearPersistedEvents();
    }
  }

  /**
   * Get client status
   */
  getStatus(): ClientStatus {
    return {
      connected: this.status === ConnectionStatus.CONNECTED,
      status: this.status,
      context: this.context,
      sessionId: this.sessionId,
      bufferedEvents: this.bufferedEvents.length,
      lastHeartbeat: this.lastHeartbeat,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen(): void {
    console.log('[BridgeClient] WebSocket connected, sending handshake');
    
    // Send handshake
    const handshake: HandshakeMessage = {
      type: 'HANDSHAKE',
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
   * Handle incoming messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as BridgeMessage;
      
      switch (message.type) {
        case 'HANDSHAKE_ACK':
          this.handleHandshakeAck(message);
          break;
        case 'HEARTBEAT':
          this.handleHeartbeat(message);
          break;
        case 'HEARTBEAT_ACK':
          this.lastHeartbeat = Date.now();
          break;
        case 'COMMAND':
          this.handleCommand(message as CommandMessage);
          break;
        case 'EVENT_ACK':
        case 'BATCH_ACK':
          // Acknowledgements are received but not acted upon
          break;
        case 'ERROR':
          console.error('[BridgeClient] Server error:', message.payload);
          break;
        case 'DISCONNECT':
          console.log('[BridgeClient] Server disconnect:', message.payload);
          this.handleClose();
          break;
      }
    } catch (error) {
      console.error('[BridgeClient] Failed to handle message:', error);
    }
  }

  /**
   * Handle handshake acknowledgement
   */
  private handleHandshakeAck(message: any): void {
    if (message.payload.accepted) {
      console.log('[BridgeClient] Handshake accepted');
      this.setStatus(ConnectionStatus.CONNECTED);
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      
      // Flush any buffered events
      this.flushBufferedEvents();
    } else {
      console.error('[BridgeClient] Handshake rejected:', message.payload.error);
      this.disconnect();
    }
  }

  /**
   * Handle heartbeat from server
   */
  private handleHeartbeat(message: HeartbeatMessage): void {
    // Send heartbeat acknowledgement
    const ack = {
      type: 'HEARTBEAT_ACK',
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload: {
        originalId: message.id,
      },
    };
    
    this.send(ack);
  }

  /**
   * Handle command from server
   */
  private handleCommand(message: CommandMessage): void {
    const { command, params } = message.payload;
    
    console.log('[BridgeClient] Received command:', command, params);
    
    switch (command) {
      case 'PAUSE':
        this.isPaused = true;
        this.setStatus(ConnectionStatus.PAUSED);
        break;
      case 'RESUME':
        this.isPaused = false;
        this.setStatus(ConnectionStatus.CONNECTED);
        this.flushBufferedEvents();
        break;
      case 'STOP':
        this.disconnect();
        break;
      case 'STATUS':
        // Send status as event
        this.sendEvent('LOG' as EventType, this.getStatus());
        break;
    }
    
    // Call command handler if provided
    if (this.onCommand) {
      this.onCommand(command, params);
    }
    
    // Send acknowledgement
    const ack = {
      type: 'COMMAND_ACK',
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload: {
        commandId: message.id,
        success: true,
      },
    };
    
    this.send(ack);
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(): void {
    console.log('[BridgeClient] WebSocket closed');
    this.stopHeartbeat();
    
    if (this.enabled) {
      this.setStatus(ConnectionStatus.DISCONNECTED);
      this.scheduleReconnect();
    }
  }

  /**
   * Handle WebSocket error event
   */
  private handleError(error: Event): void {
    console.error('[BridgeClient] WebSocket error:', error);
    this.setStatus(ConnectionStatus.ERROR);
  }

  /**
   * Send a message to the server
   */
  private send(message: Partial<BridgeMessage>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      const heartbeat: HeartbeatMessage = {
        type: 'HEARTBEAT',
        id: this.generateMessageId(),
        timestamp: Date.now(),
        payload: {
          clientId: this.context,
        },
      };
      
      this.send(heartbeat);
    }, this.heartbeatInterval) as unknown as number;
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (!this.enabled || this.reconnectTimer !== null) return;
    
    const delay = Math.min(
      1000 * Math.pow(this.reconnectBackoff, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    
    console.log(`[BridgeClient] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.connect();
    }, delay) as unknown as number;
  }

  /**
   * Stop reconnection timer
   */
  private stopReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Set client status
   */
  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      console.log(`[BridgeClient] Status changed to ${status}`);
      
      if (this.onStatusChange) {
        this.onStatusChange(status);
      }
    }
  }

  /**
   * Persist buffered events to IndexedDB (for content/sidepanel)
   */
  private async persistBufferedEvents(): Promise<void> {
    // This is a placeholder for IndexedDB persistence
    // Will be implemented based on context
    try {
      const key = `bridge_buffer_${this.context}_${this.sessionId}`;
      await chrome.storage.local.set({
        [key]: {
          events: this.bufferedEvents,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      console.error('[BridgeClient] Failed to persist buffered events:', error);
    }
  }

  /**
   * Load buffered events from storage
   */
  async loadPersistedEvents(): Promise<void> {
    try {
      const key = `bridge_buffer_${this.context}_${this.sessionId}`;
      const result = await chrome.storage.local.get(key);
      
      if (result[key]?.events) {
        this.bufferedEvents = result[key].events;
        console.log(`[BridgeClient] Loaded ${this.bufferedEvents.length} persisted events`);
      }
    } catch (error) {
      console.error('[BridgeClient] Failed to load persisted events:', error);
    }
  }

  /**
   * Clear persisted events
   */
  private async clearPersistedEvents(): Promise<void> {
    try {
      const key = `bridge_buffer_${this.context}_${this.sessionId}`;
      await chrome.storage.local.remove(key);
    } catch (error) {
      console.error('[BridgeClient] Failed to clear persisted events:', error);
    }
  }

  /**
   * Generate message ID
   */
  private generateMessageId(): string {
    return `${this.context}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

// Global instances for each context
const clientInstances: Map<ClientContext, BridgeClient> = new Map();

/**
 * Initialize bridge client for a context
 */
export async function initializeBridgeClient(config: BridgeClientConfig): Promise<BridgeClient> {
  let client = clientInstances.get(config.context);
  
  if (!client) {
    // Load session token and ID from storage if not provided
    if (!config.token || !config.sessionId) {
      const result = await chrome.storage.session.get(['debug_bridge_session_token', 'debug_bridge_session_id']);
      config.token = config.token || result.debug_bridge_session_token;
      config.sessionId = config.sessionId || result.debug_bridge_session_id;
    }
    
    if (!config.token || !config.sessionId) {
      console.warn('[BridgeClient] No session token or ID found, bridge client will not be initialized');
      // Return a dummy client that does nothing
      return new BridgeClient({ ...config, enabled: false });
    }
    
    client = new BridgeClient(config);
    clientInstances.set(config.context, client);
    
    // Load any persisted events
    await client.loadPersistedEvents();
    
    // Auto-connect if enabled
    if (config.enabled !== false) {
      await client.connect();
    }
  }
  
  return client;
}

/**
 * Get existing bridge client for a context
 */
export function getBridgeClient(context: ClientContext): BridgeClient | undefined {
  return clientInstances.get(context);
}
