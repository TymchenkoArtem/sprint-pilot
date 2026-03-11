import { describe, it, expect } from 'vitest';
import {
  ConfigSchema,
  StatusMappingSchema,
  GitConfigSchema,
  TestingConfigSchema,
} from '../../src/config/config-schema.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeValidConfig() {
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
      testCommand: 'npm test',
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConfigSchema', () => {
  it('accepts a fully valid config', () => {
    const result = ConfigSchema.safeParse(makeValidConfig());
    expect(result.success).toBe(true);
  });

  it('accepts a config with optional fields present', () => {
    const config = {
      ...makeValidConfig(),
      testing: {
        devServerCommand: 'npm run dev',
        testCommand: 'npm test',
      },
    };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('accepts a config without optional team field', () => {
    const config = makeValidConfig();
    const { team: _, ...withoutTeam } = config;
    const result = ConfigSchema.safeParse(withoutTeam);
    expect(result.success).toBe(true);
  });

  it('rejects an invalid organizationUrl', () => {
    const config = { ...makeValidConfig(), organizationUrl: 'not-a-url' };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects an empty project string', () => {
    const config = { ...makeValidConfig(), project: '' };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects an empty allowedWorkItemTypes array', () => {
    const config = { ...makeValidConfig(), allowedWorkItemTypes: [] };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects allowedWorkItemTypes with empty strings', () => {
    const config = { ...makeValidConfig(), allowedWorkItemTypes: [''] };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects missing statusMapping', () => {
    const { statusMapping: _, ...config } = makeValidConfig();
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

});

describe('StatusMappingSchema', () => {
  it('accepts a valid status mapping', () => {
    const result = StatusMappingSchema.safeParse({
      blocked: 'Blocked',
      inProgress: 'Active',
      inReview: 'Resolved',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing keys', () => {
    const result = StatusMappingSchema.safeParse({
      blocked: 'Blocked',
      inProgress: 'Active',
    });
    expect(result.success).toBe(false);
  });
});

describe('GitConfigSchema', () => {
  it('accepts a valid git config', () => {
    const result = GitConfigSchema.safeParse({
      baseBranchOrTag: 'develop',
      prTargetBranch: 'develop',
      branchTemplate: 'features/{usNumber}-{slug}',
      commitTemplate: '#{usNumber}: {description}',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty baseBranchOrTag', () => {
    const result = GitConfigSchema.safeParse({
      baseBranchOrTag: '',
      prTargetBranch: 'develop',
      branchTemplate: 'features/{usNumber}-{slug}',
      commitTemplate: '#{usNumber}: {description}',
    });
    expect(result.success).toBe(false);
  });
});

describe('TestingConfigSchema', () => {
  it('accepts a config with only testCommand', () => {
    const result = TestingConfigSchema.safeParse({ testCommand: 'npm test' });
    expect(result.success).toBe(true);
  });

  it('accepts a config with devServerCommand', () => {
    const result = TestingConfigSchema.safeParse({
      devServerCommand: 'npm run dev',
      testCommand: 'npm test',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty testCommand', () => {
    const result = TestingConfigSchema.safeParse({ testCommand: '' });
    expect(result.success).toBe(false);
  });
});
