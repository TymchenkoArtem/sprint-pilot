/**
 * reconfigure-pat -- Re-run PAT storage without full re-initialization.
 *
 * Reads stdin for the PAT (piped or interactive), validates it against
 * the organization URL from the existing config, and stores it.
 */

import { readFileSync } from 'node:fs';
import { ConfigManager } from '../config/config-manager.js';
import { CONFIG_FILE } from '../shared/constants.js';
import { KeytarStrategy } from '../auth/keytar-strategy.js';
import { FileFallbackStrategy } from '../auth/file-fallback.js';
import type { AuthStrategy } from '../auth/auth-strategy.js';

export async function reconfigurePat(): Promise<void> {
  // Step 1: Load existing config
  const configManager = new ConfigManager(CONFIG_FILE);

  let config;
  try {
    config = await configManager.load();
  } catch {
    console.error('Error: SprintPilot is not initialized in this project.');
    console.error('Run "sprint-pilot setup-claude" (or the appropriate setup command) to initialize first.');
    process.exit(1);
  }

  // Step 2: Read PAT from stdin
  console.log('Enter your Azure DevOps PAT:');

  let pat: string;
  try {
    // Read from stdin (supports piped input)
    pat = readFileSync('/dev/stdin', 'utf-8').trim();
  } catch {
    console.error('Error: Could not read PAT from stdin.');
    process.exit(1);
  }

  if (pat.length === 0) {
    console.error('Error: PAT cannot be empty.');
    process.exit(1);
  }

  // Step 3: Select auth strategy
  const keytarAvailable = await KeytarStrategy.isAvailable();
  const authStrategy: AuthStrategy = keytarAvailable
    ? new KeytarStrategy()
    : new FileFallbackStrategy();

  // Step 4: Validate PAT
  const validation = await authStrategy.validate(pat, config.organizationUrl);
  if (!validation.valid) {
    console.error('Error: PAT validation failed.');
    if (validation.missingScopes.length > 0) {
      console.error(`Missing scopes: ${validation.missingScopes.join(', ')}`);
    }
    process.exit(1);
  }

  // Step 5: Store PAT
  await authStrategy.store(pat);

  const method = keytarAvailable ? 'OS keychain' : 'file (~/.sprint-pilot/pat)';
  console.log(`PAT stored successfully via ${method}.`);
}
