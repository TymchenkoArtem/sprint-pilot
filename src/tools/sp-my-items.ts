/**
 * sp-my-items -- MCP tool for fetching work items assigned to the current user.
 *
 * Executes a WIQL query scoped to the configured project and allowed work item
 * types, batch-fetches full work item details, validates scope, sanitizes
 * responses, and returns items grouped by type then by state.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { ADO_BATCH_SIZE } from '../shared/constants.js';
import { normalizeError, ScopeViolationError } from '../shared/errors.js';
import type { SprintPilotError } from '../shared/errors.js';
import { createToolContext } from '../shared/tool-context.js';
import { estimateTokens } from '../shared/usage-tracker.js';
import {
  AdoWiqlResponseSchema,
  AdoWorkItemsResponseSchema,
} from '../ado/types.js';
import type { AdoWorkItem } from '../ado/types.js';
import { wiqlEndpoint, workItemsEndpoint } from '../ado/endpoints.js';
import { sanitizeWorkItem } from '../security/response-sanitizer.js';
import type { SanitizedWorkItem } from '../security/response-sanitizer.js';

// ---------------------------------------------------------------------------
// Strict input schema -- no arguments accepted
// ---------------------------------------------------------------------------

const SpMyItemsInputSchema = z.object({}).strict();
const spMyItemsShape = SpMyItemsInputSchema.shape;

// ---------------------------------------------------------------------------
// WIQL escape helper -- prevent injection via work item type names
// ---------------------------------------------------------------------------

function escapeWiqlString(value: string): string {
  return value.replace(/'/g, "''");
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerSpMyItems(server: McpServer): void {
  server.tool(
    'sp-my-items',
    'Fetch all work items assigned to you in the configured project. Returns items grouped by type and state.',
    spMyItemsShape,
    async (rawArgs) => {
      const startTime = Date.now();
      let ctx: Awaited<ReturnType<typeof createToolContext>> | undefined;

      try {
        SpMyItemsInputSchema.parse(rawArgs);

        ctx = await createToolContext();
        const { config, adoClient, scopeValidator } = ctx;

        // Build WIQL query with escaped type names
        const typesList = config.allowedWorkItemTypes
          .map((t) => `'${escapeWiqlString(t)}'`)
          .join(', ');

        const query = [
          'SELECT [System.Id] FROM WorkItems',
          'WHERE [System.AssignedTo] = @Me',
          `  AND [System.TeamProject] = '${escapeWiqlString(config.project)}'`,
          `  AND [System.WorkItemType] IN (${typesList})`,
          'ORDER BY [System.ChangedDate] DESC',
        ].join('\n');

        // Execute WIQL
        const wiqlResponse = await adoClient.post(
          wiqlEndpoint(config.project),
          { query },
          AdoWiqlResponseSchema,
        );

        // Handle empty results
        if (wiqlResponse.workItems.length === 0) {
          await ctx.logger?.log('my-items', 'No items found');
          const responseText = JSON.stringify({ status: 'no_items', total: 0, items: {} });
          await ctx.usageTracker?.record({
            command: 'sp-my-items',
            description: 'No items found',
            durationMs: Date.now() - startTime,
            flow: '',
            tokens: estimateTokens(rawArgs, responseText),
          });
          await ctx.close();

          return {
            content: [{ type: 'text' as const, text: responseText }],
          };
        }

        // Batch fetch work items
        const allIds = wiqlResponse.workItems.map((wi) => wi.id);
        const allWorkItems: AdoWorkItem[] = [];

        for (let i = 0; i < allIds.length; i += ADO_BATCH_SIZE) {
          const batchIds = allIds.slice(i, i + ADO_BATCH_SIZE);
          const batchResponse = await adoClient.get(
            workItemsEndpoint(batchIds),
            AdoWorkItemsResponseSchema,
          );
          allWorkItems.push(...batchResponse.value);
        }

        // Scope validate and sanitize
        const sanitizedItems: SanitizedWorkItem[] = [];

        for (const item of allWorkItems) {
          try {
            scopeValidator.validateWorkItem(item);
          } catch (err: unknown) {
            if (err instanceof ScopeViolationError) {
              continue;
            }
            throw err;
          }
          sanitizedItems.push(sanitizeWorkItem(item));
        }

        // Group by type, then by state
        const grouped: Record<string, Record<string, SanitizedWorkItem[]>> = {};

        for (const item of sanitizedItems) {
          if (grouped[item.type] === undefined) {
            grouped[item.type] = {};
          }
          const typeGroup = grouped[item.type];
          if (typeGroup[item.state] === undefined) {
            typeGroup[item.state] = [];
          }
          typeGroup[item.state].push(item);
        }

        // Log and track
        await ctx.logger?.log('my-items', `Fetched ${sanitizedItems.length} items`);

        const result = {
          status: 'items_fetched',
          total: sanitizedItems.length,
          items: grouped,
        };
        const responseText = JSON.stringify(result);

        await ctx.usageTracker?.record({
          command: 'sp-my-items',
          description: `Fetched ${sanitizedItems.length} items`,
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
