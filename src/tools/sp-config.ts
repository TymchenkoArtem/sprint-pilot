/**
 * sp-config -- MCP tool for reading and writing SprintPilot configuration.
 *
 * Supports two actions:
 * - read: Load and return the current config from ConfigManager.
 * - write: Validate updates against an updatable fields whitelist,
 *   deep-merge with existing config, validate the result, and write it back.
 *
 * Locked fields (organizationUrl, project) cannot be changed via write --
 * users must re-run sp-init to change those.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { ConfigManager } from '../config/config-manager.js';
import { ConfigSchema } from '../config/config-schema.js';
import type { SprintPilotConfig } from '../config/config-schema.js';
import { CONFIG_FILE } from '../shared/constants.js';
import {
  ConfigInvalidError,
  normalizeError,
} from '../shared/errors.js';
import type { SprintPilotError } from '../shared/errors.js';

// ---------------------------------------------------------------------------
// Updatable fields whitelist
// ---------------------------------------------------------------------------

/**
 * Flat set of allowed top-level and dotted-path keys that sp-config write
 * accepts. Nested keys like "git.baseBranchOrTag" are written as dotted
 * paths in the updates record and resolved during deep merge.
 */
const UPDATABLE_FIELDS = new Set<string>([
  'allowedWorkItemTypes',
  'statusMapping',
  'git.baseBranchOrTag',
  'git.prTargetBranch',
  'git.branchTemplate',
  'git.commitTemplate',
  'testing.devServerCommand',
  'testing.testCommand',
  'team',
]);

/**
 * Fields that are locked and require re-initialization to change.
 */
const LOCKED_FIELDS = new Set<string>([
  'organizationUrl',
  'project',
]);

// ---------------------------------------------------------------------------
// Deep merge helper
// ---------------------------------------------------------------------------

/**
 * Apply dotted-path updates to a config object. Returns a new object
 * with the updates merged in. Handles nested paths like "git.baseBranchOrTag"
 * by splitting on "." and performing a deep merge for the nested object.
 */
function applyUpdates(
  config: Readonly<SprintPilotConfig>,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  // Start with a shallow clone of the config, spreading nested objects
  const result: Record<string, unknown> = {
    ...config,
    git: { ...config.git },
    testing: { ...config.testing },
    statusMapping: { ...config.statusMapping },
  };

  for (const [key, value] of Object.entries(updates)) {
    const parts = key.split('.');
    if (parts.length === 1) {
      // Top-level field
      result[key] = value;
    } else if (parts.length === 2) {
      // Nested field: e.g., "git.baseBranchOrTag"
      const [parent, child] = parts as [string, string];
      const parentObj = result[parent];
      if (typeof parentObj === 'object' && parentObj !== null) {
        (parentObj as Record<string, unknown>)[child] = value;
      } else {
        result[parent] = { [child]: value };
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Strict input schema -- rejects unknown keys (S5.16, S5.17, S7.3 rule 9)
// ---------------------------------------------------------------------------

const SpConfigInputSchema = z.object({
  action: z.enum(['read', 'write']),
  updates: z.record(z.unknown()).optional(),
}).strict();

/** Raw shape passed to server.tool() for JSON-Schema generation. */
const spConfigShape = SpConfigInputSchema.shape;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerSpConfig(server: McpServer): void {
  server.tool(
    'sp-config',
    'Read or update SprintPilot configuration. Use action "read" to view current config, or "write" with an updates object to modify allowed fields.',
    spConfigShape,
    async (rawArgs) => {
      try {
        // Strict validation: reject unknown keys
        const args = SpConfigInputSchema.parse(rawArgs);

        const configManager = new ConfigManager(CONFIG_FILE);

        if (args.action === 'read') {
          const config = await configManager.load();
          const result = {
            status: 'success',
            config,
          };
          const responseText = JSON.stringify(result);

          return {
            content: [{ type: 'text' as const, text: responseText }],
          };
        }

        // action === 'write'
        if (!args.updates || Object.keys(args.updates).length === 0) {
          const errorResult = {
            error: 'validation_error',
            message: 'No updates provided. Pass an updates object with fields to change.',
            guidance: 'Check the updatable fields list and try again.',
          };
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify(errorResult) },
            ],
          };
        }

        // Check for locked fields
        for (const key of Object.keys(args.updates)) {
          if (LOCKED_FIELDS.has(key)) {
            const errorResult = {
              error: 'config_invalid',
              message: `Cannot update locked field "${key}" via sp-config. This field requires re-initialization.`,
              guidance:
                'Run "sprint-pilot init" in your terminal, or "sprint-pilot config set <key> <value>" for individual fields.',
            };
            return {
              content: [
                { type: 'text' as const, text: JSON.stringify(errorResult) },
              ],
            };
          }
        }

        // Validate all update keys against the whitelist
        const invalidKeys: string[] = [];
        for (const key of Object.keys(args.updates)) {
          if (!UPDATABLE_FIELDS.has(key)) {
            invalidKeys.push(key);
          }
        }

        if (invalidKeys.length > 0) {
          const errorResult = {
            error: 'validation_error',
            message: `Unknown or non-updatable fields: ${invalidKeys.join(', ')}`,
            guidance: `Updatable fields: ${[...UPDATABLE_FIELDS].join(', ')}`,
          };
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify(errorResult) },
            ],
          };
        }

        // Load existing config
        const existingConfig = await configManager.load();

        // Deep merge updates
        const merged = applyUpdates(existingConfig, args.updates);

        // Validate the merged result against ConfigSchema
        const parseResult = ConfigSchema.safeParse(merged);
        if (!parseResult.success) {
          const detail = parseResult.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ');
          throw new ConfigInvalidError(
            `Merged configuration is invalid: ${detail}`,
          );
        }

        const validatedConfig: SprintPilotConfig = parseResult.data;

        // Write back
        await configManager.write(validatedConfig);

        const result = {
          status: 'success',
          message: 'Configuration updated successfully.',
          config: validatedConfig,
        };
        const responseText = JSON.stringify(result);

        return {
          content: [{ type: 'text' as const, text: responseText }],
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
