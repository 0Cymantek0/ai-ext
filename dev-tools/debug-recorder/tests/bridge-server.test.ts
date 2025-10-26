/**
 * BridgeServer tests
 */

import { describe, it, afterEach, expect, vi } from 'vitest';
import { BridgeServer } from '../src/bridge-server.js';
import { WebSocket } from 'ws';
import type { CommandType } from '../src/protocol.js';

const sessionId = 'test-session';
let server: BridgeServer | null = null;
let lastPort = 9400;

function nextPort(): number {
  lastPort += 1;
  return lastPort;
}

async function startServer(config: Partial<ConstructorParameters<typeof BridgeServer>[0]> = {}): Promise<{ token: string; port: number; }> {
  if (server) {
    await server.stop();
    server = null;
  }

  const port = config.port ?? nextPort();
  server = new BridgeServer({ sessionId, port, ...(config ?? {}) });
  const token = await server.start();
  return { token, port };
}

async function connectClient({ token, port, context = 'background', session = sessionId }: { token: string; port: number; context?: 'background' | 'content-script' | 'side-panel' | 'offscreen'; session?: string; }): Promise<WebSocket> {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Handshake timeout'));
    }, 3000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'HANDSHAKE',
        id: 'handshake-1',
        timestamp: Date.now(),
        payload: {
          token,
          context,
          extensionId: 'test-extension',
          sessionId: session,
        },
      }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'HANDSHAKE_ACK') {
        clearTimeout(timeout);
        if (message.payload.accepted) {
          resolve(ws);
        } else {
          reject(new Error(message.payload.error ?? 'Handshake rejected'));
        }
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function closeClient(ws?: WebSocket | null): Promise<void> {
  if (!ws) return;
  if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) return;
  await new Promise<void>((resolve) => {
    ws.once('close', () => resolve());
    ws.close();
  });
}

afterEach(async () => {
  if (server) {
    await server.stop();
    server = null;
  }
});

describe('BridgeServer', () => {
  describe('Lifecycle', () => {
    it('starts and reports status', async () => {
      const { token, port } = await startServer();
      expect(token).toHaveLength(64);

      const status = server!.getStatus();
      expect(status.running).toBe(true);
      expect(status.port).toBe(port);
      expect(status.sessionId).toBe(sessionId);
      expect(status.connectedClients).toBe(0);
    });

    it('stops gracefully', async () => {
      await startServer();
      await server!.stop();
      const status = server!.getStatus();
      expect(status.running).toBe(false);
    });

    it('fails when port is already in use', async () => {
      const port = nextPort();
      server = new BridgeServer({ sessionId, port });
      await server.start();

      const server2 = new BridgeServer({ sessionId, port });
      await expect(server2.start()).rejects.toThrow();
      await server.stop();
      server = null;
    });
  });

  describe('Handshake', () => {
    it('accepts valid handshake', async () => {
      const onClientConnected = vi.fn();
      const { token, port } = await startServer({ onClientConnected });

      const client = await connectClient({ token, port });
      await closeClient(client);

      expect(onClientConnected).toHaveBeenCalledTimes(1);
      const status = server!.getStatus();
      expect(status.connectedClients).toBe(0);
    });

    it('rejects invalid token', async () => {
      const { token, port } = await startServer();

      await expect(connectClient({ token: `${token}-invalid`, port })).rejects.toThrow('Invalid token');
    });

    it('rejects invalid session', async () => {
      const { token, port } = await startServer();

      await expect(connectClient({ token, port, session: 'wrong-session' })).rejects.toThrow();
    });

    it('disconnects duplicate context connections', async () => {
      const { token, port } = await startServer();

      const first = await connectClient({ token, port, context: 'background' });
      const firstClosed = new Promise<void>((resolve) => first.once('close', () => resolve()));
      const second = await connectClient({ token, port, context: 'background' });

      await firstClosed;

      expect(first.readyState).not.toBe(WebSocket.OPEN);
      expect(second.readyState).toBe(WebSocket.OPEN);

      await closeClient(first);
      await closeClient(second);
    });
  });

  describe('Events', () => {
    it('receives single events and acknowledges', async () => {
      const onEvent = vi.fn();
      const { token, port } = await startServer({ onEvent });
      const client = await connectClient({ token, port, context: 'background' });

      const ack = new Promise<void>((resolve) => {
        client.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'EVENT_ACK') {
            expect(message.payload.eventId).toBe('event-1');
            resolve();
          }
        });
      });

      client.send(JSON.stringify({
        type: 'EVENT',
        id: 'event-1',
        timestamp: Date.now(),
        payload: {
          eventType: 'LOG',
          data: { msg: 'hello' },
          context: 'background',
        },
      }));

      await ack;
      expect(onEvent).toHaveBeenCalledTimes(1);
      await closeClient(client);
    });

    it('receives batches and acknowledges', async () => {
      const onBatch = vi.fn();
      const { token, port } = await startServer({ onBatch });
      const client = await connectClient({ token, port, context: 'background' });

      const ack = new Promise<void>((resolve) => {
        client.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'BATCH_ACK') {
            expect(message.payload.batchId).toBe('batch-1');
            expect(message.payload.received).toBe(2);
            resolve();
          }
        });
      });

      client.send(JSON.stringify({
        type: 'BATCH',
        id: 'batch-1',
        timestamp: Date.now(),
        payload: {
          events: [
            { eventType: 'LOG', data: { id: 1 }, timestamp: Date.now() },
            { eventType: 'LOG', data: { id: 2 }, timestamp: Date.now() },
          ],
          context: 'background',
        },
      }));

      await ack;
      expect(onBatch).toHaveBeenCalledTimes(1);
      await closeClient(client);
    });
  });

  describe('Commands', () => {
    it('broadcasts commands to every client', async () => {
      const { token, port } = await startServer();
      const first = await connectClient({ token, port, context: 'background' });
      const second = await connectClient({ token, port, context: 'content-script' });

      const received: CommandType[] = [];
      const wait = new Promise<void>((resolve) => {
        let count = 0;
        const handler = (data: WebSocket.RawData) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'COMMAND') {
            received.push(message.payload.command);
            count += 1;
            if (count === 2) resolve();
          }
        };
        first.on('message', handler);
        second.on('message', handler);
      });

      server!.broadcastCommand('PAUSE');
      await wait;

      expect(received).toEqual(['PAUSE', 'PAUSE']);
      await closeClient(first);
      await closeClient(second);
    });

    it('targets commands by context', async () => {
      const { token, port } = await startServer();
      const background = await connectClient({ token, port, context: 'background' });
      const content = await connectClient({ token, port, context: 'content-script' });

      let backgroundReceived = false;
      let contentReceived = false;

      const wait = new Promise<void>((resolve) => {
        background.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'COMMAND') {
            backgroundReceived = true;
            resolve();
          }
        });
        content.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'COMMAND') {
            contentReceived = true;
          }
        });
        setTimeout(resolve, 300);
      });

      server!.sendCommandToContext('background', 'PAUSE');
      await wait;

      expect(backgroundReceived).toBe(true);
      expect(contentReceived).toBe(false);
      await closeClient(background);
      await closeClient(content);
    });
  });

  describe('Heartbeat & errors', () => {
    it('responds to heartbeat', async () => {
      const { token, port } = await startServer();
      const client = await connectClient({ token, port });

      const ack = new Promise<void>((resolve) => {
        client.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'HEARTBEAT_ACK') {
            expect(message.payload.originalId).toBe('ping-1');
            resolve();
          }
        });
      });

      client.send(JSON.stringify({
        type: 'HEARTBEAT',
        id: 'ping-1',
        timestamp: Date.now(),
        payload: { clientId: 'background' },
      }));

      await ack;
      await closeClient(client);
    });

    it('returns parse error for invalid JSON', async () => {
      const { token, port } = await startServer();
      const client = await connectClient({ token, port });

      const errorPromise = new Promise<void>((resolve) => {
        client.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'ERROR') {
            expect(message.payload.code).toBe('PARSE_ERROR');
            resolve();
          }
        });
      });

      client.send('not-valid-json');
      await errorPromise;
      await closeClient(client);
    });
  });
});
