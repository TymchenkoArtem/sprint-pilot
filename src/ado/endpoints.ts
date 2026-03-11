import { ADO_API_VERSION } from '../shared/constants.js';

// ---------------------------------------------------------------------------
// Pure endpoint builders -- no I/O, no orgUrl prefix.
// Each returns a relative path with ?api-version=<version> appended.
// ---------------------------------------------------------------------------

const VERSION_QS = `api-version=${ADO_API_VERSION}-preview`;

/**
 * Connection data endpoint for resolving authenticated user identity.
 * `_apis/connectionData?api-version=7.1-preview`
 */
export function connectionDataEndpoint(): string {
  return `_apis/connectionData?${VERSION_QS}`;
}

/**
 * Single work item endpoint.
 * `_apis/wit/workItems/{id}?api-version=7.1-preview`
 */
export function workItemEndpoint(id: number): string {
  return `_apis/wit/workItems/${id}?${VERSION_QS}`;
}

/**
 * Batch work items endpoint.
 * `_apis/wit/workItems?ids={id1,id2,...}&api-version=7.1-preview`
 */
export function workItemsEndpoint(ids: number[]): string {
  return `_apis/wit/workItems?ids=${ids.join(',')}&${VERSION_QS}`;
}

/**
 * WIQL query endpoint scoped to a project.
 * `{project}/_apis/wit/wiql?api-version=7.1-preview`
 */
export function wiqlEndpoint(project: string): string {
  return `${project}/_apis/wit/wiql?${VERSION_QS}`;
}

/**
 * Projects list endpoint.
 * `_apis/projects?api-version=7.1-preview`
 */
export function projectsEndpoint(): string {
  return `_apis/projects?${VERSION_QS}`;
}

/**
 * Work item type states endpoint scoped to a project and type.
 * `{project}/_apis/wit/workitemtypes/{typeName}/states?api-version=7.1-preview`
 */
export function workItemTypeStatesEndpoint(
  project: string,
  typeName: string,
): string {
  return `${project}/_apis/wit/workitemtypes/${typeName}/states?${VERSION_QS}`;
}

/**
 * Single work item with expand.
 * `_apis/wit/workItems/{id}?$expand=all&api-version=7.1-preview`
 */
export function workItemExpandEndpoint(id: number): string {
  return `_apis/wit/workItems/${id}?$expand=all&${VERSION_QS}`;
}

/**
 * Work item comments.
 * `{project}/_apis/wit/workItems/{id}/comments?api-version=7.1-preview.4`
 */
export function workItemCommentsEndpoint(project: string, id: number): string {
  return `${project}/_apis/wit/workItems/${id}/comments?api-version=${ADO_API_VERSION}-preview.4`;
}

/**
 * Patch (update) work item.
 * `_apis/wit/workItems/{id}?api-version=7.1-preview`
 */
export function workItemPatchEndpoint(id: number): string {
  return `_apis/wit/workItems/${id}?${VERSION_QS}`;
}

/**
 * List repositories for a project.
 * `{project}/_apis/git/repositories?api-version=7.1-preview`
 */
export function repositoriesEndpoint(project: string): string {
  return `${project}/_apis/git/repositories?${VERSION_QS}`;
}

/**
 * Git refs (branches) -- project-scoped.
 * `{project}/_apis/git/repositories/{repoId}/refs?filter=heads/{branchName}&api-version=7.1-preview`
 */
export function gitRefsEndpoint(project: string, repoId: string, branchFilter?: string): string {
  const filter = branchFilter ? `&filter=heads/${branchFilter}` : '';
  return `${project}/_apis/git/repositories/${repoId}/refs?${VERSION_QS}${filter}`;
}

/**
 * Create/update git refs -- project-scoped.
 * `{project}/_apis/git/repositories/{repoId}/refs?api-version=7.1-preview`
 */
export function gitRefUpdateEndpoint(project: string, repoId: string): string {
  return `${project}/_apis/git/repositories/${repoId}/refs?${VERSION_QS}`;
}

/**
 * List pull requests (project-scoped).
 * `{project}/_apis/git/repositories/{repoId}/pullrequests?api-version=7.1-preview`
 */
export function pullRequestsEndpoint(project: string, repoId: string, sourceRefFilter?: string): string {
  const filter = sourceRefFilter ? `&searchCriteria.sourceRefName=refs/heads/${sourceRefFilter}` : '';
  return `${project}/_apis/git/repositories/${repoId}/pullrequests?${VERSION_QS}${filter}`;
}

/**
 * Create pull request (project-scoped).
 * `{project}/_apis/git/repositories/{repoId}/pullrequests?api-version=7.1-preview`
 */
export function createPullRequestEndpoint(project: string, repoId: string): string {
  return `${project}/_apis/git/repositories/${repoId}/pullrequests?${VERSION_QS}`;
}

/**
 * Team iterations.
 * `{project}/{team}/_apis/work/teamsettings/iterations?api-version=7.1-preview`
 */
export function iterationsEndpoint(project: string, team: string): string {
  return `${project}/${encodeURIComponent(team)}/_apis/work/teamsettings/iterations?${VERSION_QS}`;
}
