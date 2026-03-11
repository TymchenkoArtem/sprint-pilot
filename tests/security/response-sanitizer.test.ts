import { describe, it, expect } from 'vitest';
import {
  sanitizeWorkItem,
  sanitizeComment,
  sanitizeIteration,
} from '../../src/security/response-sanitizer.js';
import type { SanitizedWorkItem } from '../../src/security/response-sanitizer.js';
import type { AdoWorkItem } from '../../src/ado/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRawWorkItem(overrides?: {
  description?: string;
  acceptanceCriteria?: string;
  tags?: string;
  assignedTo?: { uniqueName: string };
  unassigned?: boolean;
}): AdoWorkItem {
  const assignedTo =
    overrides?.unassigned === true
      ? undefined
      : overrides?.assignedTo ?? { uniqueName: 'user@example.com' };

  return {
    id: 42,
    fields: {
      'System.Title': 'Implement feature X',
      'System.State': 'Active',
      'System.WorkItemType': 'User Story',
      'System.TeamProject': 'MyProject',
      'System.AssignedTo': assignedTo,
      'System.Description': overrides?.description ?? 'A detailed description',
      'Microsoft.VSTS.Common.AcceptanceCriteria':
        overrides?.acceptanceCriteria ?? 'Given/When/Then criteria',
      'System.IterationPath': 'MyProject\\Sprint 1',
      'System.AreaPath': 'MyProject\\Area',
      'System.Tags': overrides?.tags ?? 'frontend; priority-high',
      'System.CreatedDate': '2025-01-01T00:00:00Z',
      'System.ChangedDate': '2025-01-15T12:30:00Z',
    },
  };
}

// ---------------------------------------------------------------------------
// sanitizeWorkItem
// ---------------------------------------------------------------------------

describe('sanitizeWorkItem', () => {
  it('maps all required fields correctly', () => {
    const raw = makeRawWorkItem();
    const result = sanitizeWorkItem(raw);

    expect(result).toEqual<SanitizedWorkItem>({
      id: 42,
      type: 'User Story',
      title: 'Implement feature X',
      description: 'A detailed description',
      acceptanceCriteria: 'Given/When/Then criteria',
      state: 'Active',
      assignedTo: 'user@example.com',
      iteration: 'MyProject\\Sprint 1',
      areaPath: 'MyProject\\Area',
      tags: 'frontend; priority-high',
      createdDate: '2025-01-01T00:00:00Z',
      changedDate: '2025-01-15T12:30:00Z',
    });
  });

  it('returns only the uniqueName string for assignedTo', () => {
    const raw = makeRawWorkItem({ assignedTo: { uniqueName: 'dev@company.com' } });
    const result = sanitizeWorkItem(raw);
    expect(result.assignedTo).toBe('dev@company.com');
    expect(typeof result.assignedTo).toBe('string');
  });

  it('defaults assignedTo to empty string when unassigned', () => {
    const raw = makeRawWorkItem({ unassigned: true });
    const result = sanitizeWorkItem(raw);
    expect(result.assignedTo).toBe('');
  });

  it('defaults description to empty string when undefined', () => {
    const raw = makeRawWorkItem();
    // Manually set to undefined to simulate missing field
    (raw.fields as Record<string, unknown>)['System.Description'] = undefined;
    const result = sanitizeWorkItem(raw);
    expect(result.description).toBe('');
  });

  it('defaults acceptanceCriteria to empty string when undefined', () => {
    const raw = makeRawWorkItem();
    (raw.fields as Record<string, unknown>)['Microsoft.VSTS.Common.AcceptanceCriteria'] =
      undefined;
    const result = sanitizeWorkItem(raw);
    expect(result.acceptanceCriteria).toBe('');
  });

  it('defaults tags to empty string when undefined', () => {
    const raw = makeRawWorkItem();
    (raw.fields as Record<string, unknown>)['System.Tags'] = undefined;
    const result = sanitizeWorkItem(raw);
    expect(result.tags).toBe('');
  });

  it('does not expose any extra fields from the raw work item', () => {
    const raw = makeRawWorkItem();
    const result = sanitizeWorkItem(raw);
    const keys = Object.keys(result).sort();
    const expectedKeys = [
      'acceptanceCriteria',
      'areaPath',
      'assignedTo',
      'changedDate',
      'createdDate',
      'description',
      'id',
      'iteration',
      'state',
      'tags',
      'title',
      'type',
    ];
    expect(keys).toEqual(expectedKeys);
  });

  it('strips _links, url, rev, relations if present on the raw object', () => {
    const raw = makeRawWorkItem();
    // Simulate extra ADO properties that should not appear in output
    const extended = raw as AdoWorkItem & {
      _links: unknown;
      url: string;
      rev: number;
      relations: unknown[];
    };
    extended._links = { self: { href: 'https://example.com' } };
    extended.url = 'https://dev.azure.com/org/project/_apis/wit/workItems/42';
    extended.rev = 5;
    extended.relations = [{ rel: 'parent', url: 'https://example.com/parent' }];

    const result = sanitizeWorkItem(extended);
    expect(result).not.toHaveProperty('_links');
    expect(result).not.toHaveProperty('url');
    expect(result).not.toHaveProperty('rev');
    expect(result).not.toHaveProperty('relations');
  });

  it('preserves empty string values (does not coerce to undefined)', () => {
    const raw = makeRawWorkItem({
      description: '',
      acceptanceCriteria: '',
      tags: '',
    });
    const result = sanitizeWorkItem(raw);
    expect(result.description).toBe('');
    expect(result.acceptanceCriteria).toBe('');
    expect(result.tags).toBe('');
  });
});

// ---------------------------------------------------------------------------
// sanitizeComment
// ---------------------------------------------------------------------------

describe('sanitizeComment', () => {
  it('returns sanitized comment with all fields', () => {
    const raw = {
      id: 1,
      text: 'Hello world',
      createdBy: { displayName: 'User', uniqueName: 'user@example.com', _links: {} },
      createdDate: '2026-01-01T00:00:00Z',
    };
    const result = sanitizeComment(raw as never);
    expect(result).toEqual({
      id: 1,
      text: 'Hello world',
      createdBy: 'user@example.com',
      createdDate: '2026-01-01T00:00:00Z',
      isSprintPilot: false,
    });
  });

  it('detects sprint-pilot marker', () => {
    const raw = {
      id: 2,
      text: '<!-- sprint-pilot:clarification -->Question here',
      createdBy: { displayName: 'Bot', uniqueName: 'bot@example.com', _links: {} },
      createdDate: '2026-01-02T00:00:00Z',
    };
    const result = sanitizeComment(raw as never);
    expect(result.isSprintPilot).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sanitizeIteration -- Phase 2 tests
// ---------------------------------------------------------------------------

describe('sanitizeIteration', () => {
  it('returns sanitized iteration with all fields', () => {
    const raw = {
      id: 'iter-1',
      name: 'Sprint 1',
      path: 'Project\\Sprint 1',
      attributes: {
        startDate: '2026-01-01',
        finishDate: '2026-01-14',
        timeFrame: 'current',
      },
      url: 'https://example.com',
    };
    const result = sanitizeIteration(raw as never);
    expect(result).toEqual({
      id: 'iter-1',
      name: 'Sprint 1',
      path: 'Project\\Sprint 1',
      startDate: '2026-01-01',
      finishDate: '2026-01-14',
      timeFrame: 'current',
    });
  });

  it('defaults missing optional fields to empty strings', () => {
    const raw = {
      id: 'iter-2',
      name: 'Backlog',
      path: 'Project\\Backlog',
      attributes: {},
      url: 'https://example.com',
    };
    const result = sanitizeIteration(raw as never);
    expect(result.startDate).toBe('');
    expect(result.finishDate).toBe('');
    expect(result.timeFrame).toBe('');
  });
});
