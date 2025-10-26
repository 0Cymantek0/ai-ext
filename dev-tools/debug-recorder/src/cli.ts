import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { render } from 'ink';
import { SessionStore } from './session-store.js';
import { SessionController } from './session-controller.js';
import { ReportGenerator } from './report-generator.js';
import { normalizeSession } from './normalizer.js';
import type { Session } from './types.js';
import { CaptureReadError, readCaptureFile } from './utils/capture.js';
import { BridgeServer } from './bridge-server.js';
import { RecorderUI } from './ui/RecorderUI.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPORTS_DIR = join(__dirname, '..', 'reports');

const program = new Command();
const sessionStore = new SessionStore();

program
  .name('ai-pocket-recorder')
  .description('CLI tool for capturing runtime state and generating diagnostic reports')
  .version('0.1.0');

program
  .command('start')
  .description('Start a new recording session with interactive UI')
  .option('--extension-id <id>', 'Chrome extension ID to monitor')
  .option('--extension-version <version>', 'Extension version')
  .option('--chrome-version <version>', 'Chrome version')
  .option('--chrome-profile <profile>', 'Chrome profile name')
  .option('--screenshots', 'Enable screenshot capture', false)
  .option('--storage', 'Include storage data', false)
  .option('--metrics', 'Include performance metrics', false)
  .option('--bridge', 'Enable WebSocket bridge for real-time event streaming', false)
  .option('--port <port>', 'Port for WebSocket bridge server', '9229')
  .action(async (options) => {
    const controller = new SessionController(sessionStore);
    let bridgeServer: BridgeServer | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let uiInstance: any = null;

    const cleanup = async () => {
      if (uiInstance) {
        uiInstance.unmount();
      }
      if (bridgeServer) {
        await bridgeServer.stop();
      }
      await controller.shutdown();
    };

    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down gracefully...');
      await cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Received SIGTERM, shutting down...');
      await cleanup();
      process.exit(0);
    });

    try {
      const sessionId = await controller.start({
        extensionId: options.extensionId,
        extensionVersion: options.extensionVersion,
        chromeVersion: options.chromeVersion,
        chromeProfile: options.chromeProfile,
        includeScreenshots: options.screenshots,
        includeStorage: options.storage,
        includeMetrics: options.metrics,
        flags: {
          bridge: options.bridge,
          port: options.port,
        },
      });

      if (options.bridge) {
        bridgeServer = new BridgeServer({
          port: parseInt(options.port, 10),
          sessionId,
          onEvent: (_event) => {
            // Events are processed in background
          },
          onBatch: (_batch) => {
            // Batches are processed in background
          },
          onClientConnected: (_clientId, _context) => {
            // Connection events handled by UI
          },
          onClientDisconnected: (_clientId) => {
            // Disconnection events handled by UI
          },
        });

        const token = await bridgeServer.start();

        console.log(`\n🌐 WebSocket bridge started`);
        console.log(`   Port: ${options.port}`);
        console.log(`   Session Token: ${token}`);
        console.log(`\n📋 To connect extension, run in browser console:`);
        console.log(`   chrome.storage.session.set({`);
        console.log(`     debug_bridge_session_token: "${token}",`);
        console.log(`     debug_bridge_session_id: "${sessionId}"`);
        console.log(`   })\n`);
      }

      uiInstance = render(
        React.createElement(RecorderUI, {
          controller,
          bridgeServer,
          port: parseInt(options.port, 10),
        })
      );

      const stdin = process.stdin;
      if (stdin.isTTY) {
        stdin.setRawMode(true);
        stdin.on('data', async (key) => {
          const char = key.toString();

          if (char === '\u0003') {
            await cleanup();
            process.exit(0);
          } else if (char === '\u0010' && controller.getState() === 'recording') {
            await controller.pause();
          } else if (char === '\u0012' && controller.getState() === 'paused') {
            await controller.resume();
          }
        });
      }
    } catch (error) {
      console.error(`❌ Failed to start session:`, error);
      await cleanup();
      process.exit(1);
    }
  });

program
  .command('pause')
  .description('Pause the current recording session')
  .argument('[session-id]', 'Session ID to pause (uses latest if omitted)')
  .action(async (_sessionIdArg) => {
    console.log('⏸️  Pause command - session control via start command UI');
    console.log('Use Ctrl+P within the interactive session to pause');
  });

program
  .command('resume')
  .description('Resume a paused recording session')
  .argument('[session-id]', 'Session ID to resume (uses latest if omitted)')
  .action(async (_sessionIdArg) => {
    console.log('▶️  Resume command - session control via start command UI');
    console.log('Use Ctrl+R within the interactive session to resume');
  });

program
  .command('stop')
  .description('Stop recording and generate markdown report')
  .argument('[session-id]', 'Session ID to stop (uses latest if omitted)')
  .option('-o, --output <path>', 'Output path for the report')
  .option('--max-tokens <number>', 'Maximum tokens for report', '10000')
  .option('--include-assets', 'Include base64 screenshots', false)
  .option('--capture <path>', 'Path to raw capture JSON to persist before generating')
  .option('--no-collapse-logs', 'Do not collapse long logs', false)
  .option('--no-trim', 'Do not trim redundant text', false)
  .action(async (sessionIdArg, options) => {
    let sessionId = sessionIdArg;
    let session: Session | null = null;

    if (options.capture) {
      try {
        const raw = await readCaptureFile(options.capture);
        session = normalizeSession(raw);
        sessionId = session.metadata.sessionId;
      } catch (error: unknown) {
        if (error instanceof CaptureReadError) {
          console.error(`❌ ${error.message}`);
        } else {
          console.error(`❌ Failed to load capture: ${(error as Error).message}`);
        }
        process.exit(1);
      }
    }

    if (!sessionId) {
      const sessions = await sessionStore.list();
      if (!sessions.length) {
        console.error('❌ No active sessions found');
        process.exit(1);
      }
      sessionId = sessions[sessions.length - 1];
    }

    if (!session) {
      session = await sessionStore.load(sessionId);
      if (!session) {
        console.error(`❌ Session not found: ${sessionId}`);
        process.exit(1);
      }
    }

    if (!session.metadata.endTime) {
      session.metadata.endTime = Date.now();
    }

    await sessionStore.save(session);

    const generator = new ReportGenerator(session);
    const report = generator.generate({
      includeAssets: options.includeAssets,
      maxTokens: Number.parseInt(options.maxTokens, 10),
      trimRedundant: options.trim !== false,
      collapseLogs: options.collapseLogs !== false,
      collapseAssets: true,
    });

    await fs.mkdir(REPORTS_DIR, { recursive: true });

    const outputPath = options.output || join(REPORTS_DIR, `${session.metadata.sessionId}.md`);
    await fs.writeFile(outputPath, report, 'utf-8');

    console.log(`✅ Report generated`);
    console.log(`Session ID: ${session.metadata.sessionId}`);
    console.log(`Output: ${outputPath}`);
  });

program
  .command('status')
  .description('Show status of the current recording session')
  .argument('[session-id]', 'Session ID to check (uses latest if omitted)')
  .action(async (sessionIdArg) => {
    let sessionId = sessionIdArg;

    if (!sessionId) {
      const sessions = await sessionStore.list();
      if (!sessions.length) {
        console.error('❌ No sessions found');
        process.exit(1);
      }
      sessionId = sessions[sessions.length - 1];
    }

    const session = await sessionStore.load(sessionId);
    if (!session) {
      console.error(`❌ Session not found: ${sessionId}`);
      process.exit(1);
    }

    console.log(`\n📊 Session Status`);
    console.log(`Session ID: ${session.metadata.sessionId}`);
    console.log(`Start: ${new Date(session.metadata.startTime).toISOString()}`);

    if (session.metadata.endTime) {
      console.log(`End: ${new Date(session.metadata.endTime).toISOString()}`);
      const duration = session.metadata.endTime - session.metadata.startTime;
      console.log(`Duration: ${Math.floor(duration / 1000)}s`);
      console.log(`State: ⏹️  STOPPED`);
    } else {
      const duration = Date.now() - session.metadata.startTime;
      console.log(`Duration: ${Math.floor(duration / 1000)}s`);
      console.log(`State: 🔴 RECORDING`);
    }

    console.log(`\nExtension ID: ${session.metadata.extensionId}`);
    if (session.metadata.extensionVersion) {
      console.log(`Extension Version: ${session.metadata.extensionVersion}`);
    }
    if (session.metadata.chromeVersion) {
      console.log(`Chrome Version: ${session.metadata.chromeVersion}`);
    }
    if (session.metadata.platform) {
      console.log(`Platform: ${session.metadata.platform}`);
    }

    console.log(`\n📈 Statistics`);
    console.log(`Interactions: ${session.interactions.length}`);
    console.log(`Errors: ${session.errors.length}`);
    console.log(`Snapshots: ${session.snapshots.length}`);
  });

program
  .command('capture')
  .description('Capture session data from JSON file and generate report')
  .argument('<input>', 'Path to session capture JSON file')
  .option('-o, --output <path>', 'Output path for the report')
  .option('--max-tokens <number>', 'Maximum tokens for report', '10000')
  .option('--include-assets', 'Include base64 screenshots', false)
  .action(async (input, options) => {
    console.log(`📥 Loading capture from: ${input}`);

    let raw;
    try {
      raw = await readCaptureFile(input);
    } catch (error: unknown) {
      if (error instanceof CaptureReadError) {
        console.error(`❌ ${error.message}`);
      } else {
        console.error(`❌ Failed to read capture: ${(error as Error).message}`);
      }
      process.exit(1);
    }

    console.log(`🔄 Normalizing session data...`);
    const session = normalizeSession(raw);

    if (session.metadata.endTime === undefined) {
      session.metadata.endTime = Date.now();
    }

    await sessionStore.save(session);

    const generator = new ReportGenerator(session);
    const report = generator.generate({
      includeAssets: options.includeAssets,
      maxTokens: Number.parseInt(options.maxTokens, 10),
      trimRedundant: true,
      collapseLogs: true,
      collapseAssets: true,
    });

    await fs.mkdir(REPORTS_DIR, { recursive: true });

    const outputPath = options.output || join(REPORTS_DIR, `${session.metadata.sessionId}.md`);
    await fs.writeFile(outputPath, report, 'utf-8');

    console.log(`✅ Report generated`);
    console.log(`Session ID: ${session.metadata.sessionId}`);
    console.log(`Output: ${outputPath}`);
  });

program
  .command('list')
  .description('List all recorded sessions')
  .action(async () => {
    const sessions = await sessionStore.list();

    if (!sessions.length) {
      console.log('No sessions found');
      return;
    }

    console.log(`Found ${sessions.length} session(s):`);
    for (const sessionId of sessions) {
      console.log(`  - ${sessionId}`);
    }
  });

program
  .command('show')
  .description('Show details of a session')
  .argument('<session-id>', 'Session ID to display')
  .action(async (sessionId) => {
    const session = await sessionStore.load(sessionId);

    if (!session) {
      console.error(`❌ Session not found: ${sessionId}`);
      process.exit(1);
    }

    console.log(`Session ID: ${session.metadata.sessionId}`);
    console.log(`Start: ${new Date(session.metadata.startTime).toISOString()}`);
    if (session.metadata.endTime) {
      console.log(`End: ${new Date(session.metadata.endTime).toISOString()}`);
      const duration = session.metadata.endTime - session.metadata.startTime;
      console.log(`Duration: ${Math.floor(duration / 1000)}s`);
    } else {
      console.log(`Status: In progress`);
    }
    console.log(`Interactions: ${session.interactions.length}`);
    console.log(`Errors: ${session.errors.length}`);
    console.log(`Snapshots: ${session.snapshots.length}`);
  });

program
  .command('delete')
  .description('Delete a session')
  .argument('<session-id>', 'Session ID to delete')
  .action(async (sessionId) => {
    await sessionStore.delete(sessionId);
    console.log(`✅ Session deleted: ${sessionId}`);
  });

program.parse();
