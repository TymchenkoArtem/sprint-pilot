/**
 * setup -- Configure SprintPilot for a specific AI tool.
 *
 * [1/5] Copy slash commands to user home (for tools that support them)
 * [2/5] Register MCP servers in the AI tool's config
 * [3/5] Update .gitignore with SprintPilot entries
 * [4/5] Check prerequisites (fabric/)
 * [5/5] Interactive init: prompt for PAT (masked), org, project, team, branch
 *
 * Instructions and templates are served from the npm package via the
 * sp-instructions MCP tool and are NOT copied into the project.
 */

import { readFile, writeFile, mkdir, readdir, copyFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { execSync } from 'node:child_process';

import { ConfigManager } from '../config/config-manager.js';
import { CONFIG_FILE, FABRIC_CLI_DIR } from '../shared/constants.js';
import {
  directoryExists,
  selectAuthStrategy,
  runInitPipeline,
  InitValidationError,
} from '../shared/init-core.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AiTool = 'claude' | 'cursor' | 'copilot' | 'augment';

export interface SetupOptions {
  force?: boolean;
}

interface ToolConfig {
  /** Absolute path to the tool's global MCP config file. */
  configPath: string;
  /** Key under which MCP servers are registered. */
  serversKey: string;
  /** Display name for console output. */
  displayName: string;
  /** Path to the tool's slash commands directory, or null if unsupported. */
  commandsDir: string | null;
}

// ---------------------------------------------------------------------------
// MCP server registry
// ---------------------------------------------------------------------------

interface StdioServerEntry { type: 'stdio'; command: string; args: string[] }
interface HttpServerEntry  { type: 'http';  url: string }
type McpServerEntry = StdioServerEntry | HttpServerEntry;

interface McpServerDef {
  key: string;
  entry: McpServerEntry;
  supportedTools?: AiTool[];
}

interface McpRegistrationResult {
  key: string;
  registered: boolean;
}

const MCP_SERVERS: McpServerDef[] = [
  { key: 'sprint-pilot',    entry: { type: 'stdio', command: 'npx', args: ['-y', 'sprint-pilot', 'serve'] } },
  { key: 'playwright',      entry: { type: 'stdio', command: 'npx', args: ['@playwright/mcp@latest'] } },
  { key: 'chrome-devtools', entry: { type: 'stdio', command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest'] } },
  { key: 'microsoft-learn', entry: { type: 'http',  url: 'https://learn.microsoft.com/api/mcp' }, supportedTools: ['claude', 'copilot'] },
];

function getServersForTool(tool: AiTool): McpServerDef[] {
  return MCP_SERVERS.filter(s => !s.supportedTools || s.supportedTools.includes(tool));
}

// ---------------------------------------------------------------------------
// Tool configurations (global paths -- MCP registered in home directory)
// ---------------------------------------------------------------------------

function getCopilotConfigPath(home: string): string {
  switch (process.platform) {
    case 'win32':
      return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Code', 'User', 'mcp.json');
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'Code', 'User', 'mcp.json');
    default:
      return join(home, '.config', 'Code', 'User', 'mcp.json');
  }
}

function getToolConfig(tool: AiTool): ToolConfig {
  const home = homedir();
  switch (tool) {
    case 'claude':
      return {
        configPath: join(home, '.claude.json'),
        serversKey: 'mcpServers',
        displayName: 'Claude CLI',
        commandsDir: join(home, '.claude', 'commands'),
      };
    case 'cursor':
      return {
        configPath: join(home, '.cursor', 'mcp.json'),
        serversKey: 'mcpServers',
        displayName: 'Cursor',
        commandsDir: join(home, '.cursor', 'commands'),
      };
    case 'copilot':
      return {
        configPath: getCopilotConfigPath(home),
        serversKey: 'servers',
        displayName: 'GitHub Copilot',
        commandsDir: null,
      };
    case 'augment':
      return {
        configPath: join(home, '.augment', 'mcp.json'),
        serversKey: 'mcpServers',
        displayName: 'Augment',
        commandsDir: null,
      };
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SP_DIR = '.sprint-pilot';
const WORKFLOWS_DIR = join(SP_DIR, 'workflows');

const GITIGNORE_ENTRIES = [
  '.sprint-pilot/',
  '.claude/settings.local.json',
];

const CHECK = '\u2713';  // ✓
const WARN  = '\u26A0';  // ⚠

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the path to the npm package's templates/ directory. */
function getPackageTemplatesDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // From dist/cli/ -> up two levels to package root -> templates/
  return join(currentDir, '..', '..', 'templates');
}

/** Check whether a file or directory exists. */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively copy a directory's contents to a target directory.
 * Creates target directories as needed. Does NOT overwrite existing files
 * unless force is true.
 */
async function copyDirectory(
  src: string,
  dest: string,
  force = false,
): Promise<number> {
  await mkdir(dest, { recursive: true });
  let copied = 0;

  let entries: string[];
  try {
    entries = await readdir(src);
  } catch {
    return 0; // Source directory doesn't exist
  }

  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);

    // Check if it's a directory by trying to readdir
    try {
      await readdir(srcPath);
      // It's a directory -- recurse
      copied += await copyDirectory(srcPath, destPath, force);
    } catch {
      // It's a file
      if (force || !(await exists(destPath))) {
        await copyFile(srcPath, destPath);
        copied++;
      }
    }
  }

  return copied;
}

/**
 * Patch an AI tool's MCP config file to register multiple servers.
 * Creates the file and parent directory if they don't exist.
 * Idempotent: skips servers that are already registered.
 */
async function patchMcpConfig(
  toolConfig: ToolConfig,
  servers: McpServerDef[],
): Promise<McpRegistrationResult[]> {
  const { configPath, serversKey } = toolConfig;

  // Ensure parent directory exists
  await mkdir(dirname(configPath), { recursive: true });

  // Read existing config or start fresh
  let config: Record<string, unknown> = {};
  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null) {
      config = parsed as Record<string, unknown>;
    }
  } catch {
    // File doesn't exist or invalid JSON -- start fresh
  }

  // Get or create the servers section
  let serverSection = config[serversKey] as Record<string, unknown> | undefined;
  if (typeof serverSection !== 'object' || serverSection === null) {
    serverSection = {};
    config[serversKey] = serverSection;
  }

  const results: McpRegistrationResult[] = [];
  let anyRegistered = false;

  for (const server of servers) {
    if (server.key in serverSection) {
      results.push({ key: server.key, registered: false });
    } else {
      serverSection[server.key] = server.entry;
      results.push({ key: server.key, registered: true });
      anyRegistered = true;
    }
  }

  // Write back only if something changed
  if (anyRegistered) {
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  }

  return results;
}

/**
 * Append entries to .gitignore if not already present.
 */
async function updateGitignore(): Promise<number> {
  let content = '';
  try {
    content = await readFile('.gitignore', 'utf-8');
  } catch {
    // .gitignore doesn't exist
  }

  const existingLines = content.split('\n');
  const toAppend: string[] = [];

  for (const entry of GITIGNORE_ENTRIES) {
    if (!existingLines.includes(entry)) {
      toAppend.push(entry);
    }
  }

  if (toAppend.length > 0) {
    const suffix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    await writeFile('.gitignore', content + suffix + toAppend.join('\n') + '\n');
  }

  return toAppend.length;
}

// ---------------------------------------------------------------------------
// Interactive prompt helpers
// ---------------------------------------------------------------------------

/**
 * Prompt the user for masked input (e.g. PAT token).
 * Echoes '*' for each character typed.
 */
function promptMasked(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Override _writeToOutput to mask characters
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput =
      function (stringToWrite: string) {
        if (stringToWrite === prompt) {
          process.stdout.write(prompt);
        } else if (stringToWrite === '\r\n' || stringToWrite === '\n') {
          process.stdout.write(stringToWrite);
        } else {
          process.stdout.write('*'.repeat(stringToWrite.length));
        }
      };

    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** Prompt the user for plain text input. */
function promptLine(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** Detect the current git branch, falling back to "main". */
function detectGitBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'main';
  }
}

// ---------------------------------------------------------------------------
// Interactive initialization flow
// ---------------------------------------------------------------------------

export interface InteractiveInitOptions {
  skipIfExists?: boolean;
  indent?: string;
}

export async function runInteractiveInit(options?: InteractiveInitOptions): Promise<void> {
  const skipIfExists = options?.skipIfExists ?? true;
  const indent = options?.indent ?? '  ';

  // Check if already initialized
  const configManager = new ConfigManager(CONFIG_FILE);
  if ((await configManager.exists()) && skipIfExists) {
    console.log(`${indent}${CHECK} Already initialized. Run "sprint-pilot init" to reconfigure.`);
    return;
  }

  // Non-TTY guard
  if (!process.stdin.isTTY) {
    console.log(`${indent}Skipping initialization: not an interactive terminal.`);
    console.log(`${indent}Run setup interactively to configure PAT.`);
    return;
  }

  console.log('');

  // Prompt for PAT (masked)
  const pat = await promptMasked(`${indent}Azure DevOps PAT: `);
  if (pat.length === 0) {
    console.log(`${indent}PAT cannot be empty. Skipping initialization.`);
    return;
  }

  // Prompt for organization URL
  const organizationUrl = await promptLine(`${indent}Organization URL (e.g. https://dev.azure.com/my-org): `);
  if (organizationUrl.length === 0) {
    console.log(`${indent}Organization URL cannot be empty. Skipping initialization.`);
    return;
  }

  // Prompt for project name
  const project = await promptLine(`${indent}Project name: `);
  if (project.length === 0) {
    console.log(`${indent}Project name cannot be empty. Skipping initialization.`);
    return;
  }

  // Prompt for team (optional)
  const team = await promptLine(`${indent}Team name (optional, Enter to skip): `);

  // Prompt for base branch
  const defaultBranch = detectGitBranch();
  const baseBranchInput = await promptLine(`${indent}Base branch [${defaultBranch}]: `);
  const baseBranchOrTag = baseBranchInput.length > 0 ? baseBranchInput : defaultBranch;

  console.log('');
  console.log(`${indent}Validating PAT and fetching workflow states...`);

  // Select auth strategy and run init pipeline
  const { authStrategy, keytarAvailable } = await selectAuthStrategy();

  try {
    const result = await runInitPipeline(
      {
        pat,
        organizationUrl,
        project,
        ...(team.length > 0 ? { team } : {}),
        baseBranchOrTag,
        prTargetBranch: baseBranchOrTag,
      },
      authStrategy,
      keytarAvailable,
    );

    const method = result.authMethod === 'os_keychain' ? 'OS keychain' : 'file (~/.sprint-pilot/pat)';
    console.log(`${indent}${CHECK} PAT stored via ${method}`);
    console.log(`${indent}${CHECK} Configuration written to .sprint-pilot/config.md`);
  } catch (error: unknown) {
    if (error instanceof InitValidationError) {
      console.error('');
      console.error(`${indent}PAT validation failed.`);
      if (error.missingScopes.length > 0) {
        console.error(`${indent}Missing scopes: ${error.missingScopes.join(', ')}`);
      }
      console.error(`${indent}Create a new PAT with the required scopes and try again.`);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${indent}Initialization failed: ${message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main setup function
// ---------------------------------------------------------------------------

/* eslint-disable no-console */

export async function runSetup(tool: AiTool, options?: SetupOptions): Promise<void> {
  const force = options?.force ?? false;
  const toolConfig = getToolConfig(tool);
  const indent = '        '; // 8 spaces for sub-results

  console.log(`Setting up SprintPilot for ${toolConfig.displayName}...`);
  console.log('');

  // Create project directories silently before steps
  await mkdir(WORKFLOWS_DIR, { recursive: true });

  // Step 1: Copy slash commands (to user home, for tools that support them)
  console.log('  [1/5] Installing slash commands');
  if (toolConfig.commandsDir) {
    const packageTemplatesDir = getPackageTemplatesDir();
    const commandsSrc = join(packageTemplatesDir, 'commands');
    const commandsCopied = await copyDirectory(commandsSrc, toolConfig.commandsDir, force);
    if (commandsCopied > 0) {
      console.log(`${indent}${CHECK} Copied ${commandsCopied} slash commands to ${toolConfig.commandsDir}`);
    } else {
      console.log(`${indent}${CHECK} Slash commands already present`);
    }
  } else {
    console.log(`${indent}${CHECK} Not applicable for ${toolConfig.displayName}`);
  }

  // Step 2: Register MCP servers
  console.log('');
  console.log('  [2/5] Registering MCP servers');
  const servers = getServersForTool(tool);
  const mcpResults = await patchMcpConfig(toolConfig, servers);
  for (const result of mcpResults) {
    const status = result.registered ? 'registered' : 'already registered';
    console.log(`${indent}${CHECK} ${result.key} ${status}`);
  }

  // Step 3: Update .gitignore
  console.log('');
  console.log('  [3/5] Updating .gitignore');
  const gitignoreAdded = await updateGitignore();
  if (gitignoreAdded > 0) {
    console.log(`${indent}${CHECK} Added ${gitignoreAdded} ${gitignoreAdded === 1 ? 'entry' : 'entries'}`);
  } else {
    console.log(`${indent}${CHECK} Already up to date`);
  }

  // Step 4: Check prerequisites
  console.log('');
  console.log('  [4/5] Checking prerequisites');

  // Check fabric-cli global installation (~/fabric/)
  const hasFabricCli = await directoryExists(FABRIC_CLI_DIR);
  if (hasFabricCli) {
    console.log(`${indent}${CHECK} fabric-cli detected (${FABRIC_CLI_DIR})`);
  } else {
    console.log(`${indent}${WARN} fabric-cli not detected (~/fabric/ not found).`);
    console.log(`${indent}  fabric-cli enables advanced spec shaping and task breakdown for complex work items.`);
    console.log(`${indent}  SprintPilot will work without it using best practices and codebase analysis.`);
  }

  // Check project-level fabric/ docs
  const hasFabric = await directoryExists('fabric');
  const hasFabricProduct = hasFabric && await directoryExists('fabric/product');

  if (hasFabric && hasFabricProduct) {
    console.log(`${indent}${CHECK} fabric/ and fabric/product/ found`);
  } else if (!hasFabric) {
    console.log(`${indent}${WARN} fabric/ directory not found.`);
    console.log(`${indent}  Without fabric/, SprintPilot will use codebase analysis and best practices`);
    console.log(`${indent}  instead of project-specific standards and product documentation.`);
    console.log(`${indent}  To enable full standards-based verification, run fabric-cli initialization.`);
  } else {
    console.log(`${indent}${WARN} fabric/product/ directory not found.`);
    console.log(`${indent}  Run /plan-product from your AI tool to create it.`);
  }

  // Step 5: Project configuration
  console.log('');
  console.log('  [5/5] Project configuration');
  await runInteractiveInit({ skipIfExists: true, indent });

  // Closing message
  console.log('');
  console.log('  SprintPilot is ready.');
  if (tool === 'claude' || tool === 'cursor') {
    console.log('  Open Claude CLI and use /sp-start to start working with tasks.');
  } else {
    console.log(`  Open ${toolConfig.displayName} and ask it to 'show my work items' or 'work on <work-item-id>' to start.`);
  }
}

/* eslint-enable no-console */
