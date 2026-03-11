/**
 * Unit tests for the sp-config MCP tool.
 *
 * The tool is registered via server.tool() with a closure handler.
 * We capture the handler by providing a mock McpServer, then call
 * the handler directly with mock arguments.
 *
 * Dependencies (ConfigManager, ActivityLogger) are mocked at module level.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SprintPilotConfig } from '../../src/config/config-schema.js';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockConfigManagerInstance = {
  exists: vi.fn(),
  load: vi.fn(),
  write: vi.fn(),
};

vi.mock('../../src/config/config-manager.js', () => ({
  ConfigManager: vi.fn(() => mockConfigManagerInstance),
}));

const mockLoggerInstance = {
  log: vi.fn().mockResolvedValue(undefined),
  logError: vi.fn().mockResolvedValue(undefined),
  flush: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../src/shared/logger.js', () => ({
  ActivityLogger: vi.fn(() => mockLoggerInstance),
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------

import { registerSpConfig } from '../../src/tools/sp-config.js';
import { ConfigMissingError } from '../../src/shared/errors.js';

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

function makeMockConfig(): SprintPilotConfig {
  return {
    organizationUrl: 'https://dev.azure.com/test-org',
    project: 'TestProject',
    allowedWorkItemTypes: ['User Story', 'Bug', 'Task'],
    statusMapping: {
      'User Story': {
        blocked: 'Blocked',
        inProgress: 'Active',
        inReview: 'Resolved',
      },
      Bug: {
        blocked: 'Blocked',
        inProgress: 'Active',
        inReview: 'Resolved',
      },
      Task: {
        blocked: 'Blocked',
        inProgress: 'Active',
        inReview: 'Resolved',
      },
    },
    git: {
      baseBranchOrTag: 'main',
      prTargetBranch: 'main',
      branchTemplate: 'features/{id}-{slug}',
      commitTemplate: '#{id}: {description}',
    },
    testing: { testCommand: 'npm test' },
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();

  // Re-register the tool to capture a fresh handler
  mockServer.tool.mockClear();
  registerSpConfig(mockServer as unknown as McpServer);

  // Default mock behaviors
  mockConfigManagerInstance.load.mockResolvedValue(makeMockConfig());
  mockConfigManagerInstance.write.mockResolvedValue(undefined);
  mockConfigManagerInstance.exists.mockResolvedValue(true);

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

describe('sp-config', () => {
  it('registers tool with the server', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'sp-config',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  // -------------------------------------------------------------------------
  // Read action
  // -------------------------------------------------------------------------

  describe('read action', () => {
    it('returns current config on read action', async () => {
      const response = await toolHandler({ action: 'read' }, {});
      const result = parseResult(response);

      expect(result['status']).toBe('success');
      const config = result['config'] as Record<string, unknown>;
      expect(config['organizationUrl']).toBe('https://dev.azure.com/test-org');
      expect(config['project']).toBe('TestProject');
      expect(response.content[0].type).toBe('text' as const);
    });

    it('returns config_missing error when config does not exist', async () => {
      mockConfigManagerInstance.load.mockRejectedValue(
        new ConfigMissingError(),
      );

      const response = await toolHandler({ action: 'read' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('config_missing');
    });
  });

  // -------------------------------------------------------------------------
  // Write action -- validation errors
  // -------------------------------------------------------------------------

  describe('write action validation', () => {
    it('returns error when no updates provided', async () => {
      const response = await toolHandler(
        { action: 'write', updates: {} },
        {},
      );
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
      expect(result['message']).toContain('No updates provided');
    });

    it('returns error when updates is undefined', async () => {
      const response = await toolHandler({ action: 'write' }, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
      expect(result['message']).toContain('No updates provided');
    });

    it('rejects locked field organizationUrl', async () => {
      const response = await toolHandler(
        {
          action: 'write',
          updates: { organizationUrl: 'https://dev.azure.com/other-org' },
        },
        {},
      );
      const result = parseResult(response);

      expect(result['error']).toBe('config_invalid');
      expect(result['message']).toContain('organizationUrl');
      expect(result['message']).toContain('locked');
    });

    it('rejects locked field project', async () => {
      const response = await toolHandler(
        {
          action: 'write',
          updates: { project: 'OtherProject' },
        },
        {},
      );
      const result = parseResult(response);

      expect(result['error']).toBe('config_invalid');
      expect(result['message']).toContain('project');
    });

    it('rejects unknown fields', async () => {
      const response = await toolHandler(
        {
          action: 'write',
          updates: { unknownField: 'value', anotherBadField: 42 },
        },
        {},
      );
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
      expect(result['message']).toContain('unknownField');
      expect(result['message']).toContain('anotherBadField');
    });
  });

  // -------------------------------------------------------------------------
  // Write action -- successful updates
  // -------------------------------------------------------------------------

  describe('write action success', () => {
    it('updates allowed top-level fields', async () => {
      const response = await toolHandler(
        {
          action: 'write',
          updates: { team: 'NewTeam' },
        },
        {},
      );
      const result = parseResult(response);

      expect(result['status']).toBe('success');
      expect(result['message']).toContain('updated successfully');
      expect(mockConfigManagerInstance.write).toHaveBeenCalledTimes(1);

      // Verify the written config has the team field
      const writtenConfig = mockConfigManagerInstance.write.mock
        .calls[0][0] as SprintPilotConfig;
      expect(writtenConfig.team).toBe('NewTeam');
    });

    it('deep-merges nested fields like git.baseBranchOrTag', async () => {
      const response = await toolHandler(
        {
          action: 'write',
          updates: { 'git.baseBranchOrTag': 'develop' },
        },
        {},
      );
      const result = parseResult(response);

      expect(result['status']).toBe('success');
      const writtenConfig = mockConfigManagerInstance.write.mock
        .calls[0][0] as SprintPilotConfig;
      expect(writtenConfig.git.baseBranchOrTag).toBe('develop');
      // Other git fields should be preserved
      expect(writtenConfig.git.prTargetBranch).toBe('main');
      expect(writtenConfig.git.branchTemplate).toBe('features/{id}-{slug}');
      expect(writtenConfig.git.commitTemplate).toBe('#{id}: {description}');
    });

    it('validates merged config against schema', async () => {
      // This test verifies that ConfigSchema.safeParse is called on the
      // merged result. We can confirm by providing valid updates and
      // checking the write succeeds.
      const response = await toolHandler(
        {
          action: 'write',
          updates: { 'testing.testCommand': 'vitest run' },
        },
        {},
      );
      const result = parseResult(response);

      expect(result['status']).toBe('success');
      const writtenConfig = mockConfigManagerInstance.write.mock
        .calls[0][0] as SprintPilotConfig;
      expect(writtenConfig.testing.testCommand).toBe('vitest run');
    });

    it('returns config_invalid when merged config fails validation', async () => {
      // Make the existing config have an empty allowedWorkItemTypes
      // so that after merge, validation fails
      const invalidBaseConfig = makeMockConfig();

      mockConfigManagerInstance.load.mockResolvedValue(invalidBaseConfig);

      // Setting allowedWorkItemTypes to empty array should fail min(1)
      const response = await toolHandler(
        {
          action: 'write',
          updates: { allowedWorkItemTypes: [] },
        },
        {},
      );
      const result = parseResult(response);

      expect(result['error']).toBe('config_invalid');
    });
  });
});
