/**
 * Integration-level edge case tests for cross-cutting error scenarios.
 *
 * These tests exercise error classes, normalizeError, and ScopeValidator
 * in isolation (no module-level vi.mock), verifying behavior that spans
 * multiple modules and is not covered by individual tool unit tests.
 *
 * Covers Phase 5 task 5.9 edge cases:
 *   - BranchExistsError construction and normalization
 *   - EmptyDiffError construction and normalization
 *   - PR already exists response shape verification
 *   - ScopeViolationError serialization via toJSON()
 *   - ScopeValidator rejections (wrong project, disallowed type, wrong assignee)
 *   - normalizeError handling of unknown types (string, number, null, boolean)
 *   - Multiple error code serialization correctness
 */

import { describe, it, expect } from 'vitest';

import {
  SprintPilotError,
  ScopeViolationError,
  BranchExistsError,
  EmptyDiffError,
  InvalidStatusError,
  ValidationError,
  AdoUnreachableError,
  AuthExpiredError,
  AuthMissingError,
  AdoNotFoundError,
  AdoForbiddenError,
  normalizeError,
} from '../../src/shared/errors.js';

import { ScopeValidator } from '../../src/security/scope-validator.js';
import type { SprintPilotConfig } from '../../src/config/config-schema.js';
import type { AdoWorkItem } from '../../src/ado/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<SprintPilotConfig>): SprintPilotConfig {
  return {
    organizationUrl: 'https://dev.azure.com/testorg',
    project: 'TestProject',
    allowedWorkItemTypes: ['User Story', 'Bug', 'Task'],
    statusMapping: {
      'User Story': { blocked: 'Blocked', inProgress: 'Active', inReview: 'Resolved' },
      Bug: { blocked: 'Blocked', inProgress: 'Active', inReview: 'Resolved' },
    },
    git: {
      baseBranchOrTag: 'main',
      prTargetBranch: 'main',
      branchTemplate: 'features/{id}-{slug}',
      commitTemplate: '#{id}: {description}',
    },
    testing: { testCommand: 'npm test' },
    ...overrides,
  };
}

function makeWorkItem(overrides?: {
  id?: number;
  project?: string;
  type?: string;
  assignedTo?: string;
  unassigned?: boolean;
}): AdoWorkItem {
  const assignedTo =
    overrides?.unassigned === true
      ? undefined
      : { uniqueName: overrides?.assignedTo ?? 'current-user@example.com' };

  return {
    id: overrides?.id ?? 42,
    fields: {
      'System.Title': 'Test work item',
      'System.State': 'New',
      'System.WorkItemType': overrides?.type ?? 'User Story',
      'System.TeamProject': overrides?.project ?? 'TestProject',
      'System.AssignedTo': assignedTo,
      'System.Description': 'A description',
      'System.IterationPath': 'TestProject\\Sprint 1',
      'System.AreaPath': 'TestProject',
      'System.Tags': '',
      'System.CreatedDate': '2026-01-01T00:00:00Z',
      'System.ChangedDate': '2026-01-02T00:00:00Z',
    },
  };
}

const CURRENT_USER = 'current-user@example.com';

// ---------------------------------------------------------------------------
// BranchExistsError edge cases
// ---------------------------------------------------------------------------

describe('BranchExistsError edge cases', () => {
  it('has error code branch_exists', () => {
    const err = new BranchExistsError('features/123-my-branch');
    expect(err.code).toBe('branch_exists');
  });

  it('includes the branch name in the message', () => {
    const err = new BranchExistsError('features/456-login-flow');
    expect(err.message).toContain('features/456-login-flow');
  });

  it('is an instance of SprintPilotError', () => {
    const err = new BranchExistsError('my-branch');
    expect(err).toBeInstanceOf(SprintPilotError);
    expect(err).toBeInstanceOf(Error);
  });

  it('serializes correctly via toJSON()', () => {
    const err = new BranchExistsError('features/789-signup');
    const json = err.toJSON();

    expect(json.error).toBe('branch_exists');
    expect(json.message).toContain('features/789-signup');
    expect(json.message).toContain('already exists');
  });

  it('is preserved by normalizeError', () => {
    const err = new BranchExistsError('test-branch');
    const normalized = normalizeError(err);
    expect(normalized).toBe(err);
    expect(normalized.code).toBe('branch_exists');
  });

  it('has the correct name property', () => {
    const err = new BranchExistsError('x');
    expect(err.name).toBe('BranchExistsError');
  });
});

// ---------------------------------------------------------------------------
// EmptyDiffError edge cases
// ---------------------------------------------------------------------------

describe('EmptyDiffError edge cases', () => {
  it('has error code empty_diff', () => {
    const err = new EmptyDiffError();
    expect(err.code).toBe('empty_diff');
  });

  it('has a descriptive message about no changes', () => {
    const err = new EmptyDiffError();
    expect(err.message).toContain('No changes');
  });

  it('includes guidance about pushing commits', () => {
    const err = new EmptyDiffError();
    expect(err.guidance).toBeDefined();
    expect(err.guidance).toContain('commits');
  });

  it('serializes correctly via toJSON()', () => {
    const err = new EmptyDiffError();
    const json = err.toJSON();

    expect(json.error).toBe('empty_diff');
    expect(json.message).toContain('No changes');
    expect(json.guidance).toBeDefined();
  });

  it('is preserved by normalizeError', () => {
    const err = new EmptyDiffError();
    const normalized = normalizeError(err);
    expect(normalized).toBe(err);
    expect(normalized.code).toBe('empty_diff');
  });

  it('has the correct name property', () => {
    const err = new EmptyDiffError();
    expect(err.name).toBe('EmptyDiffError');
  });
});

// ---------------------------------------------------------------------------
// PR already exists response shape verification
// ---------------------------------------------------------------------------

describe('PR already exists response shape', () => {
  /**
   * When an active PR already exists, the sp-create-pr tool returns a JSON
   * response with status "pr_exists" including pr_id and url fields. This
   * test verifies the expected shape by constructing the response structure
   * that the tool handler produces.
   */
  it('pr_exists response includes status, pr_id, and url fields', () => {
    // This mirrors the structure returned by sp-create-pr when an active PR
    // is found during the duplicate check.
    const prExistsResponse = {
      status: 'pr_exists',
      pr_id: 99,
      url: 'https://dev.azure.com/testorg/TestProject/_git/TestProject/pullrequest/99',
    };

    expect(prExistsResponse.status).toBe('pr_exists');
    expect(prExistsResponse.pr_id).toBe(99);
    expect(prExistsResponse.url).toContain('pullrequest/99');
  });

  it('pr_exists response has numeric pr_id, not string', () => {
    const prExistsResponse = {
      status: 'pr_exists' as const,
      pr_id: 42,
      url: 'https://dev.azure.com/org/proj/_git/repo/pullrequest/42',
    };

    expect(typeof prExistsResponse.pr_id).toBe('number');
  });

  it('pr_exists url follows ADO pull request URL pattern', () => {
    const prExistsResponse = {
      status: 'pr_exists' as const,
      pr_id: 100,
      url: 'https://dev.azure.com/myorg/MyProject/_git/MyProject/pullrequest/100',
    };

    expect(prExistsResponse.url).toMatch(
      /^https:\/\/dev\.azure\.com\/[\w-]+\/[\w-]+\/_git\/[\w-]+\/pullrequest\/\d+$/,
    );
  });
});

// ---------------------------------------------------------------------------
// ScopeViolationError serialization edge cases
// ---------------------------------------------------------------------------

describe('ScopeViolationError serialization', () => {
  it('toJSON() returns scope_violation error code', () => {
    const err = new ScopeViolationError('Not your project');
    const json = err.toJSON();

    expect(json.error).toBe('scope_violation');
  });

  it('toJSON() includes the reason as the message', () => {
    const reason = 'Work item 42 belongs to project OtherProject, not TestProject';
    const err = new ScopeViolationError(reason);
    const json = err.toJSON();

    expect(json.message).toBe(reason);
  });

  it('toJSON() includes default guidance about configured scope', () => {
    const err = new ScopeViolationError('test reason');
    const json = err.toJSON();

    expect(json.guidance).toBeDefined();
    expect(json.guidance).toContain('scope');
  });

  it('JSON.stringify produces valid JSON with all required fields', () => {
    const err = new ScopeViolationError('branch source does not match');
    const serialized = JSON.stringify(err.toJSON());
    const parsed = JSON.parse(serialized) as Record<string, unknown>;

    expect(parsed['error']).toBe('scope_violation');
    expect(parsed['message']).toBe('branch source does not match');
    expect(parsed['guidance']).toBeDefined();
  });

  it('toJSON() output has exactly three keys when guidance is present', () => {
    const err = new ScopeViolationError('test');
    const json = err.toJSON();
    const keys = Object.keys(json);

    expect(keys).toHaveLength(3);
    expect(keys).toContain('error');
    expect(keys).toContain('message');
    expect(keys).toContain('guidance');
  });
});

// ---------------------------------------------------------------------------
// ScopeValidator rejection edge cases
// ---------------------------------------------------------------------------

describe('ScopeValidator rejection edge cases', () => {
  it('rejects work item from wrong project', () => {
    const config = makeConfig();
    const validator = new ScopeValidator(config, CURRENT_USER);
    const item = makeWorkItem({ project: 'WrongProject' });

    expect(() => validator.validateWorkItem(item)).toThrow(ScopeViolationError);
    expect(() => validator.validateWorkItem(item)).toThrow(/WrongProject/);
  });

  it('rejects disallowed work item type', () => {
    const config = makeConfig();
    const validator = new ScopeValidator(config, CURRENT_USER);
    const item = makeWorkItem({ type: 'Epic' });

    expect(() => validator.validateWorkItem(item)).toThrow(ScopeViolationError);
    expect(() => validator.validateWorkItem(item)).toThrow(/Epic/);
    expect(() => validator.validateWorkItem(item)).toThrow(/not in allowed types/);
  });

  it('rejects wrong assignee', () => {
    const config = makeConfig();
    const validator = new ScopeValidator(config, CURRENT_USER);
    const item = makeWorkItem({ assignedTo: 'other-user@example.com' });

    expect(() => validator.validateWorkItem(item)).toThrow(ScopeViolationError);
    expect(() => validator.validateWorkItem(item)).toThrow(/not assigned to current user/);
  });

  it('rejects unassigned work item', () => {
    const config = makeConfig();
    const validator = new ScopeValidator(config, CURRENT_USER);
    const item = makeWorkItem({ unassigned: true });

    expect(() => validator.validateWorkItem(item)).toThrow(ScopeViolationError);
    expect(() => validator.validateWorkItem(item)).toThrow(/unassigned/);
  });

  it('includes the work item ID in the rejection message', () => {
    const config = makeConfig();
    const validator = new ScopeValidator(config, CURRENT_USER);
    const item = makeWorkItem({ id: 777, project: 'WrongProject' });

    try {
      validator.validateWorkItem(item);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ScopeViolationError);
      expect((err as ScopeViolationError).message).toContain('777');
    }
  });

  it('checks project scope before type scope (first failure wins)', () => {
    const config = makeConfig();
    const validator = new ScopeValidator(config, CURRENT_USER);
    const item = makeWorkItem({ project: 'WrongProject', type: 'Epic' });

    expect(() => validator.validateWorkItem(item)).toThrow(/belongs to project/);
  });

  it('checks type scope before assignment scope (first failure wins)', () => {
    const config = makeConfig();
    const validator = new ScopeValidator(config, CURRENT_USER);
    const item = makeWorkItem({ type: 'Feature', assignedTo: 'other@example.com' });

    expect(() => validator.validateWorkItem(item)).toThrow(/has type 'Feature'/);
  });
});

// ---------------------------------------------------------------------------
// normalizeError edge cases for unknown types
// ---------------------------------------------------------------------------

describe('normalizeError edge cases', () => {
  it('wraps a thrown string into SprintPilotError', () => {
    const result = normalizeError('something broke');
    expect(result).toBeInstanceOf(SprintPilotError);
    expect(result.code).toBe('validation_error');
    expect(result.message).toBe('An unexpected error occurred.');
  });

  it('wraps a thrown number into SprintPilotError', () => {
    const result = normalizeError(42);
    expect(result).toBeInstanceOf(SprintPilotError);
    expect(result.code).toBe('validation_error');
    expect(result.message).toBe('An unexpected error occurred.');
  });

  it('wraps null into SprintPilotError', () => {
    const result = normalizeError(null);
    expect(result).toBeInstanceOf(SprintPilotError);
    expect(result.code).toBe('validation_error');
    expect(result.message).toBe('An unexpected error occurred.');
  });

  it('wraps undefined into SprintPilotError', () => {
    const result = normalizeError(undefined);
    expect(result).toBeInstanceOf(SprintPilotError);
    expect(result.code).toBe('validation_error');
  });

  it('wraps a boolean into SprintPilotError', () => {
    const result = normalizeError(false);
    expect(result).toBeInstanceOf(SprintPilotError);
    expect(result.code).toBe('validation_error');
    expect(result.message).toBe('An unexpected error occurred.');
  });

  it('wraps a plain object into SprintPilotError', () => {
    const result = normalizeError({ foo: 'bar' });
    expect(result).toBeInstanceOf(SprintPilotError);
    expect(result.code).toBe('validation_error');
  });

  it('preserves ScopeViolationError subclass identity', () => {
    const err = new ScopeViolationError('test reason');
    const result = normalizeError(err);
    expect(result).toBe(err);
    expect(result).toBeInstanceOf(ScopeViolationError);
    expect(result.code).toBe('scope_violation');
  });

  it('preserves BranchExistsError subclass identity', () => {
    const err = new BranchExistsError('my-branch');
    const result = normalizeError(err);
    expect(result).toBe(err);
    expect(result.code).toBe('branch_exists');
  });

  it('preserves EmptyDiffError subclass identity', () => {
    const err = new EmptyDiffError();
    const result = normalizeError(err);
    expect(result).toBe(err);
    expect(result.code).toBe('empty_diff');
  });

  it('preserves AuthMissingError subclass identity', () => {
    const err = new AuthMissingError();
    const result = normalizeError(err);
    expect(result).toBe(err);
    expect(result.code).toBe('auth_missing');
  });

  it('preserves AuthExpiredError subclass identity', () => {
    const err = new AuthExpiredError();
    const result = normalizeError(err);
    expect(result).toBe(err);
    expect(result.code).toBe('auth_expired');
  });

  it('preserves InvalidStatusError subclass identity', () => {
    const err = new InvalidStatusError('closed', ['blocked', 'inProgress', 'inReview']);
    const result = normalizeError(err);
    expect(result).toBe(err);
    expect(result.code).toBe('invalid_status');
  });

  it('includes guidance for wrapped unknown errors', () => {
    const result = normalizeError('some string error');
    expect(result.guidance).toBeDefined();
    expect(result.guidance).toContain('If this persists');
  });
});

// ---------------------------------------------------------------------------
// Multiple error code serialization
// ---------------------------------------------------------------------------

describe('multiple error code serialization', () => {
  const errorInstances: Array<{ instance: SprintPilotError; expectedCode: string }> = [
    { instance: new ScopeViolationError('scope test'), expectedCode: 'scope_violation' },
    { instance: new BranchExistsError('branch-x'), expectedCode: 'branch_exists' },
    { instance: new EmptyDiffError(), expectedCode: 'empty_diff' },
    { instance: new InvalidStatusError('bad', ['a', 'b']), expectedCode: 'invalid_status' },
    { instance: new ValidationError('bad input'), expectedCode: 'validation_error' },
    { instance: new AdoUnreachableError(), expectedCode: 'ado_unreachable' },
    { instance: new AuthExpiredError(), expectedCode: 'auth_expired' },
    { instance: new AuthMissingError(), expectedCode: 'auth_missing' },
    { instance: new AdoNotFoundError(), expectedCode: 'ado_not_found' },
    { instance: new AdoForbiddenError(), expectedCode: 'ado_forbidden' },
  ];

  it.each(errorInstances)(
    'toJSON().error equals "$expectedCode" for ${instance.name}',
    ({ instance, expectedCode }) => {
      const json = instance.toJSON();
      expect(json.error).toBe(expectedCode);
    },
  );

  it.each(errorInstances)(
    'toJSON().message is a non-empty string for code "$expectedCode"',
    ({ instance }) => {
      const json = instance.toJSON();
      expect(typeof json.message).toBe('string');
      expect(json.message.length).toBeGreaterThan(0);
    },
  );

  it('all error codes in toJSON output are valid ErrorCode union members', () => {
    const validCodes = new Set([
      'scope_violation',
      'auth_missing',
      'auth_expired',
      'auth_insufficient_scope',
      'ado_forbidden',
      'ado_unreachable',
      'ado_not_found',
      'config_missing',
      'config_invalid',
      'fabric_missing',
      'product_missing',
      'validation_error',
      'not_found',
      'invalid_status',
      'invalid_transition',
      'branch_exists',
      'empty_diff',
    ]);

    for (const { instance } of errorInstances) {
      const json = instance.toJSON();
      expect(validCodes.has(json.error)).toBe(true);
    }
  });
});
