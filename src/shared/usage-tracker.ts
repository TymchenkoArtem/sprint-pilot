/**
 * UsageTracker -- append-only history of tool call execution metrics.
 *
 * Records each MCP tool call with:
 * - Timestamp
 * - Flow context (e.g. US-12345) if available
 * - Tool/command name and short description
 * - Execution duration in milliseconds
 * - Token count (when reported by the AI via sp-track-usage)
 *
 * History is NEVER cleared -- old entries persist across sessions.
 * Stored per work item in `.sprint-pilot/workflows/{TYPE}-{ID}/usage.md` as append-only markdown.
 */

import { open, mkdir } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsageEntry {
  /** Tool or command name (e.g. 'sp-get-item', 'claude-cli') */
  readonly command: string;
  /** Short human-readable description (e.g. 'Fetched work item 12345') */
  readonly description: string;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  /** Flow context -- typically US-{id} or empty string */
  readonly flow: string;
  /** Estimated token count (input + output) */
  readonly tokens: number;
}

/**
 * Estimate token count from input args and output text.
 * Uses the ~4 characters per token heuristic for English/code text.
 */
export function estimateTokens(inputArgs: unknown, outputText: string): number {
  const inputStr = typeof inputArgs === 'string' ? inputArgs : JSON.stringify(inputArgs ?? {});
  const totalChars = inputStr.length + outputText.length;
  return Math.max(1, Math.ceil(totalChars / 4));
}

// ---------------------------------------------------------------------------
// UsageTracker
// ---------------------------------------------------------------------------

export class UsageTracker {
  private readonly filePath: string;
  private fileHandle: FileHandle | undefined;
  private lastDateHeader: string | undefined;
  private buffer: string[] = [];
  private flushing = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Record a usage entry. Buffers writes and flushes when the buffer
   * reaches 10 entries or when flush() is called explicitly.
   */
  async record(entry: UsageEntry): Promise<void> {
    try {
      await this.ensureOpen();
      const now = new Date();
      const dateStr = this.formatDate(now);
      const timeStr = this.formatTime(now);

      // Add date header if it changed
      if (this.lastDateHeader !== dateStr) {
        const prefix = this.lastDateHeader === undefined ? '' : '\n';
        this.buffer.push(`${prefix}## ${dateStr}\n\n`);
        this.lastDateHeader = dateStr;
      }

      // Format duration
      const duration = entry.durationMs >= 1000
        ? `${(entry.durationMs / 1000).toFixed(1)}s`
        : `${Math.round(entry.durationMs)}ms`;

      // Format tokens
      const tokens = entry.tokens > 0
        ? `~${entry.tokens.toLocaleString('en-US')} tokens`
        : '-';

      // Format flow
      const flow = entry.flow.length > 0 ? entry.flow : '-';

      this.buffer.push(
        `- ${timeStr} | ${flow} | ${entry.command} | ${entry.description} | ${duration} | ${tokens}\n`,
      );

      if (this.buffer.length >= 10) {
        await this.flush();
      }
    } catch {
      // Never crash a tool call due to usage tracking
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
      const content = this.buffer.join('');
      this.buffer = [];
      await this.fileHandle.appendFile(content, 'utf-8');
    } catch {
      // Swallow -- never crash
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
      // Swallow
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
      await mkdir(dirname(this.filePath), { recursive: true });
    } catch {
      // Swallow -- best effort directory creation
    }

    this.fileHandle = await open(this.filePath, 'a');
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
