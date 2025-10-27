/**
 * Bridge Protocol Definition
 * Typed protocol for WebSocket communication between debug-recorder CLI and extension
 */

/**
 * Message types for the bridge protocol
 */
export const BridgeMessageTypes = {
  HANDSHAKE: "HANDSHAKE",
  HANDSHAKE_ACK: "HANDSHAKE_ACK",
  HEARTBEAT: "HEARTBEAT",
  HEARTBEAT_ACK: "HEARTBEAT_ACK",
  DISCONNECT: "DISCONNECT",
  COMMAND: "COMMAND",
  COMMAND_ACK: "COMMAND_ACK",
  EVENT: "EVENT",
  EVENT_ACK: "EVENT_ACK",
  BATCH: "BATCH",
  BATCH_ACK: "BATCH_ACK",
  ERROR: "ERROR",
} as const;

export type MessageType =
  (typeof BridgeMessageTypes)[keyof typeof BridgeMessageTypes];

/**
 * Command types that CLI can send to extension
 */
export const BridgeCommandTypes = {
  PAUSE: "PAUSE",
  RESUME: "RESUME",
  STOP: "STOP",
  STATUS: "STATUS",
} as const;

export type CommandType =
  (typeof BridgeCommandTypes)[keyof typeof BridgeCommandTypes];

/**
 * Event types from extension to CLI
 */
export const BridgeEventTypes = {
  LOG: "LOG",
  INTERACTION: "INTERACTION",
  ERROR_ENTRY: "ERROR_ENTRY",
  STATE_SNAPSHOT: "STATE_SNAPSHOT",
  NETWORK_REQUEST: "NETWORK_REQUEST",
} as const;

export type EventType =
  (typeof BridgeEventTypes)[keyof typeof BridgeEventTypes];

/**
 * Connection status
 */
export enum ConnectionStatus {
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  PAUSED = "PAUSED",
  DISCONNECTED = "DISCONNECTED",
  ERROR = "ERROR",
}

/**
 * Context type for the client
 */
export type ClientContext =
  | "background"
  | "content-script"
  | "side-panel"
  | "offscreen";

/**
 * Base message structure
 */
export interface BaseMessage {
  type: MessageType;
  id: string;
  timestamp: number;
}

/**
 * Handshake message from client to server
 */
export interface HandshakeMessage extends BaseMessage {
  type: "HANDSHAKE";
  payload: {
    token: string;
    context: ClientContext;
    extensionId: string;
    sessionId: string;
  };
}

/**
 * Handshake acknowledgement from server to client
 */
export interface HandshakeAckMessage extends BaseMessage {
  type: "HANDSHAKE_ACK";
  payload: {
    accepted: boolean;
    sessionId: string;
    serverId: string;
    error?: string;
  };
}

/**
 * Heartbeat message (bidirectional)
 */
export interface HeartbeatMessage extends BaseMessage {
  type: "HEARTBEAT";
  payload: {
    clientId?: string;
    serverId?: string;
  };
}

/**
 * Heartbeat acknowledgement (bidirectional)
 */
export interface HeartbeatAckMessage extends BaseMessage {
  type: "HEARTBEAT_ACK";
  payload: {
    originalId: string;
  };
}

/**
 * Command message from server to client
 */
export interface CommandMessage extends BaseMessage {
  type: "COMMAND";
  payload: {
    command: CommandType;
    params?: Record<string, unknown>;
  };
}

/**
 * Command acknowledgement from client to server
 */
export interface CommandAckMessage extends BaseMessage {
  type: "COMMAND_ACK";
  payload: {
    commandId: string;
    success: boolean;
    result?: unknown;
    error?: string;
  };
}

/**
 * Event message from client to server
 */
export interface EventMessage extends BaseMessage {
  type: "EVENT";
  payload: {
    eventType: EventType;
    data: unknown;
    context: ClientContext;
  };
}

/**
 * Event acknowledgement from server to client
 */
export interface EventAckMessage extends BaseMessage {
  type: "EVENT_ACK";
  payload: {
    eventId: string;
    received: boolean;
  };
}

/**
 * Batch message for buffered events
 */
export interface BatchMessage extends BaseMessage {
  type: "BATCH";
  payload: {
    events: Array<{
      eventType: EventType;
      data: unknown;
      timestamp: number;
    }>;
    context: ClientContext;
    bufferedSince?: number;
  };
}

/**
 * Batch acknowledgement
 */
export interface BatchAckMessage extends BaseMessage {
  type: "BATCH_ACK";
  payload: {
    batchId: string;
    received: number;
    failed: number;
  };
}

/**
 * Error message
 */
export interface ErrorMessage extends BaseMessage {
  type: "ERROR";
  payload: {
    code: string;
    message: string;
    details?: unknown;
    recoverable: boolean;
  };
}

/**
 * Disconnect message
 */
export interface DisconnectMessage extends BaseMessage {
  type: "DISCONNECT";
  payload: {
    reason: string;
    reconnect: boolean;
  };
}

/**
 * Union type of all message types
 */
export type BridgeMessage =
  | HandshakeMessage
  | HandshakeAckMessage
  | HeartbeatMessage
  | HeartbeatAckMessage
  | CommandMessage
  | CommandAckMessage
  | EventMessage
  | EventAckMessage
  | BatchMessage
  | BatchAckMessage
  | ErrorMessage
  | DisconnectMessage;

/**
 * Configuration for the bridge
 */
export interface BridgeConfig {
  // WebSocket configuration
  host: string;
  port: number;

  // Timing configuration
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  reconnectDelayMs: number;
  maxReconnectDelayMs: number;
  reconnectBackoffMultiplier: number;

  // Buffering configuration
  maxBufferSize: number;
  bufferFlushIntervalMs: number;

  // Session configuration
  sessionTokenKey: string;
}

/**
 * Default bridge configuration
 */
export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  host: "127.0.0.1",
  port: 9229,
  heartbeatIntervalMs: 30000,
  heartbeatTimeoutMs: 10000,
  reconnectDelayMs: 1000,
  maxReconnectDelayMs: 30000,
  reconnectBackoffMultiplier: 2,
  maxBufferSize: 10000,
  bufferFlushIntervalMs: 5000,
  sessionTokenKey: "debug_bridge_session_token",
};

/**
 * Client status information
 */
export interface ClientStatus {
  connected: boolean;
  status: ConnectionStatus;
  context: ClientContext;
  sessionId: string | null;
  bufferedEvents: number;
  lastHeartbeat: number | null;
  reconnectAttempts: number;
}

/**
 * Server status information
 */
export interface ServerStatus {
  running: boolean;
  port: number;
  sessionId: string;
  connectedClients: number;
  totalEventsReceived: number;
  uptime: number;
}
