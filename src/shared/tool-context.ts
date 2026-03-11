/**
 * tool-context -- Shared initialization for MCP tool handlers.
 *
 * Eliminates the ~15 lines of boilerplate that every tool repeats:
 * config load, auth strategy selection, ADO client creation,
 * scope validator instantiation, logger and usage tracker setup.
 *
 * Usage in a tool handler:
 *   const ctx = await createToolContext();
 *   // ctx.config, ctx.adoClient, ctx.scopeValidator, ctx.logger, ctx.usageTracker
 *   // ... do work ...
 *   await ctx.close();
 */

import { join } from 'node:path';

import { ConfigManager } from '../config/config-manager.js';
import type { SprintPilotConfig } from '../config/config-schema.js';
import { CONFIG_FILE, workflowItemDir } from './constants.js';
import { KeytarStrategy } from '../auth/keytar-strategy.js';
import { FileFallbackStrategy } from '../auth/file-fallback.js';
import type { AuthStrategy } from '../auth/auth-strategy.js';
import { AdoClient } from '../ado/ado-client.js';
import { ScopeValidator } from '../security/scope-validator.js';
import { ActivityLogger } from './logger.js';
import { UsageTracker } from './usage-tracker.js';

// ---------------------------------------------------------------------------
// ToolContext
// ---------------------------------------------------------------------------

export interface ToolContext {
  readonly config: Readonly<SprintPilotConfig>;
  readonly adoClient: AdoClient;
  readonly scopeValidator: ScopeValidator;
  readonly logger?: ActivityLogger | undefined;
  readonly usageTracker?: UsageTracker | undefined;
  /** Flush and close logger + usage tracker. */
  close(): Promise<void>;
}

/**
 * Create a fully initialized tool context: config, authenticated ADO client,
 * scope validator, and optionally activity logger and usage tracker.
 *
 * When `flow` is provided, logger and usageTracker are created pointing
 * to the per-item workflow directory. When omitted, they are undefined.
 *
 * Call `ctx.close()` in the finally block of the tool handler.
 */
export async function createToolContext(flow?: string): Promise<ToolContext> {
  const configManager = new ConfigManager(CONFIG_FILE);
  const config = await configManager.load();

  const keytarAvailable = await KeytarStrategy.isAvailable();
  const authStrategy: AuthStrategy = keytarAvailable
    ? new KeytarStrategy()
    : new FileFallbackStrategy();

  const adoClient = await AdoClient.create(config.organizationUrl, authStrategy);
  const scopeValidator = new ScopeValidator(config, adoClient.getCurrentUserId());

  let logger: ActivityLogger | undefined;
  let usageTracker: UsageTracker | undefined;

  if (flow !== undefined) {
    const itemDir = workflowItemDir(flow);
    logger = new ActivityLogger(join(itemDir, 'activity.md'));
    usageTracker = new UsageTracker(join(itemDir, 'usage.md'));
  }

  return {
    config,
    adoClient,
    scopeValidator,
    logger,
    usageTracker,
    async close(): Promise<void> {
      if (logger !== undefined) {
        await logger.flush();
        await logger.close();
      }
      if (usageTracker !== undefined) {
        await usageTracker.flush();
        await usageTracker.close();
      }
    },
  };
}
