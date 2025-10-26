/**
 * Reconnection and buffering scenarios for BridgeServer
 */

import { describe, it, afterEach, expect } from 'vitest';
import { BridgeServer, type BridgeServerConfig } from '../src/bridge-server.js';
import { WebSocket } from 'ws';

const sessionId = 'test-session';
let server: BridgeServer | null = null;
let portCounter = 9600;

function nextPort(): number {
  portCounter += 1;
  return portCounter;
}

async function createServer(
  config: Partial<BridgeServerConfig> = {}
): Promise<{ token: string; port: number }> {
  if (server) {
    await server.stop();
    server = null;
  }

  const port = config.port ?? nextPort();
  server = new BridgeServer({ sessionId, port, ...config });
  const token = await server.start();
  return { token, port };
}

async function connect({
  token,
  port,
  context = 'background',
}: {
  token: string;
  port: number;
  context?: 'background' | 'content-script' | 'side-panel' | 'offscreen';
}): Promise<WebSocket> {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timeout = setTimeout(() => reject(new Error('Handshake timeout')), 3000);

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'HANDSHAKE',
          id: 'handshake-1',
          timestamp: Date.now(),
          payload: { token, context, extensionId: 'test-extension', sessionId },
        })
      );
    });

    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'HANDSHAKE_ACK' && message.payload.accepted) {
        clearTimeout(timeout);
        resolve(ws);
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function close(ws?: WebSocket | null): Promise<void> {
  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) return;
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

describe('BridgeServer reconnection scenarios', () => {
  describe('Pause flow', () => {
    it('buffers events during pause and flushes on resume', async () => {
      const events: any[] = [];
      const batches: any[] = [];

      const { port, token } = await createServer({
        onEvent: (event) => events.push(event),
        onBatch: (batch) => batches.push(batch),
      });

      const socket = await connect({ token, port });

      socket.send(
        JSON.stringify({
          type: 'EVENT',
          id: 'event-1',
          timestamp: Date.now(),
          payload: { eventType: 'LOG', data: { msg: 'before pause' }, context: 'background' },
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(events).toHaveLength(1);

      const pauseReceived = new Promise<void>((resolve) => {
        socket.on('message', (raw) => {
          const message = JSON.parse(raw.toString());
          if (message.type === 'COMMAND' && message.payload.command === 'PAUSE') {
            resolve();
          }
        });
      });

      server!.broadcastCommand('PAUSE');
      await pauseReceived;

      socket.send(
        JSON.stringify({
          type: 'BATCH',
          id: 'buffered-batch',
          timestamp: Date.now(),
          payload: {
            events: [
              { eventType: 'LOG', data: { msg: 'buffered-1' }, timestamp: Date.now() },
              { eventType: 'LOG', data: { msg: 'buffered-2' }, timestamp: Date.now() },
            ],
            context: 'background',
            bufferedSince: Date.now() - 2000,
          },
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(batches).toHaveLength(1);
      expect(batches[0].payload.events).toHaveLength(2);

      await close(socket);
    });
  });

  describe('Reconnect behaviour', () => {
    it('allows reconnect after disconnect', async () => {
      const { token, port } = await createServer();

      const first = await connect({ token, port });
      first.send(
        JSON.stringify({
          type: 'EVENT',
          id: 'event-1',
          timestamp: Date.now(),
          payload: { eventType: 'LOG', data: { msg: 'first' }, context: 'background' },
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 30));
      await close(first);
      await new Promise((resolve) => setTimeout(resolve, 30));

      const second = await connect({ token, port });
      const batchAck = new Promise<void>((resolve) => {
        second.on('message', (raw) => {
          const message = JSON.parse(raw.toString());
          if (message.type === 'BATCH_ACK') resolve();
        });
      });

      second.send(
        JSON.stringify({
          type: 'BATCH',
          id: 'reconnect-batch',
          timestamp: Date.now(),
          payload: {
            events: [{ eventType: 'LOG', data: { msg: 'buffered' }, timestamp: Date.now() }],
            context: 'background',
            bufferedSince: Date.now() - 1000,
          },
        })
      );

      await batchAck;
      await close(second);
    });

    it('survives multiple rapid reconnects', async () => {
      const { token, port } = await createServer();

      for (let i = 0; i < 5; i++) {
        const client = await connect({ token, port });
        client.send(
          JSON.stringify({
            type: 'EVENT',
            id: `event-${i}`,
            timestamp: Date.now(),
            payload: { eventType: 'LOG', data: { iteration: i }, context: 'background' },
          })
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
        await close(client);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const finalClient = await connect({ token, port });
      expect(finalClient.readyState).toBe(WebSocket.OPEN);
      await close(finalClient);
    });
  });

  describe('Message ordering', () => {
    it('preserves order across batches', async () => {
      const received: Array<{ order: number }> = [];

      const { token, port } = await createServer({
        onEvent: (event) => received.push(event.payload.data),
        onBatch: (batch) => {
          batch.payload.events.forEach((evt) => received.push(evt.data as { order: number }));
        },
      });

      const primary = await connect({ token, port });
      for (let i = 0; i < 3; i++) {
        primary.send(
          JSON.stringify({
            type: 'EVENT',
            id: `event-${i}`,
            timestamp: Date.now() + i,
            payload: { eventType: 'LOG', data: { order: i }, context: 'background' },
          })
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
      await close(primary);

      const secondary = await connect({ token, port });
      secondary.send(
        JSON.stringify({
          type: 'BATCH',
          id: 'batch-1',
          timestamp: Date.now(),
          payload: {
            events: [
              { eventType: 'LOG', data: { order: 3 }, timestamp: Date.now() + 3 },
              { eventType: 'LOG', data: { order: 4 }, timestamp: Date.now() + 4 },
            ],
            context: 'background',
          },
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(received).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        expect(received[i].order).toBe(i);
      }

      await close(secondary);
    });
  });
});
