import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ActivityLogger } from '../../src/shared/logger.js';

// ---------------------------------------------------------------------------
// Test setup: real temp directory for file operations
// ---------------------------------------------------------------------------

let tempDir: string;
let activeLoggers: ActivityLogger[];

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'sp-logger-test-'));
  activeLoggers = [];
});

afterEach(async () => {
  // Close all loggers to release file handles before cleanup (required on Windows)
  for (const logger of activeLoggers) {
    await logger.close();
  }
  await rm(tempDir, { recursive: true, force: true });
});

/**
 * Helper that creates a logger and tracks it for cleanup in afterEach.
 */
function createLogger(logPath: string): ActivityLogger {
  const logger = new ActivityLogger(logPath);
  activeLoggers.push(logger);
  return logger;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActivityLogger', () => {
  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('does not create files on construction', async () => {
      const logPath = join(tempDir, 'activity.md');
      const _logger = createLogger(logPath);

      // File should not exist yet
      await expect(stat(logPath)).rejects.toThrow();
    });

    it('has no side effects', () => {
      // Construction with a non-existent path should not throw
      const logger = new ActivityLogger('/non/existent/path/activity.md');
      expect(logger).toBeInstanceOf(ActivityLogger);
    });
  });

  // -----------------------------------------------------------------------
  // log()
  // -----------------------------------------------------------------------

  describe('log()', () => {
    it('creates file on first write', async () => {
      const logPath = join(tempDir, 'activity.md');
      const logger = createLogger(logPath);

      await logger.log('TEST', 'first message');
      await logger.flush();

      const fileStat = await stat(logPath);
      expect(fileStat.isFile()).toBe(true);
    });

    it('writes correct format with timestamp and category', async () => {
      const logPath = join(tempDir, 'activity.md');
      const logger = createLogger(logPath);

      await logger.log('TOOL-NAME', 'something happened');
      await logger.flush();

      const content = await readFile(logPath, 'utf-8');

      // Format: - HH:MM [CATEGORY] message\n
      expect(content).toMatch(
        /- \d{2}:\d{2} \[TOOL-NAME\] something happened\n/,
      );
    });

    it('prepends date header on first call', async () => {
      const logPath = join(tempDir, 'activity.md');
      const logger = createLogger(logPath);

      await logger.log('TEST', 'first');
      await logger.flush();

      const content = await readFile(logPath, 'utf-8');

      // Date header format: ## YYYY-MM-DD
      expect(content).toMatch(/^## \d{4}-\d{2}-\d{2}\n\n/);
    });

    it('accumulates multiple entries', async () => {
      const logPath = join(tempDir, 'activity.md');
      const logger = createLogger(logPath);

      await logger.log('A', 'first');
      await logger.log('B', 'second');
      await logger.log('C', 'third');
      await logger.flush();

      const content = await readFile(logPath, 'utf-8');

      expect(content).toContain('[A] first');
      expect(content).toContain('[B] second');
      expect(content).toContain('[C] third');
    });
  });

  // -----------------------------------------------------------------------
  // logError()
  // -----------------------------------------------------------------------

  describe('logError()', () => {
    it('writes format with error code', async () => {
      const logPath = join(tempDir, 'activity.md');
      const logger = createLogger(logPath);

      await logger.logError('GET-ITEM', 'Work item not found', 'ado_not_found');
      await logger.flush();

      const content = await readFile(logPath, 'utf-8');

      // Format: - HH:MM [CATEGORY:ERROR_CODE] message\n
      expect(content).toMatch(
        /- \d{2}:\d{2} \[GET-ITEM:ado_not_found\] Work item not found\n/,
      );
    });

    it('prepends date header on first logError call', async () => {
      const logPath = join(tempDir, 'activity.md');
      const logger = createLogger(logPath);

      await logger.logError('TEST', 'error msg', 'auth_expired');
      await logger.flush();

      const content = await readFile(logPath, 'utf-8');
      expect(content).toMatch(/^## \d{4}-\d{2}-\d{2}\n\n/);
    });
  });

  // -----------------------------------------------------------------------
  // Buffer flushing
  // -----------------------------------------------------------------------

  describe('buffer flushing', () => {
    it('flushes automatically when buffer reaches 10 entries', async () => {
      const logPath = join(tempDir, 'activity.md');
      const logger = createLogger(logPath);

      // The first log call adds 2 buffer entries (date header + log line).
      // Each subsequent call adds 1 entry.
      // After the 9th call: 2 + 8 = 10 entries -> auto-flush triggers.
      for (let i = 0; i < 9; i++) {
        await logger.log('TEST', `message ${i}`);
      }

      // Buffer should have auto-flushed after reaching 10
      const content = await readFile(logPath, 'utf-8');
      expect(content).toContain('message 0');
      expect(content).toContain('message 8');
    });
  });

  // -----------------------------------------------------------------------
  // flush()
  // -----------------------------------------------------------------------

  describe('flush()', () => {
    it('writes buffered content to file', async () => {
      const logPath = join(tempDir, 'activity.md');
      const logger = createLogger(logPath);

      await logger.log('TEST', 'buffered entry');
      await logger.flush();

      const content = await readFile(logPath, 'utf-8');
      expect(content).toContain('buffered entry');
    });

    it('is a no-op when buffer is empty', async () => {
      const logPath = join(tempDir, 'activity.md');
      const logger = createLogger(logPath);

      // Flush with nothing in buffer -- should not throw or create file
      await logger.flush();

      await expect(stat(logPath)).rejects.toThrow();
    });

    it('clears the buffer after flushing', async () => {
      const logPath = join(tempDir, 'activity.md');
      const logger = createLogger(logPath);

      await logger.log('TEST', 'entry one');
      await logger.flush();

      // Read first flush
      const content1 = await readFile(logPath, 'utf-8');
      expect(content1).toContain('entry one');

      // Write more and flush again
      await logger.log('TEST', 'entry two');
      await logger.flush();

      const content2 = await readFile(logPath, 'utf-8');
      // entry one should still be there (append mode) plus entry two
      expect(content2).toContain('entry one');
      expect(content2).toContain('entry two');
    });
  });

  // -----------------------------------------------------------------------
  // close()
  // -----------------------------------------------------------------------

  describe('close()', () => {
    it('flushes remaining entries and closes file handle', async () => {
      const logPath = join(tempDir, 'activity.md');
      const logger = createLogger(logPath);

      await logger.log('TEST', 'before close');
      await logger.close();

      const content = await readFile(logPath, 'utf-8');
      expect(content).toContain('before close');
    });

    it('is safe to call multiple times', async () => {
      const logPath = join(tempDir, 'activity.md');
      const logger = createLogger(logPath);

      await logger.log('TEST', 'data');
      await logger.close();
      await logger.close(); // second close should not throw
    });
  });

  // -----------------------------------------------------------------------
  // Error swallowing
  // -----------------------------------------------------------------------

  describe('error swallowing', () => {
    it('swallows errors during log when file cannot be opened', async () => {
      // Use a path that will fail -- directory as file path
      const logger = new ActivityLogger(
        join(tempDir, 'nonexistent-dir', 'subdir', 'missing', 'activity.md'),
      );

      // Should not throw
      await logger.log('TEST', 'this should not throw');
    });

    it('swallows errors during logError when file cannot be opened', async () => {
      const logger = new ActivityLogger(
        join(tempDir, 'nonexistent-dir', 'activity.md'),
      );

      // Should not throw
      await logger.logError('TEST', 'error', 'some_code');
    });

    it('swallows errors during close when file handle is not open', async () => {
      const logger = new ActivityLogger(join(tempDir, 'never-opened.md'));

      // close() without ever opening -- should not throw
      await logger.close();
    });
  });
});
