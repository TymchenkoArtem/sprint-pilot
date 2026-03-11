/**
 * Unit tests for the sp-create-branch MCP tool.
 *
 * The tool is registered via server.tool() with a closure handler.
 * We capture the handler by providing a mock McpServer, then call
 * the handler directly with mock arguments.
 *
 * Dependencies (ConfigManager, AdoClient, ScopeValidator, ActivityLogger)
 * are mocked at module level via vi.mock() with vi.hoisted() instances.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// ---------------------------------------------------------------------------
// Hoisted mock instances -- available inside vi.mock() factories
// ---------------------------------------------------------------------------

const {
  mockConfigManagerInstance,
  mockKeytarIsAvailable,
  mockKeytarInstance,
  mockFileFallbackInstance,
  mockAdoClientCreate,
  mockAdoClientInstance,
  mockLoggerInstance,
  mockScopeValidatorInstance,
} = vi.hoisted(() => {
  const _mockConfigManagerInstance = { exists: vi.fn(), load: vi.fn(), write: vi.fn() };
  const _mockKeytarIsAvailable = vi.fn();
  const _mockKeytarInstance = { store: vi.fn(), retrieve: vi.fn(), validate: vi.fn(), clear: vi.fn() };
  const _mockFileFallbackInstance = { store: vi.fn(), retrieve: vi.fn(), validate: vi.fn(), clear: vi.fn() };
  const _mockAdoClientInstance = {
    get: vi.fn(), post: vi.fn(), patch: vi.fn(),
    getConnectionData: vi.fn(), getCurrentUserId: vi.fn(),
  };
  const _mockAdoClientCreate = vi.fn().mockResolvedValue(_mockAdoClientInstance);
  const _mockLoggerInstance = {
    log: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const _mockScopeValidatorInstance = {
    validateWorkItem: vi.fn(),
    validateStatusTransition: vi.fn(),
    validateBranchSource: vi.fn(),
    validatePrTarget: vi.fn(),
  };
  return {
    mockConfigManagerInstance: _mockConfigManagerInstance,
    mockKeytarIsAvailable: _mockKeytarIsAvailable,
    mockKeytarInstance: _mockKeytarInstance,
    mockFileFallbackInstance: _mockFileFallbackInstance,
    mockAdoClientCreate: _mockAdoClientCreate,
    mockAdoClientInstance: _mockAdoClientInstance,
    mockLoggerInstance: _mockLoggerInstance,
    mockScopeValidatorInstance: _mockScopeValidatorInstance,
  };
});

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/config/config-manager.js', () => ({
  ConfigManager: vi.fn(() => mockConfigManagerInstance),
}));
vi.mock('../../src/auth/keytar-strategy.js', () => ({
  KeytarStrategy: Object.assign(vi.fn(() => mockKeytarInstance), { isAvailable: mockKeytarIsAvailable }),
}));
vi.mock('../../src/auth/file-fallback.js', () => ({
  FileFallbackStrategy: vi.fn(() => mockFileFallbackInstance),
}));
vi.mock('../../src/ado/ado-client.js', () => ({
  AdoClient: { create: mockAdoClientCreate },
}));
vi.mock('../../src/shared/logger.js', () => ({
  ActivityLogger: vi.fn(() => mockLoggerInstance),
}));
vi.mock('../../src/security/scope-validator.js', () => ({
  ScopeValidator: vi.fn(() => mockScopeValidatorInstance),
}));
vi.mock('../../src/shared/usage-tracker.js', () => ({
  UsageTracker: vi.fn(() => ({
    record: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  estimateTokens: (inputArgs: unknown, outputText: string) => {
    const inputStr = typeof inputArgs === 'string' ? inputArgs : JSON.stringify(inputArgs ?? {});
    return Math.max(1, Math.ceil((inputStr.length + outputText.length) / 4));
  },
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------

import { registerSpCreateBranch } from '../../src/tools/sp-create-branch.js';
import { ScopeViolationError, SprintPilotError } from '../../src/shared/errors.js';

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

const defaultConfig = {
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

/** Default args for a successful branch creation. */
function makeValidArgs(): Record<string, unknown> {
  return {
    name: 'feature-branch',
    source_ref: 'main',
  };
}

/** Set up the mock chain for a successful branch creation. */
function setupHappyPathMocks(): void {
  // First get: repositories
  mockAdoClientInstance.get.mockResolvedValueOnce({
    count: 1,
    value: [{
      id: 'repo-1',
      name: 'TestProject',
      defaultBranch: 'refs/heads/main',
      project: { id: 'proj-1', name: 'TestProject' },
    }],
  });
  // Second get: git refs (source commit)
  mockAdoClientInstance.get.mockResolvedValueOnce({
    count: 1,
    value: [{ name: 'refs/heads/main', objectId: 'abc123def456789012345678901234567890abcd' }],
  });
  // Post: create ref
  mockAdoClientInstance.post.mockResolvedValueOnce({
    value: [{
      name: 'refs/heads/feature-branch',
      oldObjectId: '0000000000000000000000000000000000000000',
      newObjectId: 'abc123def456789012345678901234567890abcd',
      success: true,
    }],
  });
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Re-register the tool to capture a fresh handler
  mockServer.tool.mockClear();
  registerSpCreateBranch(mockServer as unknown as McpServer);

  // Default mock behaviors
  mockConfigManagerInstance.load.mockResolvedValue(defaultConfig);
  mockKeytarIsAvailable.mockResolvedValue(true);
  mockAdoClientCreate.mockResolvedValue(mockAdoClientInstance);
  mockAdoClientInstance.getCurrentUserId.mockReturnValue('user-id-123');
  mockScopeValidatorInstance.validateBranchSource.mockReturnValue(undefined);

  mockLoggerInstance.log.mockResolvedValue(undefined);
  mockLoggerInstance.logError.mockResolvedValue(undefined);
  mockLoggerInstance.flush.mockResolvedValue(undefined);
  mockLoggerInstance.close.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sp-create-branch', () => {
  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  it('registers tool with the server as sp-create-branch', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'sp-create-branch',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  // -------------------------------------------------------------------------
  // Input validation -- strict schema
  // -------------------------------------------------------------------------

  describe('input validation', () => {
    it('rejects unknown keys via strict schema', async () => {
      setupHappyPathMocks();

      const response = await toolHandler(
        { name: 'feature-branch', source_ref: 'main', extra_field: 'bad' },
        {},
      );
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('successful branch creation', () => {
    it('returns branch_created with name, source, and commit SHA', async () => {
      setupHappyPathMocks();

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['status']).toBe('branch_created');
      expect(result['name']).toBe('feature-branch');
      expect(result['source']).toBe('main');
      expect(result['commit']).toBe('abc123def456789012345678901234567890abcd');
      expect(response.content[0].type).toBe('text');
    });

    it('does not instantiate logger when no flow is provided', async () => {
      setupHappyPathMocks();

      await toolHandler(makeValidArgs(), {});

      // Without a flow parameter, logger is undefined -- no calls expected
      expect(mockLoggerInstance.log).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Scope validation failure
  // -------------------------------------------------------------------------

  describe('scope validation', () => {
    it('returns scope_violation error when source_ref validation fails', async () => {
      mockScopeValidatorInstance.validateBranchSource.mockImplementation(() => {
        throw new ScopeViolationError(
          "Source ref 'develop' does not match configured base branch 'main'.",
        );
      });

      const response = await toolHandler(
        { name: 'feature-branch', source_ref: 'develop' },
        {},
      );
      const result = parseResult(response);

      expect(result['error']).toBe('scope_violation');
      expect(result['message']).toContain('develop');
    });

    it('returns normalized error JSON when scope validation fails', async () => {
      mockScopeValidatorInstance.validateBranchSource.mockImplementation(() => {
        throw new ScopeViolationError(
          "Source ref 'develop' does not match configured base branch 'main'.",
        );
      });

      const response = await toolHandler(
        { name: 'feature-branch', source_ref: 'develop' },
        {},
      );
      const result = parseResult(response);

      expect(result['error']).toBe('scope_violation');
      expect(result['message']).toContain('develop');
    });
  });

  // -------------------------------------------------------------------------
  // No repositories found
  // -------------------------------------------------------------------------

  describe('no repositories found', () => {
    it('returns ado_not_found error when repo list is empty', async () => {
      mockAdoClientInstance.get.mockResolvedValueOnce({
        count: 0,
        value: [],
      });

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['error']).toBe('ado_not_found');
      expect(result['message']).toContain('No repositories');
    });
  });

  // -------------------------------------------------------------------------
  // Source ref not found
  // -------------------------------------------------------------------------

  describe('source ref not found', () => {
    it('returns ado_not_found error when source ref does not exist', async () => {
      // First get: repositories -- success
      mockAdoClientInstance.get.mockResolvedValueOnce({
        count: 1,
        value: [{
          id: 'repo-1',
          name: 'TestProject',
          defaultBranch: 'refs/heads/main',
          project: { id: 'proj-1', name: 'TestProject' },
        }],
      });
      // Second get: git refs -- empty (branch not found)
      mockAdoClientInstance.get.mockResolvedValueOnce({
        count: 0,
        value: [],
      });

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['error']).toBe('ado_not_found');
      expect(result['message']).toContain('main');
      expect(result['message']).toContain('not found');
    });
  });

  // -------------------------------------------------------------------------
  // Branch already exists -- ref update returns success: false
  // -------------------------------------------------------------------------

  describe('branch already exists', () => {
    it('returns branch_exists error when ref update returns success false', async () => {
      // First get: repositories
      mockAdoClientInstance.get.mockResolvedValueOnce({
        count: 1,
        value: [{
          id: 'repo-1',
          name: 'TestProject',
          defaultBranch: 'refs/heads/main',
          project: { id: 'proj-1', name: 'TestProject' },
        }],
      });
      // Second get: git refs
      mockAdoClientInstance.get.mockResolvedValueOnce({
        count: 1,
        value: [{ name: 'refs/heads/main', objectId: 'abc123def456789012345678901234567890abcd' }],
      });
      // Post: ref update fails (success: false)
      mockAdoClientInstance.post.mockResolvedValueOnce({
        value: [{
          name: 'refs/heads/feature-branch',
          oldObjectId: '0000000000000000000000000000000000000000',
          newObjectId: 'abc123def456789012345678901234567890abcd',
          success: false,
        }],
      });

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['error']).toBe('branch_exists');
      expect(result['message']).toContain('feature-branch');
    });

    it('returns branch_exists error when ADO returns 409 conflict', async () => {
      // First get: repositories
      mockAdoClientInstance.get.mockResolvedValueOnce({
        count: 1,
        value: [{
          id: 'repo-1',
          name: 'TestProject',
          defaultBranch: 'refs/heads/main',
          project: { id: 'proj-1', name: 'TestProject' },
        }],
      });
      // Second get: git refs
      mockAdoClientInstance.get.mockResolvedValueOnce({
        count: 1,
        value: [{ name: 'refs/heads/main', objectId: 'abc123def456789012345678901234567890abcd' }],
      });
      // Post: ADO throws 409 conflict
      mockAdoClientInstance.post.mockRejectedValueOnce(
        new SprintPilotError(
          'validation_error',
          'TF401027: A conflict was detected. The branch already exists.',
        ),
      );

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['error']).toBe('branch_exists');
      expect(result['message']).toContain('feature-branch');
    });

    it('returns branch_exists error JSON when branch already exists (success: false)', async () => {
      // First get: repositories
      mockAdoClientInstance.get.mockResolvedValueOnce({
        count: 1,
        value: [{
          id: 'repo-1',
          name: 'TestProject',
          defaultBranch: 'refs/heads/main',
          project: { id: 'proj-1', name: 'TestProject' },
        }],
      });
      // Second get: git refs
      mockAdoClientInstance.get.mockResolvedValueOnce({
        count: 1,
        value: [{ name: 'refs/heads/main', objectId: 'abc123def456789012345678901234567890abcd' }],
      });
      // Post: ref update fails
      mockAdoClientInstance.post.mockResolvedValueOnce({
        value: [{
          name: 'refs/heads/feature-branch',
          oldObjectId: '0000000000000000000000000000000000000000',
          newObjectId: 'abc123def456789012345678901234567890abcd',
          success: false,
        }],
      });

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['error']).toBe('branch_exists');
      expect(result['message']).toContain('feature-branch');
    });
  });

  // -------------------------------------------------------------------------
  // Logger lifecycle on error paths
  // -------------------------------------------------------------------------

  describe('logger lifecycle', () => {
    it('returns normalized error JSON on error path', async () => {
      mockAdoClientInstance.get.mockResolvedValueOnce({
        count: 0,
        value: [],
      });

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['error']).toBe('ado_not_found');
    });

    it('does not call logger on error path when no flow is provided', async () => {
      mockAdoClientInstance.get.mockResolvedValueOnce({
        count: 0,
        value: [],
      });

      await toolHandler(makeValidArgs(), {});

      expect(mockLoggerInstance.flush).not.toHaveBeenCalled();
      expect(mockLoggerInstance.close).not.toHaveBeenCalled();
    });
  });
});
