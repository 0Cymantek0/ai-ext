#!/usr/bin/env node

import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionStore } from './session-store.js';
import { ReportGenerator } from './report-generator.js';
import { normalizeSession, RawSessionCapture } from './normalizer.js';
import type { Session } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPORTS_DIR = join(__dirname, '..', 'reports');

const program = new Command();
const sessionStore = new SessionStore();

program
  .name('debug-recorder')
  .description('CLI tool for capturing runtime state and generating diagnostic reports')
  .version('0.1.0');

program
  .command('start')
  .description('Start a new recording session')
  .option('--extension-id <id>', 'Chrome extension ID to monitor')
  .option('--screenshots', 'Enable screenshot capture', false)
  .option('--storage', 'Include storage data', false)
  .option('--metrics', 'Include performance metrics', false)
  .action(async (options) => {
    const sessionId = generateSessionId();

    const session: Session = {
      metadata: {
        sessionId,
        startTime: Date.now(),
        extensionId: options.extensionId || 'unknown',
        recordingOptions: {
          includeScreenshots: options.screenshots,
          includeStorage: options.storage,
          includeMetrics: options.metrics,
          includePII: false,
        },
      },
      interactions: [],
      errors: [],
      snapshots: [],
    };

    await sessionStore.save(session);

    console.log(`✅ Recording started`);
    console.log(`Session ID: ${sessionId}`);
    console.log(`\nTo stop recording and generate report:`);
    console.log(`  debug-recorder stop ${sessionId}`);
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
      const contents = await fs.readFile(options.capture, 'utf-8');
      const raw: RawSessionCapture = JSON.parse(contents);
      session = normalizeSession(raw);
      sessionId = session.metadata.sessionId;
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
  .command('capture')
  .description('Capture session data from JSON file and generate report')
  .argument('<input>', 'Path to session capture JSON file')
  .option('-o, --output <path>', 'Output path for the report')
  .option('--max-tokens <number>', 'Maximum tokens for report', '10000')
  .option('--include-assets', 'Include base64 screenshots', false)
  .action(async (input, options) => {
    console.log(`📥 Loading capture from: ${input}`);

    const contents = await fs.readFile(input, 'utf-8');
    const raw: RawSessionCapture = JSON.parse(contents);

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

function generateSessionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `session-${timestamp}-${random}`;
}

program.parse();
