/**
 * Unit tests for the sp-get-iterations MCP tool.
 *
 * The tool is registered via server.tool() with a closure handler.
 * We capture the handler by providing a mock McpServer, then call
 * the handler directly with mock arguments.
 *
 * All external dependencies are mocked at the module level via vi.mock().
 * Mock instances are created with vi.hoisted() so they are available
 * inside hoisted vi.mock() factory functions.
 *
 * NOTE: response-sanitizer is NOT mocked -- the real sanitizeIteration
 * function runs to verify the full sanitization pipeline.
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

import { registerSpGetIterations } from '../../src/tools/sp-get-iterations.js';

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
  git: { baseBranchOrTag: 'main', prTargetBranch: 'main', branchTemplate: 'features/{id}-{slug}', commitTemplate: '#{id}: {description}' },
  testing: { testCommand: 'npm test' },
};

const iterationsResponse = {
  count: 3,
  value: [
    { id: 'iter-1', name: 'Sprint 1', path: 'TestProject\\Sprint 1', attributes: { startDate: '2026-01-01', finishDate: '2026-01-14', timeFrame: 'past' } },
    { id: 'iter-2', name: 'Sprint 2', path: 'TestProject\\Sprint 2', attributes: { startDate: '2026-01-15', finishDate: '2026-01-28', timeFrame: 'current' } },
    { id: 'iter-3', name: 'Sprint 3', path: 'TestProject\\Sprint 3', attributes: { startDate: '2026-01-29', finishDate: '2026-02-11', timeFrame: 'future' } },
  ],
};

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockServer.tool.mockClear();
  registerSpGetIterations(mockServer as unknown as McpServer);

  // Default mock behaviors
  mockConfigManagerInstance.load.mockResolvedValue({ ...defaultConfig });
  mockKeytarIsAvailable.mockResolvedValue(true);
  mockAdoClientCreate.mockResolvedValue(mockAdoClientInstance);

  // ADO get returns the iterations response
  mockAdoClientInstance.get.mockResolvedValue(iterationsResponse);

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

describe('sp-get-iterations', () => {
  it('registers tool with the server as sp-get-iterations', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'sp-get-iterations',
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
      const response = await toolHandler({ extraField: 'should fail' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
      expect(result['message']).toBeDefined();
    });

    it('accepts empty object as valid input', async () => {
      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['status']).toBe('iterations_fetched');
    });
  });

  // -------------------------------------------------------------------------
  // Successful iteration fetch
  // -------------------------------------------------------------------------

  describe('successful iteration fetch', () => {
    it('returns iterations_fetched with sanitized iterations', async () => {
      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['status']).toBe('iterations_fetched');

      const iterations = result['iterations'] as Array<Record<string, unknown>>;
      expect(iterations).toHaveLength(3);

      // Verify sanitization produced the expected flat shape
      expect(iterations[0]).toEqual({
        id: 'iter-1',
        name: 'Sprint 1',
        path: 'TestProject\\Sprint 1',
        startDate: '2026-01-01',
        finishDate: '2026-01-14',
        timeFrame: 'past',
      });

      expect(iterations[1]).toEqual({
        id: 'iter-2',
        name: 'Sprint 2',
        path: 'TestProject\\Sprint 2',
        startDate: '2026-01-15',
        finishDate: '2026-01-28',
        timeFrame: 'current',
      });

      expect(iterations[2]).toEqual({
        id: 'iter-3',
        name: 'Sprint 3',
        path: 'TestProject\\Sprint 3',
        startDate: '2026-01-29',
        finishDate: '2026-02-11',
        timeFrame: 'future',
      });
    });

    it('identifies the current iteration by timeFrame', async () => {
      const response = await toolHandler({}, {});
      const result = parseResult(response);

      const current = result['current'] as Record<string, unknown>;
      expect(current).not.toBeNull();
      expect(current['name']).toBe('Sprint 2');
      expect(current['timeFrame']).toBe('current');
    });

    it('returns null for current when no iteration has timeFrame current', async () => {
      const noCurrent = {
        count: 2,
        value: [
          { id: 'iter-1', name: 'Sprint 1', path: 'TestProject\\Sprint 1', attributes: { startDate: '2026-01-01', finishDate: '2026-01-14', timeFrame: 'past' } },
          { id: 'iter-3', name: 'Sprint 3', path: 'TestProject\\Sprint 3', attributes: { startDate: '2026-01-29', finishDate: '2026-02-11', timeFrame: 'future' } },
        ],
      };
      mockAdoClientInstance.get.mockResolvedValue(noCurrent);

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['current']).toBeNull();
    });

    it('handles empty iterations list', async () => {
      mockAdoClientInstance.get.mockResolvedValue({ count: 0, value: [] });

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      expect(result['status']).toBe('iterations_fetched');
      expect(result['iterations']).toEqual([]);
      expect(result['current']).toBeNull();
    });

    it('sanitizes iterations with missing optional attributes', async () => {
      const partialIter = {
        count: 1,
        value: [
          { id: 'iter-x', name: 'Sprint X', path: 'TestProject\\Sprint X', attributes: {} },
        ],
      };
      mockAdoClientInstance.get.mockResolvedValue(partialIter);

      const response = await toolHandler({}, {});
      const result = parseResult(response);

      const iterations = result['iterations'] as Array<Record<string, unknown>>;
      expect(iterations).toHaveLength(1);
      // sanitizeIteration defaults missing fields to empty strings
      expect(iterations[0]).toEqual({
        id: 'iter-x',
        name: 'Sprint X',
        path: 'TestProject\\Sprint X',
        startDate: '',
        finishDate: '',
        timeFrame: '',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Team name resolution
  // -------------------------------------------------------------------------

  describe('team name resolution', () => {
    it('uses team from config when present', async () => {
      mockConfigManagerInstance.load.mockResolvedValue({
        ...defaultConfig,
        team: 'CustomTeam',
      });

      await toolHandler({}, {});

      expect(mockAdoClientInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('CustomTeam'),
        expect.anything(),
      );
    });

    it('defaults team to project + " Team" when team is not in config', async () => {
      // defaultConfig has no team field
      await toolHandler({}, {});

      expect(mockAdoClientInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('TestProject%20Team'),
        expect.anything(),
      );
    });

    it('URL-encodes the team name in the endpoint', async () => {
      mockConfigManagerInstance.load.mockResolvedValue({
        ...defaultConfig,
        team: 'My Special Team',
      });

      await toolHandler({}, {});

      expect(mockAdoClientInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('My%20Special%20Team'),
        expect.anything(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // ADO failure
  // -------------------------------------------------------------------------

  describe('ADO failure', () => {
    it('returns error when adoClient.get rejects', async () => {
      mockAdoClientInstance.get.mockRejectedValue(new Error('ADO 500 Internal Server Error'));

      const response = await toolHandler({}, {});
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
      await toolHandler({}, {});

      expect(mockLoggerInstance.log).not.toHaveBeenCalled();
      expect(mockLoggerInstance.flush).not.toHaveBeenCalled();
      expect(mockLoggerInstance.close).not.toHaveBeenCalled();
    });

    it('does not call logger on error when no flow is provided', async () => {
      mockAdoClientInstance.get.mockRejectedValue(new Error('ADO failure'));

      await toolHandler({}, {});

      expect(mockLoggerInstance.flush).not.toHaveBeenCalled();
      expect(mockLoggerInstance.close).not.toHaveBeenCalled();
    });
  });
});
