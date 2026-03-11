/**
 * resolve-repo -- Shared helper for resolving the default Git repository.
 *
 * Used by sp-create-branch and sp-create-pr to find the project's
 * default repository without duplicating the logic.
 */

import { SprintPilotError } from '../shared/errors.js';
import { AdoClient } from './ado-client.js';
import { repositoriesEndpoint } from './endpoints.js';
import { AdoRepositoriesResponseSchema } from './types.js';

export interface ResolvedRepo {
  id: string;
  name: string;
}

/**
 * Resolve the default repository for a project.
 *
 * Strategy (ordered):
 * 1. If the project has a repo with the same name as the project → use it (ADO default convention).
 * 2. Otherwise use the first repository returned by ADO.
 *
 * @throws SprintPilotError when no repositories exist for the project.
 */
export async function resolveDefaultRepo(
  adoClient: AdoClient,
  project: string,
): Promise<ResolvedRepo> {
  const repos = await adoClient.get(
    repositoriesEndpoint(project),
    AdoRepositoriesResponseSchema,
  );
  if (repos.value.length === 0) {
    throw new SprintPilotError(
      'ado_not_found',
      'No repositories found for the configured project.',
      'Verify the project has a Git repository.',
    );
  }

  // Prefer repo whose name matches the project (ADO default convention)
  const projectNameLower = project.toLowerCase();
  const matchingRepo = repos.value.find(
    (r) => r.name.toLowerCase() === projectNameLower,
  );

  const repo = matchingRepo ?? repos.value[0]!;
  return { id: repo.id, name: repo.name };
}
