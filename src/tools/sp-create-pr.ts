/**
 * sp-create-pr -- MCP tool for creating a pull request in Azure DevOps.
 *
 * Creates a PR from a source branch to the configured prTargetBranch.
 * The target branch is ALWAYS from config -- the AI cannot specify a
 * different target. Optionally links a work item and adds labels/tags.
 *
 * If an active PR already exists from the same source branch, returns
 * the existing PR details instead of creating a duplicate.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { normalizeError } from '../shared/errors.js';
import type { SprintPilotError } from '../shared/errors.js';
import { createToolContext } from '../shared/tool-context.js';
import { estimateTokens } from '../shared/usage-tracker.js';
import {
  pullRequestsEndpoint,
  createPullRequestEndpoint,
  workItemExpandEndpoint,
} from '../ado/endpoints.js';
import {
  AdoPullRequestsResponseSchema,
  AdoPullRequestSchema,
  AdoWorkItemSchema,
} from '../ado/types.js';
import { resolveDefaultRepo } from '../ado/resolve-repo.js';

// ---------------------------------------------------------------------------
// Strict input schema
// ---------------------------------------------------------------------------

const SpCreatePrInputSchema = z.object({
  source_branch: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  work_item_id: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
}).strict();

const spCreatePrShape = SpCreatePrInputSchema.shape;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the web URL for a pull request in Azure DevOps.
 * Format: {orgUrl}/{project}/_git/{repoName}/pullrequest/{prId}
 */
function buildPrWebUrl(
  orgUrl: string,
  project: string,
  repoName: string,
  prId: number,
): string {
  const base = orgUrl.replace(/\/+$/, '');
  return `${base}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repoName)}/pullrequest/${prId}`;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerSpCreatePr(server: McpServer): void {
  server.tool(
    'sp-create-pr',
    'Create a pull request in Azure DevOps. Target branch is always the configured prTargetBranch. Optionally links a work item and adds labels.',
    spCreatePrShape,
    async (rawArgs) => {
      const startTime = Date.now();
      let ctx: Awaited<ReturnType<typeof createToolContext>> | undefined;

      try {
        const args = SpCreatePrInputSchema.parse(rawArgs);

        ctx = await createToolContext();
        const { config, adoClient, scopeValidator } = ctx;

        // Validate PR target
        scopeValidator.validatePrTarget(
          'refs/heads/' + config.git.prTargetBranch,
        );

        // Resolve default repository
        const repo = await resolveDefaultRepo(adoClient, config.project);

        // Check for existing active PR from same source branch
        const existingPrs = await adoClient.get(
          pullRequestsEndpoint(config.project, repo.id, args.source_branch),
          AdoPullRequestsResponseSchema,
        );

        const activePr = existingPrs.value.find(
          (pr) => pr.status === 'active',
        );
        if (activePr !== undefined) {
          const webUrl = buildPrWebUrl(
            config.organizationUrl,
            config.project,
            repo.name,
            activePr.pullRequestId,
          );
          const existingResult = {
            status: 'pr_exists',
            pr_id: activePr.pullRequestId,
            url: webUrl,
            repository: repo.name,
          };

          await ctx.logger?.log(
            'create-pr',
            `PR already exists: #${activePr.pullRequestId} from ${args.source_branch}`,
          );
          const responseText = JSON.stringify(existingResult);
          await ctx.usageTracker?.record({
            command: 'sp-create-pr',
            description: `PR already exists: #${activePr.pullRequestId}`,
            durationMs: Date.now() - startTime,
            flow: '',
            tokens: estimateTokens(rawArgs, responseText),
          });
          await ctx.close();

          return {
            content: [
              {
                type: 'text' as const,
                text: responseText,
              },
            ],
          };
        }

        // If work_item_id provided, validate scope
        if (args.work_item_id !== undefined) {
          const workItem = await adoClient.get(
            workItemExpandEndpoint(args.work_item_id),
            AdoWorkItemSchema,
          );
          scopeValidator.validateWorkItem(workItem);
        }

        // Build PR body
        const prBody = {
          sourceRefName: `refs/heads/${args.source_branch}`,
          targetRefName: `refs/heads/${config.git.prTargetBranch}`,
          title: args.title,
          description: args.description ?? '',
          ...(args.work_item_id !== undefined
            ? { workItemRefs: [{ id: String(args.work_item_id) }] }
            : {}),
          ...(args.tags !== undefined && args.tags.length > 0
            ? { labels: args.tags.map((name) => ({ name })) }
            : {}),
        };

        // Create PR
        const pr = await adoClient.post(
          createPullRequestEndpoint(config.project, repo.id),
          prBody,
          AdoPullRequestSchema,
        );

        // Verify the created PR is in active state
        if (pr.status !== 'active') {
          const webUrl = buildPrWebUrl(
            config.organizationUrl,
            config.project,
            repo.name,
            pr.pullRequestId,
          );
          const warnResult = {
            status: 'pr_created_with_warning',
            pr_id: pr.pullRequestId,
            pr_status: pr.status,
            url: webUrl,
            repository: repo.name,
            source: args.source_branch,
            target: config.git.prTargetBranch,
            warning: `PR was created but has status "${pr.status}" instead of "active". This may indicate a branch policy or merge conflict issue. Check the PR in ADO.`,
          };
          const warnText = JSON.stringify(warnResult);
          await ctx.logger?.log(
            'create-pr',
            `PR #${pr.pullRequestId} created with status "${pr.status}" (expected "active")`,
          );
          await ctx.usageTracker?.record({
            command: 'sp-create-pr',
            description: `PR #${pr.pullRequestId} created with unexpected status: ${pr.status}`,
            durationMs: Date.now() - startTime,
            flow: '',
            tokens: estimateTokens(rawArgs, warnText),
          });
          await ctx.close();
          return {
            content: [{ type: 'text' as const, text: warnText }],
          };
        }

        // Build web URL for the user
        const webUrl = buildPrWebUrl(
          config.organizationUrl,
          config.project,
          repo.name,
          pr.pullRequestId,
        );

        // Log and track
        const description = `PR #${pr.pullRequestId} created: ${args.source_branch} -> ${config.git.prTargetBranch}`;
        await ctx.logger?.log('create-pr', description);
        const result = {
          status: 'pr_created',
          pr_id: pr.pullRequestId,
          url: webUrl,
          repository: repo.name,
          source: args.source_branch,
          target: config.git.prTargetBranch,
          work_item_linked: args.work_item_id !== undefined,
          tags: args.tags ?? [],
        };
        const responseText = JSON.stringify(result);

        await ctx.usageTracker?.record({
          command: 'sp-create-pr',
          description,
          durationMs: Date.now() - startTime,
          flow: '',
          tokens: estimateTokens(rawArgs, responseText),
        });
        await ctx.close();

        return {
          content: [{ type: 'text' as const, text: responseText }],
        };
      } catch (error: unknown) {
        const normalized: SprintPilotError = normalizeError(error);

        const errorResponseText = JSON.stringify(normalized.toJSON());

        if (ctx !== undefined) {
          await ctx.usageTracker?.record({
            command: 'sp-create-pr',
            description: normalized.message,
            durationMs: Date.now() - startTime,
            flow: '',
            tokens: estimateTokens(rawArgs, errorResponseText),
          });
          await ctx.close();
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: errorResponseText,
            },
          ],
        };
      }
    },
  );
}
