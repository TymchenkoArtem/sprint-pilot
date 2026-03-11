/**
 * sp-update-status -- MCP tool for updating a work item's state in ADO.
 *
 * Validates the work item is in scope, resolves the logical status key
 * (e.g. 'blocked') to the ADO state string (e.g. 'Blocked') via
 * ScopeValidator, then patches the work item's System.State field.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { normalizeError } from '../shared/errors.js';
import type { SprintPilotError } from '../shared/errors.js';
import { createToolContext } from '../shared/tool-context.js';
import { estimateTokens } from '../shared/usage-tracker.js';
import { workItemExpandEndpoint, workItemPatchEndpoint } from '../ado/endpoints.js';
import { AdoWorkItemSchema } from '../ado/types.js';

// ---------------------------------------------------------------------------
// Strict input schema
// ---------------------------------------------------------------------------

const SpUpdateStatusInputSchema = z.object({
  id: z.number().int().positive(),
  status: z.string().min(1),
}).strict();

const spUpdateStatusShape = SpUpdateStatusInputSchema.shape;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerSpUpdateStatus(server: McpServer): void {
  server.tool(
    'sp-update-status',
    'Update the status of a work item. Provide the work item ID and a logical status key (e.g. "blocked", "inProgress", "inReview") which maps to the configured ADO state.',
    spUpdateStatusShape,
    async (rawArgs) => {
      const startTime = Date.now();
      let ctx: Awaited<ReturnType<typeof createToolContext>> | undefined;

      try {
        const args = SpUpdateStatusInputSchema.parse(rawArgs);

        ctx = await createToolContext();
        const { adoClient, scopeValidator } = ctx;

        // Fetch work item with expand
        const item = await adoClient.get(
          workItemExpandEndpoint(args.id),
          AdoWorkItemSchema,
        );

        // Validate work item is in scope
        scopeValidator.validateWorkItem(item);

        // Resolve logical status key to ADO state string
        const adoState = scopeValidator.validateStatusTransition(
          item.fields['System.WorkItemType'],
          args.status,
        );

        // Capture previous state
        const previousState = item.fields['System.State'];

        // Patch the work item
        await adoClient.patch(
          workItemPatchEndpoint(args.id),
          [{ op: 'replace', path: '/fields/System.State', value: adoState }],
          AdoWorkItemSchema,
        );

        // Log and track
        await ctx.logger?.log(
          'update-status',
          `Work item ${args.id}: ${previousState} -> ${adoState}`,
        );
        const result = {
          status: 'status_updated',
          item_id: args.id,
          previous_state: previousState,
          new_state: adoState,
        };
        const responseText = JSON.stringify(result);

        await ctx.usageTracker?.record({
          command: 'sp-update-status',
          description: `Item ${args.id}: ${previousState} -> ${adoState}`,
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
