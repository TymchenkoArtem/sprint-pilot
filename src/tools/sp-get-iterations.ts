/**
 * sp-get-iterations -- MCP tool for fetching team iterations (sprints) from ADO.
 *
 * Returns all iterations for the configured team along with which one is
 * marked as "current". Requires no input parameters.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { normalizeError } from '../shared/errors.js';
import type { SprintPilotError } from '../shared/errors.js';
import { createToolContext } from '../shared/tool-context.js';
import { estimateTokens } from '../shared/usage-tracker.js';
import { iterationsEndpoint } from '../ado/endpoints.js';
import { AdoIterationsResponseSchema } from '../ado/types.js';
import { sanitizeIteration } from '../security/response-sanitizer.js';

// ---------------------------------------------------------------------------
// Strict input schema -- no params needed
// ---------------------------------------------------------------------------

const SpGetIterationsInputSchema = z.object({}).strict();
const spGetIterationsShape = SpGetIterationsInputSchema.shape;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerSpGetIterations(server: McpServer): void {
  server.tool(
    'sp-get-iterations',
    'Fetch all team iterations (sprints) from Azure DevOps. Returns the full list of iterations and identifies the current one.',
    spGetIterationsShape,
    async (rawArgs) => {
      const startTime = Date.now();
      let ctx: Awaited<ReturnType<typeof createToolContext>> | undefined;

      try {
        SpGetIterationsInputSchema.parse(rawArgs);

        ctx = await createToolContext();
        const { config, adoClient } = ctx;

        // Resolve team name
        const team = config.team ?? `${config.project} Team`;

        // Fetch iterations
        const response = await adoClient.get(
          iterationsEndpoint(config.project, team),
          AdoIterationsResponseSchema,
        );

        // Sanitize each iteration
        const sanitizedIterations = response.value.map((iter) =>
          sanitizeIteration(iter),
        );

        // Find current iteration
        const currentIteration =
          sanitizedIterations.find((iter) => iter.timeFrame === 'current') ?? null;

        // Log and track
        const description = `Fetched ${sanitizedIterations.length} iterations for team "${team}"`;
        await ctx.logger?.log('get-iterations', description);
        const result = {
          status: 'iterations_fetched',
          current: currentIteration,
          iterations: sanitizedIterations,
        };
        const responseText = JSON.stringify(result);

        await ctx.usageTracker?.record({
          command: 'sp-get-iterations',
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
