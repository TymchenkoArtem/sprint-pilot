import { open, mkdir } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';

// ---------------------------------------------------------------------------
// ActivityLogger -- append-only buffered writer for per-item activity logs
// ---------------------------------------------------------------------------

interface BufferEntry {
  readonly line: string;
}

export class ActivityLogger {
  private readonly logPath: string;
  private fileHandle: FileHandle | undefined;
  private buffer: BufferEntry[] = [];
  private lastDateHeader: string | undefined;
  private flushing = false;
  private signalHandlersRegistered = false;

  constructor(logPath: string) {
    this.logPath = logPath;
    // No I/O -- constructor is side-effect free
  }

  async log(category: string, message: string): Promise<void> {
    try {
      await this.ensureOpen();
      const now = new Date();
      const dateStr = this.formatDate(now);
      const timeStr = this.formatTime(now);

      if (this.lastDateHeader !== dateStr) {
        const prefix = this.lastDateHeader === undefined ? '' : '\n';
        this.buffer.push({ line: `${prefix}## ${dateStr}\n\n` });
        this.lastDateHeader = dateStr;
      }

      this.buffer.push({ line: `- ${timeStr} [${category}] ${message}\n` });

      if (this.buffer.length >= 10) {
        await this.flush();
      }
    } catch {
      // Swallow all logger errors -- never crash a tool call
    }
  }

  async logError(
    category: string,
    message: string,
    code: string,
  ): Promise<void> {
    try {
      await this.ensureOpen();
      const now = new Date();
      const dateStr = this.formatDate(now);
      const timeStr = this.formatTime(now);

      if (this.lastDateHeader !== dateStr) {
        const prefix = this.lastDateHeader === undefined ? '' : '\n';
        this.buffer.push({ line: `${prefix}## ${dateStr}\n\n` });
        this.lastDateHeader = dateStr;
      }

      this.buffer.push({
        line: `- ${timeStr} [${category}:${code}] ${message}\n`,
      });

      if (this.buffer.length >= 10) {
        await this.flush();
      }
    } catch {
      // Swallow all logger errors -- never crash a tool call
    }
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) {
      return;
    }

    this.flushing = true;
    try {
      if (this.fileHandle === undefined) {
        return;
      }
      const content = this.buffer.map((entry) => entry.line).join('');
      this.buffer = [];
      await this.fileHandle.appendFile(content, 'utf-8');
    } catch {
      // Swallow all logger errors -- never crash a tool call
    } finally {
      this.flushing = false;
    }
  }

  async close(): Promise<void> {
    try {
      await this.flush();
      if (this.fileHandle !== undefined) {
        await this.fileHandle.close();
        this.fileHandle = undefined;
      }
    } catch {
      // Swallow all logger errors
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async ensureOpen(): Promise<void> {
    if (this.fileHandle !== undefined) {
      return;
    }

    try {
      await mkdir(dirname(this.logPath), { recursive: true });
    } catch {
      // Swallow -- best effort directory creation
    }

    this.fileHandle = await open(this.logPath, 'a');
    this.registerSignalHandlers();
  }

  private registerSignalHandlers(): void {
    if (this.signalHandlersRegistered) {
      return;
    }
    this.signalHandlersRegistered = true;

    const handler = (): void => {
      // Use synchronous-style best-effort flush on exit signals
      this.flush()
        .then(() => this.close())
        .catch(() => {
          // Swallow -- nothing to do during shutdown
        });
    };

    process.on('SIGTERM', handler);
    process.on('SIGINT', handler);
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatTime(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}
