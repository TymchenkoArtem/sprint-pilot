/**
 * config -- CLI command for displaying and updating SprintPilot configuration.
 *
 * Subcommands:
 * - (none)          Display current config in readable format
 * - set <key> <val> Update a single config field (dot-notation supported)
 */

import { ConfigManager } from '../config/config-manager.js';
import { ConfigSchema } from '../config/config-schema.js';
import type { SprintPilotConfig } from '../config/config-schema.js';
import { CONFIG_FILE } from '../shared/constants.js';

// ---------------------------------------------------------------------------
// Deep-set helper
// ---------------------------------------------------------------------------

/**
 * Set a value on an object using a dotted key path (e.g. "git.branchTemplate").
 * Mutates the target object in place.
 */
function deepSet(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split('.');
  if (parts.length === 1) {
    obj[key] = value;
    return;
  }

  const [parent, child] = parts as [string, string];
  const parentObj = obj[parent];
  if (typeof parentObj === 'object' && parentObj !== null) {
    (parentObj as Record<string, unknown>)[child] = value;
  } else {
    obj[parent] = { [child]: value };
  }
}

// ---------------------------------------------------------------------------
// Display helper
// ---------------------------------------------------------------------------

function displayConfig(config: Readonly<SprintPilotConfig>): void {
  console.log('SprintPilot Configuration');
  console.log('');
  console.log('  Azure DevOps');
  console.log(`    Organization:  ${config.organizationUrl}`);
  console.log(`    Project:       ${config.project}`);
  if (config.team !== undefined) {
    console.log(`    Team:          ${config.team}`);
  }
  console.log('');
  console.log('  Work Item Types');
  for (const type of config.allowedWorkItemTypes) {
    console.log(`    - ${type}`);
  }
  console.log('');
  console.log('  Status Mapping');
  for (const [type, mapping] of Object.entries(config.statusMapping)) {
    console.log(`    ${type}: blocked=${mapping.blocked}, inProgress=${mapping.inProgress}, inReview=${mapping.inReview}`);
  }
  console.log('');
  console.log('  Git');
  console.log(`    Base branch:      ${config.git.baseBranchOrTag}`);
  console.log(`    PR target:        ${config.git.prTargetBranch}`);
  console.log(`    Branch template:  ${config.git.branchTemplate}`);
  console.log(`    Commit template:  ${config.git.commitTemplate}`);
  console.log('');
  console.log('  Testing');
  if (config.testing.devServerCommand !== undefined) {
    console.log(`    Dev server:  ${config.testing.devServerCommand}`);
  }
  console.log(`    Test command: ${config.testing.testCommand}`);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runConfigCli(
  subcommand: string | undefined,
  args: string[],
): Promise<void> {
  const configManager = new ConfigManager(CONFIG_FILE);

  // No subcommand: display config
  if (subcommand === undefined) {
    let config: Readonly<SprintPilotConfig>;
    try {
      config = await configManager.load();
    } catch {
      console.error('Error: SprintPilot is not initialized.');
      console.error('Run "sprint-pilot setup-claude" (or the appropriate setup command) first.');
      process.exit(1);
      return;
    }
    displayConfig(config);
    return;
  }

  // set <key> <value>
  if (subcommand === 'set') {
    const key = args[0];
    const valueParts = args.slice(1);

    if (!key || valueParts.length === 0) {
      console.error('Usage: sprint-pilot config set <key> <value>');
      process.exit(1);
      return;
    }

    const value = valueParts.join(' ');

    // Load existing config
    let config: Readonly<SprintPilotConfig>;
    try {
      config = await configManager.load();
    } catch {
      console.error('Error: SprintPilot is not initialized.');
      console.error('Run "sprint-pilot setup-claude" (or the appropriate setup command) first.');
      process.exit(1);
      return;
    }

    // Deep clone and apply update
    const updated: Record<string, unknown> = {
      ...config,
      git: { ...config.git },
      testing: { ...config.testing },
      statusMapping: { ...config.statusMapping },
    };
    deepSet(updated, key, value);

    // Validate with ConfigSchema
    const parseResult = ConfigSchema.safeParse(updated);
    if (!parseResult.success) {
      const detail = parseResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      console.error(`Validation error: ${detail}`);
      process.exit(1);
    }

    // Write back
    await configManager.write(parseResult.data);
    console.log(`Updated "${key}" to "${value}".`);
    return;
  }

  // Unknown subcommand
  console.error(`Unknown config subcommand: ${subcommand}`);
  console.error('Usage: sprint-pilot config [set <key> <value>]');
  process.exit(1);
}
