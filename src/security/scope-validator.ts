import type { SprintPilotConfig } from '../config/config-schema.js';
import type { AdoWorkItem } from '../ado/types.js';
import { ScopeViolationError } from '../shared/errors.js';

// ---------------------------------------------------------------------------
// ScopeValidator -- triple scope filter
// ---------------------------------------------------------------------------

/**
 * Validates that every work item and operation stays within the configured
 * security boundary. All methods are pure and synchronous -- no I/O.
 */
export class ScopeValidator {
  constructor(
    private readonly config: Readonly<SprintPilotConfig>,
    private readonly currentUserId: string,
  ) {}

  // -------------------------------------------------------------------------
  // Work item scope
  // -------------------------------------------------------------------------

  /**
   * Validates that a work item belongs to the configured project, has an
   * allowed type, and is assigned to the current user.
   *
   * @throws ScopeViolationError when any check fails.
   */
  validateWorkItem(item: AdoWorkItem): void {
    const fields = item.fields;
    const id = item.id;

    // 1. Project scope
    const project = fields['System.TeamProject'];
    if (project !== this.config.project) {
      throw new ScopeViolationError(
        `Work item ${id} belongs to project '${project}', not '${this.config.project}'`,
      );
    }

    // 2. Work item type scope
    const workItemType = fields['System.WorkItemType'];
    if (!this.config.allowedWorkItemTypes.includes(workItemType)) {
      throw new ScopeViolationError(
        `Work item ${id} has type '${workItemType}' which is not in allowed types: ${this.config.allowedWorkItemTypes.join(', ')}`,
      );
    }

    // 3. Assignment scope
    const assignedTo = fields['System.AssignedTo'];
    if (assignedTo === undefined) {
      throw new ScopeViolationError(
        `Work item ${id} is unassigned`,
      );
    }
    if (assignedTo.uniqueName.toLowerCase() !== this.currentUserId.toLowerCase()) {
      throw new ScopeViolationError(
        `Work item ${id} is not assigned to current user '${this.currentUserId}'`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Status transition scope
  // -------------------------------------------------------------------------

  /**
   * Returns the ADO state string for a given logical status key
   * (e.g. 'blocked' -> 'Blocked').
   *
   * @throws ScopeViolationError when the work item type or status key is not
   *         present in the configured status mapping.
   */
  validateStatusTransition(workItemType: string, statusKey: string): string {
    const mapping = this.config.statusMapping[workItemType];
    if (mapping === undefined) {
      const validTypes = Object.keys(this.config.statusMapping).join(', ');
      throw new ScopeViolationError(
        `Work item type '${workItemType}' is not in status mapping. Valid types: ${validTypes}`,
      );
    }

    const validKeys = Object.keys(mapping) as Array<keyof typeof mapping>;
    if (!validKeys.includes(statusKey as keyof typeof mapping)) {
      throw new ScopeViolationError(
        `Status key '${statusKey}' is not valid for work item type '${workItemType}'. Valid keys: ${validKeys.join(', ')}`,
      );
    }

    return mapping[statusKey as keyof typeof mapping];
  }

  // -------------------------------------------------------------------------
  // Git ref scope
  // -------------------------------------------------------------------------

  /**
   * Validates that a branch source ref matches the configured base branch.
   *
   * @throws ScopeViolationError when the source ref does not match.
   */
  validateBranchSource(sourceRef: string): void {
    const expected = `refs/heads/${this.config.git.baseBranchOrTag}`;
    if (sourceRef !== expected) {
      throw new ScopeViolationError(
        `Branch source '${sourceRef}' does not match expected '${expected}'`,
      );
    }
  }

  /**
   * Validates that a PR target ref matches the configured PR target branch.
   *
   * @throws ScopeViolationError when the target ref does not match.
   */
  validatePrTarget(targetRef: string): void {
    const expected = `refs/heads/${this.config.git.prTargetBranch}`;
    if (targetRef !== expected) {
      throw new ScopeViolationError(
        `PR target '${targetRef}' does not match expected '${expected}'`,
      );
    }
  }
}
