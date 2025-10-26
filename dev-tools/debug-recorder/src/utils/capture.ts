import { promises as fs } from 'node:fs';
import { RawSessionCapture } from '../normalizer.js';

export type CaptureErrorCode = 'file-not-found' | 'invalid-json' | 'read-failed';

export class CaptureReadError extends Error {
  public readonly cause?: unknown;

  constructor(
    public readonly code: CaptureErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message);
    this.name = 'CaptureReadError';
    this.cause = cause;
  }
}

export async function readCaptureFile(filePath: string): Promise<RawSessionCapture> {
  let contents: string;

  try {
    contents = await fs.readFile(filePath, 'utf-8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CaptureReadError('file-not-found', `Capture file not found: ${filePath}`, error);
    }

    throw new CaptureReadError('read-failed', `Unable to read capture file: ${filePath}`, error);
  }

  try {
    return JSON.parse(contents) as RawSessionCapture;
  } catch (error: unknown) {
    throw new CaptureReadError(
      'invalid-json',
      `Capture file is not valid JSON: ${filePath}`,
      error
    );
  }
}
