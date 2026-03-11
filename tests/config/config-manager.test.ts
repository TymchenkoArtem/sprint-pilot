import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigManager } from '../../src/config/config-manager.js';
import { ConfigMissingError, ConfigInvalidError } from '../../src/shared/errors.js';
import type { SprintPilotConfig } from '../../src/config/config-schema.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_MARKDOWN = `# SprintPilot Configuration

## Azure DevOps
- Organization: https://dev.azure.com/my-org
- Project: MyProject
- Team: MyProject Team

## Work Item Types
- User Story
- Bug
- Task

## Status Mapping
### User Story
- blocked: Blocked
- inProgress: Active
- inReview: Resolved

### Bug
- blocked: Blocked
- inProgress: Active
- inReview: Resolved

## Git
- Base branch: develop
- PR target: develop
- Branch template: features/{usNumber}-{slug}
- Commit template: #{usNumber}: {description}

## Testing
- Dev server command: npm run dev
- Test command: npm test
`;

const MINIMAL_MARKDOWN = `# SprintPilot Configuration

## Azure DevOps
- Organization: https://dev.azure.com/my-org
- Project: MyProject

## Work Item Types
- User Story

## Status Mapping
### User Story
- blocked: Blocked
- inProgress: Active
- inReview: Resolved

## Git
- Base branch: main
- PR target: main
- Branch template: feature/{id}
- Commit template: #{id}: {msg}

## Testing
- Test command: npm test
`;

function makeConfig(): SprintPilotConfig {
  return {
    organizationUrl: 'https://dev.azure.com/my-org',
    project: 'MyProject',
    team: 'MyProject Team',
    allowedWorkItemTypes: ['User Story', 'Bug', 'Task'],
    statusMapping: {
      'User Story': { blocked: 'Blocked', inProgress: 'Active', inReview: 'Resolved' },
      Bug: { blocked: 'Blocked', inProgress: 'Active', inReview: 'Resolved' },
    },
    git: {
      baseBranchOrTag: 'develop',
      prTargetBranch: 'develop',
      branchTemplate: 'features/{usNumber}-{slug}',
      commitTemplate: '#{usNumber}: {description}',
    },
    testing: {
      devServerCommand: 'npm run dev',
      testCommand: 'npm test',
    },
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let tempDir: string;
let configPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'sp-config-test-'));
  configPath = join(tempDir, 'config.md');
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests: exists()
// ---------------------------------------------------------------------------

describe('ConfigManager.exists()', () => {
  it('returns false when config file does not exist', async () => {
    const mgr = new ConfigManager(configPath);
    expect(await mgr.exists()).toBe(false);
  });

  it('returns true when config file exists', async () => {
    await writeFile(configPath, VALID_MARKDOWN, 'utf-8');
    const mgr = new ConfigManager(configPath);
    expect(await mgr.exists()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: load()
// ---------------------------------------------------------------------------

describe('ConfigManager.load()', () => {
  it('throws ConfigMissingError when file does not exist', async () => {
    const mgr = new ConfigManager(configPath);
    await expect(mgr.load()).rejects.toThrow(ConfigMissingError);
  });

  it('parses a valid full config from markdown', async () => {
    await writeFile(configPath, VALID_MARKDOWN, 'utf-8');
    const mgr = new ConfigManager(configPath);
    const config = await mgr.load();

    expect(config.organizationUrl).toBe('https://dev.azure.com/my-org');
    expect(config.project).toBe('MyProject');
    expect(config.team).toBe('MyProject Team');
    expect(config.allowedWorkItemTypes).toEqual(['User Story', 'Bug', 'Task']);
    expect(config.statusMapping['User Story']).toEqual({
      blocked: 'Blocked',
      inProgress: 'Active',
      inReview: 'Resolved',
    });
    expect(config.statusMapping['Bug']).toEqual({
      blocked: 'Blocked',
      inProgress: 'Active',
      inReview: 'Resolved',
    });
    expect(config.git).toEqual({
      baseBranchOrTag: 'develop',
      prTargetBranch: 'develop',
      branchTemplate: 'features/{usNumber}-{slug}',
      commitTemplate: '#{usNumber}: {description}',
    });
    expect(config.testing.devServerCommand).toBe('npm run dev');
    expect(config.testing.testCommand).toBe('npm test');
  });

  it('parses a minimal config without optional fields', async () => {
    await writeFile(configPath, MINIMAL_MARKDOWN, 'utf-8');
    const mgr = new ConfigManager(configPath);
    const config = await mgr.load();

    expect(config.organizationUrl).toBe('https://dev.azure.com/my-org');
    expect(config.project).toBe('MyProject');
    expect(config.team).toBeUndefined();
    expect(config.allowedWorkItemTypes).toEqual(['User Story']);
    expect(config.testing.devServerCommand).toBeUndefined();
  });

  it('returns a frozen object', async () => {
    await writeFile(configPath, VALID_MARKDOWN, 'utf-8');
    const mgr = new ConfigManager(configPath);
    const config = await mgr.load();

    expect(Object.isFrozen(config)).toBe(true);
  });

  it('returns cached result when mtime is unchanged', async () => {
    await writeFile(configPath, VALID_MARKDOWN, 'utf-8');
    const mgr = new ConfigManager(configPath);
    const first = await mgr.load();
    const second = await mgr.load();

    // Same frozen reference
    expect(first).toBe(second);
  });

  it('re-reads file when mtime changes', async () => {
    await writeFile(configPath, VALID_MARKDOWN, 'utf-8');
    const mgr = new ConfigManager(configPath);
    const first = await mgr.load();

    // Rewrite with a modified project
    const modified = VALID_MARKDOWN.replace('Project: MyProject', 'Project: AnotherProject');
    await writeFile(configPath, modified, 'utf-8');

    // Force a different mtime
    const futureTime = new Date(Date.now() + 10_000);
    await utimes(configPath, futureTime, futureTime);

    const second = await mgr.load();
    expect(second).not.toBe(first);
    expect(second.project).toBe('AnotherProject');
  });

  it('throws ConfigInvalidError for invalid markdown content', async () => {
    await writeFile(configPath, '# Not a valid config\nHello world\n', 'utf-8');
    const mgr = new ConfigManager(configPath);
    await expect(mgr.load()).rejects.toThrow(ConfigInvalidError);
  });

  it('throws ConfigInvalidError with details for missing required fields', async () => {
    // Missing ## Git section entirely
    const incomplete = `# SprintPilot Configuration

## Azure DevOps
- Organization: https://dev.azure.com/my-org
- Project: MyProject

## Work Item Types
- User Story

## Status Mapping
### User Story
- blocked: Blocked
- inProgress: Active
- inReview: Resolved

## Testing
- Test command: npm test
`;
    await writeFile(configPath, incomplete, 'utf-8');
    const mgr = new ConfigManager(configPath);
    await expect(mgr.load()).rejects.toThrow(ConfigInvalidError);
  });

  it('throws ConfigInvalidError when organizationUrl is not a valid URL', async () => {
    const bad = VALID_MARKDOWN.replace(
      'https://dev.azure.com/my-org',
      'not-a-url',
    );
    await writeFile(configPath, bad, 'utf-8');
    const mgr = new ConfigManager(configPath);
    await expect(mgr.load()).rejects.toThrow(ConfigInvalidError);
  });
});

// ---------------------------------------------------------------------------
// Tests: write()
// ---------------------------------------------------------------------------

describe('ConfigManager.write()', () => {
  it('writes config as structured markdown', async () => {
    const mgr = new ConfigManager(configPath);
    await mgr.write(makeConfig());

    const content = await readFile(configPath, 'utf-8');
    expect(content).toContain('# SprintPilot Configuration');
    expect(content).toContain('## Azure DevOps');
    expect(content).toContain('- Organization: https://dev.azure.com/my-org');
    expect(content).toContain('- Project: MyProject');
    expect(content).toContain('- Team: MyProject Team');
    expect(content).toContain('## Work Item Types');
    expect(content).toContain('- User Story');
    expect(content).toContain('- Bug');
    expect(content).toContain('- Task');
    expect(content).toContain('## Status Mapping');
    expect(content).toContain('### User Story');
    expect(content).toContain('- blocked: Blocked');
    expect(content).toContain('- inProgress: Active');
    expect(content).toContain('- inReview: Resolved');
    expect(content).toContain('## Git');
    expect(content).toContain('- Base branch: develop');
    expect(content).toContain('- PR target: develop');
    expect(content).toContain('- Branch template: features/{usNumber}-{slug}');
    expect(content).toContain('- Commit template: #{usNumber}: {description}');
    expect(content).toContain('## Testing');
    expect(content).toContain('- Dev server command: npm run dev');
    expect(content).toContain('- Test command: npm test');
  });

  it('omits optional fields when not present', async () => {
    const config: SprintPilotConfig = {
      organizationUrl: 'https://dev.azure.com/my-org',
      project: 'MyProject',
      allowedWorkItemTypes: ['User Story'],
      statusMapping: {
        'User Story': { blocked: 'Blocked', inProgress: 'Active', inReview: 'Resolved' },
      },
      git: {
        baseBranchOrTag: 'main',
        prTargetBranch: 'main',
        branchTemplate: 'feature/{id}',
        commitTemplate: '#{id}: {msg}',
      },
      testing: {
        testCommand: 'npm test',
      },
    };

    const mgr = new ConfigManager(configPath);
    await mgr.write(config);

    const content = await readFile(configPath, 'utf-8');
    expect(content).not.toContain('Team:');
    expect(content).not.toContain('Dev server command:');
  });

  it('updates cache so subsequent load() returns without re-reading', async () => {
    const mgr = new ConfigManager(configPath);
    const original = makeConfig();
    await mgr.write(original);

    const loaded = await mgr.load();
    expect(loaded.organizationUrl).toBe(original.organizationUrl);
    expect(loaded.project).toBe(original.project);
  });

  it('write then load roundtrip preserves all fields', async () => {
    const mgr = new ConfigManager(configPath);
    const original = makeConfig();
    await mgr.write(original);

    // Create a fresh manager to ensure no in-memory state tricks
    const mgr2 = new ConfigManager(configPath);
    const loaded = await mgr2.load();

    expect(loaded.organizationUrl).toBe(original.organizationUrl);
    expect(loaded.project).toBe(original.project);
    expect(loaded.team).toBe(original.team);
    expect(loaded.allowedWorkItemTypes).toEqual(original.allowedWorkItemTypes);
    expect(loaded.statusMapping).toEqual(original.statusMapping);
    expect(loaded.git).toEqual(original.git);
    expect(loaded.testing).toEqual(original.testing);
  });

  it('roundtrip preserves config without optional fields', async () => {
    const config: SprintPilotConfig = {
      organizationUrl: 'https://dev.azure.com/my-org',
      project: 'MyProject',
      allowedWorkItemTypes: ['Bug'],
      statusMapping: {
        Bug: { blocked: 'Blocked', inProgress: 'Active', inReview: 'Resolved' },
      },
      git: {
        baseBranchOrTag: 'main',
        prTargetBranch: 'main',
        branchTemplate: 'feature/{id}',
        commitTemplate: '#{id}: {msg}',
      },
      testing: {
        testCommand: 'npm test',
      },
    };

    const mgr = new ConfigManager(configPath);
    await mgr.write(config);

    const mgr2 = new ConfigManager(configPath);
    const loaded = await mgr2.load();

    expect(loaded.team).toBeUndefined();
    expect(loaded.testing.devServerCommand).toBeUndefined();
    expect(loaded.project).toBe('MyProject');
    expect(loaded.allowedWorkItemTypes).toEqual(['Bug']);
  });
});

// ---------------------------------------------------------------------------
// Tests: constructor
// ---------------------------------------------------------------------------

describe('ConfigManager constructor', () => {
  it('does not perform any I/O', () => {
    // If this threw, it would mean the constructor tried to read a non-existent path
    const mgr = new ConfigManager('/non/existent/path/config.md');
    expect(mgr).toBeInstanceOf(ConfigManager);
  });
});
