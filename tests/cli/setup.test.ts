/**
 * Unit tests for src/cli/setup.ts -- runSetup()
 *
 * All external I/O (fs, import.meta.url, init-core) is mocked at the module level.
 * Tests verify each step of the setup flow:
 *   - [1/5] slash command installation (to user home)
 *   - [2/5] multi-server MCP registration
 *   - [3/5] .gitignore updates
 *   - [4/5] prerequisites check (fabric/)
 *   - [5/5] interactive initialization
 *   - closing message
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Hoisted mock instances -- available inside vi.mock() factories
// ---------------------------------------------------------------------------

const {
  mockReadFile,
  mockWriteFile,
  mockMkdir,
  mockReaddir,
  mockCopyFile,
  mockAccess,
  mockHomedir,
  mockDirectoryExists,
  mockSelectAuthStrategy,
  mockRunInitPipeline,
  mockConfigManagerInstance,
  mockCreateInterface,
  mockExecSync,
} = vi.hoisted(() => {
  return {
    mockReadFile: vi.fn(),
    mockWriteFile: vi.fn().mockResolvedValue(undefined),
    mockMkdir: vi.fn().mockResolvedValue(undefined),
    mockReaddir: vi.fn(),
    mockCopyFile: vi.fn().mockResolvedValue(undefined),
    mockAccess: vi.fn(),
    mockHomedir: vi.fn(() => '/fake/home'),
    mockDirectoryExists: vi.fn().mockResolvedValue(false),
    mockSelectAuthStrategy: vi.fn(),
    mockRunInitPipeline: vi.fn(),
    mockConfigManagerInstance: {
      exists: vi.fn().mockResolvedValue(false),
      load: vi.fn(),
      write: vi.fn(),
    },
    mockCreateInterface: vi.fn(),
    mockExecSync: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  readdir: mockReaddir,
  copyFile: mockCopyFile,
  access: mockAccess,
}));

// Mock import.meta.url resolution by mocking node:url
vi.mock('node:url', () => ({
  fileURLToPath: vi.fn(() => '/fake/dist/cli/setup.js'),
}));

// Mock node:os for homedir
vi.mock('node:os', () => ({
  homedir: mockHomedir,
}));

// Mock node:readline for interactive prompts
vi.mock('node:readline', () => ({
  createInterface: mockCreateInterface,
}));

// Mock node:child_process for git branch detection
vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}));

// Mock init-core
vi.mock('../../src/shared/init-core.js', () => ({
  directoryExists: mockDirectoryExists,
  selectAuthStrategy: mockSelectAuthStrategy,
  runInitPipeline: mockRunInitPipeline,
  InitValidationError: class InitValidationError extends Error {
    missingScopes: string[];
    constructor(message: string, missingScopes: string[]) {
      super(message);
      this.name = 'InitValidationError';
      this.missingScopes = missingScopes;
    }
  },
}));

// Mock config-manager
vi.mock('../../src/config/config-manager.js', () => ({
  ConfigManager: vi.fn(() => mockConfigManagerInstance),
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------

import { runSetup } from '../../src/cli/setup.js';
import { InitValidationError } from '../../src/shared/init-core.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize path separators to forward slashes for cross-platform matching. */
function norm(p: string): string {
  return p.replace(/\\/g, '/');
}

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

/**
 * Default mock setup: source template directories are empty,
 * activity log does not exist, .gitignore does not exist,
 * MCP config file does not exist, fabric missing.
 */
function setupDefaultMocks(): void {
  // readdir: source template dirs are empty
  mockReaddir.mockRejectedValue(new Error('ENOENT'));
  // access: nothing exists
  mockAccess.mockRejectedValue(new Error('ENOENT'));
  // readFile: no files exist
  mockReadFile.mockRejectedValue(new Error('ENOENT'));
  // writeFile and mkdir succeed
  mockWriteFile.mockResolvedValue(undefined);
  mockMkdir.mockResolvedValue(undefined);
  mockCopyFile.mockResolvedValue(undefined);

  // init-core: fabric/ not found by default
  mockDirectoryExists.mockResolvedValue(false);
  mockConfigManagerInstance.exists.mockResolvedValue(false);
}

/**
 * Create a mock readline interface that answers questions in sequence.
 */
function setupReadlineAnswers(answers: string[]): void {
  let idx = 0;
  mockCreateInterface.mockImplementation(() => {
    return {
      question: (_prompt: string, callback: (answer: string) => void) => {
        callback(answers[idx++] ?? '');
      },
      close: vi.fn(),
    };
  });
}

/**
 * Parse the MCP config JSON written to a specific path.
 * Returns null if no write was made to that path.
 */
function getWrittenMcpConfig(configPathSubstring: string): Record<string, unknown> | null {
  const writeFileCalls = mockWriteFile.mock.calls as unknown[][];
  const configWrite = writeFileCalls.find(
    (call) => norm(String(call[0])).includes(configPathSubstring),
  );
  if (!configWrite) return null;
  return JSON.parse(String(configWrite[1])) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  setupDefaultMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runSetup', () => {
  // -------------------------------------------------------------------------
  // Directory creation
  // -------------------------------------------------------------------------

  describe('directory creation', () => {
    it('creates .sprint-pilot/workflows directory', async () => {
      captureConsoleLog();
      await runSetup('claude');

      const mkdirCalls = mockMkdir.mock.calls.map(
        (call: unknown[]) => norm(String(call[0])),
      );

      expect(mkdirCalls.some((p) => p.includes('.sprint-pilot/workflows'))).toBe(true);

      for (const call of mockMkdir.mock.calls) {
        const options = call[1] as { recursive: boolean } | undefined;
        expect(options?.recursive).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // [1/5] Slash command installation
  // -------------------------------------------------------------------------

  describe('[1/5] slash command installation', () => {
    it('logs step header', async () => {
      const logs = captureConsoleLog();
      await runSetup('claude');

      expect(logs.some((l) => l.includes('[1/5] Installing slash commands'))).toBe(true);
    });

    it('copies commands to ~/.claude/commands/ for claude tool', async () => {
      const logs = captureConsoleLog();

      const pkgTemplates = join('/fake/dist/cli', '..', '..', 'templates');
      const commandsDir = join(pkgTemplates, 'commands');

      mockReaddir.mockImplementation(async (path: unknown) => {
        const pathStr = String(path);
        if (pathStr === commandsDir) return ['sp-start.md'];
        throw new Error('ENOENT');
      });

      mockAccess.mockRejectedValue(new Error('ENOENT'));

      await runSetup('claude');

      expect(mockCopyFile).toHaveBeenCalledTimes(1);
      const destPath = norm(String(mockCopyFile.mock.calls[0][1]));
      expect(destPath).toContain('/fake/home/.claude/commands/sp-start.md');
      expect(logs.some((l) => l.includes('\u2713 Copied 1 slash commands'))).toBe(true);
    });

    it('copies commands to ~/.cursor/commands/ for cursor tool', async () => {
      const logs = captureConsoleLog();

      const pkgTemplates = join('/fake/dist/cli', '..', '..', 'templates');
      const commandsDir = join(pkgTemplates, 'commands');

      mockReaddir.mockImplementation(async (path: unknown) => {
        const pathStr = String(path);
        if (pathStr === commandsDir) return ['sp-help.md'];
        throw new Error('ENOENT');
      });

      mockAccess.mockRejectedValue(new Error('ENOENT'));

      await runSetup('cursor');

      expect(mockCopyFile).toHaveBeenCalledTimes(1);
      const destPath = norm(String(mockCopyFile.mock.calls[0][1]));
      expect(destPath).toContain('/fake/home/.cursor/commands/sp-help.md');
      expect(logs.some((l) => l.includes('\u2713 Copied 1 slash commands'))).toBe(true);
    });

    it('shows not applicable for copilot tool (no slash commands)', async () => {
      const logs = captureConsoleLog();
      await runSetup('copilot');

      expect(logs.some((l) => l.includes('\u2713 Not applicable for GitHub Copilot'))).toBe(true);
    });

    it('shows not applicable for augment tool (no slash commands)', async () => {
      const logs = captureConsoleLog();
      await runSetup('augment');

      expect(logs.some((l) => l.includes('\u2713 Not applicable for Augment'))).toBe(true);
    });

    it('logs checkmark when commands already present', async () => {
      const logs = captureConsoleLog();

      const pkgTemplates = join('/fake/dist/cli', '..', '..', 'templates');
      const commandsDir = join(pkgTemplates, 'commands');
      const destFile = join('/fake/home', '.claude', 'commands', 'sp-start.md');

      mockReaddir.mockImplementation(async (path: unknown) => {
        const pathStr = String(path);
        if (pathStr === commandsDir) return ['sp-start.md'];
        throw new Error('ENOENT');
      });

      mockAccess.mockImplementation(async (path: unknown) => {
        const n = norm(String(path));
        if (n === norm(destFile)) return;
        throw new Error('ENOENT');
      });

      await runSetup('claude');

      expect(logs.some((l) => l.includes('\u2713 Slash commands already present'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // [2/6] MCP server registration
  // -------------------------------------------------------------------------

  describe('[2/5] MCP server registration', () => {
    it('registers 4 MCP servers for claude (including http microsoft-learn)', async () => {
      const logs = captureConsoleLog();
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await runSetup('claude');

      expect(logs.some((l) => l.includes('[2/5] Registering MCP servers'))).toBe(true);
      expect(logs.some((l) => l.includes('sprint-pilot registered'))).toBe(true);
      expect(logs.some((l) => l.includes('playwright registered'))).toBe(true);
      expect(logs.some((l) => l.includes('chrome-devtools registered'))).toBe(true);
      expect(logs.some((l) => l.includes('microsoft-learn registered'))).toBe(true);
    });

    it('registers 4 MCP servers for copilot (including http microsoft-learn)', async () => {
      const logs = captureConsoleLog();
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await runSetup('copilot');

      expect(logs.some((l) => l.includes('sprint-pilot registered'))).toBe(true);
      expect(logs.some((l) => l.includes('playwright registered'))).toBe(true);
      expect(logs.some((l) => l.includes('chrome-devtools registered'))).toBe(true);
      expect(logs.some((l) => l.includes('microsoft-learn registered'))).toBe(true);
    });

    it('registers 3 MCP servers for cursor (excludes microsoft-learn)', async () => {
      const logs = captureConsoleLog();
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await runSetup('cursor');

      expect(logs.some((l) => l.includes('sprint-pilot registered'))).toBe(true);
      expect(logs.some((l) => l.includes('playwright registered'))).toBe(true);
      expect(logs.some((l) => l.includes('chrome-devtools registered'))).toBe(true);
      expect(logs.every((l) => !l.includes('microsoft-learn'))).toBe(true);
    });

    it('registers 3 MCP servers for augment (excludes microsoft-learn)', async () => {
      const logs = captureConsoleLog();
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await runSetup('augment');

      expect(logs.some((l) => l.includes('sprint-pilot registered'))).toBe(true);
      expect(logs.some((l) => l.includes('playwright registered'))).toBe(true);
      expect(logs.some((l) => l.includes('chrome-devtools registered'))).toBe(true);
      expect(logs.every((l) => !l.includes('microsoft-learn'))).toBe(true);
    });

    it('microsoft-learn entry uses http transport with correct URL', async () => {
      captureConsoleLog();
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await runSetup('claude');

      const written = getWrittenMcpConfig('.claude.json');
      expect(written).not.toBeNull();
      const servers = written!['mcpServers'] as Record<string, unknown>;
      expect(servers['microsoft-learn']).toEqual({
        type: 'http',
        url: 'https://learn.microsoft.com/api/mcp',
      });
    });

    it('skips servers that are already registered', async () => {
      const logs = captureConsoleLog();
      const expectedPath = join('/fake/home', '.claude.json');

      mockReadFile.mockImplementation(async (path: unknown) => {
        if (norm(String(path)) === norm(expectedPath)) {
          return JSON.stringify({
            mcpServers: {
              'sprint-pilot': { command: 'old-command' },
              'playwright': { command: 'old-pw' },
            },
          });
        }
        throw new Error('ENOENT');
      });

      await runSetup('claude');

      expect(logs.some((l) => l.includes('sprint-pilot already registered'))).toBe(true);
      expect(logs.some((l) => l.includes('playwright already registered'))).toBe(true);
      expect(logs.some((l) => l.includes('chrome-devtools registered') && !l.includes('already'))).toBe(true);
      expect(logs.some((l) => l.includes('microsoft-learn registered') && !l.includes('already'))).toBe(true);
    });

    it('does not write config when all servers already registered', async () => {
      captureConsoleLog();
      const expectedPath = join('/fake/home', '.claude.json');

      mockReadFile.mockImplementation(async (path: unknown) => {
        if (norm(String(path)) === norm(expectedPath)) {
          return JSON.stringify({
            mcpServers: {
              'sprint-pilot': { command: 'npx' },
              'playwright': { command: 'npx' },
              'chrome-devtools': { command: 'npx' },
              'microsoft-learn': { type: 'http', url: 'https://learn.microsoft.com/api/mcp' },
            },
          });
        }
        throw new Error('ENOENT');
      });

      await runSetup('claude');

      const writeFileCalls = mockWriteFile.mock.calls as unknown[][];
      const configWrite = writeFileCalls.find(
        (call) => norm(String(call[0])) === norm(expectedPath),
      );
      expect(configWrite).toBeUndefined();
    });

    it('creates .claude.json with all server entries for claude tool', async () => {
      captureConsoleLog();
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await runSetup('claude');

      const written = getWrittenMcpConfig('.claude.json');
      expect(written).not.toBeNull();
      const servers = written!['mcpServers'] as Record<string, unknown>;
      expect(servers['sprint-pilot']).toEqual({
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'sprint-pilot', 'serve'],
      });
      expect(servers['playwright']).toBeDefined();
      expect(servers['chrome-devtools']).toBeDefined();
      expect(servers['microsoft-learn']).toBeDefined();
    });

    it('creates ~/.cursor/mcp.json with mcpServers key for cursor tool', async () => {
      captureConsoleLog();
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await runSetup('cursor');

      const expectedPath = join('/fake/home', '.cursor', 'mcp.json');
      const writeFileCalls = mockWriteFile.mock.calls as unknown[][];
      const configWrite = writeFileCalls.find(
        (call) => norm(String(call[0])) === norm(expectedPath),
      );

      expect(configWrite).toBeDefined();
      const written = JSON.parse(String(configWrite![1])) as Record<string, unknown>;
      expect(written['mcpServers']).toBeDefined();
      const servers = written['mcpServers'] as Record<string, unknown>;
      expect(servers['sprint-pilot']).toBeDefined();
      expect(servers['playwright']).toBeDefined();
      expect(servers['chrome-devtools']).toBeDefined();
      // microsoft-learn should NOT be present for cursor
      expect(servers['microsoft-learn']).toBeUndefined();
    });

    it('creates platform-specific VS Code mcp.json with servers key for copilot tool', async () => {
      captureConsoleLog();
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await runSetup('copilot');

      const writeFileCalls = mockWriteFile.mock.calls as unknown[][];
      const configWrite = writeFileCalls.find((call) =>
        norm(String(call[0])).includes('Code/User/mcp.json'),
      );

      expect(configWrite).toBeDefined();
      const written = JSON.parse(String(configWrite![1])) as Record<string, unknown>;
      expect(written['servers']).toBeDefined();
      const servers = written['servers'] as Record<string, unknown>;
      expect(servers['sprint-pilot']).toBeDefined();
      expect(servers['microsoft-learn']).toBeDefined();
    });

    it('creates ~/.augment/mcp.json with mcpServers key for augment tool', async () => {
      captureConsoleLog();
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await runSetup('augment');

      const expectedPath = join('/fake/home', '.augment', 'mcp.json');
      const writeFileCalls = mockWriteFile.mock.calls as unknown[][];
      const configWrite = writeFileCalls.find(
        (call) => norm(String(call[0])) === norm(expectedPath),
      );

      expect(configWrite).toBeDefined();
      const written = JSON.parse(String(configWrite![1])) as Record<string, unknown>;
      expect(written['mcpServers']).toBeDefined();
    });

    it('preserves existing config entries when patching', async () => {
      captureConsoleLog();
      const expectedPath = join('/fake/home', '.claude.json');

      mockReadFile.mockImplementation(async (path: unknown) => {
        if (norm(String(path)) === norm(expectedPath)) {
          return JSON.stringify({
            mcpServers: { 'other-server': { command: 'other' } },
            customKey: 'custom-value',
          });
        }
        throw new Error('ENOENT');
      });

      await runSetup('claude');

      const written = getWrittenMcpConfig('.claude.json');
      expect(written).not.toBeNull();
      expect(written!['customKey']).toBe('custom-value');
      const servers = written!['mcpServers'] as Record<string, unknown>;
      expect(servers['other-server']).toEqual({ command: 'other' });
      expect(servers['sprint-pilot']).toBeDefined();
    });

    it('handles invalid JSON in existing config file gracefully', async () => {
      const logs = captureConsoleLog();
      const expectedPath = join('/fake/home', '.claude.json');

      mockReadFile.mockImplementation(async (path: unknown) => {
        if (norm(String(path)) === norm(expectedPath)) {
          return '{ invalid json !!!';
        }
        throw new Error('ENOENT');
      });

      await runSetup('claude');

      const written = getWrittenMcpConfig('.claude.json');
      expect(written).not.toBeNull();
      expect(logs.some((l) => l.includes('sprint-pilot registered'))).toBe(true);
    });

    it('creates parent directory for nested config paths', async () => {
      captureConsoleLog();
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await runSetup('cursor');

      const mkdirCalls = mockMkdir.mock.calls.map(
        (call: unknown[]) => norm(String(call[0])),
      );
      expect(mkdirCalls.some((p) => p.includes('/fake/home') && p.includes('.cursor'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // [3/6] .gitignore updates
  // -------------------------------------------------------------------------

  describe('[3/5] .gitignore updates', () => {
    it('creates .gitignore with entries when it does not exist', async () => {
      const logs = captureConsoleLog();
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await runSetup('claude');

      const writeFileCalls = mockWriteFile.mock.calls as unknown[][];
      const gitignoreWrite = writeFileCalls.find(
        (call) => String(call[0]) === '.gitignore',
      );
      expect(gitignoreWrite).toBeDefined();
      const content = String(gitignoreWrite![1]);
      expect(content).toContain('.sprint-pilot/');
      expect(logs.some((l) => l.includes('[3/5] Updating .gitignore'))).toBe(true);
      expect(logs.some((l) => l.includes('\u2713 Added'))).toBe(true);
    });

    it('appends missing entries to existing .gitignore', async () => {
      captureConsoleLog();

      mockReadFile.mockImplementation(async (path: unknown) => {
        const pathStr = String(path);
        if (pathStr === '.gitignore') {
          return 'node_modules/\ndist/\n';
        }
        throw new Error('ENOENT');
      });

      await runSetup('claude');

      const writeFileCalls = mockWriteFile.mock.calls as unknown[][];
      const gitignoreWrite = writeFileCalls.find(
        (call) => String(call[0]) === '.gitignore',
      );
      expect(gitignoreWrite).toBeDefined();
      const content = String(gitignoreWrite![1]);
      expect(content).toContain('node_modules/');
      expect(content).toContain('dist/');
      expect(content).toContain('.sprint-pilot/');
    });

    it('does not duplicate entries already in .gitignore', async () => {
      const logs = captureConsoleLog();

      mockReadFile.mockImplementation(async (path: unknown) => {
        const pathStr = String(path);
        if (pathStr === '.gitignore') {
          return '.sprint-pilot/\n.claude/settings.local.json\n';
        }
        throw new Error('ENOENT');
      });

      await runSetup('claude');

      expect(logs.some((l) => l.includes('\u2713 Already up to date'))).toBe(true);
    });

    it('adds newline before appending if .gitignore does not end with one', async () => {
      captureConsoleLog();

      mockReadFile.mockImplementation(async (path: unknown) => {
        const pathStr = String(path);
        if (pathStr === '.gitignore') {
          return 'node_modules/'; // No trailing newline
        }
        throw new Error('ENOENT');
      });

      await runSetup('claude');

      const writeFileCalls = mockWriteFile.mock.calls as unknown[][];
      const gitignoreWrite = writeFileCalls.find(
        (call) => String(call[0]) === '.gitignore',
      );
      expect(gitignoreWrite).toBeDefined();
      const content = String(gitignoreWrite![1]);
      expect(content).toMatch(/node_modules\/\n\.sprint-pilot/);
    });
  });

  // -------------------------------------------------------------------------
  // [4/5] Prerequisites check
  // -------------------------------------------------------------------------

  describe('[4/5] prerequisites check', () => {
    it('shows checkmark when both fabric/ and fabric/product/ exist', async () => {
      const logs = captureConsoleLog();
      mockDirectoryExists.mockResolvedValue(true);
      mockConfigManagerInstance.exists.mockResolvedValue(true);

      await runSetup('claude');

      expect(logs.some((l) => l.includes('[4/5] Checking prerequisites'))).toBe(true);
      expect(logs.some((l) => l.includes('\u2713 fabric/ and fabric/product/ found'))).toBe(true);
    });

    it('shows warning when fabric/ is missing', async () => {
      const logs = captureConsoleLog();
      mockDirectoryExists.mockResolvedValue(false);

      await runSetup('claude');

      expect(logs.some((l) => l.includes('\u26A0 fabric/ directory not found.'))).toBe(true);
      expect(logs.some((l) => l.includes('Without fabric/'))).toBe(true);
    });

    it('shows warning when fabric-cli is not installed', async () => {
      const logs = captureConsoleLog();
      mockDirectoryExists.mockResolvedValue(false);

      await runSetup('claude');

      expect(logs.some((l) => l.includes('\u26A0 fabric-cli not detected'))).toBe(true);
      expect(logs.some((l) => l.includes('SprintPilot will work without it'))).toBe(true);
    });

    it('shows warning when fabric/product/ is missing', async () => {
      const logs = captureConsoleLog();
      mockDirectoryExists.mockImplementation(async (path: string) => {
        if (path === 'fabric') return true;
        return false; // fabric/product
      });

      await runSetup('claude');

      expect(logs.some((l) => l.includes('\u26A0 fabric/product/ directory not found.'))).toBe(true);
      expect(logs.some((l) => l.includes('/plan-product'))).toBe(true);
    });

    it('does not block init when fabric/ is missing', async () => {
      const logs = captureConsoleLog();
      mockDirectoryExists.mockResolvedValue(false);
      mockConfigManagerInstance.exists.mockResolvedValue(false);

      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

      await runSetup('claude');

      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });

      // Step 5 should still execute (shows non-TTY skip, not fabric skip)
      expect(logs.some((l) => l.includes('[5/5] Project configuration'))).toBe(true);
      expect(logs.some((l) => l.includes('not an interactive terminal'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // [5/5] Interactive init
  // -------------------------------------------------------------------------

  describe('[5/5] interactive init', () => {
    it('shows step header', async () => {
      const logs = captureConsoleLog();
      await runSetup('claude');

      expect(logs.some((l) => l.includes('[5/5] Project configuration'))).toBe(true);
    });

    it('shows already initialized when config exists', async () => {
      const logs = captureConsoleLog();
      mockDirectoryExists.mockResolvedValue(true);
      mockConfigManagerInstance.exists.mockResolvedValue(true);

      await runSetup('claude');

      expect(logs.some((l) => l.includes('\u2713 Already initialized. Run "sprint-pilot init"'))).toBe(true);
      expect(mockRunInitPipeline).not.toHaveBeenCalled();
    });

    it('skips init when stdin is not a TTY', async () => {
      const logs = captureConsoleLog();
      mockDirectoryExists.mockResolvedValue(true);
      mockConfigManagerInstance.exists.mockResolvedValue(false);

      // Ensure stdin.isTTY is falsy (default in test env)
      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

      await runSetup('claude');

      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });

      expect(logs.some((l) => l.includes('not an interactive terminal'))).toBe(true);
      expect(mockRunInitPipeline).not.toHaveBeenCalled();
    });

    it('skips init when PAT is empty', async () => {
      const logs = captureConsoleLog();
      mockDirectoryExists.mockResolvedValue(true);
      mockConfigManagerInstance.exists.mockResolvedValue(false);

      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      // First answer (PAT) is empty
      setupReadlineAnswers(['']);

      await runSetup('claude');

      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });

      expect(logs.some((l) => l.includes('PAT cannot be empty'))).toBe(true);
      expect(mockRunInitPipeline).not.toHaveBeenCalled();
    });

    it('skips init when organization URL is empty', async () => {
      const logs = captureConsoleLog();
      mockDirectoryExists.mockResolvedValue(true);
      mockConfigManagerInstance.exists.mockResolvedValue(false);

      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      // PAT provided, org URL empty
      setupReadlineAnswers(['my-pat', '']);

      await runSetup('claude');

      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });

      expect(logs.some((l) => l.includes('Organization URL cannot be empty'))).toBe(true);
      expect(mockRunInitPipeline).not.toHaveBeenCalled();
    });

    it('skips init when project name is empty', async () => {
      const logs = captureConsoleLog();
      mockDirectoryExists.mockResolvedValue(true);
      mockConfigManagerInstance.exists.mockResolvedValue(false);

      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      // PAT, org URL provided, project empty
      setupReadlineAnswers(['my-pat', 'https://dev.azure.com/org', '']);

      await runSetup('claude');

      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });

      expect(logs.some((l) => l.includes('Project name cannot be empty'))).toBe(true);
      expect(mockRunInitPipeline).not.toHaveBeenCalled();
    });

    it('runs full init when all prompts answered', async () => {
      const logs = captureConsoleLog();
      mockDirectoryExists.mockResolvedValue(true);
      mockConfigManagerInstance.exists.mockResolvedValue(false);
      mockExecSync.mockReturnValue('develop\n');

      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      // PAT, org, project, team (optional), base branch (accept default)
      setupReadlineAnswers([
        'my-pat-token',
        'https://dev.azure.com/my-org',
        'MyProject',
        'MyTeam',
        '', // accept detected branch
      ]);

      const mockAuthStrategy = { validate: vi.fn(), store: vi.fn(), retrieve: vi.fn(), clear: vi.fn() };
      mockSelectAuthStrategy.mockResolvedValue({
        authStrategy: mockAuthStrategy,
        keytarAvailable: true,
      });

      mockRunInitPipeline.mockResolvedValue({
        config: { project: 'MyProject' },
        authMethod: 'os_keychain',
      });

      await runSetup('claude');

      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });

      expect(mockRunInitPipeline).toHaveBeenCalledWith(
        {
          pat: 'my-pat-token',
          organizationUrl: 'https://dev.azure.com/my-org',
          project: 'MyProject',
          team: 'MyTeam',
          baseBranchOrTag: 'develop',
          prTargetBranch: 'develop',
        },
        mockAuthStrategy,
        true,
      );
      expect(logs.some((l) => l.includes('\u2713 PAT stored via OS keychain'))).toBe(true);
      expect(logs.some((l) => l.includes('\u2713 Configuration written'))).toBe(true);
    });

    it('shows already initialized regardless of --force', async () => {
      const logs = captureConsoleLog();
      mockDirectoryExists.mockResolvedValue(true);
      mockConfigManagerInstance.exists.mockResolvedValue(true);

      await runSetup('claude', { force: true });

      expect(logs.some((l) => l.includes('\u2713 Already initialized. Run "sprint-pilot init"'))).toBe(true);
      expect(mockRunInitPipeline).not.toHaveBeenCalled();
    });

    it('reports PAT validation failure', async () => {
      captureConsoleLog();
      const errors = captureConsoleError();
      mockDirectoryExists.mockResolvedValue(true);
      mockConfigManagerInstance.exists.mockResolvedValue(false);
      mockExecSync.mockReturnValue('main\n');

      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      setupReadlineAnswers([
        'bad-pat',
        'https://dev.azure.com/org',
        'Proj',
        '',
        '',
      ]);

      mockSelectAuthStrategy.mockResolvedValue({
        authStrategy: {},
        keytarAvailable: true,
      });

      mockRunInitPipeline.mockRejectedValue(
        new InitValidationError('PAT validation failed', ['Work Items: Read & Write']),
      );

      await runSetup('claude');

      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });

      expect(errors.some((l) => l.includes('PAT validation failed'))).toBe(true);
      expect(errors.some((l) => l.includes('Work Items: Read & Write'))).toBe(true);
    });

    it('uses "main" as default branch when git fails', async () => {
      captureConsoleLog();
      mockDirectoryExists.mockResolvedValue(true);
      mockConfigManagerInstance.exists.mockResolvedValue(false);
      mockExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      setupReadlineAnswers([
        'my-pat',
        'https://dev.azure.com/org',
        'Proj',
        '',
        '', // accept default
      ]);

      const mockAuthStrategy = { validate: vi.fn(), store: vi.fn(), retrieve: vi.fn(), clear: vi.fn() };
      mockSelectAuthStrategy.mockResolvedValue({
        authStrategy: mockAuthStrategy,
        keytarAvailable: true,
      });

      mockRunInitPipeline.mockResolvedValue({
        config: { project: 'Proj' },
        authMethod: 'os_keychain',
      });

      await runSetup('claude');

      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });

      expect(mockRunInitPipeline).toHaveBeenCalledWith(
        expect.objectContaining({ baseBranchOrTag: 'main' }),
        mockAuthStrategy,
        true,
      );
    });

    it('omits team from input when user skips it', async () => {
      captureConsoleLog();
      mockDirectoryExists.mockResolvedValue(true);
      mockConfigManagerInstance.exists.mockResolvedValue(false);
      mockExecSync.mockReturnValue('main\n');

      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      setupReadlineAnswers([
        'my-pat',
        'https://dev.azure.com/org',
        'Proj',
        '', // skip team
        '',
      ]);

      const mockAuthStrategy = { validate: vi.fn(), store: vi.fn(), retrieve: vi.fn(), clear: vi.fn() };
      mockSelectAuthStrategy.mockResolvedValue({
        authStrategy: mockAuthStrategy,
        keytarAvailable: true,
      });

      mockRunInitPipeline.mockResolvedValue({
        config: { project: 'Proj' },
        authMethod: 'os_keychain',
      });

      await runSetup('claude');

      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });

      const input = mockRunInitPipeline.mock.calls[0][0] as Record<string, unknown>;
      expect(input).not.toHaveProperty('team');
    });
  });

  // -------------------------------------------------------------------------
  // Console output / closing message
  // -------------------------------------------------------------------------

  describe('console output', () => {
    it('prints setup header with tool display name', async () => {
      const logs = captureConsoleLog();
      await runSetup('claude');

      expect(logs[0]).toBe('Setting up SprintPilot for Claude CLI...');
    });

    it('prints closing message with /sp-start for claude', async () => {
      const logs = captureConsoleLog();
      await runSetup('claude');

      expect(logs.some((l) => l.includes('SprintPilot is ready.'))).toBe(true);
      expect(logs.some((l) => l.includes('/sp-start'))).toBe(true);
    });

    it('prints closing message with /sp-start for cursor', async () => {
      const logs = captureConsoleLog();
      await runSetup('cursor');

      expect(logs.some((l) => l.includes('SprintPilot is ready.'))).toBe(true);
      expect(logs.some((l) => l.includes('/sp-start'))).toBe(true);
    });

    it('prints closing message with tool-specific wording for copilot', async () => {
      const logs = captureConsoleLog();
      await runSetup('copilot');

      expect(logs.some((l) => l.includes('SprintPilot is ready.'))).toBe(true);
      expect(logs.some((l) => l.includes('GitHub Copilot'))).toBe(true);
      expect(logs.some((l) => l.includes('show my work items'))).toBe(true);
    });

    it('prints closing message with tool-specific wording for augment', async () => {
      const logs = captureConsoleLog();
      await runSetup('augment');

      expect(logs.some((l) => l.includes('SprintPilot is ready.'))).toBe(true);
      expect(logs.some((l) => l.includes('Augment'))).toBe(true);
      expect(logs.some((l) => l.includes('show my work items'))).toBe(true);
    });
  });
});
