/**
 * sp-track-usage -- MCP tool for recording token usage and execution metrics.
 *
 * Called by the AI tool to log token consumption per operation. This enables
 * tracking costs and resource usage per flow (US-{id}) and per command.
 *
 * The usage history is append-only and NEVER cleared. Each entry records:
 * - command: what was executed (tool name or CLI command)
 * - description: short human-readable summary
 * - durationMs: execution time in milliseconds
 * - flow: current flow context (e.g. "US-12345") -- REQUIRED
 * - tokens: token count consumed by the AI for this operation
 *
 * The history file is stored at `.sprint-pilot/workflows/{flow}/usage.md`.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { join } from 'node:path';
import { z } from 'zod';

import { workflowItemDir } from '../shared/constants.js';
import { normalizeError } from '../shared/errors.js';
import type { SprintPilotError } from '../shared/errors.js';
import { UsageTracker } from '../shared/usage-tracker.js';

// ---------------------------------------------------------------------------
// Strict input schema
// ---------------------------------------------------------------------------

const SpTrackUsageInputSchema = z.object({
  command: z.string().min(1),
  description: z.string().min(1),
  duration_ms: z.number().int().nonnegative(),
  flow: z.string().min(1),
  tokens: z.number().int().nonnegative().optional(),
}).strict();

const spTrackUsageShape = SpTrackUsageInputSchema.shape;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerSpTrackUsage(server: McpServer): void {
  server.tool(
    'sp-track-usage',
    'Record token usage and execution metrics for the current operation. Use this to track costs per flow (US-{id}). The history is append-only and never cleared.',
    spTrackUsageShape,
    async (rawArgs) => {
      try {
        const args = SpTrackUsageInputSchema.parse(rawArgs);
        const tracker = new UsageTracker(
          join(workflowItemDir(args.flow), 'usage.md'),
        );

        await tracker.record({
          command: args.command,
          description: args.description,
          durationMs: args.duration_ms,
          flow: args.flow,
          tokens: args.tokens ?? 0,
        });
        await tracker.flush();
        await tracker.close();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ status: 'usage_recorded' }),
            },
          ],
        };
      } catch (error: unknown) {
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
