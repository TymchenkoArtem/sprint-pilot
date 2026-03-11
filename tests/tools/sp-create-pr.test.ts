/**
 * Unit tests for the sp-create-pr MCP tool.
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

import { registerSpCreatePr } from '../../src/tools/sp-create-pr.js';
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

/** Default args for a successful PR creation. */
function makeValidArgs(): Record<string, unknown> {
  return {
    source_branch: 'feature-branch',
    title: 'Test PR',
  };
}

/** Mock repo response shared across tests. */
const mockRepoResponse = {
  count: 1,
  value: [{
    id: 'repo-1',
    name: 'TestProject',
    defaultBranch: 'refs/heads/main',
    project: { id: 'proj-1', name: 'TestProject' },
  }],
};

/** Mock PR creation response from ADO. */
const mockCreatedPr = {
  pullRequestId: 42,
  title: 'Test PR',
  status: 'active',
  sourceRefName: 'refs/heads/feature-branch',
  targetRefName: 'refs/heads/main',
  repository: { id: 'repo-1', name: 'TestProject' },
  createdBy: { displayName: 'User', uniqueName: 'user@test.com' },
};

/** Set up the mock chain for a successful PR creation with no existing PRs. */
function setupHappyPathMocks(): void {
  // First get: repositories
  mockAdoClientInstance.get.mockResolvedValueOnce(mockRepoResponse);
  // Second get: existing PRs -- none active
  mockAdoClientInstance.get.mockResolvedValueOnce({
    count: 0,
    value: [],
  });
  // Post: create PR
  mockAdoClientInstance.post.mockResolvedValueOnce(mockCreatedPr);
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Re-register the tool to capture a fresh handler
  mockServer.tool.mockClear();
  registerSpCreatePr(mockServer as unknown as McpServer);

  // Default mock behaviors
  mockConfigManagerInstance.load.mockResolvedValue(defaultConfig);
  mockKeytarIsAvailable.mockResolvedValue(true);
  mockAdoClientCreate.mockResolvedValue(mockAdoClientInstance);
  mockAdoClientInstance.getCurrentUserId.mockReturnValue('user-id-123');
  mockScopeValidatorInstance.validatePrTarget.mockReturnValue(undefined);
  mockScopeValidatorInstance.validateWorkItem.mockReturnValue(undefined);

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

describe('sp-create-pr', () => {
  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  it('registers tool with the server as sp-create-pr', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'sp-create-pr',
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
        { source_branch: 'feature', title: 'PR title', unknown_key: 'bad' },
        {},
      );
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('successful PR creation', () => {
    it('returns pr_created with pr_id, source, target, url, repository, and metadata', async () => {
      setupHappyPathMocks();

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['status']).toBe('pr_created');
      expect(result['pr_id']).toBe(42);
      expect(result['source']).toBe('feature-branch');
      expect(result['target']).toBe('main');
      expect(result['url']).toBe(
        'https://dev.azure.com/test-org/TestProject/_git/TestProject/pullrequest/42',
      );
      expect(result['repository']).toBe('TestProject');
      expect(result['work_item_linked']).toBe(false);
      expect(result['tags']).toEqual([]);
      expect(response.content[0].type).toBe('text');
    });

    it('does not instantiate logger when no flow is provided', async () => {
      setupHappyPathMocks();

      await toolHandler(makeValidArgs(), {});

      expect(mockLoggerInstance.log).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // PR created with non-active status (warning)
  // -------------------------------------------------------------------------

  describe('PR created with non-active status', () => {
    it('returns pr_created_with_warning when PR status is not active', async () => {
      // First get: repositories
      mockAdoClientInstance.get.mockResolvedValueOnce(mockRepoResponse);
      // Second get: existing PRs -- none
      mockAdoClientInstance.get.mockResolvedValueOnce({ count: 0, value: [] });
      // Post: create PR with non-active status
      mockAdoClientInstance.post.mockResolvedValueOnce({
        ...mockCreatedPr,
        pullRequestId: 77,
        status: 'notSet',
      });

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['status']).toBe('pr_created_with_warning');
      expect(result['pr_id']).toBe(77);
      expect(result['pr_status']).toBe('notSet');
      expect(result['url']).toBe(
        'https://dev.azure.com/test-org/TestProject/_git/TestProject/pullrequest/77',
      );
      expect(result['repository']).toBe('TestProject');
      expect(result['warning']).toContain('notSet');
    });
  });

  // -------------------------------------------------------------------------
  // PR already exists
  // -------------------------------------------------------------------------

  describe('existing active PR', () => {
    it('returns pr_exists when active PR already exists from same source branch', async () => {
      // First get: repositories
      mockAdoClientInstance.get.mockResolvedValueOnce(mockRepoResponse);
      // Second get: existing PRs -- one active
      mockAdoClientInstance.get.mockResolvedValueOnce({
        count: 1,
        value: [{
          pullRequestId: 99,
          title: 'Existing PR',
          status: 'active',
          sourceRefName: 'refs/heads/feature-branch',
          targetRefName: 'refs/heads/main',
          repository: { id: 'repo-1', name: 'TestProject' },
          createdBy: { displayName: 'User', uniqueName: 'user@test.com' },
          url: 'https://dev.azure.com/test-org/TestProject/_git/TestProject/pullrequest/99',
        }],
      });

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['status']).toBe('pr_exists');
      expect(result['pr_id']).toBe(99);
      expect(result['url']).toBe(
        'https://dev.azure.com/test-org/TestProject/_git/TestProject/pullrequest/99',
      );
      expect(result['repository']).toBe('TestProject');
    });

    it('does not call logger for pr_exists path when no flow is provided', async () => {
      mockAdoClientInstance.get.mockResolvedValueOnce(mockRepoResponse);
      mockAdoClientInstance.get.mockResolvedValueOnce({
        count: 1,
        value: [{
          pullRequestId: 99,
          title: 'Existing PR',
          status: 'active',
          sourceRefName: 'refs/heads/feature-branch',
          targetRefName: 'refs/heads/main',
          repository: { id: 'repo-1', name: 'TestProject' },
          createdBy: { displayName: 'User', uniqueName: 'user@test.com' },
          url: 'https://dev.azure.com/test-org/TestProject/_git/TestProject/pullrequest/99',
        }],
      });

      await toolHandler(makeValidArgs(), {});

      expect(mockLoggerInstance.log).not.toHaveBeenCalled();
      expect(mockLoggerInstance.logError).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Work item linking
  // -------------------------------------------------------------------------

  describe('work item linking', () => {
    it('links work item when work_item_id is provided', async () => {
      // First get: repositories
      mockAdoClientInstance.get.mockResolvedValueOnce(mockRepoResponse);
      // Second get: existing PRs -- none
      mockAdoClientInstance.get.mockResolvedValueOnce({ count: 0, value: [] });
      // Third get: work item expand (validate scope)
      mockAdoClientInstance.get.mockResolvedValueOnce({
        id: 123,
        fields: {
          'System.WorkItemType': 'User Story',
          'System.Title': 'Test story',
          'System.State': 'Active',
          'System.TeamProject': 'TestProject',
          'System.AssignedTo': { uniqueName: 'user@test.com' },
        },
      });
      // Post: create PR
      mockAdoClientInstance.post.mockResolvedValueOnce({
        ...mockCreatedPr,
        pullRequestId: 55,
      });

      const args = { ...makeValidArgs(), work_item_id: 123 };
      const response = await toolHandler(args, {});
      const result = parseResult(response);

      expect(result['status']).toBe('pr_created');
      expect(result['work_item_linked']).toBe(true);
      expect(result['pr_id']).toBe(55);

      // Verify the post body includes workItemRefs
      const postCallArgs = mockAdoClientInstance.post.mock.calls[0];
      const prBody = postCallArgs[1] as Record<string, unknown>;
      expect(prBody['workItemRefs']).toEqual([{ id: '123' }]);
    });

    it('validates work item scope via scopeValidator', async () => {
      // First get: repositories
      mockAdoClientInstance.get.mockResolvedValueOnce(mockRepoResponse);
      // Second get: existing PRs -- none
      mockAdoClientInstance.get.mockResolvedValueOnce({ count: 0, value: [] });
      // Third get: work item expand
      const mockWorkItem = {
        id: 456,
        fields: {
          'System.WorkItemType': 'User Story',
          'System.Title': 'Test story',
          'System.State': 'Active',
          'System.TeamProject': 'TestProject',
          'System.AssignedTo': { uniqueName: 'user@test.com' },
        },
      };
      mockAdoClientInstance.get.mockResolvedValueOnce(mockWorkItem);
      // Post: create PR
      mockAdoClientInstance.post.mockResolvedValueOnce(mockCreatedPr);

      await toolHandler({ ...makeValidArgs(), work_item_id: 456 }, {});

      expect(mockScopeValidatorInstance.validateWorkItem).toHaveBeenCalledWith(mockWorkItem);
    });
  });

  // -------------------------------------------------------------------------
  // Tags / labels
  // -------------------------------------------------------------------------

  describe('tags and labels', () => {
    it('adds labels when tags array is provided', async () => {
      setupHappyPathMocks();

      const args = { ...makeValidArgs(), tags: ['ready-for-review', 'frontend'] };
      const response = await toolHandler(args, {});
      const result = parseResult(response);

      expect(result['status']).toBe('pr_created');
      expect(result['tags']).toEqual(['ready-for-review', 'frontend']);

      // Verify the post body includes labels
      const postCallArgs = mockAdoClientInstance.post.mock.calls[0];
      const prBody = postCallArgs[1] as Record<string, unknown>;
      expect(prBody['labels']).toEqual([
        { name: 'ready-for-review' },
        { name: 'frontend' },
      ]);
    });

    it('omits labels field from body when tags is not provided', async () => {
      setupHappyPathMocks();

      await toolHandler(makeValidArgs(), {});

      const postCallArgs = mockAdoClientInstance.post.mock.calls[0];
      const prBody = postCallArgs[1] as Record<string, unknown>;
      expect(prBody['labels']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Scope validation failure -- PR target
  // -------------------------------------------------------------------------

  describe('scope validation', () => {
    it('returns scope_violation error when validatePrTarget throws', async () => {
      mockScopeValidatorInstance.validatePrTarget.mockImplementation(() => {
        throw new ScopeViolationError(
          "Target branch 'refs/heads/main' is not allowed by configured scope.",
        );
      });

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['error']).toBe('scope_violation');
      expect(result['message']).toContain('Target branch');
    });

    it('returns normalized error JSON when PR target scope validation fails', async () => {
      mockScopeValidatorInstance.validatePrTarget.mockImplementation(() => {
        throw new ScopeViolationError(
          "Target branch 'refs/heads/main' is not allowed.",
        );
      });

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['error']).toBe('scope_violation');
      expect(result['message']).toContain('Target branch');
    });
  });

  // -------------------------------------------------------------------------
  // Repo resolution -- prefers project-name-matching repo
  // -------------------------------------------------------------------------

  describe('repo resolution', () => {
    it('uses repo matching project name even if not first in list', async () => {
      // Repositories: first is "OtherRepo", second matches project name "TestProject"
      mockAdoClientInstance.get.mockResolvedValueOnce({
        count: 2,
        value: [
          { id: 'repo-other', name: 'OtherRepo', defaultBranch: 'refs/heads/main', project: { id: 'proj-1', name: 'TestProject' } },
          { id: 'repo-match', name: 'TestProject', defaultBranch: 'refs/heads/main', project: { id: 'proj-1', name: 'TestProject' } },
        ],
      });
      // Existing PRs -- none
      mockAdoClientInstance.get.mockResolvedValueOnce({ count: 0, value: [] });
      // Create PR
      mockAdoClientInstance.post.mockResolvedValueOnce(mockCreatedPr);

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['status']).toBe('pr_created');
      expect(result['repository']).toBe('TestProject');
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
  // Work item scope validation failure
  // -------------------------------------------------------------------------

  describe('work item scope validation failure', () => {
    it('returns scope_violation when work item validation fails', async () => {
      // First get: repositories
      mockAdoClientInstance.get.mockResolvedValueOnce(mockRepoResponse);
      // Second get: existing PRs -- none
      mockAdoClientInstance.get.mockResolvedValueOnce({ count: 0, value: [] });
      // Third get: work item expand
      mockAdoClientInstance.get.mockResolvedValueOnce({
        id: 789,
        fields: {
          'System.WorkItemType': 'Epic',
          'System.Title': 'Out of scope epic',
          'System.State': 'Active',
          'System.TeamProject': 'OtherProject',
          'System.AssignedTo': { uniqueName: 'other@test.com' },
        },
      });

      // ScopeValidator rejects the work item
      mockScopeValidatorInstance.validateWorkItem.mockImplementation(() => {
        throw new ScopeViolationError(
          "Work item type 'Epic' is not in the allowed list.",
        );
      });

      const args = { ...makeValidArgs(), work_item_id: 789 };
      const response = await toolHandler(args, {});
      const result = parseResult(response);

      expect(result['error']).toBe('scope_violation');
      expect(result['message']).toContain('Epic');
    });
  });

  // -------------------------------------------------------------------------
  // ADO create PR failure
  // -------------------------------------------------------------------------

  describe('ADO create PR failure', () => {
    it('returns error when ADO post fails', async () => {
      // First get: repositories
      mockAdoClientInstance.get.mockResolvedValueOnce(mockRepoResponse);
      // Second get: existing PRs -- none
      mockAdoClientInstance.get.mockResolvedValueOnce({ count: 0, value: [] });
      // Post: ADO create PR throws
      mockAdoClientInstance.post.mockRejectedValueOnce(
        new SprintPilotError(
          'ado_forbidden',
          'You do not have permission to create pull requests.',
          'Check that your PAT has Code (Read & Write) scope.',
        ),
      );

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['error']).toBe('ado_forbidden');
      expect(result['message']).toContain('permission');
    });

    it('returns normalized error JSON when ADO create PR fails', async () => {
      mockAdoClientInstance.get.mockResolvedValueOnce(mockRepoResponse);
      mockAdoClientInstance.get.mockResolvedValueOnce({ count: 0, value: [] });
      mockAdoClientInstance.post.mockRejectedValueOnce(
        new SprintPilotError(
          'ado_forbidden',
          'You do not have permission to create pull requests.',
        ),
      );

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['error']).toBe('ado_forbidden');
      expect(result['message']).toContain('permission');
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
