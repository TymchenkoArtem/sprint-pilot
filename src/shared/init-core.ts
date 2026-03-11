/**
 * init-core -- Shared initialization helpers and pipeline.
 *
 * Extracted from sp-init.ts so both the MCP tool (status check)
 * and the CLI setup flow can reuse the same logic.
 *
 * The CLI calls runInitPipeline() directly with user-provided input;
 * the MCP tool only calls selectAuthStrategy() and directoryExists()
 * for its status-check role.
 */

import { readFile, writeFile, stat, mkdir, access } from 'node:fs/promises';
import { z } from 'zod';

import { StatusMappingSchema } from '../config/config-schema.js';
import type { SprintPilotConfig } from '../config/config-schema.js';
import { ConfigManager } from '../config/config-manager.js';
import {
  CONFIG_FILE,
  WORKFLOWS_DIR,
} from './constants.js';
import { KeytarStrategy } from '../auth/keytar-strategy.js';
import { FileFallbackStrategy } from '../auth/file-fallback.js';
import type { AuthStrategy } from '../auth/auth-strategy.js';
import { AdoClient } from '../ado/ado-client.js';
import { workItemTypeStatesEndpoint } from '../ado/endpoints.js';
import { AdoWorkItemTypeStatesResponseSchema } from '../ado/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check whether a directory exists at the given path. */
export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/** Check whether a file exists at the given path. */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect dev server and test commands from package.json scripts.
 * Returns an object with optional devServerCommand and testCommand.
 */
export async function detectPackageJsonScripts(): Promise<{
  devServerCommand: string | undefined;
  testCommand: string | undefined;
}> {
  let devServerCommand: string | undefined;
  let testCommand: string | undefined;

  try {
    const content = await readFile('package.json', 'utf-8');
    const parsed: unknown = JSON.parse(content);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'scripts' in parsed &&
      typeof (parsed as Record<string, unknown>).scripts === 'object'
    ) {
      const scripts = (parsed as Record<string, unknown>).scripts as Record<
        string,
        unknown
      >;

      // Detect dev server command
      if (typeof scripts['dev'] === 'string') {
        devServerCommand = 'npm run dev';
      } else if (typeof scripts['start'] === 'string') {
        devServerCommand = 'npm start';
      } else if (typeof scripts['serve'] === 'string') {
        devServerCommand = 'npm run serve';
      }

      // Detect test command
      if (typeof scripts['test'] === 'string') {
        testCommand = 'npm test';
      } else if (typeof scripts['test:unit'] === 'string') {
        testCommand = 'npm run test:unit';
      }
    }
  } catch {
    // package.json missing or invalid -- leave as undefined
  }

  return { devServerCommand, testCommand };
}

/**
 * Build default status mapping from ADO workflow states for a given
 * work item type. Attempts to find reasonable defaults for blocked,
 * inProgress, and inReview from the fetched state names.
 */
export function buildDefaultStatusMapping(
  stateNames: string[],
): z.infer<typeof StatusMappingSchema> {
  const lowerStates = stateNames.map((s) => s.toLowerCase());

  // Find blocked state
  const blockedCandidates = ['blocked', 'on hold', 'removed'];
  let blocked = 'Blocked';
  for (const candidate of blockedCandidates) {
    const idx = lowerStates.indexOf(candidate);
    if (idx !== -1) {
      blocked = stateNames[idx]!;
      break;
    }
  }

  // Find inProgress state
  const inProgressCandidates = ['active', 'in progress', 'doing', 'committed'];
  let inProgress = 'Active';
  for (const candidate of inProgressCandidates) {
    const idx = lowerStates.indexOf(candidate);
    if (idx !== -1) {
      inProgress = stateNames[idx]!;
      break;
    }
  }

  // Find inReview state
  const inReviewCandidates = ['resolved', 'in review', 'review', 'testing'];
  let inReview = 'Resolved';
  for (const candidate of inReviewCandidates) {
    const idx = lowerStates.indexOf(candidate);
    if (idx !== -1) {
      inReview = stateNames[idx]!;
      break;
    }
  }

  return { blocked, inProgress, inReview };
}

/**
 * Append entries to .gitignore if they are not already present.
 * Creates .gitignore if it doesn't exist.
 */
export async function updateGitignore(entries: string[]): Promise<void> {
  let content = '';
  try {
    content = await readFile('.gitignore', 'utf-8');
  } catch {
    // .gitignore doesn't exist -- will be created
  }

  const existingLines = content.split('\n');
  const toAppend: string[] = [];

  for (const entry of entries) {
    if (!existingLines.includes(entry)) {
      toAppend.push(entry);
    }
  }

  if (toAppend.length > 0) {
    const suffix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    await writeFile('.gitignore', content + suffix + toAppend.join('\n') + '\n');
  }
}

// ---------------------------------------------------------------------------
// Auth strategy selection
// ---------------------------------------------------------------------------

/**
 * Select the best available auth strategy.
 * Returns the strategy instance and whether keytar is available.
 */
export async function selectAuthStrategy(): Promise<{
  authStrategy: AuthStrategy;
  keytarAvailable: boolean;
}> {
  const keytarAvailable = await KeytarStrategy.isAvailable();
  const authStrategy: AuthStrategy = keytarAvailable
    ? new KeytarStrategy()
    : new FileFallbackStrategy();
  return { authStrategy, keytarAvailable };
}

// ---------------------------------------------------------------------------
// Init pipeline
// ---------------------------------------------------------------------------

/** Input for the initialization pipeline. */
export interface InitInput {
  pat: string;
  organizationUrl: string;
  project: string;
  team?: string;
  allowedWorkItemTypes?: string[];
  statusMapping?: Record<string, z.infer<typeof StatusMappingSchema>>;
  baseBranchOrTag?: string;
  prTargetBranch?: string;
  branchTemplate?: string;
  commitTemplate?: string;
  testCommand?: string;
  devServerCommand?: string;
}

/** Result of a successful initialization. */
export interface InitResult {
  config: SprintPilotConfig;
  authMethod: 'os_keychain' | 'file_fallback';
}

/**
 * Core initialization pipeline. Validates PAT, stores it, fetches ADO
 * workflow states, detects package.json scripts, builds config, writes
 * config, creates workflows dir, creates activity log, and logs the event.
 *
 * The caller is responsible for checking prerequisites (fabric/, product/,
 * existing config) before calling this function.
 */
export async function runInitPipeline(
  input: InitInput,
  authStrategy: AuthStrategy,
  keytarAvailable: boolean,
): Promise<InitResult> {
  // Step 1: Validate PAT
  const validationResult = await authStrategy.validate(
    input.pat,
    input.organizationUrl,
  );
  if (!validationResult.valid) {
    throw new InitValidationError(
      'PAT validation failed against Azure DevOps.',
      validationResult.missingScopes,
    );
  }

  // Step 2: Store PAT
  await authStrategy.store(input.pat);

  // Step 3: Default work item types
  const allowedWorkItemTypes = input.allowedWorkItemTypes ?? [
    'User Story',
    'Bug',
    'Task',
  ];

  // Step 4: Fetch workflow states and build status mapping
  let statusMapping: Record<string, z.infer<typeof StatusMappingSchema>>;

  if (input.statusMapping) {
    statusMapping = input.statusMapping;
  } else {
    statusMapping = {};
    const adoClient = await AdoClient.create(
      input.organizationUrl,
      authStrategy,
    );

    for (const witType of allowedWorkItemTypes) {
      const endpoint = workItemTypeStatesEndpoint(input.project, witType);
      const statesResponse = await adoClient.get(
        endpoint,
        AdoWorkItemTypeStatesResponseSchema,
      );
      const stateNames = statesResponse.value.map((s) => s.name);
      statusMapping[witType] = buildDefaultStatusMapping(stateNames);
    }
  }

  // Step 5: Detect commands from package.json
  const detected = await detectPackageJsonScripts();
  const testCommand = input.testCommand ?? detected.testCommand ?? 'npm test';
  const devServerCommand = input.devServerCommand ?? detected.devServerCommand;

  // Step 6: Build config
  const testingConfig: SprintPilotConfig['testing'] =
    devServerCommand !== undefined
      ? { testCommand, devServerCommand }
      : { testCommand };

  const config: SprintPilotConfig = {
    organizationUrl: input.organizationUrl,
    project: input.project,
    allowedWorkItemTypes,
    statusMapping,
    git: {
      baseBranchOrTag: input.baseBranchOrTag ?? 'main',
      prTargetBranch: input.prTargetBranch ?? 'main',
      branchTemplate: input.branchTemplate ?? 'features/{id}-{slug}',
      commitTemplate: input.commitTemplate ?? '#{id}: {description}',
    },
    testing: testingConfig,
    ...(input.team !== undefined ? { team: input.team } : {}),
  };

  // Step 7: Write config
  const configManager = new ConfigManager(CONFIG_FILE);
  await configManager.write(config);

  // Step 8: Update .gitignore
  await updateGitignore([WORKFLOWS_DIR + '/']);

  // Step 9: Create workflows directory
  await mkdir(WORKFLOWS_DIR, { recursive: true });

  return {
    config,
    authMethod: keytarAvailable ? 'os_keychain' : 'file_fallback',
  };
}

// ---------------------------------------------------------------------------
// Init-specific error
// ---------------------------------------------------------------------------

/**
 * Error thrown when PAT validation fails during the init pipeline.
 * Carries the missing scopes for reporting.
 */
export class InitValidationError extends Error {
  constructor(
    message: string,
    public readonly missingScopes: string[],
  ) {
    super(message);
    this.name = 'InitValidationError';
  }
}
