import { homedir } from 'node:os';
import { join } from 'node:path';

// Keytar identifiers
export const KEYTAR_SERVICE = 'sprint-pilot';
export const KEYTAR_ACCOUNT = 'ado-pat';

// Project-local paths (relative to project root)
export const CONFIG_DIR = '.sprint-pilot';
export const CONFIG_FILE = '.sprint-pilot/config.md';
export const WORKFLOWS_DIR = '.sprint-pilot/workflows';

/** Return the per-item workflow directory, e.g. '.sprint-pilot/workflows/US-12345'. */
export function workflowItemDir(itemId: string): string {
  return join(WORKFLOWS_DIR, itemId);
}

// User-home paths (PAT is org-scoped, not project-scoped)
export const CREDENTIALS_DIR = join(homedir(), '.sprint-pilot');
export const CREDENTIALS_FILE = join(homedir(), '.sprint-pilot', 'pat');

// fabric-cli global directory (standard location: ~/fabric/)
export const FABRIC_CLI_DIR = join(homedir(), 'fabric');

// ADO API configuration
export const ADO_API_VERSION = '7.1';
export const ADO_TIMEOUT_MS = 15_000;
export const ADO_BATCH_SIZE = 200;
export const ADO_MAX_CONCURRENCY = 6;
export const ADO_RETRY_MAX_ATTEMPTS = 3;
export const ADO_RETRY_BASE_DELAY_MS = 1_000;
