/**
 * sp-post-comment -- MCP tool for posting a comment on an ADO work item.
 *
 * Validates the work item is within scope (project, type, assignment),
 * posts a new comment, and returns the created comment ID.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { normalizeError } from '../shared/errors.js';
import type { SprintPilotError } from '../shared/errors.js';
import { createToolContext } from '../shared/tool-context.js';
import { estimateTokens } from '../shared/usage-tracker.js';
import {
  workItemExpandEndpoint,
  workItemCommentsEndpoint,
} from '../ado/endpoints.js';
import {
  AdoWorkItemSchema,
  AdoPostCommentResponseSchema,
} from '../ado/types.js';

// ---------------------------------------------------------------------------
// Strict input schema
// ---------------------------------------------------------------------------

const SpPostCommentInputSchema = z.object({
  id: z.number().int().positive(),
  text: z.string().min(1),
}).strict();

const spPostCommentShape = SpPostCommentInputSchema.shape;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerSpPostComment(server: McpServer): void {
  server.tool(
    'sp-post-comment',
    'Post a new comment on an Azure DevOps work item. The work item must be within scope (assigned to you, correct project and type). Only creates new comments -- no edit or delete.',
    spPostCommentShape,
    async (rawArgs) => {
      const startTime = Date.now();
      let ctx: Awaited<ReturnType<typeof createToolContext>> | undefined;

      try {
        const args = SpPostCommentInputSchema.parse(rawArgs);

        ctx = await createToolContext();
        const { config, adoClient, scopeValidator } = ctx;

        // Fetch and validate the work item is in scope
        const item = await adoClient.get(
          workItemExpandEndpoint(args.id),
          AdoWorkItemSchema,
        );
        scopeValidator.validateWorkItem(item);

        // Post the comment
        const response = await adoClient.post(
          workItemCommentsEndpoint(config.project, args.id),
          { text: args.text },
          AdoPostCommentResponseSchema,
        );

        // Log and track
        await ctx.logger?.log(
          'post-comment',
          `Posted comment ${response.id} on work item ${args.id}`,
        );
        const result = {
          status: 'comment_posted',
          item_id: args.id,
          comment_id: response.id,
        };
        const responseText = JSON.stringify(result);

        await ctx.usageTracker?.record({
          command: 'sp-post-comment',
          description: `Posted comment ${response.id} on item ${args.id}`,
          durationMs: Date.now() - startTime,
          flow: '',
          tokens: estimateTokens(rawArgs, responseText),
        });
        await ctx.close();

        return {
          content: [{ type: 'text' as const, text: responseText }],
        };
      } catch (error: unknown) {
        if (ctx !== undefined) {
          await ctx.close();
        }

        const normalized: SprintPilotError = normalizeError(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(normalized.toJSON()),
            },
          ],
        };
      }
    },
  );
}
