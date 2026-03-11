/**
 * Unit tests for the sp-update-status MCP tool.
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

import { registerSpUpdateStatus } from '../../src/tools/sp-update-status.js';
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

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockServer.tool.mockClear();
  registerSpUpdateStatus(mockServer as unknown as McpServer);

  // Default mock behaviors
  mockConfigManagerInstance.load.mockResolvedValue(defaultConfig);
  mockKeytarIsAvailable.mockResolvedValue(true);
  mockAdoClientCreate.mockResolvedValue(mockAdoClientInstance);
  mockAdoClientInstance.getCurrentUserId.mockReturnValue('user@test.com');

  // ADO get returns a work item
  mockAdoClientInstance.get.mockResolvedValue(makeWorkItem());

  // ADO patch returns the patched work item
  mockAdoClientInstance.patch.mockResolvedValue(makeWorkItem());

  // Scope validator defaults
  mockScopeValidatorInstance.validateWorkItem.mockReturnValue(undefined);
  mockScopeValidatorInstance.validateStatusTransition.mockReturnValue('Resolved');

  // Logger defaults
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

describe('sp-update-status', () => {
  it('registers tool with the server as sp-update-status', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'sp-update-status',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  // -------------------------------------------------------------------------
  // Strict input validation
  // -------------------------------------------------------------------------

  describe('strict input validation', () => {
    it('rejects unknown keys in input', async () => {
      const response = await toolHandler(
        { id: 123, status: 'inReview', extraField: 'should fail' },
        {},
      );
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
      expect(result['message']).toBeDefined();
    });

    it('rejects when id is missing', async () => {
      const response = await toolHandler({ status: 'inReview' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });

    it('rejects when status is missing', async () => {
      const response = await toolHandler({ id: 123 }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });

    it('rejects when id is not a positive integer', async () => {
      const response = await toolHandler({ id: -1, status: 'inReview' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });

    it('rejects when status is empty string', async () => {
      const response = await toolHandler({ id: 123, status: '' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });
  });

  // -------------------------------------------------------------------------
  // Successful status update
  // -------------------------------------------------------------------------

  describe('successful status update', () => {
    it('returns status_updated with previous_state and new_state', async () => {
      mockScopeValidatorInstance.validateStatusTransition.mockReturnValue('Resolved');

      const response = await toolHandler({ id: 123, status: 'inReview' }, {});
      const result = parseResult(response);

      expect(result['status']).toBe('status_updated');
      expect(result['item_id']).toBe(123);
      expect(result['previous_state']).toBe('Active');
      expect(result['new_state']).toBe('Resolved');
    });

    it('calls adoClient.get to fetch the work item', async () => {
      await toolHandler({ id: 456, status: 'inProgress' }, {});

      expect(mockAdoClientInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('456'),
        expect.anything(),
      );
    });

    it('calls scopeValidator.validateWorkItem with the fetched item', async () => {
      const workItem = makeWorkItem(789);
      mockAdoClientInstance.get.mockResolvedValue(workItem);

      await toolHandler({ id: 789, status: 'blocked' }, {});

      expect(mockScopeValidatorInstance.validateWorkItem).toHaveBeenCalledWith(workItem);
    });

    it('calls scopeValidator.validateStatusTransition with type and status key', async () => {
      await toolHandler({ id: 123, status: 'blocked' }, {});

      expect(mockScopeValidatorInstance.validateStatusTransition).toHaveBeenCalledWith(
        'User Story',
        'blocked',
      );
    });

    it('calls adoClient.patch with json-patch body to update System.State', async () => {
      mockScopeValidatorInstance.validateStatusTransition.mockReturnValue('Blocked');

      await toolHandler({ id: 123, status: 'blocked' }, {});

      expect(mockAdoClientInstance.patch).toHaveBeenCalledWith(
        expect.stringContaining('123'),
        [{ op: 'replace', path: '/fields/System.State', value: 'Blocked' }],
        expect.anything(),
      );
    });

    it('captures previous state from the original work item', async () => {
      const item = makeWorkItem(123);
      item.fields['System.State'] = 'New';
      mockAdoClientInstance.get.mockResolvedValue(item);
      mockScopeValidatorInstance.validateStatusTransition.mockReturnValue('Active');

      const response = await toolHandler({ id: 123, status: 'inProgress' }, {});
      const result = parseResult(response);

      expect(result['previous_state']).toBe('New');
      expect(result['new_state']).toBe('Active');
    });
  });

  // -------------------------------------------------------------------------
  // Scope validation errors
  // -------------------------------------------------------------------------

  describe('scope validation errors', () => {
    it('returns error when validateWorkItem throws ScopeViolationError', async () => {
      mockScopeValidatorInstance.validateWorkItem.mockImplementation(() => {
        throw new ScopeViolationError('Work item 123 belongs to project \'OtherProject\', not \'TestProject\'');
      });

      const response = await toolHandler({ id: 123, status: 'inReview' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('scope_violation');
      expect(result['message']).toContain('OtherProject');
    });

    it('returns error when validateStatusTransition throws ScopeViolationError', async () => {
      mockScopeValidatorInstance.validateStatusTransition.mockImplementation(() => {
        throw new ScopeViolationError('Status key \'invalid\' is not valid for work item type \'User Story\'');
      });

      const response = await toolHandler({ id: 123, status: 'invalid' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('scope_violation');
      expect(result['message']).toContain('invalid');
    });
  });

  // -------------------------------------------------------------------------
  // ADO patch failure
  // -------------------------------------------------------------------------

  describe('ADO failure', () => {
    it('returns error when adoClient.patch rejects', async () => {
      mockAdoClientInstance.patch.mockRejectedValue(new Error('ADO 500 Internal Server Error'));

      const response = await toolHandler({ id: 123, status: 'inReview' }, {});
      const result = parseResult(response);

      expect(result['error']).toBeDefined();
      expect(result['message']).toBeDefined();
    });

    it('returns error when adoClient.get rejects', async () => {
      mockAdoClientInstance.get.mockRejectedValue(new Error('ADO 404 Not Found'));

      const response = await toolHandler({ id: 999, status: 'inReview' }, {});
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
      await toolHandler({ id: 123, status: 'inReview' }, {});

      expect(mockLoggerInstance.log).not.toHaveBeenCalled();
      expect(mockLoggerInstance.flush).not.toHaveBeenCalled();
      expect(mockLoggerInstance.close).not.toHaveBeenCalled();
    });

    it('does not call logger on error when no flow is provided', async () => {
      mockAdoClientInstance.get.mockRejectedValue(new Error('ADO failure'));

      await toolHandler({ id: 123, status: 'inReview' }, {});

      expect(mockLoggerInstance.flush).not.toHaveBeenCalled();
      expect(mockLoggerInstance.close).not.toHaveBeenCalled();
    });
  });
});
