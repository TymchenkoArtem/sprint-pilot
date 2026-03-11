/**
 * Unit tests for src/shared/init-core.ts -- extracted init helpers and pipeline.
 *
 * All external dependencies are mocked at the module level via vi.mock().
 * Mock instances are created with vi.hoisted() so they are available
 * inside hoisted vi.mock() factory functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock instances
// ---------------------------------------------------------------------------

const {
  mockConfigManagerInstance,
  mockKeytarIsAvailable,
  mockKeytarInstance,
  mockFileFallbackInstance,
  mockAdoClientCreate,
  mockAdoClientInstance,
  mockLoggerInstance,
  mockStat,
  mockAccess,
  mockReadFile,
  mockWriteFile,
  mockMkdir,
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

  const _mockStat = vi.fn();
  const _mockAccess = vi.fn();
  const _mockReadFile = vi.fn();
  const _mockWriteFile = vi.fn().mockResolvedValue(undefined);
  const _mockMkdir = vi.fn().mockResolvedValue(undefined);

  return {
    mockConfigManagerInstance: _mockConfigManagerInstance,
    mockKeytarIsAvailable: _mockKeytarIsAvailable,
    mockKeytarInstance: _mockKeytarInstance,
    mockFileFallbackInstance: _mockFileFallbackInstance,
    mockAdoClientCreate: _mockAdoClientCreate,
    mockAdoClientInstance: _mockAdoClientInstance,
    mockLoggerInstance: _mockLoggerInstance,
    mockStat: _mockStat,
    mockAccess: _mockAccess,
    mockReadFile: _mockReadFile,
    mockWriteFile: _mockWriteFile,
    mockMkdir: _mockMkdir,
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
  AdoClient: {
    create: mockAdoClientCreate,
  },
}));

vi.mock('../../src/shared/logger.js', () => ({
  ActivityLogger: vi.fn(() => mockLoggerInstance),
}));

vi.mock('node:fs/promises', () => ({
  stat: mockStat,
  access: mockAccess,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------

import {
  directoryExists,
  fileExists,
  detectPackageJsonScripts,
  buildDefaultStatusMapping,
  updateGitignore,
  selectAuthStrategy,
  runInitPipeline,
  InitValidationError,
} from '../../src/shared/init-core.js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockStat.mockReset();
  mockAccess.mockReset();
  mockReadFile.mockReset();
  mockWriteFile.mockResolvedValue(undefined);
  mockMkdir.mockResolvedValue(undefined);

  mockConfigManagerInstance.exists.mockResolvedValue(false);
  mockConfigManagerInstance.load.mockResolvedValue({});
  mockConfigManagerInstance.write.mockResolvedValue(undefined);

  mockKeytarIsAvailable.mockResolvedValue(true);
  mockKeytarInstance.validate.mockResolvedValue({
    valid: true,
    missingScopes: [],
    excessiveScopes: [],
  });
  mockKeytarInstance.store.mockResolvedValue(undefined);

  mockFileFallbackInstance.validate.mockResolvedValue({
    valid: true,
    missingScopes: [],
    excessiveScopes: [],
  });
  mockFileFallbackInstance.store.mockResolvedValue(undefined);

  mockAdoClientCreate.mockResolvedValue(mockAdoClientInstance);
  mockAdoClientInstance.get.mockResolvedValue({
    count: 5,
    value: [
      { name: 'New', color: '000000', category: 'Proposed' },
      { name: 'Active', color: '007acc', category: 'InProgress' },
      { name: 'Resolved', color: '339933', category: 'Resolved' },
      { name: 'Blocked', color: 'cc0000', category: 'InProgress' },
      { name: 'Closed', color: '999999', category: 'Completed' },
    ],
  });

  mockLoggerInstance.log.mockResolvedValue(undefined);
  mockLoggerInstance.flush.mockResolvedValue(undefined);
  mockLoggerInstance.close.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests: directoryExists
// ---------------------------------------------------------------------------

describe('directoryExists', () => {
  it('returns true when stat reports a directory', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    expect(await directoryExists('fabric')).toBe(true);
  });

  it('returns false when stat reports a file', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => false });
    expect(await directoryExists('somefile.txt')).toBe(false);
  });

  it('returns false when stat throws', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));
    expect(await directoryExists('nonexistent')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: fileExists
// ---------------------------------------------------------------------------

describe('fileExists', () => {
  it('returns true when access succeeds', async () => {
    mockAccess.mockResolvedValue(undefined);
    expect(await fileExists('test.txt')).toBe(true);
  });

  it('returns false when access throws', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    expect(await fileExists('missing.txt')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: detectPackageJsonScripts
// ---------------------------------------------------------------------------

describe('detectPackageJsonScripts', () => {
  it('detects dev and test scripts', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ scripts: { dev: 'vite', test: 'vitest' } }),
    );
    const result = await detectPackageJsonScripts();
    expect(result.devServerCommand).toBe('npm run dev');
    expect(result.testCommand).toBe('npm test');
  });

  it('detects start script as devServerCommand', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ scripts: { start: 'node server.js' } }),
    );
    const result = await detectPackageJsonScripts();
    expect(result.devServerCommand).toBe('npm start');
  });

  it('detects serve script as devServerCommand', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ scripts: { serve: 'vue-cli-service serve' } }),
    );
    const result = await detectPackageJsonScripts();
    expect(result.devServerCommand).toBe('npm run serve');
  });

  it('detects test:unit script', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ scripts: { 'test:unit': 'vitest run' } }),
    );
    const result = await detectPackageJsonScripts();
    expect(result.testCommand).toBe('npm run test:unit');
  });

  it('returns undefined for both when package.json is missing', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const result = await detectPackageJsonScripts();
    expect(result.devServerCommand).toBeUndefined();
    expect(result.testCommand).toBeUndefined();
  });

  it('returns undefined when scripts section is missing', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ name: 'test' }));
    const result = await detectPackageJsonScripts();
    expect(result.devServerCommand).toBeUndefined();
    expect(result.testCommand).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: buildDefaultStatusMapping
// ---------------------------------------------------------------------------

describe('buildDefaultStatusMapping', () => {
  it('maps ADO states to blocked/inProgress/inReview', () => {
    const states = ['New', 'Active', 'Resolved', 'Blocked', 'Closed'];
    const result = buildDefaultStatusMapping(states);
    expect(result.blocked).toBe('Blocked');
    expect(result.inProgress).toBe('Active');
    expect(result.inReview).toBe('Resolved');
  });

  it('uses alternative candidates', () => {
    const states = ['New', 'In Progress', 'In Review', 'On Hold', 'Done'];
    const result = buildDefaultStatusMapping(states);
    expect(result.blocked).toBe('On Hold');
    expect(result.inProgress).toBe('In Progress');
    expect(result.inReview).toBe('In Review');
  });

  it('falls back to defaults when no candidates match', () => {
    const states = ['Custom1', 'Custom2', 'Custom3'];
    const result = buildDefaultStatusMapping(states);
    expect(result.blocked).toBe('Blocked');
    expect(result.inProgress).toBe('Active');
    expect(result.inReview).toBe('Resolved');
  });
});

// ---------------------------------------------------------------------------
// Tests: updateGitignore
// ---------------------------------------------------------------------------

describe('updateGitignore', () => {
  it('creates .gitignore with entries when it does not exist', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    await updateGitignore(['.sprint-pilot/']);

    expect(mockWriteFile).toHaveBeenCalledWith(
      '.gitignore',
      '.sprint-pilot/\n',
    );
  });

  it('appends missing entries to existing .gitignore', async () => {
    mockReadFile.mockResolvedValue('node_modules/\n');

    await updateGitignore(['.sprint-pilot/']);

    expect(mockWriteFile).toHaveBeenCalledWith(
      '.gitignore',
      'node_modules/\n.sprint-pilot/\n',
    );
  });

  it('does not duplicate existing entries', async () => {
    mockReadFile.mockResolvedValue('.sprint-pilot/\n');

    await updateGitignore(['.sprint-pilot/']);

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('adds newline before appending if content does not end with one', async () => {
    mockReadFile.mockResolvedValue('node_modules/');

    await updateGitignore(['.sprint-pilot/']);

    const content = mockWriteFile.mock.calls[0][1] as string;
    expect(content).toBe('node_modules/\n.sprint-pilot/\n');
  });
});

// ---------------------------------------------------------------------------
// Tests: selectAuthStrategy
// ---------------------------------------------------------------------------

describe('selectAuthStrategy', () => {
  it('returns KeytarStrategy when keytar is available', async () => {
    mockKeytarIsAvailable.mockResolvedValue(true);
    const result = await selectAuthStrategy();
    expect(result.keytarAvailable).toBe(true);
    expect(result.authStrategy).toBeDefined();
  });

  it('returns FileFallbackStrategy when keytar is unavailable', async () => {
    mockKeytarIsAvailable.mockResolvedValue(false);
    const result = await selectAuthStrategy();
    expect(result.keytarAvailable).toBe(false);
    expect(result.authStrategy).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: runInitPipeline
// ---------------------------------------------------------------------------

describe('runInitPipeline', () => {
  it('runs full pipeline and returns config + auth method', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const result = await runInitPipeline(
      {
        pat: 'test-pat',
        organizationUrl: 'https://dev.azure.com/test-org',
        project: 'TestProject',
      },
      mockKeytarInstance,
      true,
    );

    expect(result.authMethod).toBe('os_keychain');
    expect(result.config.organizationUrl).toBe('https://dev.azure.com/test-org');
    expect(result.config.project).toBe('TestProject');
    expect(mockKeytarInstance.validate).toHaveBeenCalledWith(
      'test-pat',
      'https://dev.azure.com/test-org',
    );
    expect(mockKeytarInstance.store).toHaveBeenCalledWith('test-pat');
    expect(mockConfigManagerInstance.write).toHaveBeenCalled();
  });

  it('returns file_fallback auth method when keytar unavailable', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const result = await runInitPipeline(
      {
        pat: 'test-pat',
        organizationUrl: 'https://dev.azure.com/test-org',
        project: 'TestProject',
      },
      mockFileFallbackInstance,
      false,
    );

    expect(result.authMethod).toBe('file_fallback');
  });

  it('throws InitValidationError when PAT validation fails', async () => {
    mockKeytarInstance.validate.mockResolvedValue({
      valid: false,
      missingScopes: ['Work Items: Read & Write'],
      excessiveScopes: [],
    });

    await expect(
      runInitPipeline(
        {
          pat: 'bad-pat',
          organizationUrl: 'https://dev.azure.com/test-org',
          project: 'TestProject',
        },
        mockKeytarInstance,
        true,
      ),
    ).rejects.toThrow(InitValidationError);
  });

  it('uses provided statusMapping instead of fetching from ADO', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const customMapping = {
      'User Story': { blocked: 'On Hold', inProgress: 'Doing', inReview: 'Testing' },
    };

    const result = await runInitPipeline(
      {
        pat: 'test-pat',
        organizationUrl: 'https://dev.azure.com/test-org',
        project: 'TestProject',
        allowedWorkItemTypes: ['User Story'],
        statusMapping: customMapping,
      },
      mockKeytarInstance,
      true,
    );

    expect(result.config.statusMapping).toEqual(customMapping);
    expect(mockAdoClientCreate).not.toHaveBeenCalled();
  });

  it('fetches workflow states from ADO for default work item types', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    await runInitPipeline(
      {
        pat: 'test-pat',
        organizationUrl: 'https://dev.azure.com/test-org',
        project: 'TestProject',
      },
      mockKeytarInstance,
      true,
    );

    // 3 default types: User Story, Bug, Task
    expect(mockAdoClientInstance.get).toHaveBeenCalledTimes(3);
  });

  it('includes optional team in config', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const result = await runInitPipeline(
      {
        pat: 'test-pat',
        organizationUrl: 'https://dev.azure.com/test-org',
        project: 'TestProject',
        team: 'MyTeam',
      },
      mockKeytarInstance,
      true,
    );

    expect(result.config.team).toBe('MyTeam');
  });
});

// ---------------------------------------------------------------------------
// Tests: InitValidationError
// ---------------------------------------------------------------------------

describe('InitValidationError', () => {
  it('carries missingScopes', () => {
    const err = new InitValidationError('failed', ['Scope A', 'Scope B']);
    expect(err.message).toBe('failed');
    expect(err.missingScopes).toEqual(['Scope A', 'Scope B']);
    expect(err.name).toBe('InitValidationError');
  });
});
