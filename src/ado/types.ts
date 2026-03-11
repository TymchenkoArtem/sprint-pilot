import { z } from 'zod';

// ---------------------------------------------------------------------------
// ADO Work Item response schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for a single ADO work item response.
 *
 * System.AssignedTo is optional because unassigned work items exist in ADO.
 * ScopeValidator must handle the undefined case and reject unassigned items.
 */
export const AdoWorkItemSchema = z.object({
  id: z.number(),
  fields: z.object({
    'System.Title': z.string(),
    'System.State': z.string(),
    'System.WorkItemType': z.string(),
    'System.TeamProject': z.string(),
    'System.AssignedTo': z.object({ uniqueName: z.string() }).optional(),
    'System.Description': z.string().optional(),
    'Microsoft.VSTS.Common.AcceptanceCriteria': z.string().optional(),
    'System.IterationPath': z.string(),
    'System.AreaPath': z.string(),
    'System.Tags': z.string().optional(),
    'System.CreatedDate': z.string(),
    'System.ChangedDate': z.string(),
  }),
});

export type AdoWorkItem = z.infer<typeof AdoWorkItemSchema>;

// ---------------------------------------------------------------------------
// Connection data response schema (used to resolve current user)
// ---------------------------------------------------------------------------

export const ConnectionDataSchema = z.object({
  authenticatedUser: z.object({
    id: z.string(),
    properties: z.object({
      Account: z.object({ $value: z.string() }),
    }),
  }),
});

export type ConnectionData = z.infer<typeof ConnectionDataSchema>;

// ---------------------------------------------------------------------------
// WIQL query response schema (returns only work item IDs)
// ---------------------------------------------------------------------------

export const AdoWiqlResponseSchema = z.object({
  queryType: z.string(),
  queryResultType: z.string(),
  asOf: z.string(),
  workItems: z.array(
    z.object({
      id: z.number(),
      url: z.string(),
    }),
  ),
});

export type AdoWiqlResponse = z.infer<typeof AdoWiqlResponseSchema>;

// ---------------------------------------------------------------------------
// ADO project schema
// ---------------------------------------------------------------------------

export const AdoProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.string(),
});

export type AdoProject = z.infer<typeof AdoProjectSchema>;

// ---------------------------------------------------------------------------
// ADO projects list response schema
// ---------------------------------------------------------------------------

export const AdoProjectsResponseSchema = z.object({
  count: z.number(),
  value: z.array(AdoProjectSchema),
});

export type AdoProjectsResponse = z.infer<typeof AdoProjectsResponseSchema>;

// ---------------------------------------------------------------------------
// ADO work item type state schema (for fetching workflow states)
// ---------------------------------------------------------------------------

export const AdoWorkItemTypeStateSchema = z.object({
  name: z.string(),
  color: z.string(),
  category: z.string(),
});

export type AdoWorkItemTypeState = z.infer<typeof AdoWorkItemTypeStateSchema>;

// ---------------------------------------------------------------------------
// ADO work item type states list response schema
// ---------------------------------------------------------------------------

export const AdoWorkItemTypeStatesResponseSchema = z.object({
  count: z.number(),
  value: z.array(AdoWorkItemTypeStateSchema),
});

export type AdoWorkItemTypeStatesResponse = z.infer<
  typeof AdoWorkItemTypeStatesResponseSchema
>;

// ---------------------------------------------------------------------------
// ADO batch work items response schema
// ---------------------------------------------------------------------------

export const AdoWorkItemsResponseSchema = z.object({
  count: z.number(),
  value: z.array(AdoWorkItemSchema),
});

export type AdoWorkItemsResponse = z.infer<typeof AdoWorkItemsResponseSchema>;

// ---------------------------------------------------------------------------
// ADO work item comments response schema
// ---------------------------------------------------------------------------

export const AdoCommentSchema = z.object({
  id: z.number(),
  text: z.string(),
  createdBy: z.object({
    displayName: z.string(),
    uniqueName: z.string(),
  }),
  createdDate: z.string(),
});
export type AdoComment = z.infer<typeof AdoCommentSchema>;

export const AdoCommentsResponseSchema = z.object({
  comments: z.array(AdoCommentSchema),
});
export type AdoCommentsResponse = z.infer<typeof AdoCommentsResponseSchema>;

// ---------------------------------------------------------------------------
// Post comment response (returns the created comment)
// ---------------------------------------------------------------------------

export const AdoPostCommentResponseSchema = AdoCommentSchema;
export type AdoPostCommentResponse = z.infer<typeof AdoPostCommentResponseSchema>;

// ---------------------------------------------------------------------------
// ADO Git repository schema
// ---------------------------------------------------------------------------

export const AdoRepositorySchema = z.object({
  id: z.string(),
  name: z.string(),
  defaultBranch: z.string().optional(),
  project: z.object({
    id: z.string(),
    name: z.string(),
  }),
});
export type AdoRepository = z.infer<typeof AdoRepositorySchema>;

export const AdoRepositoriesResponseSchema = z.object({
  count: z.number(),
  value: z.array(AdoRepositorySchema),
});
export type AdoRepositoriesResponse = z.infer<typeof AdoRepositoriesResponseSchema>;

// ---------------------------------------------------------------------------
// ADO Git ref (branch) schema
// ---------------------------------------------------------------------------

export const AdoGitRefSchema = z.object({
  name: z.string(),
  objectId: z.string(),
});
export type AdoGitRef = z.infer<typeof AdoGitRefSchema>;

export const AdoGitRefsResponseSchema = z.object({
  count: z.number(),
  value: z.array(AdoGitRefSchema),
});
export type AdoGitRefsResponse = z.infer<typeof AdoGitRefsResponseSchema>;

// ---------------------------------------------------------------------------
// ADO create/update ref response schema
// ---------------------------------------------------------------------------

export const AdoRefUpdateResultSchema = z.object({
  name: z.string(),
  oldObjectId: z.string(),
  newObjectId: z.string(),
  success: z.boolean(),
});
export type AdoRefUpdateResult = z.infer<typeof AdoRefUpdateResultSchema>;

export const AdoRefUpdateResponseSchema = z.object({
  value: z.array(AdoRefUpdateResultSchema),
});
export type AdoRefUpdateResponse = z.infer<typeof AdoRefUpdateResponseSchema>;

// ---------------------------------------------------------------------------
// ADO pull request schema
// ---------------------------------------------------------------------------

export const AdoPullRequestSchema = z.object({
  pullRequestId: z.number(),
  title: z.string(),
  description: z.string().optional(),
  status: z.string(),
  sourceRefName: z.string(),
  targetRefName: z.string(),
  repository: z.object({
    id: z.string(),
    name: z.string(),
  }),
  createdBy: z.object({
    displayName: z.string(),
    uniqueName: z.string(),
  }),
  url: z.string().optional(),
});
export type AdoPullRequest = z.infer<typeof AdoPullRequestSchema>;

export const AdoPullRequestsResponseSchema = z.object({
  count: z.number(),
  value: z.array(AdoPullRequestSchema),
});
export type AdoPullRequestsResponse = z.infer<typeof AdoPullRequestsResponseSchema>;

// ---------------------------------------------------------------------------
// ADO iteration / sprint schema
// ---------------------------------------------------------------------------

export const AdoIterationSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  attributes: z.object({
    startDate: z.string().optional(),
    finishDate: z.string().optional(),
    timeFrame: z.string().optional(),
  }),
});
export type AdoIteration = z.infer<typeof AdoIterationSchema>;

export const AdoIterationsResponseSchema = z.object({
  count: z.number(),
  value: z.array(AdoIterationSchema),
});
export type AdoIterationsResponse = z.infer<typeof AdoIterationsResponseSchema>;
