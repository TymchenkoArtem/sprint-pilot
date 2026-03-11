import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { UsageTracker, estimateTokens } from '../../src/shared/usage-tracker.js';
import type { UsageEntry } from '../../src/shared/usage-tracker.js';

// ---------------------------------------------------------------------------
// Test setup: real temp directory for file operations
// ---------------------------------------------------------------------------

let tempDir: string;
let activeTrackers: UsageTracker[];

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'sp-usage-tracker-test-'));
  activeTrackers = [];
});

afterEach(async () => {
  // Close all trackers to release file handles before cleanup (required on Windows)
  for (const tracker of activeTrackers) {
    await tracker.close();
  }
  await rm(tempDir, { recursive: true, force: true });
});

/**
 * Helper that creates a tracker and tracks it for cleanup in afterEach.
 */
function createTracker(filePath: string): UsageTracker {
  const tracker = new UsageTracker(filePath);
  activeTrackers.push(tracker);
  return tracker;
}

/**
 * Helper to build a UsageEntry with sensible defaults.
 */
function makeEntry(overrides: Partial<UsageEntry> = {}): UsageEntry {
  return {
    command: 'sp-get-item',
    description: 'Fetched work item #123',
    durationMs: 250,
    flow: 'claude',
    tokens: 500,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UsageTracker', () => {
  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('does not create files on construction', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const _tracker = createTracker(filePath);

      // File should not exist yet
      await expect(stat(filePath)).rejects.toThrow();
    });

    it('has no side effects', () => {
      // Construction with a non-existent path should not throw
      const tracker = new UsageTracker('/non/existent/path/usage-history.md');
      expect(tracker).toBeInstanceOf(UsageTracker);
    });
  });

  // -----------------------------------------------------------------------
  // record()
  // -----------------------------------------------------------------------

  describe('record()', () => {
    it('creates file on first write', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      await tracker.record(makeEntry());
      await tracker.flush();

      const fileStat = await stat(filePath);
      expect(fileStat.isFile()).toBe(true);
    });

    it('writes correct markdown format', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      await tracker.record(makeEntry({
        command: 'sp-get-item',
        description: 'Fetched work item #123',
        durationMs: 250,
        flow: 'claude',
        tokens: 500,
      }));
      await tracker.flush();

      const content = await readFile(filePath, 'utf-8');

      // Format: - HH:MM | flow | command | description | duration | tokens
      expect(content).toMatch(
        /- \d{2}:\d{2} \| claude \| sp-get-item \| Fetched work item #123 \| 250ms \| ~500 tokens\n/,
      );
    });

    it('includes date header on first call', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      await tracker.record(makeEntry());
      await tracker.flush();

      const content = await readFile(filePath, 'utf-8');

      // Date header format: ## YYYY-MM-DD
      expect(content).toMatch(/^## \d{4}-\d{2}-\d{2}\n\n/);
    });

    it('formats duration as seconds when >= 1000ms', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      await tracker.record(makeEntry({ durationMs: 1500 }));
      await tracker.flush();

      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('| 1.5s |');
    });

    it('formats duration as ms when < 1000ms', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      await tracker.record(makeEntry({ durationMs: 500 }));
      await tracker.flush();

      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('| 500ms |');
    });

    it('formats tokens with commas when > 0', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      await tracker.record(makeEntry({ tokens: 1500 }));
      await tracker.flush();

      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('~1,500 tokens');
    });

    it('formats tokens as "-" when 0', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      await tracker.record(makeEntry({ tokens: 0 }));
      await tracker.flush();

      const content = await readFile(filePath, 'utf-8');
      // The line should end with "| -\n"
      expect(content).toMatch(/\| -\n/);
    });

    it('formats flow as "-" when empty string', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      await tracker.record(makeEntry({ flow: '' }));
      await tracker.flush();

      const content = await readFile(filePath, 'utf-8');
      // Should have "| - |" for the flow field
      expect(content).toMatch(/- \d{2}:\d{2} \| - \|/);
    });

    it('includes flow when provided', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      await tracker.record(makeEntry({ flow: 'cursor' }));
      await tracker.flush();

      const content = await readFile(filePath, 'utf-8');
      expect(content).toMatch(/- \d{2}:\d{2} \| cursor \|/);
    });

    it('auto-flushes when buffer reaches 10 entries', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      // The first record() adds 2 buffer entries (date header + log line).
      // Each subsequent call adds 1 entry.
      // After the 9th call: 2 + 8 = 10 entries -> auto-flush triggers.
      for (let i = 0; i < 9; i++) {
        await tracker.record(makeEntry({ description: `action ${i}` }));
      }

      // Buffer should have auto-flushed after reaching 10
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('action 0');
      expect(content).toContain('action 8');
    });

    it('swallows errors when file cannot be opened', async () => {
      // Use a path that will fail -- directory does not exist
      const tracker = new UsageTracker(
        join(tempDir, 'nonexistent-dir', 'subdir', 'missing', 'usage-history.md'),
      );

      // Should not throw
      await tracker.record(makeEntry());
    });
  });

  // -----------------------------------------------------------------------
  // flush()
  // -----------------------------------------------------------------------

  describe('flush()', () => {
    it('writes buffered content to file', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      await tracker.record(makeEntry({ description: 'buffered entry' }));
      await tracker.flush();

      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('buffered entry');
    });

    it('is no-op when buffer is empty', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      // Flush with nothing in buffer -- should not throw or create file
      await tracker.flush();

      await expect(stat(filePath)).rejects.toThrow();
    });

    it('clears buffer after flushing', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      await tracker.record(makeEntry({ description: 'entry one' }));
      await tracker.flush();

      const content1 = await readFile(filePath, 'utf-8');
      expect(content1).toContain('entry one');

      // Write more and flush again
      await tracker.record(makeEntry({ description: 'entry two' }));
      await tracker.flush();

      const content2 = await readFile(filePath, 'utf-8');
      // entry one should still be there (append mode) plus entry two
      expect(content2).toContain('entry one');
      expect(content2).toContain('entry two');
    });

    it('is no-op when fileHandle is undefined (not opened)', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      // Force a buffer entry without opening a file handle by accessing internals.
      // Since flush() checks fileHandle === undefined and returns early, we verify
      // by ensuring no file is created and no error is thrown.
      await tracker.flush();

      await expect(stat(filePath)).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // close()
  // -----------------------------------------------------------------------

  describe('close()', () => {
    it('flushes remaining entries and closes handle', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      await tracker.record(makeEntry({ description: 'before close' }));
      await tracker.close();

      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('before close');
    });

    it('is safe to call multiple times', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      await tracker.record(makeEntry({ description: 'data' }));
      await tracker.close();
      await tracker.close(); // second close should not throw
    });

    it('is safe when never opened', async () => {
      const filePath = join(tempDir, 'usage-history.md');
      const tracker = createTracker(filePath);

      // close() without ever opening -- should not throw
      await tracker.close();
    });
  });
});

// ---------------------------------------------------------------------------
// estimateTokens()
// ---------------------------------------------------------------------------

describe('estimateTokens()', () => {
  it('returns correct estimate for string input', () => {
    // 12 chars input + 8 chars output = 20 chars -> ceil(20/4) = 5
    const result = estimateTokens('hello world!', 'response');
    expect(result).toBe(5);
  });

  it('returns correct estimate for object input', () => {
    const input = { id: 123 };
    const inputStr = JSON.stringify(input); // '{"id":123}' -> 10 chars
    const output = 'ok'; // 2 chars
    // ceil(12/4) = 3
    const result = estimateTokens(input, output);
    expect(result).toBe(Math.ceil((inputStr.length + output.length) / 4));
  });

  it('returns minimum of 1', () => {
    // Empty string input + empty output = 2 chars (JSON.stringify({}) = '{}')
    // But let's test with truly minimal input
    const result = estimateTokens('', '');
    expect(result).toBeGreaterThanOrEqual(1);
  });

  it('handles null input', () => {
    // null -> JSON.stringify(null) = 'null' -> 4 chars + 0 = ceil(4/4) = 1
    const result = estimateTokens(null, '');
    expect(result).toBeGreaterThanOrEqual(1);
  });

  it('handles undefined input', () => {
    // undefined -> inputArgs ?? {} -> JSON.stringify({}) = '{}' -> 2 chars
    const result = estimateTokens(undefined, '');
    expect(result).toBeGreaterThanOrEqual(1);
  });
});
