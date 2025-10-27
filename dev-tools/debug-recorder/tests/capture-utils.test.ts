import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readCaptureFile, CaptureReadError } from '../src/utils/capture.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('capture utilities', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `capture-util-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { force: true, recursive: true });
  });

  it('reads a valid capture file', async () => {
    const file = join(tempDir, 'capture.json');
    await fs.writeFile(
      file,
      JSON.stringify({
        session: {
          sessionId: 'test',
          startTime: 1,
          extensionId: 'test',
        },
      }),
      'utf-8'
    );

    const capture = await readCaptureFile(file);
    expect(capture.session?.sessionId).toBe('test');
  });

  it('throws CaptureReadError when file does not exist', async () => {
    const missing = join(tempDir, 'missing.json');

    await expect(readCaptureFile(missing)).rejects.toMatchObject({
      name: 'CaptureReadError',
      code: 'file-not-found',
    });
  });

  it('throws CaptureReadError when file is not valid JSON', async () => {
    const file = join(tempDir, 'invalid.json');
    await fs.writeFile(file, '{ not json }', 'utf-8');

    await expect(readCaptureFile(file)).rejects.toMatchObject({
      name: 'CaptureReadError',
      code: 'invalid-json',
    });
  });

  it('throws CaptureReadError for read failures', async () => {
    const file = join(tempDir, 'capture.json');
    await fs.writeFile(file, '{}', 'utf-8');
    // Remove read permissions to trigger failure
    await fs.chmod(file, 0o000);

    await expect(readCaptureFile(file)).rejects.toMatchObject({
      name: 'CaptureReadError',
      code: 'read-failed',
    });
  });
});
