/**
 * Unit tests for the sp-get-item MCP tool.
 *
 * The tool is registered via server.tool() with a closure handler.
 * We capture the handler by providing a mock McpServer, then call
 * the handler directly with mock arguments.
 *
 * All external dependencies are mocked at the module level via vi.mock().
 * Mock instances are created with vi.hoisted() so they are available
 * inside hoisted vi.mock() factory functions.
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

  const _mockAdoClientInstance = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    getConnectionData: vi.fn(),
    getCurrentUserId: vi.fn(),
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
  KeytarStrategy: Object.assign(
    vi.fn(() => mockKeytarInstance),
    { isAvailable: mockKeytarIsAvailable },
  ),
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

import { registerSpGetItem } from '../../src/tools/sp-get-item.js';
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

const defaultConfig = {
  organizationUrl: 'https://dev.azure.com/test-org',
  project: 'TestProject',
  allowedWorkItemTypes: ['User Story', 'Bug', 'Task'],
  statusMapping: {
    'User Story': { blocked: 'Blocked', inProgress: 'Active', inReview: 'Resolved' },
    'Bug': { blocked: 'Blocked', inProgress: 'Active', inReview: 'Resolved' },
    'Task': { blocked: 'Blocked', inProgress: 'Active', inReview: 'Resolved' },
  },
  git: {
    baseBranchOrTag: 'main',
    prTargetBranch: 'main',
    branchTemplate: 'features/{id}-{slug}',
    commitTemplate: '#{id}: {description}',
  },
  testing: { testCommand: 'npm test' },
};

function makeWorkItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 123,
    fields: {
      'System.Title': 'Test item',
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
      'System.TeamProject': 'TestProject',
      'System.AssignedTo': { uniqueName: 'user@test.com' },
      'System.Description': 'Description',
      'Microsoft.VSTS.Common.AcceptanceCriteria': 'AC',
      'System.IterationPath': 'TestProject\\Sprint 1',
      'System.AreaPath': 'TestProject',
      'System.Tags': 'tag1; tag2',
      'System.CreatedDate': '2026-01-01T00:00:00Z',
      'System.ChangedDate': '2026-01-02T00:00:00Z',
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Re-register the tool to capture a fresh handler
  registerSpGetItem(mockServer as unknown as McpServer);

  // Default mock behaviors
  mockConfigManagerInstance.load.mockResolvedValue(defaultConfig);

  mockKeytarIsAvailable.mockResolvedValue(true);

  mockAdoClientCreate.mockResolvedValue(mockAdoClientInstance);
  mockAdoClientInstance.getCurrentUserId.mockReturnValue('user@test.com');

  // sp-get-item uses adoClient.get which returns a single work item (not
  // wrapped in a value array like batch endpoints).
  mockAdoClientInstance.get.mockResolvedValue(makeWorkItem());

  mockScopeValidatorInstance.validateWorkItem.mockImplementation(() => {
    // no-op -- passes scope validation by default
  });

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

describe('sp-get-item', () => {
  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  it('registers tool with the server', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'sp-get-item',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  describe('input validation', () => {
    it('rejects unknown keys in input', async () => {
      const response = await toolHandler({ id: 123, foo: 'bar' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
      expect(result['message']).toBeDefined();
    });

    it('rejects when id is missing', async () => {
      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
      expect(result['message']).toBeDefined();
    });

    it('rejects when id is not a positive integer', async () => {
      const response = await toolHandler({ id: -5 }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });

    it('rejects when id is a float', async () => {
      const response = await toolHandler({ id: 1.5 }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });
  });

  // -------------------------------------------------------------------------
  // Successful fetch
  // -------------------------------------------------------------------------

  describe('successful fetch', () => {
    it('returns item_fetched with sanitized work item on success', async () => {
      const response = await toolHandler({ id: 123 }, {});
      const result = parseResult(response);

      expect(result['status']).toBe('item_fetched');

      const item = result['item'] as Record<string, unknown>;
      expect(item['id']).toBe(123);
      expect(item['title']).toBe('Test item');
      expect(item['type']).toBe('User Story');
      expect(item['state']).toBe('Active');
      expect(item['assignedTo']).toBe('user@test.com');
      expect(item['description']).toBe('Description');
      expect(item['acceptanceCriteria']).toBe('AC');
      expect(item['iteration']).toBe('TestProject\\Sprint 1');
      expect(item['areaPath']).toBe('TestProject');
      expect(item['tags']).toBe('tag1; tag2');
      expect(item['createdDate']).toBe('2026-01-01T00:00:00Z');
      expect(item['changedDate']).toBe('2026-01-02T00:00:00Z');
    });

    it('sanitizes items with missing optional fields', async () => {
      mockAdoClientInstance.get.mockResolvedValue(
        makeWorkItem({
          'System.Description': undefined,
          'Microsoft.VSTS.Common.AcceptanceCriteria': undefined,
          'System.AssignedTo': undefined,
          'System.Tags': undefined,
        }),
      );

      const response = await toolHandler({ id: 123 }, {});
      const result = parseResult(response);

      expect(result['status']).toBe('item_fetched');
      const item = result['item'] as Record<string, unknown>;
      expect(item['description']).toBe('');
      expect(item['acceptanceCriteria']).toBe('');
      expect(item['assignedTo']).toBe('');
      expect(item['tags']).toBe('');
    });

    it('returns text content type', async () => {
      const response = await toolHandler({ id: 123 }, {});

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
    });
  });

  // -------------------------------------------------------------------------
  // Scope violation
  // -------------------------------------------------------------------------

  describe('scope violation', () => {
    it('returns scope_violation structured error when validateWorkItem throws ScopeViolationError', async () => {
      mockScopeValidatorInstance.validateWorkItem.mockImplementation(() => {
        throw new ScopeViolationError(
          'Work item 123 belongs to project OtherProject',
        );
      });

      const response = await toolHandler({ id: 123 }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('scope_violation');
      expect(result['reason']).toBe(
        'Work item 123 belongs to project OtherProject',
      );
    });

    it('does not call logger on scope violation when no flow is provided', async () => {
      mockScopeValidatorInstance.validateWorkItem.mockImplementation(() => {
        throw new ScopeViolationError('Item not assigned to current user');
      });

      await toolHandler({ id: 123 }, {});

      expect(mockLoggerInstance.logError).not.toHaveBeenCalled();
      expect(mockLoggerInstance.log).not.toHaveBeenCalled();
    });

    it('re-throws non-ScopeViolationError during scope validation', async () => {
      mockScopeValidatorInstance.validateWorkItem.mockImplementation(() => {
        throw new TypeError('Unexpected type error');
      });

      const response = await toolHandler({ id: 123 }, {});
      const result = parseResult(response);

      // normalizeError wraps TypeError into a SprintPilotError
      expect(result['error']).toBeDefined();
      expect(result['message']).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('returns normalized error on ADO failure', async () => {
      mockAdoClientInstance.get.mockRejectedValue(
        new Error('Network timeout'),
      );

      const response = await toolHandler({ id: 123 }, {});
      const result = parseResult(response);

      expect(result['error']).toBeDefined();
      expect(result['message']).toBeDefined();
    });

    it('returns normalized error on config load failure', async () => {
      mockConfigManagerInstance.load.mockRejectedValue(
        new Error('Config file corrupted'),
      );

      const response = await toolHandler({ id: 123 }, {});
      const result = parseResult(response);

      expect(result['error']).toBeDefined();
      expect(result['message']).toBeDefined();
    });

    it('does not call logger on error when no flow is provided', async () => {
      mockAdoClientInstance.get.mockRejectedValue(
        new Error('Network timeout'),
      );

      await toolHandler({ id: 123 }, {});

      expect(mockLoggerInstance.flush).not.toHaveBeenCalled();
      expect(mockLoggerInstance.close).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Activity logging
  // -------------------------------------------------------------------------

  describe('activity logging', () => {
    it('does not call logger on success when no flow is provided', async () => {
      const response = await toolHandler({ id: 123 }, {});
      const result = parseResult(response);

      expect(result['status']).toBe('item_fetched');
      expect(mockLoggerInstance.log).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Auth fallback
  // -------------------------------------------------------------------------

  describe('auth fallback', () => {
    it('uses file fallback auth when keytar is unavailable', async () => {
      mockKeytarIsAvailable.mockResolvedValue(false);

      const response = await toolHandler({ id: 123 }, {});
      const result = parseResult(response);

      expect(result['status']).toBe('item_fetched');
      // AdoClient.create should still be called -- the tool uses
      // FileFallbackStrategy when keytar is unavailable.
      expect(mockAdoClientCreate).toHaveBeenCalled();
    });
  });
});
