import { describe, it, expect, beforeEach } from 'vitest';
import { ScopeValidator } from '../../src/security/scope-validator.js';
import { ScopeViolationError } from '../../src/shared/errors.js';
import type { SprintPilotConfig } from '../../src/config/config-schema.js';
import type { AdoWorkItem } from '../../src/ado/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<SprintPilotConfig>): SprintPilotConfig {
  return {
    organizationUrl: 'https://dev.azure.com/myorg',
    project: 'MyProject',
    allowedWorkItemTypes: ['User Story', 'Bug', 'Task'],
    statusMapping: {
      'User Story': { blocked: 'Blocked', inProgress: 'Active', inReview: 'In Review' },
      Bug: { blocked: 'Blocked', inProgress: 'Active', inReview: 'In Review' },
      Task: { blocked: 'Blocked', inProgress: 'Active', inReview: 'In Review' },
    },
    git: {
      baseBranchOrTag: 'main',
      prTargetBranch: 'develop',
      branchTemplate: 'feature/{id}-{title}',
      commitTemplate: '{type}: {message} (#{id})',
    },
    testing: {
      testCommand: 'npm test',
    },
    ...overrides,
  };
}

function makeWorkItem(overrides?: {
  id?: number;
  project?: string;
  type?: string;
  assignedTo?: string | undefined;
  unassigned?: boolean;
}): AdoWorkItem {
  const assignedTo =
    overrides?.unassigned === true
      ? undefined
      : { uniqueName: overrides?.assignedTo ?? 'user@example.com' };

  return {
    id: overrides?.id ?? 42,
    fields: {
      'System.Title': 'Test work item',
      'System.State': 'New',
      'System.WorkItemType': overrides?.type ?? 'User Story',
      'System.TeamProject': overrides?.project ?? 'MyProject',
      'System.AssignedTo': assignedTo,
      'System.Description': 'A description',
      'Microsoft.VSTS.Common.AcceptanceCriteria': 'Some criteria',
      'System.IterationPath': 'MyProject\\Sprint 1',
      'System.AreaPath': 'MyProject\\Area',
      'System.Tags': 'tag1; tag2',
      'System.CreatedDate': '2025-01-01T00:00:00Z',
      'System.ChangedDate': '2025-01-02T00:00:00Z',
    },
  };
}

const CURRENT_USER = 'user@example.com';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScopeValidator', () => {
  let config: SprintPilotConfig;
  let validator: ScopeValidator;

  beforeEach(() => {
    config = makeConfig();
    validator = new ScopeValidator(config, CURRENT_USER);
  });

  // -----------------------------------------------------------------------
  // validateWorkItem
  // -----------------------------------------------------------------------

  describe('validateWorkItem', () => {
    it('accepts a work item that matches all scopes', () => {
      const item = makeWorkItem();
      expect(() => validator.validateWorkItem(item)).not.toThrow();
    });

    it('rejects a work item from a different project', () => {
      const item = makeWorkItem({ project: 'OtherProject' });
      expect(() => validator.validateWorkItem(item)).toThrow(ScopeViolationError);
      expect(() => validator.validateWorkItem(item)).toThrow(
        /belongs to project 'OtherProject', not 'MyProject'/,
      );
    });

    it('includes the work item ID in project mismatch error', () => {
      const item = makeWorkItem({ id: 123, project: 'OtherProject' });
      expect(() => validator.validateWorkItem(item)).toThrow(
        /Work item 123/,
      );
    });

    it('rejects a work item with a disallowed type', () => {
      const item = makeWorkItem({ type: 'Epic' });
      expect(() => validator.validateWorkItem(item)).toThrow(ScopeViolationError);
      expect(() => validator.validateWorkItem(item)).toThrow(
        /has type 'Epic' which is not in allowed types: User Story, Bug, Task/,
      );
    });

    it('rejects an unassigned work item', () => {
      const item = makeWorkItem({ unassigned: true });
      expect(() => validator.validateWorkItem(item)).toThrow(ScopeViolationError);
      expect(() => validator.validateWorkItem(item)).toThrow(/is unassigned/);
    });

    it('rejects a work item assigned to a different user', () => {
      const item = makeWorkItem({ assignedTo: 'other@example.com' });
      expect(() => validator.validateWorkItem(item)).toThrow(ScopeViolationError);
      expect(() => validator.validateWorkItem(item)).toThrow(
        /is not assigned to current user 'user@example.com'/,
      );
    });

    it('accepts work item when assignedTo has different casing than currentUserId', () => {
      const item = makeWorkItem({ assignedTo: 'User@Example.COM' });
      expect(() => validator.validateWorkItem(item)).not.toThrow();
    });

    it('checks project before type (first failure wins)', () => {
      const item = makeWorkItem({ project: 'OtherProject', type: 'Epic' });
      expect(() => validator.validateWorkItem(item)).toThrow(
        /belongs to project/,
      );
    });

    it('checks type before assignment (first failure wins)', () => {
      const item = makeWorkItem({ type: 'Epic', assignedTo: 'other@example.com' });
      expect(() => validator.validateWorkItem(item)).toThrow(
        /has type 'Epic'/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // validateStatusTransition
  // -----------------------------------------------------------------------

  describe('validateStatusTransition', () => {
    it('returns the ADO state for a valid status key', () => {
      expect(validator.validateStatusTransition('User Story', 'blocked')).toBe('Blocked');
      expect(validator.validateStatusTransition('User Story', 'inProgress')).toBe('Active');
      expect(validator.validateStatusTransition('User Story', 'inReview')).toBe('In Review');
    });

    it('works for multiple work item types', () => {
      expect(validator.validateStatusTransition('Bug', 'blocked')).toBe('Blocked');
      expect(validator.validateStatusTransition('Task', 'inProgress')).toBe('Active');
    });

    it('rejects an unknown work item type', () => {
      expect(() => validator.validateStatusTransition('Epic', 'blocked')).toThrow(
        ScopeViolationError,
      );
      expect(() => validator.validateStatusTransition('Epic', 'blocked')).toThrow(
        /Work item type 'Epic' is not in status mapping/,
      );
    });

    it('lists valid types in the error for unknown type', () => {
      expect(() => validator.validateStatusTransition('Epic', 'blocked')).toThrow(
        /Valid types: User Story, Bug, Task/,
      );
    });

    it('rejects an unknown status key', () => {
      expect(() => validator.validateStatusTransition('User Story', 'invalid')).toThrow(
        ScopeViolationError,
      );
      expect(() => validator.validateStatusTransition('User Story', 'invalid')).toThrow(
        /Status key 'invalid' is not valid for work item type 'User Story'/,
      );
    });

    it('lists valid keys in the error for unknown status key', () => {
      expect(() => validator.validateStatusTransition('User Story', 'done')).toThrow(
        /Valid keys: blocked, inProgress, inReview/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // validateBranchSource
  // -----------------------------------------------------------------------

  describe('validateBranchSource', () => {
    it('accepts the configured base branch ref', () => {
      expect(() => validator.validateBranchSource('refs/heads/main')).not.toThrow();
    });

    it('rejects a different branch ref', () => {
      expect(() => validator.validateBranchSource('refs/heads/feature/foo')).toThrow(
        ScopeViolationError,
      );
      expect(() => validator.validateBranchSource('refs/heads/feature/foo')).toThrow(
        /Branch source 'refs\/heads\/feature\/foo' does not match expected 'refs\/heads\/main'/,
      );
    });

    it('rejects a bare branch name without refs/heads/', () => {
      expect(() => validator.validateBranchSource('main')).toThrow(ScopeViolationError);
    });

    it('works with a custom base branch', () => {
      const customConfig = makeConfig({ git: { ...config.git, baseBranchOrTag: 'release/1.0' } });
      const customValidator = new ScopeValidator(customConfig, CURRENT_USER);
      expect(() => customValidator.validateBranchSource('refs/heads/release/1.0')).not.toThrow();
      expect(() => customValidator.validateBranchSource('refs/heads/main')).toThrow(
        ScopeViolationError,
      );
    });
  });

  // -----------------------------------------------------------------------
  // validatePrTarget
  // -----------------------------------------------------------------------

  describe('validatePrTarget', () => {
    it('accepts the configured PR target branch ref', () => {
      expect(() => validator.validatePrTarget('refs/heads/develop')).not.toThrow();
    });

    it('rejects a different target ref', () => {
      expect(() => validator.validatePrTarget('refs/heads/main')).toThrow(ScopeViolationError);
      expect(() => validator.validatePrTarget('refs/heads/main')).toThrow(
        /PR target 'refs\/heads\/main' does not match expected 'refs\/heads\/develop'/,
      );
    });

    it('rejects a bare branch name without refs/heads/', () => {
      expect(() => validator.validatePrTarget('develop')).toThrow(ScopeViolationError);
    });

    it('works with a custom PR target branch', () => {
      const customConfig = makeConfig({ git: { ...config.git, prTargetBranch: 'main' } });
      const customValidator = new ScopeValidator(customConfig, CURRENT_USER);
      expect(() => customValidator.validatePrTarget('refs/heads/main')).not.toThrow();
      expect(() => customValidator.validatePrTarget('refs/heads/develop')).toThrow(
        ScopeViolationError,
      );
    });
  });
});
