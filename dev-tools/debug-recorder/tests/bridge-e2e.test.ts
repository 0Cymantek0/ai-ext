/**
 * End-to-end bridge tests simulating real-world scenarios
 */

import { describe, it, afterEach, expect, vi } from 'vitest';
import { BridgeServer, type BridgeServerConfig } from '../src/bridge-server.js';
import { WebSocket } from 'ws';

let server: BridgeServer | null = null;
let portCounter = 9700;

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
  server = new BridgeServer({ sessionId: 'test-e2e', port, ...config });
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
          payload: { token, context, extensionId: 'test-extension', sessionId: 'test-e2e' },
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

describe('Bridge E2E Scenarios', () => {
  it('full lifecycle: connect, send events, pause, buffer, resume, flush, disconnect', async () => {
    const events: any[] = [];
    const batches: any[] = [];

    const { token, port } = await createServer({
      onEvent: (event) => events.push(event),
      onBatch: (batch) => batches.push(batch),
    });

    // Connect client
    const client = await connect({ token, port, context: 'background' });

    // Send normal events
    for (let i = 0; i < 3; i++) {
      client.send(
        JSON.stringify({
          type: 'EVENT',
          id: `event-${i}`,
          timestamp: Date.now(),
          payload: { eventType: 'LOG', data: { index: i }, context: 'background' },
        })
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events).toHaveLength(3);

    // Pause
    const pauseReceived = new Promise<void>((resolve) => {
      client.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'COMMAND' && message.payload.command === 'PAUSE') {
          resolve();
        }
      });
    });
    server!.broadcastCommand('PAUSE');
    await pauseReceived;

    // Simulate buffered batch
    client.send(
      JSON.stringify({
        type: 'BATCH',
        id: 'buffered-batch',
        timestamp: Date.now(),
        payload: {
          events: [
            { eventType: 'LOG', data: { index: 3 }, timestamp: Date.now() },
            { eventType: 'LOG', data: { index: 4 }, timestamp: Date.now() },
          ],
          context: 'background',
          bufferedSince: Date.now() - 1000,
        },
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(batches).toHaveLength(1);
    expect(batches[0].payload.events).toHaveLength(2);

    // Disconnect
    await close(client);
    const status = server!.getStatus();
    expect(status.connectedClients).toBe(0);
    expect(status.totalEventsReceived).toBe(5); // 3 events + 2 in batch
  });

  it('multi-context scenario: background + content working simultaneously', async () => {
    const receivedEvents: Array<{ context: string; data: any }> = [];

    const { token, port } = await createServer({
      onEvent: (event) => {
        receivedEvents.push({
          context: event.payload.context,
          data: event.payload.data,
        });
      },
    });

    // Connect multiple contexts
    const background = await connect({ token, port, context: 'background' });
    const content = await connect({ token, port, context: 'content-script' });

    // Send events from both
    background.send(
      JSON.stringify({
        type: 'EVENT',
        id: 'bg-event-1',
        timestamp: Date.now(),
        payload: { eventType: 'LOG', data: { source: 'background' }, context: 'background' },
      })
    );

    content.send(
      JSON.stringify({
        type: 'EVENT',
        id: 'cs-event-1',
        timestamp: Date.now(),
        payload: {
          eventType: 'INTERACTION',
          data: { source: 'content' },
          context: 'content-script',
        },
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents.find((e) => e.context === 'background')).toBeDefined();
    expect(receivedEvents.find((e) => e.context === 'content-script')).toBeDefined();

    await close(background);
    await close(content);
  });

  it('stress test: 100 rapid events', async () => {
    let received = 0;

    const { token, port } = await createServer({
      onEvent: () => {
        received++;
      },
    });

    const client = await connect({ token, port });

    // Send 100 events rapidly
    for (let i = 0; i < 100; i++) {
      client.send(
        JSON.stringify({
          type: 'EVENT',
          id: `event-${i}`,
          timestamp: Date.now(),
          payload: { eventType: 'LOG', data: { index: i }, context: 'background' },
        })
      );
    }

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(received).toBe(100);
    await close(client);
  });

  it('context-targeted commands work correctly', async () => {
    const bgCommands: string[] = [];
    const csCommands: string[] = [];

    const { token, port } = await createServer();

    const background = await connect({ token, port, context: 'background' });
    const content = await connect({ token, port, context: 'content-script' });

    const bgPromise = new Promise<void>((resolve) => {
      background.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'COMMAND') {
          bgCommands.push(message.payload.command);
          if (bgCommands.length === 1) resolve();
        }
      });
    });

    const csTimeout = new Promise<void>((resolve) => {
      content.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'COMMAND') {
          csCommands.push(message.payload.command);
        }
      });
      setTimeout(resolve, 200);
    });

    // Send command only to background
    server!.sendCommandToContext('background', 'PAUSE');

    await Promise.all([bgPromise, csTimeout]);

    expect(bgCommands).toEqual(['PAUSE']);
    expect(csCommands).toEqual([]);

    await close(background);
    await close(content);
  });

  it('server shutdown notifies clients gracefully', async () => {
    const { token, port } = await createServer();
    const client = await connect({ token, port });

    const disconnectReceived = new Promise<void>((resolve) => {
      client.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'DISCONNECT') {
          expect(message.payload.reason).toContain('shutdown');
          resolve();
        }
      });
    });

    await server!.stop();
    await disconnectReceived;
  });

  it('heartbeat keeps connection alive', async () => {
    const { token, port } = await createServer();
    const client = await connect({ token, port });

    // Send heartbeat
    const ackReceived = new Promise<void>((resolve) => {
      client.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'HEARTBEAT_ACK') {
          expect(message.payload.originalId).toBe('test-heartbeat');
          resolve();
        }
      });
    });

    client.send(
      JSON.stringify({
        type: 'HEARTBEAT',
        id: 'test-heartbeat',
        timestamp: Date.now(),
        payload: { clientId: 'background' },
      })
    );

    await ackReceived;
    await close(client);
  });

  it('mixed event and batch transmission', async () => {
    let eventCount = 0;
    let batchCount = 0;

    const { token, port } = await createServer({
      onEvent: () => {
        eventCount++;
      },
      onBatch: (batch) => {
        batchCount += batch.payload.events.length;
      },
    });

    const client = await connect({ token, port });

    // Send individual events
    for (let i = 0; i < 5; i++) {
      client.send(
        JSON.stringify({
          type: 'EVENT',
          id: `event-${i}`,
          timestamp: Date.now(),
          payload: { eventType: 'LOG', data: { i }, context: 'background' },
        })
      );
    }

    // Send batch
    client.send(
      JSON.stringify({
        type: 'BATCH',
        id: 'batch-1',
        timestamp: Date.now(),
        payload: {
          events: [
            { eventType: 'LOG', data: { i: 5 }, timestamp: Date.now() },
            { eventType: 'LOG', data: { i: 6 }, timestamp: Date.now() },
            { eventType: 'LOG', data: { i: 7 }, timestamp: Date.now() },
          ],
          context: 'background',
        },
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(eventCount).toBe(5);
    expect(batchCount).toBe(3);

    await close(client);
  });
});
