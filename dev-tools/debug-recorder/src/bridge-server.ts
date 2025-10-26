/**
 * Bridge Server
 * WebSocket server for debug-recorder CLI to receive events from extension
 */

import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import type {
  BridgeMessage,
  HandshakeMessage,
  HeartbeatMessage,
  EventMessage,
  BatchMessage,
  CommandMessage,
  CommandType,
  ClientContext,
  ServerStatus,
  BridgeConfig,
} from './protocol.js';

const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  host: '127.0.0.1',
  port: 9229,
  heartbeatIntervalMs: 30000,
  heartbeatTimeoutMs: 10000,
  reconnectDelayMs: 1000,
  maxReconnectDelayMs: 30000,
  reconnectBackoffMultiplier: 2,
  maxBufferSize: 10000,
  bufferFlushIntervalMs: 5000,
  sessionTokenKey: 'debug_bridge_session_token',
};

interface ConnectedClient {
  ws: WebSocket;
  id: string;
  context: ClientContext;
  sessionId: string;
  lastHeartbeat: number;
  authenticated: boolean;
}

export interface BridgeServerConfig {
  port?: number;
  sessionId: string;
  onEvent?: (event: EventMessage) => void;
  onBatch?: (batch: BatchMessage) => void;
  onClientConnected?: (clientId: string, context: ClientContext) => void;
  onClientDisconnected?: (clientId: string) => void;
}

/**
 * Bridge WebSocket Server
 */
export class BridgeServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ConnectedClient> = new Map();
  private sessionToken: string;
  private sessionId: string;
  private port: number;
  private config: BridgeConfig;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private totalEventsReceived: number = 0;
  
  private onEvent?: (event: EventMessage) => void;
  private onBatch?: (batch: BatchMessage) => void;
  private onClientConnected?: (clientId: string, context: ClientContext) => void;
  private onClientDisconnected?: (clientId: string) => void;

  constructor(config: BridgeServerConfig) {
    this.port = config.port || DEFAULT_BRIDGE_CONFIG.port;
    this.sessionId = config.sessionId;
    this.sessionToken = this.generateToken();
    this.config = { ...DEFAULT_BRIDGE_CONFIG, port: this.port };
    this.onEvent = config.onEvent;
    this.onBatch = config.onBatch;
    this.onClientConnected = config.onClientConnected;
    this.onClientDisconnected = config.onClientDisconnected;
  }

  /**
   * Start the WebSocket server
   */
  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ 
          host: this.config.host,
          port: this.port 
        });

        this.wss.on('listening', () => {
          this.startTime = Date.now();
          this.startHeartbeat();
          resolve(this.sessionToken);
        });

        this.wss.on('error', (error) => {
          reject(error);
        });

        this.wss.on('connection', (ws, req) => {
          this.handleConnection(ws, req);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      // Notify all clients about disconnection
      for (const [clientId, client] of this.clients.entries()) {
        if (client.ws.readyState === WebSocket.OPEN) {
          this.sendMessage(client.ws, {
            type: 'DISCONNECT',
            id: this.generateMessageId(),
            timestamp: Date.now(),
            payload: {
              reason: 'Server shutdown',
              reconnect: false,
            },
          });
        }
        client.ws.close();
      }

      this.clients.clear();

      if (this.wss) {
        this.wss.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Broadcast a command to all connected clients
   */
  broadcastCommand(command: CommandType, params?: Record<string, unknown>): void {
    const message: CommandMessage = {
      type: 'COMMAND',
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload: { command, params },
    };

    for (const client of this.clients.values()) {
      if (client.authenticated && client.ws.readyState === WebSocket.OPEN) {
        this.sendMessage(client.ws, message);
      }
    }
  }

  /**
   * Send command to specific client context
   */
  sendCommandToContext(context: ClientContext, command: CommandType, params?: Record<string, unknown>): void {
    const message: CommandMessage = {
      type: 'COMMAND',
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload: { command, params },
    };

    for (const client of this.clients.values()) {
      if (client.authenticated && client.context === context && client.ws.readyState === WebSocket.OPEN) {
        this.sendMessage(client.ws, message);
      }
    }
  }

  /**
   * Get server status
   */
  getStatus(): ServerStatus {
    return {
      running: this.wss !== null && this.wss.address() !== null,
      port: this.port,
      sessionId: this.sessionId,
      connectedClients: this.clients.size,
      totalEventsReceived: this.totalEventsReceived,
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Get session token for clients to connect
   */
  getSessionToken(): string {
    return this.sessionToken;
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: any): void {
    const clientId = this.generateClientId();
    
    const client: ConnectedClient = {
      ws,
      id: clientId,
      context: 'background',
      sessionId: '',
      lastHeartbeat: Date.now(),
      authenticated: false,
    };

    // Set up message handler
    ws.on('message', (data) => {
      this.handleMessage(client, data.toString());
    });

    // Handle disconnection
    ws.on('close', () => {
      this.handleDisconnection(clientId);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[BridgeServer] Client ${clientId} error:`, error);
    });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(client: ConnectedClient, data: string): void {
    try {
      const message = JSON.parse(data) as BridgeMessage;

      switch (message.type) {
        case 'HANDSHAKE':
          this.handleHandshake(client, message as HandshakeMessage);
          break;

        case 'HEARTBEAT':
          this.handleHeartbeat(client, message as HeartbeatMessage);
          break;

        case 'EVENT':
          if (client.authenticated) {
            this.handleEvent(client, message as EventMessage);
          }
          break;

        case 'BATCH':
          if (client.authenticated) {
            this.handleBatch(client, message as BatchMessage);
          }
          break;

        case 'COMMAND_ACK':
          // Command acknowledgements are logged but not acted upon
          break;

        default:
          console.warn(`[BridgeServer] Unknown message type:`, message.type);
      }
    } catch (error) {
      console.error('[BridgeServer] Failed to parse message:', error);
      this.sendError(client.ws, 'PARSE_ERROR', 'Failed to parse message', false);
    }
  }

  /**
   * Handle handshake from client
   */
  private handleHandshake(client: ConnectedClient, message: HandshakeMessage): void {
    const { token, context, extensionId, sessionId } = message.payload;

    // Verify token and session
    if (token !== this.sessionToken || sessionId !== this.sessionId) {
      this.sendMessage(client.ws, {
        type: 'HANDSHAKE_ACK',
        id: this.generateMessageId(),
        timestamp: Date.now(),
        payload: {
          accepted: false,
          sessionId: this.sessionId,
          serverId: 'bridge-server',
          error: 'Invalid token or session ID',
        },
      });
      client.ws.close();
      return;
    }

    // Check for duplicate sessions from same context
    for (const existingClient of this.clients.values()) {
      if (existingClient.authenticated && 
          existingClient.context === context && 
          existingClient.sessionId === sessionId) {
        console.warn(`[BridgeServer] Duplicate connection from ${context}, closing old connection`);
        existingClient.ws.close();
      }
    }

    // Update client info
    client.authenticated = true;
    client.context = context;
    client.sessionId = sessionId;
    this.clients.set(client.id, client);

    // Send acknowledgement
    this.sendMessage(client.ws, {
      type: 'HANDSHAKE_ACK',
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload: {
        accepted: true,
        sessionId: this.sessionId,
        serverId: 'bridge-server',
      },
    });

    console.log(`[BridgeServer] Client connected: ${client.id} (${context})`);
    
    if (this.onClientConnected) {
      this.onClientConnected(client.id, context);
    }
  }

  /**
   * Handle heartbeat from client
   */
  private handleHeartbeat(client: ConnectedClient, message: HeartbeatMessage): void {
    client.lastHeartbeat = Date.now();

    // Send heartbeat acknowledgement
    this.sendMessage(client.ws, {
      type: 'HEARTBEAT_ACK',
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload: {
        originalId: message.id,
      },
    });
  }

  /**
   * Handle event from client
   */
  private handleEvent(client: ConnectedClient, message: EventMessage): void {
    this.totalEventsReceived++;

    // Send acknowledgement
    this.sendMessage(client.ws, {
      type: 'EVENT_ACK',
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload: {
        eventId: message.id,
        received: true,
      },
    });

    // Call event handler
    if (this.onEvent) {
      this.onEvent(message);
    }
  }

  /**
   * Handle batch from client
   */
  private handleBatch(client: ConnectedClient, message: BatchMessage): void {
    const received = message.payload.events.length;
    this.totalEventsReceived += received;

    // Send acknowledgement
    this.sendMessage(client.ws, {
      type: 'BATCH_ACK',
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload: {
        batchId: message.id,
        received,
        failed: 0,
      },
    });

    // Call batch handler
    if (this.onBatch) {
      this.onBatch(message);
    }
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      console.log(`[BridgeServer] Client disconnected: ${clientId} (${client.context})`);
      this.clients.delete(clientId);
      
      if (this.onClientDisconnected) {
        this.onClientDisconnected(clientId);
      }
    }
  }

  /**
   * Send message to client
   */
  private sendMessage(ws: WebSocket, message: Partial<BridgeMessage>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error to client
   */
  private sendError(ws: WebSocket, code: string, message: string, recoverable: boolean): void {
    this.sendMessage(ws, {
      type: 'ERROR',
      id: this.generateMessageId(),
      timestamp: Date.now(),
      payload: {
        code,
        message,
        recoverable,
      },
    });
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = this.config.heartbeatTimeoutMs;

      for (const [clientId, client] of this.clients.entries()) {
        if (client.authenticated && now - client.lastHeartbeat > timeout) {
          console.warn(`[BridgeServer] Client ${clientId} heartbeat timeout, closing connection`);
          client.ws.close();
          this.clients.delete(clientId);
        }
      }
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * Generate authentication token
   */
  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Generate client ID
   */
  private generateClientId(): string {
    return `client-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  /**
   * Generate message ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }
}
