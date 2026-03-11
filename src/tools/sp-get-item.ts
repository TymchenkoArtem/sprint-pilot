/**
 * sp-get-item -- MCP tool for fetching a single work item by ID.
 *
 * Fetches the work item with full expand, validates scope (project, type,
 * assignment), sanitizes the response, and returns the safe-to-return shape.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { normalizeError, ScopeViolationError } from '../shared/errors.js';
import type { SprintPilotError } from '../shared/errors.js';
import { createToolContext } from '../shared/tool-context.js';
import { estimateTokens } from '../shared/usage-tracker.js';
import { AdoWorkItemSchema } from '../ado/types.js';
import { workItemExpandEndpoint } from '../ado/endpoints.js';
import { sanitizeWorkItem } from '../security/response-sanitizer.js';

// ---------------------------------------------------------------------------
// Strict input schema
// ---------------------------------------------------------------------------

const SpGetItemInputSchema = z.object({
  id: z.number().int().positive(),
}).strict();

const spGetItemShape = SpGetItemInputSchema.shape;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerSpGetItem(server: McpServer): void {
  server.tool(
    'sp-get-item',
    'Fetch a single work item by ID. Returns full details including description and acceptance criteria.',
    spGetItemShape,
    async (rawArgs) => {
      const startTime = Date.now();
      let ctx: Awaited<ReturnType<typeof createToolContext>> | undefined;

      try {
        const args = SpGetItemInputSchema.parse(rawArgs);

        ctx = await createToolContext();
        const { adoClient, scopeValidator } = ctx;

        // Fetch work item with full expand
        const item = await adoClient.get(
          workItemExpandEndpoint(args.id),
          AdoWorkItemSchema,
        );

        // Scope validation
        try {
          scopeValidator.validateWorkItem(item);
        } catch (err: unknown) {
          if (err instanceof ScopeViolationError) {
            await ctx.logger?.logError(
              'get-item',
              `Scope violation for item ${args.id}: ${err.message}`,
              err.code,
            );
            const responseText = JSON.stringify({
              error: 'scope_violation',
              reason: err.message,
            });
            await ctx.usageTracker?.record({
              command: 'sp-get-item',
              description: `Scope violation for item ${args.id}`,
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
          throw err;
        }

        // Sanitize
        const sanitized = sanitizeWorkItem(item);

        // Log and track
        await ctx.logger?.log('get-item', `Fetched item ${args.id}: ${sanitized.title}`);
        const responseText = JSON.stringify({ status: 'item_fetched', item: sanitized });
        await ctx.usageTracker?.record({
          command: 'sp-get-item',
          description: `Fetched item ${args.id}: ${sanitized.title}`,
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
