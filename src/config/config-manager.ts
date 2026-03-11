import { readFile, writeFile, stat } from 'node:fs/promises';
import { ConfigSchema } from './config-schema.js';
import type { SprintPilotConfig } from './config-schema.js';
import { ConfigMissingError, ConfigInvalidError } from '../shared/errors.js';
import { ZodError } from 'zod';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface CacheEntry {
  mtimeMs: number;
  config: Readonly<SprintPilotConfig>;
}

// ---------------------------------------------------------------------------
// Markdown key constants
// ---------------------------------------------------------------------------

const MD_KEY_ORG = 'Organization';
const MD_KEY_PROJECT = 'Project';
const MD_KEY_TEAM = 'Team';
const MD_KEY_BASE_BRANCH = 'Base branch';
const MD_KEY_PR_TARGET = 'PR target';
const MD_KEY_BRANCH_TPL = 'Branch template';
const MD_KEY_COMMIT_TPL = 'Commit template';
const MD_KEY_DEV_SERVER = 'Dev server command';
const MD_KEY_TEST_CMD = 'Test command';

// ---------------------------------------------------------------------------
// ConfigManager
// ---------------------------------------------------------------------------

export class ConfigManager {
  private readonly configPath: string;
  private cache: CacheEntry | null = null;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  async load(): Promise<Readonly<SprintPilotConfig>> {
    // Check existence first (throws ConfigMissingError if absent)
    const fileStat = await this.statOrThrow();

    // Return cached result if mtime is unchanged
    if (this.cache !== null && this.cache.mtimeMs === fileStat.mtimeMs) {
      return this.cache.config;
    }

    // Read and parse
    const content = await readFile(this.configPath, 'utf-8');
    const raw = parseMarkdown(content);

    let validated: SprintPilotConfig;
    try {
      validated = ConfigSchema.parse(raw);
    } catch (err: unknown) {
      if (err instanceof ZodError) {
        const detail = err.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        throw new ConfigInvalidError(detail);
      }
      throw err;
    }

    const frozen = Object.freeze(validated);
    this.cache = { mtimeMs: fileStat.mtimeMs, config: frozen };
    return frozen;
  }

  async write(config: SprintPilotConfig): Promise<void> {
    const markdown = serializeMarkdown(config);
    await writeFile(this.configPath, markdown, 'utf-8');

    // Update cache mtime to avoid stale reads on next load()
    const fileStat = await stat(this.configPath);
    this.cache = { mtimeMs: fileStat.mtimeMs, config: Object.freeze({ ...config }) };
  }

  async exists(): Promise<boolean> {
    try {
      await stat(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async statOrThrow(): Promise<{ mtimeMs: number }> {
    try {
      const s = await stat(this.configPath);
      return { mtimeMs: s.mtimeMs };
    } catch {
      throw new ConfigMissingError();
    }
  }
}

// ---------------------------------------------------------------------------
// Markdown parsing
// ---------------------------------------------------------------------------

type SectionName =
  | 'azure devops'
  | 'work item types'
  | 'status mapping'
  | 'git'
  | 'testing'
  | 'unknown';

function parseMarkdown(content: string): Record<string, unknown> {
  const lines = content.split(/\r?\n/);

  let currentSection: SectionName = 'unknown';
  let currentSubSection: string | null = null;

  // Collected values
  const kvAzure = new Map<string, string>();
  const workItemTypes: string[] = [];
  const statusMapping: Record<string, Record<string, string>> = {};
  const kvGit = new Map<string, string>();
  const kvTesting = new Map<string, string>();

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect ## section headers
    const sectionMatch = /^##\s+(.+)$/.exec(trimmed);
    if (sectionMatch !== null) {
      currentSubSection = null;
      const sectionTitle = sectionMatch[1].trim().toLowerCase();
      if (sectionTitle === 'azure devops') currentSection = 'azure devops';
      else if (sectionTitle === 'work item types') currentSection = 'work item types';
      else if (sectionTitle === 'status mapping') currentSection = 'status mapping';
      else if (sectionTitle === 'git') currentSection = 'git';
      else if (sectionTitle === 'testing') currentSection = 'testing';
      else currentSection = 'unknown';
      continue;
    }

    // Detect ### sub-section headers (used within Status Mapping)
    const subSectionMatch = /^###\s+(.+)$/.exec(trimmed);
    if (subSectionMatch !== null) {
      currentSubSection = subSectionMatch[1].trim();
      continue;
    }

    // Parse list items
    const kvMatch = /^-\s+(.+?):\s+(.+)$/.exec(trimmed);
    const bareMatch = /^-\s+(.+)$/.exec(trimmed);

    if (kvMatch !== null) {
      const key = kvMatch[1];
      const value = kvMatch[2];

      switch (currentSection) {
        case 'azure devops':
          kvAzure.set(key, value);
          break;
        case 'status mapping':
          if (currentSubSection !== null) {
            if (statusMapping[currentSubSection] === undefined) {
              statusMapping[currentSubSection] = {};
            }
            statusMapping[currentSubSection][key] = value;
          }
          break;
        case 'git':
          kvGit.set(key, value);
          break;
        case 'testing':
          kvTesting.set(key, value);
          break;
        default:
          break;
      }
    } else if (bareMatch !== null && currentSection === 'work item types') {
      workItemTypes.push(bareMatch[1].trim());
    }
  }

  // Assemble raw config object
  const raw: Record<string, unknown> = {
    organizationUrl: kvAzure.get(MD_KEY_ORG),
    project: kvAzure.get(MD_KEY_PROJECT),
    allowedWorkItemTypes: workItemTypes,
    statusMapping: buildStatusMapping(statusMapping),
    git: {
      baseBranchOrTag: kvGit.get(MD_KEY_BASE_BRANCH),
      prTargetBranch: kvGit.get(MD_KEY_PR_TARGET),
      branchTemplate: kvGit.get(MD_KEY_BRANCH_TPL),
      commitTemplate: kvGit.get(MD_KEY_COMMIT_TPL),
    },
    testing: buildTestingConfig(kvTesting),
  };

  // Optional fields -- only include if present
  const team = kvAzure.get(MD_KEY_TEAM);
  if (team !== undefined) {
    raw['team'] = team;
  }

  return raw;
}

function buildStatusMapping(
  raw: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const [type, mapping] of Object.entries(raw)) {
    result[type] = {
      blocked: mapping['blocked'] ?? '',
      inProgress: mapping['inProgress'] ?? '',
      inReview: mapping['inReview'] ?? '',
    };
  }
  return result;
}

function buildTestingConfig(kv: Map<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {
    testCommand: kv.get(MD_KEY_TEST_CMD),
  };

  const devServer = kv.get(MD_KEY_DEV_SERVER);
  if (devServer !== undefined) {
    result['devServerCommand'] = devServer;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Markdown serialization
// ---------------------------------------------------------------------------

function serializeMarkdown(config: SprintPilotConfig): string {
  const lines: string[] = [];

  lines.push('# SprintPilot Configuration');
  lines.push('');

  // Azure DevOps
  lines.push('## Azure DevOps');
  lines.push(`- ${MD_KEY_ORG}: ${config.organizationUrl}`);
  lines.push(`- ${MD_KEY_PROJECT}: ${config.project}`);
  if (config.team !== undefined) {
    lines.push(`- ${MD_KEY_TEAM}: ${config.team}`);
  }
  lines.push('');

  // Work Item Types
  lines.push('## Work Item Types');
  for (const type of config.allowedWorkItemTypes) {
    lines.push(`- ${type}`);
  }
  lines.push('');

  // Status Mapping
  lines.push('## Status Mapping');
  for (const [type, mapping] of Object.entries(config.statusMapping)) {
    lines.push(`### ${type}`);
    lines.push(`- blocked: ${mapping.blocked}`);
    lines.push(`- inProgress: ${mapping.inProgress}`);
    lines.push(`- inReview: ${mapping.inReview}`);
    lines.push('');
  }

  // Git
  lines.push('## Git');
  lines.push(`- ${MD_KEY_BASE_BRANCH}: ${config.git.baseBranchOrTag}`);
  lines.push(`- ${MD_KEY_PR_TARGET}: ${config.git.prTargetBranch}`);
  lines.push(`- ${MD_KEY_BRANCH_TPL}: ${config.git.branchTemplate}`);
  lines.push(`- ${MD_KEY_COMMIT_TPL}: ${config.git.commitTemplate}`);
  lines.push('');

  // Testing
  lines.push('## Testing');
  if (config.testing.devServerCommand !== undefined) {
    lines.push(`- ${MD_KEY_DEV_SERVER}: ${config.testing.devServerCommand}`);
  }
  lines.push(`- ${MD_KEY_TEST_CMD}: ${config.testing.testCommand}`);
  lines.push('');

  return lines.join('\n');
}
