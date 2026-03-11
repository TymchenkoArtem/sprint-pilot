/**
 * sp-init -- MCP tool for SprintPilot initialization status check.
 *
 * This tool does NOT accept a PAT or perform initialization.
 * It checks whether SprintPilot is properly configured and tells
 * the AI to direct the user to the CLI if setup is needed.
 *
 * PAT configuration happens exclusively in the terminal via
 * `sprint-pilot setup-claude` (or other setup-* commands).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { ConfigManager } from '../config/config-manager.js';
import { CONFIG_FILE, FABRIC_CLI_DIR } from '../shared/constants.js';
import { normalizeError } from '../shared/errors.js';
import type { SprintPilotError } from '../shared/errors.js';
import { directoryExists, selectAuthStrategy } from '../shared/init-core.js';

// ---------------------------------------------------------------------------
// Strict input schema -- no parameters needed for status check
// ---------------------------------------------------------------------------

const SpInitInputSchema = z.object({}).strict();

/** Raw shape passed to server.tool() for JSON-Schema generation. */
const spInitShape = SpInitInputSchema.shape;

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerSpInit(server: McpServer): void {
  server.tool(
    'sp-init',
    'Check SprintPilot initialization status. Returns whether the project is configured and PAT is stored. If not initialized, tells user to run CLI setup.',
    spInitShape,
    async (rawArgs) => {
      try {
        // Strict validation: reject unknown keys
        SpInitInputSchema.parse(rawArgs);

        // Check 1: fabric/ directory (project-level)
        const fabricExists = await directoryExists('fabric');

        // Check 2: fabric/product/ directory
        const productExists = fabricExists
          ? await directoryExists('fabric/product')
          : false;

        // Check 3: fabric-cli installed (global ~/fabric/ directory)
        const fabricCliInstalled = await directoryExists(FABRIC_CLI_DIR);

        // Check 4: config file
        const configManager = new ConfigManager(CONFIG_FILE);
        const configExists = await configManager.exists();

        // Check 5: PAT stored
        let patConfigured = false;
        let authMethod: string | undefined;
        const { authStrategy, keytarAvailable } = await selectAuthStrategy();
        const storedPat = await authStrategy.retrieve();
        if (storedPat !== null) {
          patConfigured = true;
          authMethod = keytarAvailable ? 'os_keychain' : 'file_fallback';
        }

        // Determine status
        if (configExists && patConfigured) {
          // Fully initialized
          const config = await configManager.load();
          const result = {
            status: 'initialized',
            config,
            auth_method: authMethod,
            pat_configured: true,
            fabric: {
              project_docs: fabricExists,
              product_docs: productExists,
              cli_installed: fabricCliInstalled,
            },
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          };
        }

        if (configExists && !patConfigured) {
          // Config exists but PAT is gone
          const config = await configManager.load();
          const result = {
            status: 'pat_missing',
            message:
              "PAT not configured. Run 'sprint-pilot init --reconfigure-pat' in the terminal to restore it.",
            config,
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          };
        }

        // Not initialized
        const result = {
          status: 'not_initialized',
          message:
            "Run 'sprint-pilot setup-claude' (or setup-cursor, setup-copilot, setup-augment) in your terminal to initialize.",
          checks: {
            fabric: fabricExists,
            product: productExists,
            fabric_cli: fabricCliInstalled,
            config: configExists,
            pat: patConfigured,
          },
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
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
