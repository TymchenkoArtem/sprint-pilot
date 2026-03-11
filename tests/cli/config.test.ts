/**
 * Unit tests for src/cli/config.ts -- runConfigCli()
 *
 * Tests the CLI config display and set commands.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock instances
// ---------------------------------------------------------------------------

const {
  mockConfigManagerInstance,
  mockProcessExit,
} = vi.hoisted(() => {
  return {
    mockConfigManagerInstance: {
      exists: vi.fn().mockResolvedValue(true),
      load: vi.fn(),
      write: vi.fn().mockResolvedValue(undefined),
    },
    mockProcessExit: vi.fn() as unknown as (code?: number) => never,
  };
});

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/config/config-manager.js', () => ({
  ConfigManager: vi.fn(() => mockConfigManagerInstance),
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import { runConfigCli } from '../../src/cli/config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function captureConsoleLog(): string[] {
  const logs: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  });
  return logs;
}

function captureConsoleError(): string[] {
  const errors: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });
  return errors;
}

/** A valid config fixture. */
function validConfig() {
  return {
    organizationUrl: 'https://dev.azure.com/my-org',
    project: 'MyProject',
    team: 'MyTeam',
    allowedWorkItemTypes: ['User Story', 'Bug', 'Task'],
    statusMapping: {
      'User Story': { blocked: 'Blocked', inProgress: 'Active', inReview: 'Resolved' },
    },
    git: {
      baseBranchOrTag: 'develop',
      prTargetBranch: 'develop',
      branchTemplate: 'features/{id}-{slug}',
      commitTemplate: '#{id}: {description}',
    },
    testing: {
      testCommand: 'npm test',
      devServerCommand: 'npm run dev',
    },
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.spyOn(process, 'exit').mockImplementation(mockProcessExit);
  mockConfigManagerInstance.load.mockResolvedValue(validConfig());
  mockConfigManagerInstance.write.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  mockConfigManagerInstance.load.mockReset();
  mockConfigManagerInstance.write.mockReset();
  mockConfigManagerInstance.exists.mockReset();
  (mockProcessExit as unknown as ReturnType<typeof vi.fn>).mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runConfigCli', () => {
  // -------------------------------------------------------------------------
  // Display (no subcommand)
  // -------------------------------------------------------------------------

  describe('display config', () => {
    it('loads and displays config in readable format', async () => {
      const logs = captureConsoleLog();

      await runConfigCli(undefined, []);

      expect(mockConfigManagerInstance.load).toHaveBeenCalledTimes(1);
      const output = logs.join('\n');
      expect(output).toContain('SprintPilot Configuration');
      expect(output).toContain('https://dev.azure.com/my-org');
      expect(output).toContain('MyProject');
      expect(output).toContain('MyTeam');
      expect(output).toContain('develop');
      expect(output).toContain('features/{id}-{slug}');
      expect(output).toContain('npm test');
      expect(output).toContain('npm run dev');
    });

    it('exits 1 when not initialized', async () => {
      captureConsoleLog();
      const errors = captureConsoleError();
      mockConfigManagerInstance.load.mockRejectedValue(new Error('config missing'));

      await runConfigCli(undefined, []);

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(errors.some((e) => e.includes('not initialized'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // set subcommand
  // -------------------------------------------------------------------------

  describe('set', () => {
    it('updates a top-level field', async () => {
      const logs = captureConsoleLog();

      await runConfigCli('set', ['project', 'NewProject']);

      expect(mockConfigManagerInstance.write).toHaveBeenCalledTimes(1);
      const written = mockConfigManagerInstance.write.mock.calls[0][0] as Record<string, unknown>;
      expect(written.project).toBe('NewProject');
      expect(logs.some((l) => l.includes('Updated "project"'))).toBe(true);
    });

    it('updates a nested field (git.branchTemplate)', async () => {
      captureConsoleLog();

      await runConfigCli('set', ['git.branchTemplate', 'feat/{id}']);

      const written = mockConfigManagerInstance.write.mock.calls[0][0] as Record<string, unknown>;
      const git = written.git as Record<string, unknown>;
      expect(git.branchTemplate).toBe('feat/{id}');
    });

    it('allows updating organizationUrl (no locked fields at CLI)', async () => {
      captureConsoleLog();

      await runConfigCli('set', ['organizationUrl', 'https://dev.azure.com/new-org']);

      const written = mockConfigManagerInstance.write.mock.calls[0][0] as Record<string, unknown>;
      expect(written.organizationUrl).toBe('https://dev.azure.com/new-org');
    });

    it('joins multi-word values', async () => {
      captureConsoleLog();

      await runConfigCli('set', ['git.commitTemplate', '#{id}:', '{description}', 'extra']);

      const written = mockConfigManagerInstance.write.mock.calls[0][0] as Record<string, unknown>;
      const git = written.git as Record<string, unknown>;
      expect(git.commitTemplate).toBe('#{id}: {description} extra');
    });

    it('exits 1 when key is missing', async () => {
      captureConsoleLog();
      const errors = captureConsoleError();

      await runConfigCli('set', []);

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(errors.some((e) => e.includes('Usage:'))).toBe(true);
    });

    it('exits 1 when value is missing', async () => {
      captureConsoleLog();
      const errors = captureConsoleError();

      await runConfigCli('set', ['project']);

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(errors.some((e) => e.includes('Usage:'))).toBe(true);
    });

    it('exits 1 when Zod validation fails', async () => {
      captureConsoleLog();
      const errors = captureConsoleError();

      // Set organizationUrl to an invalid URL
      await runConfigCli('set', ['organizationUrl', 'not-a-url']);

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(errors.some((e) => e.includes('Validation error'))).toBe(true);
    });

    it('exits 1 when config not initialized', async () => {
      captureConsoleLog();
      const errors = captureConsoleError();
      mockConfigManagerInstance.load.mockRejectedValue(new Error('config missing'));

      await runConfigCli('set', ['project', 'NewProject']);

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(errors.some((e) => e.includes('not initialized'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Unknown subcommand
  // -------------------------------------------------------------------------

  describe('unknown subcommand', () => {
    it('exits 1 for unknown subcommand', async () => {
      captureConsoleLog();
      const errors = captureConsoleError();

      await runConfigCli('foobar', []);

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(errors.some((e) => e.includes('Unknown config subcommand: foobar'))).toBe(true);
    });
  });
});
