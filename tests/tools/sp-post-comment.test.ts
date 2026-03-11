/**
 * Unit tests for the sp-post-comment MCP tool.
 *
 * The tool is registered via server.tool() with a closure handler.
 * We capture the handler by providing a mock McpServer, then call
 * the handler directly with mock arguments.
 *
 * Dependencies (ConfigManager, AuthStrategy, AdoClient, ScopeValidator,
 * ActivityLogger) are mocked at module level. The response-sanitizer is
 * NOT mocked -- no sanitizer is used by this tool.
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

// ---------------------------------------------------------------------------
// Import the module under test AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------

import { registerSpPostComment } from '../../src/tools/sp-post-comment.js';
import { ScopeViolationError } from '../../src/shared/errors.js';

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

function makeWorkItem(id = 123) {
  return {
    id,
    fields: {
      'System.Title': 'Test item',
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
      'System.TeamProject': 'TestProject',
      'System.AssignedTo': { uniqueName: 'user@test.com' },
      'System.Description': '',
      'System.IterationPath': 'TestProject\\Sprint 1',
      'System.AreaPath': 'TestProject',
      'System.Tags': '',
      'System.CreatedDate': '2026-01-01T00:00:00Z',
      'System.ChangedDate': '2026-01-02T00:00:00Z',
    },
  };
}

const defaultConfig = {
  organizationUrl: 'https://dev.azure.com/test-org',
  project: 'TestProject',
  allowedWorkItemTypes: ['User Story', 'Bug', 'Task'],
  statusMapping: {
    'User Story': { blocked: 'Blocked', inProgress: 'Active', inReview: 'Resolved' },
  },
  git: { baseBranchOrTag: 'main', prTargetBranch: 'main', branchTemplate: 'features/{id}-{slug}', commitTemplate: '#{id}: {description}' },
  testing: { testCommand: 'npm test' },
};

const postCommentResponse = {
  id: 42,
  text: 'Test comment',
  createdBy: { displayName: 'User', uniqueName: 'user@test.com' },
  createdDate: '2026-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Re-register the tool to capture a fresh handler
  mockServer.tool.mockClear();
  registerSpPostComment(mockServer as unknown as McpServer);

  // Default mock behaviors
  mockConfigManagerInstance.load.mockResolvedValue(defaultConfig);
  mockKeytarIsAvailable.mockResolvedValue(true);
  mockAdoClientCreate.mockResolvedValue(mockAdoClientInstance);
  mockAdoClientInstance.getCurrentUserId.mockReturnValue('user@test.com');
  mockScopeValidatorInstance.validateWorkItem.mockReturnValue(undefined);

  // adoClient.get returns work item (for scope check)
  mockAdoClientInstance.get.mockResolvedValue(makeWorkItem(123));

  // adoClient.post returns the created comment
  mockAdoClientInstance.post.mockResolvedValue(postCommentResponse);

  mockLoggerInstance.log.mockResolvedValue(undefined);
  mockLoggerInstance.flush.mockResolvedValue(undefined);
  mockLoggerInstance.close.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sp-post-comment', () => {
  it('registers tool with the server as sp-post-comment', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'sp-post-comment',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  // -------------------------------------------------------------------------
  // Strict input validation
  // -------------------------------------------------------------------------

  describe('input validation', () => {
    it('rejects unknown keys in input', async () => {
      const response = await toolHandler({ id: 1, text: 'Hello', foo: 'bar' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
      expect(result['message']).toContain('Unrecognized key');
    });

    it('rejects missing id', async () => {
      const response = await toolHandler({ text: 'Hello' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });

    it('rejects missing text', async () => {
      const response = await toolHandler({ id: 1 }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });

    it('rejects empty text', async () => {
      const response = await toolHandler({ id: 1, text: '' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });

    it('rejects non-positive id', async () => {
      const response = await toolHandler({ id: 0, text: 'Hello' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });

    it('rejects non-integer id', async () => {
      const response = await toolHandler({ id: 1.5, text: 'Hello' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });
  });

  // -------------------------------------------------------------------------
  // Happy path -- comment posted
  // -------------------------------------------------------------------------

  describe('successful comment post', () => {
    it('posts comment successfully and returns comment_posted', async () => {
      const response = await toolHandler({ id: 123, text: 'Test comment' }, {});
      const result = parseResult(response);

      expect(result['status']).toBe('comment_posted');
      expect(result['item_id']).toBe(123);
      expect(result['comment_id']).toBe(42);
      expect(response.content[0].type).toBe('text');
    });

    it('calls adoClient.post with the comment text', async () => {
      await toolHandler({ id: 123, text: 'My new comment' }, {});

      expect(mockAdoClientInstance.post).toHaveBeenCalledWith(
        expect.stringContaining('comments'),
        { text: 'My new comment' },
        expect.anything(),
      );
    });

    it('fetches work item for scope validation before posting', async () => {
      await toolHandler({ id: 123, text: 'Test comment' }, {});

      // get() called once for scope check
      expect(mockAdoClientInstance.get).toHaveBeenCalledTimes(1);
      expect(mockAdoClientInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('workItems/123'),
        expect.anything(),
      );

      // validateWorkItem called with the work item
      expect(mockScopeValidatorInstance.validateWorkItem).toHaveBeenCalledWith(
        makeWorkItem(123),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Scope validation failure
  // -------------------------------------------------------------------------

  describe('scope validation', () => {
    it('returns error when scope validation fails', async () => {
      mockScopeValidatorInstance.validateWorkItem.mockImplementation(() => {
        throw new ScopeViolationError(
          "Work item 123 is not assigned to current user 'user@test.com'",
        );
      });

      const response = await toolHandler({ id: 123, text: 'Test comment' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('scope_violation');
      expect(result['message']).toContain('not assigned');
    });

    it('does not post comment when scope validation fails', async () => {
      mockScopeValidatorInstance.validateWorkItem.mockImplementation(() => {
        throw new ScopeViolationError('Out of scope');
      });

      await toolHandler({ id: 123, text: 'Test comment' }, {});

      expect(mockAdoClientInstance.post).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // ADO failure
  // -------------------------------------------------------------------------

  describe('ADO error handling', () => {
    it('returns error on ADO failure during work item fetch', async () => {
      mockAdoClientInstance.get.mockRejectedValue(
        new Error('fetch failed'),
      );

      const response = await toolHandler({ id: 123, text: 'Test comment' }, {});
      const result = parseResult(response);

      expect(result['error']).toBeDefined();
      expect(result['message']).toBeDefined();
    });

    it('returns error on ADO failure during comment post', async () => {
      mockAdoClientInstance.post.mockRejectedValue(
        new Error('fetch failed'),
      );

      const response = await toolHandler({ id: 123, text: 'Test comment' }, {});
      const result = parseResult(response);

      expect(result['error']).toBeDefined();
      expect(result['message']).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Logger lifecycle
  // -------------------------------------------------------------------------

  describe('logger lifecycle', () => {
    it('does not call logger on success when no flow is provided', async () => {
      await toolHandler({ id: 123, text: 'Test comment' }, {});

      expect(mockLoggerInstance.log).not.toHaveBeenCalled();
      expect(mockLoggerInstance.flush).not.toHaveBeenCalled();
      expect(mockLoggerInstance.close).not.toHaveBeenCalled();
    });

    it('does not call logger on error when no flow is provided', async () => {
      mockAdoClientInstance.get.mockRejectedValue(
        new Error('ADO failure'),
      );

      await toolHandler({ id: 123, text: 'Test comment' }, {});

      expect(mockLoggerInstance.flush).not.toHaveBeenCalled();
      expect(mockLoggerInstance.close).not.toHaveBeenCalled();
    });
  });
});
