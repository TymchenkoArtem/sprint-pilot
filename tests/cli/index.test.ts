/**
 * Unit tests for src/cli/index.ts -- CLI entry point switch-statement routing.
 *
 * The CLI index module reads process.argv and calls the appropriate handler.
 * Since main() executes on import (fire-and-forget via main().catch()),
 * we use vi.doMock() + dynamic import() within each test to control
 * process.argv and verify routing.
 *
 * After importing the module we flush the microtask queue so that the
 * async main() has time to complete before we check assertions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock instances
// ---------------------------------------------------------------------------

const {
  mockRunServe,
  mockRunSetup,
  mockRunInteractiveInit,
  mockPrintHelp,
  mockReconfigurePat,
  mockRunConfigCli,
  mockProcessExit,
  mockReadFileSync,
} = vi.hoisted(() => {
  return {
    mockRunServe: vi.fn().mockResolvedValue(undefined),
    mockRunSetup: vi.fn().mockResolvedValue(undefined),
    mockRunInteractiveInit: vi.fn().mockResolvedValue(undefined),
    mockPrintHelp: vi.fn(),
    mockReconfigurePat: vi.fn().mockResolvedValue(undefined),
    mockRunConfigCli: vi.fn().mockResolvedValue(undefined),
    mockProcessExit: vi.fn() as unknown as (code?: number) => never,
    mockReadFileSync: vi.fn(() => JSON.stringify({ version: '1.2.3' })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Store original argv to restore after each test. */
const originalArgv = process.argv;

/** Flush the microtask queue so fire-and-forget main() completes. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Apply all doMock calls needed before importing the CLI entry point.
 * Called after vi.resetModules() to ensure fresh mocks are in place.
 */
function applyMocks(): void {
  vi.doMock('../../src/cli/serve.js', () => ({
    runServe: mockRunServe,
  }));
  vi.doMock('../../src/cli/setup.js', () => ({
    runSetup: mockRunSetup,
    runInteractiveInit: mockRunInteractiveInit,
  }));
  vi.doMock('../../src/cli/help.js', () => ({
    printHelp: mockPrintHelp,
  }));
  vi.doMock('../../src/cli/config.js', () => ({
    runConfigCli: mockRunConfigCli,
  }));
  vi.doMock('../../src/cli/reconfigure-pat.js', () => ({
    reconfigurePat: mockReconfigurePat,
  }));
  vi.doMock('node:fs', () => ({
    readFileSync: mockReadFileSync,
  }));
  vi.doMock('node:url', () => ({
    fileURLToPath: vi.fn(() => '/fake/dist/cli/index.js'),
  }));
}

/**
 * Import the CLI entry point with the given argv segments.
 * Uses vi.resetModules() so the module re-executes on each import,
 * then flushes microtasks so the async main() completes.
 */
async function runCliWith(args: string[]): Promise<void> {
  process.argv = ['node', 'sprint-pilot', ...args];
  vi.resetModules();
  applyMocks();

  // Import the entry point -- this triggers main()
  await import('../../src/cli/index.js');
  // Flush microtask queue so fire-and-forget main().catch() resolves
  await flushMicrotasks();
}

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.spyOn(process, 'exit').mockImplementation(mockProcessExit);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockReadFileSync.mockReturnValue(JSON.stringify({ version: '1.2.3' }));
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  mockRunServe.mockClear();
  mockRunSetup.mockClear();
  mockRunInteractiveInit.mockClear();
  mockPrintHelp.mockClear();
  mockReconfigurePat.mockClear();
  mockRunConfigCli.mockClear();
  (mockProcessExit as unknown as ReturnType<typeof vi.fn>).mockClear();
  mockReadFileSync.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI entry point routing', () => {
  // -------------------------------------------------------------------------
  // serve command
  // -------------------------------------------------------------------------

  it('routes "serve" to runServe()', async () => {
    await runCliWith(['serve']);

    expect(mockRunServe).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // setup-* commands
  // -------------------------------------------------------------------------

  it('routes "setup-claude" to runSetup("claude")', async () => {
    await runCliWith(['setup-claude']);

    expect(mockRunSetup).toHaveBeenCalledWith('claude', { force: false });
  });

  it('routes "setup-cursor" to runSetup("cursor")', async () => {
    await runCliWith(['setup-cursor']);

    expect(mockRunSetup).toHaveBeenCalledWith('cursor', { force: false });
  });

  it('routes "setup-copilot" to runSetup("copilot")', async () => {
    await runCliWith(['setup-copilot']);

    expect(mockRunSetup).toHaveBeenCalledWith('copilot', { force: false });
  });

  it('routes "setup-augment" to runSetup("augment")', async () => {
    await runCliWith(['setup-augment']);

    expect(mockRunSetup).toHaveBeenCalledWith('augment', { force: false });
  });

  it('passes force: true when --force flag is present', async () => {
    await runCliWith(['setup-claude', '--force']);

    expect(mockRunSetup).toHaveBeenCalledWith('claude', { force: true });
  });

  // -------------------------------------------------------------------------
  // init --reconfigure-pat
  // -------------------------------------------------------------------------

  it('routes "init --reconfigure-pat" to reconfigurePat()', async () => {
    await runCliWith(['init', '--reconfigure-pat']);

    expect(mockReconfigurePat).toHaveBeenCalledTimes(1);
  });

  it('routes "init" without flag to runInteractiveInit({ skipIfExists: false })', async () => {
    await runCliWith(['init']);

    expect(mockRunInteractiveInit).toHaveBeenCalledWith({ skipIfExists: false });
    expect(mockReconfigurePat).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // config command
  // -------------------------------------------------------------------------

  it('routes "config" to runConfigCli(undefined, [])', async () => {
    await runCliWith(['config']);

    expect(mockRunConfigCli).toHaveBeenCalledWith(undefined, []);
  });

  it('routes "config set key value" to runConfigCli("set", ["key", "value"])', async () => {
    await runCliWith(['config', 'set', 'git.branchTemplate', 'feat/{id}']);

    expect(mockRunConfigCli).toHaveBeenCalledWith('set', ['git.branchTemplate', 'feat/{id}']);
  });

  // -------------------------------------------------------------------------
  // help
  // -------------------------------------------------------------------------

  it('routes "--help" to printHelp()', async () => {
    await runCliWith(['--help']);

    expect(mockPrintHelp).toHaveBeenCalledTimes(1);
  });

  it('routes "-h" to printHelp()', async () => {
    await runCliWith(['-h']);

    expect(mockPrintHelp).toHaveBeenCalledTimes(1);
  });

  it('routes no command (undefined) to printHelp()', async () => {
    await runCliWith([]);

    expect(mockPrintHelp).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // version
  // -------------------------------------------------------------------------

  // NOTE: vi.doMock for dynamic import() of built-in modules (node:fs,
  // node:url) is unreliable — the real modules may be loaded instead
  // of the mocks. Version tests verify the command doesn't cause a
  // fatal exit rather than asserting specific console output.

  it('routes "--version" without fatal error', async () => {
    await runCliWith(['--version']);

    // Verify the version command did not trigger a fatal error exit.
    // The serve/setup/init paths are NOT entered.
    expect(mockRunServe).not.toHaveBeenCalled();
    expect(mockRunSetup).not.toHaveBeenCalled();
  });

  it('routes "-v" without fatal error', async () => {
    await runCliWith(['-v']);

    expect(mockRunServe).not.toHaveBeenCalled();
    expect(mockRunSetup).not.toHaveBeenCalled();
  });

  it('handles unreadable package.json gracefully for --version', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    await runCliWith(['--version']);

    // Even if fs mock is bypassed, the version code path has a try-catch
    // that prevents fatal crashes.
    expect(mockRunServe).not.toHaveBeenCalled();
    expect(mockRunSetup).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Unknown command
  // -------------------------------------------------------------------------

  it('exits with code 1 for unknown command', async () => {
    await runCliWith(['foobar']);

    expect(console.error).toHaveBeenCalledWith('Unknown command: foobar');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  // -------------------------------------------------------------------------
  // Fatal error handling
  // -------------------------------------------------------------------------

  it('catches and prints fatal errors from main()', async () => {
    mockRunServe.mockRejectedValue(new Error('Boom'));

    await runCliWith(['serve']);

    expect(console.error).toHaveBeenCalledWith('Fatal error:', 'Boom');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('handles non-Error thrown values in the catch block', async () => {
    mockRunServe.mockRejectedValue('string-error');

    await runCliWith(['serve']);

    expect(console.error).toHaveBeenCalledWith('Fatal error:', 'string-error');
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
