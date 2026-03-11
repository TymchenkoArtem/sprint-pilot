/**
 * sp-get-comments -- MCP tool for fetching work item comments from ADO.
 *
 * Validates the work item is within scope (project, type, assignment),
 * fetches all comments, sanitizes them (stripping internal metadata and
 * detecting sprint-pilot markers), and returns the result.
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
  AdoCommentsResponseSchema,
} from '../ado/types.js';
import { sanitizeComment } from '../security/response-sanitizer.js';

// ---------------------------------------------------------------------------
// Strict input schema
// ---------------------------------------------------------------------------

const SpGetCommentsInputSchema = z.object({
  id: z.number().int().positive(),
}).strict();

const spGetCommentsShape = SpGetCommentsInputSchema.shape;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerSpGetComments(server: McpServer): void {
  server.tool(
    'sp-get-comments',
    'Fetch all comments on an Azure DevOps work item. Returns sanitized comments with sprint-pilot marker detection. The work item must be within scope (assigned to you, correct project and type).',
    spGetCommentsShape,
    async (rawArgs) => {
      const startTime = Date.now();
      let ctx: Awaited<ReturnType<typeof createToolContext>> | undefined;

      try {
        const args = SpGetCommentsInputSchema.parse(rawArgs);

        ctx = await createToolContext();
        const { config, adoClient, scopeValidator } = ctx;

        // Fetch and validate the work item is in scope
        const item = await adoClient.get(
          workItemExpandEndpoint(args.id),
          AdoWorkItemSchema,
        );
        scopeValidator.validateWorkItem(item);

        // Fetch comments
        const commentsResponse = await adoClient.get(
          workItemCommentsEndpoint(config.project, args.id),
          AdoCommentsResponseSchema,
        );

        // Sanitize each comment
        const sanitizedComments = commentsResponse.comments.map(sanitizeComment);

        // Log and track
        await ctx.logger?.log(
          'get-comments',
          `Fetched ${sanitizedComments.length} comments for work item ${args.id}`,
        );
        const result = {
          status: 'comments_fetched',
          item_id: args.id,
          comments: sanitizedComments,
        };
        const responseText = JSON.stringify(result);

        await ctx.usageTracker?.record({
          command: 'sp-get-comments',
          description: `Fetched ${sanitizedComments.length} comments for item ${args.id}`,
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
