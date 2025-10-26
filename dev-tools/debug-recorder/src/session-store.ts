import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SESSIONS_DIR = join(__dirname, '..', 'sessions');

export class SessionStore {
  constructor(private readonly baseDir: string = SESSIONS_DIR) {}

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  async load(sessionId: string): Promise<Session | null> {
    const file = join(this.baseDir, `${sessionId}.json`);
    try {
      const contents = await fs.readFile(file, 'utf-8');
      return JSON.parse(contents) as Session;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async save(session: Session): Promise<void> {
    await this.ensureDir();
    const file = join(this.baseDir, `${session.metadata.sessionId}.json`);
    await fs.writeFile(file, JSON.stringify(session, null, 2), 'utf-8');
  }

  async list(): Promise<string[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.baseDir);
    return files.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  }

  async delete(sessionId: string): Promise<void> {
    const file = join(this.baseDir, `${sessionId}.json`);
    try {
      await fs.rm(file);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
