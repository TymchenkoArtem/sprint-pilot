import type { AdoComment, AdoIteration, AdoWorkItem } from '../ado/types.js';

// ---------------------------------------------------------------------------
// SanitizedWorkItem -- safe-to-return shape
// ---------------------------------------------------------------------------

export interface SanitizedWorkItem {
  id: number;
  type: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  state: string;
  assignedTo: string;
  iteration: string;
  areaPath: string;
  tags: string;
  createdDate: string;
  changedDate: string;
}


// ---------------------------------------------------------------------------
// SanitizedComment -- safe-to-return shape for work item comments
// ---------------------------------------------------------------------------

export interface SanitizedComment {
  id: number;
  text: string;
  createdBy: string;    // uniqueName only
  createdDate: string;
  isSprintPilot: boolean;
}

// ---------------------------------------------------------------------------
// SanitizedIteration -- safe-to-return shape for iterations / sprints
// ---------------------------------------------------------------------------

export interface SanitizedIteration {
  id: string;
  name: string;
  path: string;
  startDate: string;
  finishDate: string;
  timeFrame: string;
}

// ---------------------------------------------------------------------------
// sanitizeWorkItem -- Phase 1
// ---------------------------------------------------------------------------

/**
 * Strips ADO internal metadata and reshapes a raw work item into the
 * minimal, safe-to-return structure. Never exposes _links, urls, rev,
 * relations, internal GUIDs, or any URL containing tokens.
 *
 * Missing optional fields default to empty strings.
 */
export function sanitizeWorkItem(raw: AdoWorkItem): SanitizedWorkItem {
  const fields = raw.fields;
  return {
    id: raw.id,
    type: fields['System.WorkItemType'],
    title: fields['System.Title'],
    description: fields['System.Description'] ?? '',
    acceptanceCriteria: fields['Microsoft.VSTS.Common.AcceptanceCriteria'] ?? '',
    state: fields['System.State'],
    assignedTo: fields['System.AssignedTo']?.uniqueName ?? '',
    iteration: fields['System.IterationPath'],
    areaPath: fields['System.AreaPath'],
    tags: fields['System.Tags'] ?? '',
    createdDate: fields['System.CreatedDate'],
    changedDate: fields['System.ChangedDate'],
  };
}

// ---------------------------------------------------------------------------
// sanitizeComment
// ---------------------------------------------------------------------------

/**
 * Strips ADO internal metadata and reshapes a raw comment into the
 * minimal, safe-to-return structure. Only exposes uniqueName from the
 * createdBy object. Detects sprint-pilot markers via HTML comment tag.
 */
export function sanitizeComment(raw: AdoComment): SanitizedComment {
  return {
    id: raw.id,
    text: raw.text,
    createdBy: raw.createdBy.uniqueName,
    createdDate: raw.createdDate,
    isSprintPilot: raw.text.includes('<!-- sprint-pilot'),
  };
}

// ---------------------------------------------------------------------------
// sanitizeIteration -- Phase 2
// ---------------------------------------------------------------------------

/**
 * Strips ADO internal metadata and reshapes a raw iteration into the
 * minimal, safe-to-return structure. Missing optional date/timeFrame
 * fields default to empty strings.
 */
export function sanitizeIteration(raw: AdoIteration): SanitizedIteration {
  return {
    id: raw.id,
    name: raw.name,
    path: raw.path,
    startDate: raw.attributes.startDate ?? '',
    finishDate: raw.attributes.finishDate ?? '',
    timeFrame: raw.attributes.timeFrame ?? '',
  };
}
