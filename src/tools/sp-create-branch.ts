/**
 * sp-create-branch -- MCP tool for creating a new Git branch in Azure DevOps.
 *
 * Creates a branch from the configured base branch/tag. Validates that the
 * source ref matches the configured baseBranchOrTag via ScopeValidator.
 * Resolves the default repository, fetches the source commit SHA, and
 * creates the branch via the ADO Git ref update API.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  SprintPilotError,
  BranchExistsError,
  normalizeError,
} from '../shared/errors.js';
import { createToolContext } from '../shared/tool-context.js';
import { estimateTokens } from '../shared/usage-tracker.js';
import {
  gitRefsEndpoint,
  gitRefUpdateEndpoint,
} from '../ado/endpoints.js';
import {
  AdoGitRefsResponseSchema,
  AdoRefUpdateResponseSchema,
} from '../ado/types.js';
import { resolveDefaultRepo } from '../ado/resolve-repo.js';

// ---------------------------------------------------------------------------
// Strict input schema
// ---------------------------------------------------------------------------

const SpCreateBranchInputSchema = z.object({
  name: z.string().min(1),
  source_ref: z.string().min(1),
}).strict();

const spCreateBranchShape = SpCreateBranchInputSchema.shape;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerSpCreateBranch(server: McpServer): void {
  server.tool(
    'sp-create-branch',
    'Create a new Git branch in Azure DevOps from the configured base branch. Validates that the source ref matches the configured baseBranchOrTag.',
    spCreateBranchShape,
    async (rawArgs) => {
      const startTime = Date.now();
      let ctx: Awaited<ReturnType<typeof createToolContext>> | undefined;

      try {
        const args = SpCreateBranchInputSchema.parse(rawArgs);

        ctx = await createToolContext();
        const { config, adoClient, scopeValidator } = ctx;

        // Validate source ref matches configured base branch
        scopeValidator.validateBranchSource(args.source_ref);

        // Resolve default repository
        const repo = await resolveDefaultRepo(adoClient, config.project);

        // Get source commit SHA
        const refsResponse = await adoClient.get(
          gitRefsEndpoint(config.project, repo.id, config.git.baseBranchOrTag),
          AdoGitRefsResponseSchema,
        );

        if (refsResponse.value.length === 0) {
          throw new SprintPilotError(
            'ado_not_found',
            `Source ref '${config.git.baseBranchOrTag}' not found in repository '${repo.name}'.`,
            'Verify the baseBranchOrTag in your SprintPilot config points to an existing branch.',
          );
        }

        const sourceCommitSha = refsResponse.value[0]!.objectId;

        // Create branch via ref update
        let refUpdateResponse;
        try {
          refUpdateResponse = await adoClient.post(
            gitRefUpdateEndpoint(config.project, repo.id),
            [
              {
                name: 'refs/heads/' + args.name,
                oldObjectId: '0000000000000000000000000000000000000000',
                newObjectId: sourceCommitSha,
              },
            ],
            AdoRefUpdateResponseSchema,
          );
        } catch (error: unknown) {
          if (
            error instanceof SprintPilotError &&
            error.code === 'validation_error' &&
            error.message.toLowerCase().includes('conflict')
          ) {
            throw new BranchExistsError(args.name);
          }
          throw error;
        }

        // Check result success
        const updateResult = refUpdateResponse.value[0];
        if (!updateResult?.success) {
          throw new BranchExistsError(args.name);
        }

        // Log and track
        const description = `Branch '${args.name}' created from ${args.source_ref} (${sourceCommitSha.substring(0, 8)})`;
        await ctx.logger?.log('create-branch', description);
        const result = {
          status: 'branch_created',
          name: args.name,
          source: args.source_ref,
          commit: sourceCommitSha,
        };
        const responseText = JSON.stringify(result);

        await ctx.usageTracker?.record({
          command: 'sp-create-branch',
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
            command: 'sp-create-branch',
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
