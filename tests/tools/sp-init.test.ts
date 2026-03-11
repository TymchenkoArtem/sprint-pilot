/**
 * Unit tests for the sp-init MCP tool (status-check only).
 *
 * The tool no longer accepts PAT or performs initialization.
 * It checks whether SprintPilot is configured and returns status.
 *
 * All external dependencies are mocked at the module level via vi.mock().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// ---------------------------------------------------------------------------
// Hoisted mock instances
// ---------------------------------------------------------------------------

const {
  mockConfigManagerInstance,
  mockKeytarIsAvailable,
  mockKeytarInstance,
  mockFileFallbackInstance,
  mockStat,
} = vi.hoisted(() => {
  const _mockConfigManagerInstance = {
    exists: vi.fn(),
    load: vi.fn(),
    write: vi.fn(),
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

  const _mockStat = vi.fn();

  return {
    mockConfigManagerInstance: _mockConfigManagerInstance,
    mockKeytarIsAvailable: _mockKeytarIsAvailable,
    mockKeytarInstance: _mockKeytarInstance,
    mockFileFallbackInstance: _mockFileFallbackInstance,
    mockStat: _mockStat,
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

vi.mock('node:fs/promises', () => ({
  stat: mockStat,
  access: vi.fn().mockRejectedValue(new Error('ENOENT')),
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------

import { registerSpInit } from '../../src/tools/sp-init.js';

// ---------------------------------------------------------------------------
// Handler capture
// ---------------------------------------------------------------------------

type ToolHandler = (
  args: Record<string, unknown>,
  extra: unknown,
) => Promise<{ content: Array<{ type: string; text: string }> }>;

let toolHandler: ToolHandler;

const mockServer = {
  tool: vi.fn(
    (
      _name: string,
      _desc: string,
      _schema: unknown,
      handler: ToolHandler,
    ) => {
      toolHandler = handler;
    },
  ),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseResult(
  response: { content: Array<{ type: string; text: string }> },
): Record<string, unknown> {
  return JSON.parse(response.content[0].text) as Record<string, unknown>;
}

/** Simulate stat returning isDirectory: true for fabric/, fabric/product/, and ~/fabric/. */
function setupFabricDirs(): void {
  mockStat.mockImplementation(async (path: unknown) => {
    const pathStr = String(path);
    if (
      pathStr === 'fabric' ||
      pathStr.endsWith('fabric/product') ||
      pathStr.endsWith('fabric\\product') ||
      pathStr.endsWith('/fabric') ||
      pathStr.endsWith('\\fabric')
    ) {
      return { isDirectory: () => true };
    }
    throw new Error(`ENOENT: ${pathStr}`);
  });
}

const sampleConfig = {
  organizationUrl: 'https://dev.azure.com/test-org',
  project: 'TestProject',
  allowedWorkItemTypes: ['User Story', 'Bug', 'Task'],
  statusMapping: {
    'User Story': { blocked: 'Blocked', inProgress: 'Active', inReview: 'Resolved' },
  },
  git: {
    baseBranchOrTag: 'main',
    prTargetBranch: 'main',
    branchTemplate: 'features/{id}-{slug}',
    commitTemplate: '#{id}: {description}',
  },
  testing: { testCommand: 'npm test' },
};

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockServer.tool.mockClear();
  registerSpInit(mockServer as unknown as McpServer);

  mockConfigManagerInstance.exists.mockResolvedValue(false);
  mockConfigManagerInstance.load.mockResolvedValue(sampleConfig);
  mockConfigManagerInstance.write.mockResolvedValue(undefined);

  mockKeytarIsAvailable.mockResolvedValue(true);
  mockKeytarInstance.retrieve.mockResolvedValue('stored-pat');

  mockStat.mockRejectedValue(new Error('ENOENT'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sp-init (status check)', () => {
  it('registers tool with the server', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'sp-init',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  // -------------------------------------------------------------------------
  // Fully initialized
  // -------------------------------------------------------------------------

  describe('initialized', () => {
    it('returns "initialized" when config exists and PAT is stored', async () => {
      setupFabricDirs();
      mockConfigManagerInstance.exists.mockResolvedValue(true);
      mockKeytarInstance.retrieve.mockResolvedValue('stored-pat');

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['status']).toBe('initialized');
      expect(result['pat_configured']).toBe(true);
      expect(result['auth_method']).toBe('os_keychain');
      expect(result['config']).toBeDefined();
      const fabric = result['fabric'] as Record<string, boolean>;
      expect(fabric['project_docs']).toBe(true);
      expect(fabric['product_docs']).toBe(true);
      expect(fabric['cli_installed']).toBe(true);
    });

    it('returns file_fallback auth method when keytar unavailable', async () => {
      setupFabricDirs();
      mockConfigManagerInstance.exists.mockResolvedValue(true);
      mockKeytarIsAvailable.mockResolvedValue(false);
      mockFileFallbackInstance.retrieve.mockResolvedValue('stored-pat');

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['status']).toBe('initialized');
      expect(result['auth_method']).toBe('file_fallback');
    });
  });

  // -------------------------------------------------------------------------
  // PAT missing
  // -------------------------------------------------------------------------

  describe('pat_missing', () => {
    it('returns "pat_missing" when config exists but PAT is not stored', async () => {
      setupFabricDirs();
      mockConfigManagerInstance.exists.mockResolvedValue(true);
      mockKeytarInstance.retrieve.mockResolvedValue(null);

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['status']).toBe('pat_missing');
      expect(result['message']).toContain('reconfigure-pat');
      expect(result['config']).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Not initialized
  // -------------------------------------------------------------------------

  describe('not_initialized', () => {
    it('returns "not_initialized" when config does not exist', async () => {
      setupFabricDirs();
      mockConfigManagerInstance.exists.mockResolvedValue(false);

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['status']).toBe('not_initialized');
      expect(result['message']).toContain('setup-claude');
      const checks = result['checks'] as Record<string, boolean>;
      expect(checks['fabric']).toBe(true);
      expect(checks['product']).toBe(true);
      expect(checks['fabric_cli']).toBe(true);
      expect(checks['config']).toBe(false);
    });

    it('reports fabric missing in checks', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));
      mockConfigManagerInstance.exists.mockResolvedValue(false);

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['status']).toBe('not_initialized');
      const checks = result['checks'] as Record<string, boolean>;
      expect(checks['fabric']).toBe(false);
      expect(checks['product']).toBe(false);
      expect(checks['fabric_cli']).toBe(false);
    });

    it('reports fabric present but product missing in checks', async () => {
      mockStat.mockImplementation(async (path: unknown) => {
        const pathStr = String(path);
        if (pathStr === 'fabric') {
          return { isDirectory: () => true };
        }
        throw new Error('ENOENT');
      });
      mockConfigManagerInstance.exists.mockResolvedValue(false);

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['status']).toBe('not_initialized');
      const checks = result['checks'] as Record<string, boolean>;
      expect(checks['fabric']).toBe(true);
      expect(checks['product']).toBe(false);
      expect(checks['fabric_cli']).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Strict validation
  // -------------------------------------------------------------------------

  describe('strict validation', () => {
    it('rejects unknown keys', async () => {
      const response = await toolHandler({ unknownKey: 'value' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('wraps unexpected errors via normalizeError', async () => {
      mockConfigManagerInstance.exists.mockRejectedValue(
        new Error('Unexpected disk failure'),
      );
      setupFabricDirs();

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['error']).toBeDefined();
      expect(result['message']).toBeDefined();
    });
  });
});
