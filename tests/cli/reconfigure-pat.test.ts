/**
 * Unit tests for src/cli/reconfigure-pat.ts -- reconfigurePat()
 *
 * All external I/O (ConfigManager, keytar, file-fallback, fs, process.exit)
 * is mocked at the module level. Tests verify:
 *   - happy path: loads config, reads PAT from stdin, validates, stores
 *   - keytar fallback to file strategy
 *   - validation failure
 *   - config not found (not initialized)
 *   - empty PAT
 *   - stdin read failure
 *
 * process.exit is mocked to throw a sentinel error so that execution halts
 * at the exit point, matching the real runtime behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock instances -- available inside vi.mock() factories
// ---------------------------------------------------------------------------

const {
  mockConfigManagerInstance,
  mockKeytarIsAvailable,
  mockKeytarInstance,
  mockFileFallbackInstance,
  mockReadFileSync,
} = vi.hoisted(() => {
  const _mockConfigManagerInstance = {
    load: vi.fn(),
  };

  const _mockKeytarIsAvailable = vi.fn();
  const _mockKeytarInstance = {
    store: vi.fn(),
    retrieve: vi.fn(),
    validate: vi.fn(),
    clear: vi.fn(),
  };

  const _mockFileFallbackInstance = {
    store: vi.fn(),
    retrieve: vi.fn(),
    validate: vi.fn(),
    clear: vi.fn(),
  };

  const _mockReadFileSync = vi.fn();

  return {
    mockConfigManagerInstance: _mockConfigManagerInstance,
    mockKeytarIsAvailable: _mockKeytarIsAvailable,
    mockKeytarInstance: _mockKeytarInstance,
    mockFileFallbackInstance: _mockFileFallbackInstance,
    mockReadFileSync: _mockReadFileSync,
  };
});

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/config/config-manager.js', () => ({
  ConfigManager: vi.fn(() => mockConfigManagerInstance),
}));

vi.mock('../../src/auth/keytar-strategy.js', () => ({
  KeytarStrategy: Object.assign(
    vi.fn(() => mockKeytarInstance),
    { isAvailable: mockKeytarIsAvailable },
  ),
}));

vi.mock('../../src/auth/file-fallback.js', () => ({
  FileFallbackStrategy: vi.fn(() => mockFileFallbackInstance),
}));

vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------

import { reconfigurePat } from '../../src/cli/reconfigure-pat.js';

// ---------------------------------------------------------------------------
// Sentinel error thrown by process.exit mock to halt execution
// ---------------------------------------------------------------------------

class ProcessExitError extends Error {
  public readonly code: number | undefined;
  constructor(code?: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capture console.log output for assertion. */
function captureConsoleLog(): string[] {
  const logs: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  });
  return logs;
}

/** Capture console.error output for assertion. */
function captureConsoleError(): string[] {
  const errors: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });
  return errors;
}

/** Default config returned by ConfigManager.load(). */
function makeConfig(): { organizationUrl: string; project: string } {
  return {
    organizationUrl: 'https://dev.azure.com/test-org',
    project: 'TestProject',
  };
}

/** Set up mocks for a successful happy path. */
function setupHappyPath(): void {
  mockConfigManagerInstance.load.mockResolvedValue(makeConfig());
  mockReadFileSync.mockReturnValue('  my-pat-token  ');
  mockKeytarIsAvailable.mockResolvedValue(true);
  mockKeytarInstance.validate.mockResolvedValue({
    valid: true,
    missingScopes: [],
    excessiveScopes: [],
  });
  mockKeytarInstance.store.mockResolvedValue(undefined);
}

/**
 * Call reconfigurePat() and catch the ProcessExitError thrown by
 * the process.exit mock. Returns any ProcessExitError that was thrown.
 */
async function runAndCatchExit(): Promise<ProcessExitError | undefined> {
  try {
    await reconfigurePat();
  } catch (error: unknown) {
    if (error instanceof ProcessExitError) {
      return error;
    }
    throw error;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  setupHappyPath();
  // Mock process.exit to throw a sentinel so execution halts like real runtime
  vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
    throw new ProcessExitError(code as number | undefined);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reconfigurePat', () => {
  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('happy path (keytar available)', () => {
    it('loads existing config from ConfigManager', async () => {
      captureConsoleLog();
      captureConsoleError();
      await runAndCatchExit();

      expect(mockConfigManagerInstance.load).toHaveBeenCalledTimes(1);
    });

    it('reads PAT from stdin and trims whitespace', async () => {
      captureConsoleLog();
      captureConsoleError();
      await runAndCatchExit();

      // validate receives the trimmed PAT
      expect(mockKeytarInstance.validate).toHaveBeenCalledWith(
        'my-pat-token',
        'https://dev.azure.com/test-org',
      );
    });

    it('validates PAT against the organization URL', async () => {
      captureConsoleLog();
      captureConsoleError();
      await runAndCatchExit();

      expect(mockKeytarInstance.validate).toHaveBeenCalledWith(
        'my-pat-token',
        'https://dev.azure.com/test-org',
      );
    });

    it('stores PAT via keytar strategy', async () => {
      captureConsoleLog();
      captureConsoleError();
      await runAndCatchExit();

      expect(mockKeytarInstance.store).toHaveBeenCalledWith('my-pat-token');
    });

    it('prints success message mentioning OS keychain', async () => {
      const logs = captureConsoleLog();
      captureConsoleError();
      await runAndCatchExit();

      expect(logs.some((l) => l.includes('PAT stored successfully'))).toBe(true);
      expect(logs.some((l) => l.includes('OS keychain'))).toBe(true);
    });

    it('does not call process.exit on success', async () => {
      captureConsoleLog();
      captureConsoleError();
      const exitError = await runAndCatchExit();

      expect(exitError).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // File fallback
  // -------------------------------------------------------------------------

  describe('file fallback (keytar unavailable)', () => {
    it('uses FileFallbackStrategy when keytar is not available', async () => {
      mockKeytarIsAvailable.mockResolvedValue(false);
      mockFileFallbackInstance.validate.mockResolvedValue({
        valid: true,
        missingScopes: [],
        excessiveScopes: [],
      });
      mockFileFallbackInstance.store.mockResolvedValue(undefined);

      const logs = captureConsoleLog();
      captureConsoleError();
      await runAndCatchExit();

      expect(mockFileFallbackInstance.validate).toHaveBeenCalledWith(
        'my-pat-token',
        'https://dev.azure.com/test-org',
      );
      expect(mockFileFallbackInstance.store).toHaveBeenCalledWith('my-pat-token');
      expect(logs.some((l) => l.includes('file'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Validation failure
  // -------------------------------------------------------------------------

  describe('validation failure', () => {
    it('exits with code 1 when PAT validation fails', async () => {
      mockKeytarInstance.validate.mockResolvedValue({
        valid: false,
        missingScopes: ['Work Items: Read & Write'],
        excessiveScopes: [],
      });

      const errors = captureConsoleError();
      captureConsoleLog();
      const exitError = await runAndCatchExit();

      expect(errors.some((e) => e.includes('PAT validation failed'))).toBe(true);
      expect(errors.some((e) => e.includes('Work Items: Read & Write'))).toBe(true);
      expect(exitError?.code).toBe(1);
    });

    it('exits with code 1 when validation fails with no missing scopes', async () => {
      mockKeytarInstance.validate.mockResolvedValue({
        valid: false,
        missingScopes: [],
        excessiveScopes: [],
      });

      captureConsoleError();
      captureConsoleLog();
      const exitError = await runAndCatchExit();

      expect(exitError?.code).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Config not found
  // -------------------------------------------------------------------------

  describe('config not found', () => {
    it('exits with code 1 when config cannot be loaded', async () => {
      mockConfigManagerInstance.load.mockRejectedValue(
        new Error('Config file not found'),
      );

      const errors = captureConsoleError();
      captureConsoleLog();
      const exitError = await runAndCatchExit();

      expect(errors.some((e) => e.includes('not initialized'))).toBe(true);
      expect(exitError?.code).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Empty PAT
  // -------------------------------------------------------------------------

  describe('empty PAT', () => {
    it('exits with code 1 when stdin returns empty string', async () => {
      mockReadFileSync.mockReturnValue('   ');

      const errors = captureConsoleError();
      captureConsoleLog();
      const exitError = await runAndCatchExit();

      expect(errors.some((e) => e.includes('PAT cannot be empty'))).toBe(true);
      expect(exitError?.code).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Stdin read failure
  // -------------------------------------------------------------------------

  describe('stdin read failure', () => {
    it('exits with code 1 when readFileSync throws', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('EAGAIN');
      });

      const errors = captureConsoleError();
      captureConsoleLog();
      const exitError = await runAndCatchExit();

      expect(errors.some((e) => e.includes('Could not read PAT from stdin'))).toBe(
        true,
      );
      expect(exitError?.code).toBe(1);
    });
  });
});
