/**
 * Unit tests for the sp-my-items MCP tool.
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

import { registerSpMyItems } from '../../src/tools/sp-my-items.js';
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

function makeWiqlResponse(ids: number[]) {
  return {
    queryType: 'flat',
    queryResultType: 'workItem',
    asOf: '2026-01-01T00:00:00Z',
    workItems: ids.map((id) => ({
      id,
      url: `https://dev.azure.com/test-org/_apis/wit/workItems/${id}`,
    })),
  };
}

function makeBatchResponse(items: ReturnType<typeof makeWorkItem>[]) {
  return {
    count: items.length,
    value: items,
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Re-register the tool to capture a fresh handler
  mockServer.tool.mockClear();
  registerSpMyItems(mockServer as unknown as McpServer);

  // Default mock behaviors
  mockConfigManagerInstance.load.mockResolvedValue(defaultConfig);

  mockKeytarIsAvailable.mockResolvedValue(true);

  mockAdoClientCreate.mockResolvedValue(mockAdoClientInstance);
  mockAdoClientInstance.getCurrentUserId.mockReturnValue('user@test.com');

  mockAdoClientInstance.post.mockResolvedValue(
    makeWiqlResponse([123, 456]),
  );
  mockAdoClientInstance.get.mockResolvedValue(
    makeBatchResponse([
      makeWorkItem(),
      makeWorkItem({
        'System.Title': 'Second item',
        'System.State': 'New',
        'System.WorkItemType': 'Bug',
      }),
    ]),
  );

  mockScopeValidatorInstance.validateWorkItem.mockImplementation(() => {
    // no-op -- all items pass by default
  });

  mockLoggerInstance.log.mockResolvedValue(undefined);
  mockLoggerInstance.logError.mockResolvedValue(undefined);
  mockLoggerInstance.flush.mockResolvedValue(undefined);
  mockLoggerInstance.close.mockResolvedValue(undefined);

  vi.clearAllMocks();

  // Re-register after clearAllMocks to capture handler
  registerSpMyItems(mockServer as unknown as McpServer);

  // Re-apply defaults after clear
  mockConfigManagerInstance.load.mockResolvedValue(defaultConfig);
  mockKeytarIsAvailable.mockResolvedValue(true);
  mockAdoClientCreate.mockResolvedValue(mockAdoClientInstance);
  mockAdoClientInstance.getCurrentUserId.mockReturnValue('user@test.com');
  mockAdoClientInstance.post.mockResolvedValue(
    makeWiqlResponse([123, 456]),
  );
  mockAdoClientInstance.get.mockResolvedValue(
    makeBatchResponse([
      makeWorkItem(),
      makeWorkItem({
        'System.Title': 'Second item',
        'System.State': 'New',
        'System.WorkItemType': 'Bug',
      }),
    ]),
  );
  mockScopeValidatorInstance.validateWorkItem.mockImplementation(() => {
    // no-op
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

describe('sp-my-items', () => {
  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  it('registers tool with the server', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'sp-my-items',
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
      const response = await toolHandler({ foo: 'bar' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
      expect(result['message']).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Empty results
  // -------------------------------------------------------------------------

  describe('empty results', () => {
    it('returns no_items when WIQL returns empty workItems array', async () => {
      mockAdoClientInstance.post.mockResolvedValue(makeWiqlResponse([]));

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['status']).toBe('no_items');
      expect(result['total']).toBe(0);
      expect(result['items']).toEqual({});
    });

    it('does not call logger on empty results when no flow is provided', async () => {
      mockAdoClientInstance.post.mockResolvedValue(makeWiqlResponse([]));

      await toolHandler({}, {});

      expect(mockLoggerInstance.log).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Batch fetching
  // -------------------------------------------------------------------------

  describe('batch fetching', () => {
    it('fetches items in batches when WIQL returns more than 200 IDs', async () => {
      // Generate 450 IDs to trigger 3 batch calls (200 + 200 + 50)
      const ids = Array.from({ length: 450 }, (_, i) => i + 1);
      mockAdoClientInstance.post.mockResolvedValue(makeWiqlResponse(ids));

      // Each batch get returns a single work item for simplicity
      mockAdoClientInstance.get.mockResolvedValue(
        makeBatchResponse([makeWorkItem()]),
      );

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      // Three batch calls: ceil(450 / 200) = 3
      expect(mockAdoClientInstance.get).toHaveBeenCalledTimes(3);
      expect(result['status']).toBe('items_fetched');
    });

    it('makes a single batch call when WIQL returns fewer than 200 IDs', async () => {
      const ids = [1, 2, 3];
      mockAdoClientInstance.post.mockResolvedValue(makeWiqlResponse(ids));
      mockAdoClientInstance.get.mockResolvedValue(
        makeBatchResponse([
          makeWorkItem(),
          makeWorkItem({ 'System.Title': 'Item 2' }),
          makeWorkItem({ 'System.Title': 'Item 3' }),
        ]),
      );

      await toolHandler({}, {});

      expect(mockAdoClientInstance.get).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Scope filtering
  // -------------------------------------------------------------------------

  describe('scope filtering', () => {
    it('filters out scope-violating items silently', async () => {
      const validItem = makeWorkItem({ 'System.Title': 'Valid item' });
      const violatingItem = makeWorkItem({
        'System.Title': 'Out of scope',
        'System.TeamProject': 'OtherProject',
      });
      // Give violating item a distinct id so scope validator can target it
      violatingItem.id = 999;

      mockAdoClientInstance.post.mockResolvedValue(
        makeWiqlResponse([123, 999]),
      );
      mockAdoClientInstance.get.mockResolvedValue(
        makeBatchResponse([validItem, violatingItem]),
      );

      // Scope validator throws for the violating item only
      mockScopeValidatorInstance.validateWorkItem.mockImplementation(
        (item: { id: number }) => {
          if (item.id === 999) {
            throw new ScopeViolationError(
              'Work item 999 belongs to project OtherProject',
            );
          }
        },
      );

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['status']).toBe('items_fetched');
      expect(result['total']).toBe(1);
    });

    it('re-throws non-ScopeViolationError errors during validation', async () => {
      mockAdoClientInstance.post.mockResolvedValue(
        makeWiqlResponse([123]),
      );
      mockAdoClientInstance.get.mockResolvedValue(
        makeBatchResponse([makeWorkItem()]),
      );

      mockScopeValidatorInstance.validateWorkItem.mockImplementation(() => {
        throw new TypeError('Unexpected type error');
      });

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      // normalizeError wraps TypeError into a SprintPilotError
      expect(result['error']).toBeDefined();
      expect(result['message']).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Grouping
  // -------------------------------------------------------------------------

  describe('grouping', () => {
    it('returns items grouped by type then by state', async () => {
      const userStoryActive = makeWorkItem({
        'System.Title': 'US Active',
        'System.WorkItemType': 'User Story',
        'System.State': 'Active',
      });
      const userStoryNew = makeWorkItem({
        'System.Title': 'US New',
        'System.WorkItemType': 'User Story',
        'System.State': 'New',
      });
      const bugActive = makeWorkItem({
        'System.Title': 'Bug Active',
        'System.WorkItemType': 'Bug',
        'System.State': 'Active',
      });

      mockAdoClientInstance.post.mockResolvedValue(
        makeWiqlResponse([1, 2, 3]),
      );
      mockAdoClientInstance.get.mockResolvedValue(
        makeBatchResponse([userStoryActive, userStoryNew, bugActive]),
      );

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['status']).toBe('items_fetched');
      expect(result['total']).toBe(3);

      const items = result['items'] as Record<
        string,
        Record<string, unknown[]>
      >;

      // User Story group should have Active and New states
      expect(items['User Story']).toBeDefined();
      expect(items['User Story']['Active']).toHaveLength(1);
      expect(items['User Story']['New']).toHaveLength(1);

      // Bug group should have Active state
      expect(items['Bug']).toBeDefined();
      expect(items['Bug']['Active']).toHaveLength(1);
    });

    it('returns sanitized work item fields in grouped output', async () => {
      mockAdoClientInstance.post.mockResolvedValue(
        makeWiqlResponse([123]),
      );
      mockAdoClientInstance.get.mockResolvedValue(
        makeBatchResponse([makeWorkItem()]),
      );

      const response = await toolHandler({}, {});
      const result = parseResult(response);
      const items = result['items'] as Record<
        string,
        Record<string, Array<Record<string, unknown>>>
      >;

      const firstItem = items['User Story']['Active'][0];
      expect(firstItem['id']).toBe(123);
      expect(firstItem['title']).toBe('Test item');
      expect(firstItem['type']).toBe('User Story');
      expect(firstItem['state']).toBe('Active');
      expect(firstItem['assignedTo']).toBe('user@test.com');
      expect(firstItem['description']).toBe('Description');
      expect(firstItem['acceptanceCriteria']).toBe('AC');
      expect(firstItem['iteration']).toBe('TestProject\\Sprint 1');
      expect(firstItem['areaPath']).toBe('TestProject');
      expect(firstItem['tags']).toBe('tag1; tag2');
      expect(firstItem['createdDate']).toBe('2026-01-01T00:00:00Z');
      expect(firstItem['changedDate']).toBe('2026-01-02T00:00:00Z');
    });
  });

  // -------------------------------------------------------------------------
  // Auth fallback
  // -------------------------------------------------------------------------

  describe('auth fallback', () => {
    it('uses file fallback auth when keytar is unavailable', async () => {
      mockKeytarIsAvailable.mockResolvedValue(false);

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['status']).toBe('items_fetched');
      // Verify AdoClient.create was called -- file fallback is used
      // when keytar is unavailable, meaning FileFallbackStrategy is
      // constructed instead of KeytarStrategy.
      expect(mockAdoClientCreate).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('returns normalized error on ADO failure', async () => {
      mockAdoClientInstance.post.mockRejectedValue(
        new Error('Network timeout'),
      );

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['error']).toBeDefined();
      expect(result['message']).toBeDefined();
    });

    it('does not call logger on error when no flow is provided', async () => {
      mockAdoClientInstance.post.mockRejectedValue(
        new Error('Network timeout'),
      );

      await toolHandler({}, {});

      expect(mockLoggerInstance.flush).not.toHaveBeenCalled();
      expect(mockLoggerInstance.close).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Activity logging
  // -------------------------------------------------------------------------

  describe('activity logging', () => {
    it('does not call logger on success when no flow is provided', async () => {
      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['status']).toBe('items_fetched');
      expect(mockLoggerInstance.log).not.toHaveBeenCalled();
    });

    it('does not call logger on empty results when no flow is provided', async () => {
      mockAdoClientInstance.post.mockResolvedValue(makeWiqlResponse([]));

      await toolHandler({}, {});

      expect(mockLoggerInstance.log).not.toHaveBeenCalled();
    });
  });
});
