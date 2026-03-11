/**
 * sp-instructions -- MCP tool for retrieving built-in workflow instructions
 * and templates from the SprintPilot package.
 *
 * This is a lightweight, read-only tool that serves markdown files shipped
 * inside the npm package. No auth, config, or ADO client required.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { normalizeError } from '../shared/errors.js';
import type { SprintPilotError } from '../shared/errors.js';

// ---------------------------------------------------------------------------
// Strict input schema
// ---------------------------------------------------------------------------

const SpInstructionsInputSchema = z
  .object({
    name: z
      .string()
      .describe(
        'File name without .md extension (e.g. "CLAUDE", "session-start", "pr-description")',
      ),
    category: z
      .enum(['instructions', 'templates'])
      .default('instructions')
      .describe(
        'Category: "instructions" for workflow docs, "templates" for file templates',
      ),
  })
  .strict();

/** Raw shape passed to server.tool() for JSON-Schema generation. */
export const spInstructionsShape = SpInstructionsInputSchema.shape;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPackageTemplatesDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // From dist/tools/ -> up two levels to package root -> templates/
  return join(currentDir, '..', '..', 'templates');
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerSpInstructions(server: McpServer): void {
  server.tool(
    'sp-instructions',
    'Retrieve SprintPilot workflow instructions and templates. Returns markdown content from the package\'s built-in instruction and template files.',
    spInstructionsShape,
    async (rawArgs) => {
      try {
        // Strict validation: reject unknown keys
        const { name, category } = SpInstructionsInputSchema.parse(rawArgs);

        const templatesDir = getPackageTemplatesDir();
        const categoryDir = join(templatesDir, category);
        const filePath = join(categoryDir, name + '.md');

        try {
          const fileContent = await readFile(filePath, 'utf-8');
          return {
            content: [{ type: 'text' as const, text: fileContent }],
          };
        } catch (fileError: unknown) {
          // File not found -- list available files in the category
          if (
            fileError instanceof Error &&
            'code' in fileError &&
            (fileError as NodeJS.ErrnoException).code === 'ENOENT'
          ) {
            let available: string[] = [];
            try {
              const entries = await readdir(categoryDir);
              available = entries
                .filter((e) => e.endsWith('.md'))
                .map((e) => e.replace(/\.md$/, ''));
            } catch {
              // Category directory itself doesn't exist
            }

            const listing =
              available.length > 0
                ? `Available ${category}: ${available.join(', ')}`
                : `No files found in category "${category}".`;

            return {
              content: [
                {
                  type: 'text' as const,
                  text: `File "${name}.md" not found in ${category}. ${listing}`,
                },
              ],
            };
          }

          // Re-throw non-ENOENT errors to outer catch
          throw fileError;
        }
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
