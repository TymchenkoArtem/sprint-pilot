/**
 * Unit tests for the sp-get-comments MCP tool.
 *
 * The tool is registered via server.tool() with a closure handler.
 * We capture the handler by providing a mock McpServer, then call
 * the handler directly with mock arguments.
 *
 * Dependencies (ConfigManager, AuthStrategy, AdoClient, ScopeValidator,
 * ActivityLogger) are mocked at module level. The response-sanitizer is
 * NOT mocked -- real sanitizeComment runs to verify end-to-end output.
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

import { registerSpGetComments } from '../../src/tools/sp-get-comments.js';
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

const commentsResponse = {
  comments: [
    { id: 1, text: 'Regular comment', createdBy: { displayName: 'User', uniqueName: 'user@test.com' }, createdDate: '2026-01-01T00:00:00Z' },
    { id: 2, text: '<!-- sprint-pilot:clarification -->Question', createdBy: { displayName: 'Bot', uniqueName: 'bot@test.com' }, createdDate: '2026-01-02T00:00:00Z' },
  ],
};

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Re-register the tool to capture a fresh handler
  mockServer.tool.mockClear();
  registerSpGetComments(mockServer as unknown as McpServer);

  // Default mock behaviors
  mockConfigManagerInstance.load.mockResolvedValue(defaultConfig);
  mockKeytarIsAvailable.mockResolvedValue(true);
  mockAdoClientCreate.mockResolvedValue(mockAdoClientInstance);
  mockAdoClientInstance.getCurrentUserId.mockReturnValue('user@test.com');
  mockScopeValidatorInstance.validateWorkItem.mockReturnValue(undefined);

  // First .get call returns the work item (expand); second returns comments
  mockAdoClientInstance.get
    .mockResolvedValueOnce(makeWorkItem(123))
    .mockResolvedValueOnce(commentsResponse);

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

describe('sp-get-comments', () => {
  it('registers tool with the server as sp-get-comments', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'sp-get-comments',
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
      const response = await toolHandler({ id: 1, foo: 'bar' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
      expect(result['message']).toContain('Unrecognized key');
    });

    it('rejects missing id', async () => {
      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });

    it('rejects non-positive id', async () => {
      const response = await toolHandler({ id: -1 }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });

    it('rejects non-integer id', async () => {
      const response = await toolHandler({ id: 1.5 }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });
  });

  // -------------------------------------------------------------------------
  // Happy path -- comments fetched
  // -------------------------------------------------------------------------

  describe('successful comment fetch', () => {
    it('returns comments_fetched with sanitized comments on success', async () => {
      const response = await toolHandler({ id: 123 }, {});
      const result = parseResult(response);

      expect(result['status']).toBe('comments_fetched');
      expect(result['item_id']).toBe(123);

      const comments = result['comments'] as Array<Record<string, unknown>>;
      expect(comments).toHaveLength(2);

      // First comment: regular comment (not sprint-pilot)
      expect(comments[0]['id']).toBe(1);
      expect(comments[0]['text']).toBe('Regular comment');
      expect(comments[0]['createdBy']).toBe('user@test.com');
      expect(comments[0]['createdDate']).toBe('2026-01-01T00:00:00Z');
      expect(comments[0]['isSprintPilot']).toBe(false);

      // Second comment: sprint-pilot marker present
      expect(comments[1]['id']).toBe(2);
      expect(comments[1]['text']).toBe('<!-- sprint-pilot:clarification -->Question');
      expect(comments[1]['createdBy']).toBe('bot@test.com');
      expect(comments[1]['createdDate']).toBe('2026-01-02T00:00:00Z');
      expect(comments[1]['isSprintPilot']).toBe(true);

      expect(response.content[0].type).toBe('text');
    });

    it('detects sprint-pilot markers in comments (isSprintPilot: true)', async () => {
      const markerComments = {
        comments: [
          { id: 10, text: '<!-- sprint-pilot:status-update -->Status changed', createdBy: { displayName: 'Bot', uniqueName: 'bot@test.com' }, createdDate: '2026-01-05T00:00:00Z' },
        ],
      };

      mockAdoClientInstance.get
        .mockReset()
        .mockResolvedValueOnce(makeWorkItem(456))
        .mockResolvedValueOnce(markerComments);

      const response = await toolHandler({ id: 456 }, {});
      const result = parseResult(response);
      const comments = result['comments'] as Array<Record<string, unknown>>;

      expect(comments).toHaveLength(1);
      expect(comments[0]['isSprintPilot']).toBe(true);
    });

    it('returns empty comments array when work item has no comments', async () => {
      mockAdoClientInstance.get
        .mockReset()
        .mockResolvedValueOnce(makeWorkItem(789))
        .mockResolvedValueOnce({ comments: [] });

      const response = await toolHandler({ id: 789 }, {});
      const result = parseResult(response);

      expect(result['status']).toBe('comments_fetched');
      expect(result['item_id']).toBe(789);
      expect(result['comments']).toEqual([]);
    });

    it('sanitizes comments to expose only uniqueName, not displayName', async () => {
      const response = await toolHandler({ id: 123 }, {});
      const result = parseResult(response);
      const comments = result['comments'] as Array<Record<string, unknown>>;

      // createdBy should be the uniqueName string, not the full object
      expect(comments[0]['createdBy']).toBe('user@test.com');
      expect(typeof comments[0]['createdBy']).toBe('string');
    });
  });

  // -------------------------------------------------------------------------
  // Scope validation failure
  // -------------------------------------------------------------------------

  describe('scope validation', () => {
    it('returns error when work item scope validation fails', async () => {
      mockScopeValidatorInstance.validateWorkItem.mockImplementation(() => {
        throw new ScopeViolationError(
          "Work item 123 belongs to project 'OtherProject', not 'TestProject'",
        );
      });

      const response = await toolHandler({ id: 123 }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('scope_violation');
      expect(result['message']).toContain('OtherProject');
    });
  });

  // -------------------------------------------------------------------------
  // ADO failure
  // -------------------------------------------------------------------------

  describe('ADO error handling', () => {
    it('returns error on ADO failure during work item fetch', async () => {
      mockAdoClientInstance.get.mockReset().mockRejectedValue(
        new Error('fetch failed'),
      );

      const response = await toolHandler({ id: 123 }, {});
      const result = parseResult(response);

      expect(result['error']).toBeDefined();
      expect(result['message']).toBeDefined();
    });

    it('returns error on ADO failure during comments fetch', async () => {
      mockAdoClientInstance.get
        .mockReset()
        .mockResolvedValueOnce(makeWorkItem(123))
        .mockRejectedValueOnce(new Error('fetch failed'));

      const response = await toolHandler({ id: 123 }, {});
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
      await toolHandler({ id: 123 }, {});

      expect(mockLoggerInstance.log).not.toHaveBeenCalled();
      expect(mockLoggerInstance.flush).not.toHaveBeenCalled();
      expect(mockLoggerInstance.close).not.toHaveBeenCalled();
    });

    it('does not call logger on error when no flow is provided', async () => {
      mockAdoClientInstance.get.mockReset().mockRejectedValue(
        new Error('ADO failure'),
      );

      await toolHandler({ id: 123 }, {});

      expect(mockLoggerInstance.flush).not.toHaveBeenCalled();
      expect(mockLoggerInstance.close).not.toHaveBeenCalled();
    });
  });
});
