/**
 * FileFallbackStrategy -- Fallback authentication strategy using file storage.
 *
 * Used only when KeytarStrategy.isAvailable() returns false.
 * Stores the PAT in a file (default: ~/.sprint-pilot/pat) with
 * best-effort chmod 600.
 *
 * Security considerations:
 * - chmod 600 is best-effort; on Windows, NTFS uses ACLs, not Unix permissions.
 * - A prominent warning is printed to process.stderr on every store() call.
 * - The credentials path is never included in any log entry.
 * - The PAT value is never logged, exposed in errors, or returned in output.
 */

import { mkdir, writeFile, readFile, unlink, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AuthStrategy, ValidationResult } from './auth-strategy.js';
import { CREDENTIALS_FILE, ADO_TIMEOUT_MS } from '../shared/constants.js';

/**
 * Build a Basic auth header value from a PAT token.
 * PAT uses empty username: base64(":token").
 */
function buildAuthHeader(token: string): string {
  return 'Basic ' + Buffer.from(':' + token).toString('base64');
}

/**
 * Make a GET request to an ADO endpoint with PAT auth and timeout.
 * Returns the HTTP response. Callers inspect status codes to determine
 * scope availability.
 */
async function adoGet(
  url: string,
  token: string,
): Promise<Response> {
  return fetch(url, {
    method: 'GET',
    headers: {
      Authorization: buildAuthHeader(token),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(ADO_TIMEOUT_MS),
  });
}

export class FileFallbackStrategy implements AuthStrategy {
  private readonly credentialsPath: string;

  constructor(credentialsPath: string = CREDENTIALS_FILE) {
    // No I/O in constructor
    this.credentialsPath = credentialsPath;
  }

  async store(token: string): Promise<void> {
    // Step 1: Create parent directory if it does not exist
    const dir = dirname(this.credentialsPath);
    await mkdir(dir, { recursive: true });

    // Step 2: Write the token to the credentials file
    await writeFile(this.credentialsPath, token, { encoding: 'utf-8' });

    // Step 3: Best-effort chmod 600
    // On Windows, chmod is a no-op (NTFS uses ACLs). Do not throw on failure.
    try {
      await chmod(this.credentialsPath, 0o600);
    } catch {
      // Intentionally swallowed -- chmod failure is expected on Windows
    }

    // Step 4: Warn on stderr (not stdout -- MCP uses stdout for JSON-RPC stream)
    process.stderr.write(
      'WARNING: OS keychain unavailable. PAT stored in file at ~/.sprint-pilot/pat. ' +
        'This is less secure than keychain storage.\n',
    );
  }

  async retrieve(): Promise<string | null> {
    try {
      const content = await readFile(this.credentialsPath, 'utf-8');
      return content;
    } catch (error: unknown) {
      // File does not exist or is not readable -- return null, do not throw.
      // This is a predictable condition ("checked, not found").
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return null;
      }
      // Re-throw unexpected errors (permission denied, etc.)
      throw error;
    }
  }

  /**
   * Validate a PAT against Azure DevOps endpoints.
   *
   * Same 3-step validation as KeytarStrategy:
   * 1. GET _apis/connectionData -- confirms PAT is valid and org is reachable.
   * 2. GET _apis/wit/workItems?ids=0&api-version=7.1-preview -- tests Work Items scope.
   * 3. GET _apis/projects?api-version=7.1-preview -- tests Project and Team Read scope.
   */
  async validate(token: string, orgUrl: string): Promise<ValidationResult> {
    const missingScopes: string[] = [];
    const excessiveScopes: string[] = [];

    // Normalize orgUrl: strip trailing slash
    const baseUrl = orgUrl.replace(/\/+$/, '');

    // Step 1: Test basic connectivity and PAT validity
    try {
      const connectionResponse = await adoGet(
        `${baseUrl}/_apis/connectionData`,
        token,
      );

      if (connectionResponse.status !== 200) {
        return {
          valid: false,
          missingScopes: ['All (PAT invalid or org unreachable)'],
          excessiveScopes: [],
        };
      }
    } catch {
      return {
        valid: false,
        missingScopes: ['All (PAT invalid or org unreachable)'],
        excessiveScopes: [],
      };
    }

    // Step 2: Test Work Items scope
    try {
      const workItemsResponse = await adoGet(
        `${baseUrl}/_apis/wit/workItems?ids=0&api-version=7.1-preview`,
        token,
      );

      if (
        workItemsResponse.status === 401 ||
        workItemsResponse.status === 403
      ) {
        missingScopes.push('Work Items: Read & Write');
      }
      // 200 or 404 means scope is present
    } catch {
      missingScopes.push('Work Items: Read & Write');
    }

    // Step 3: Test Project and Team Read scope
    try {
      const projectsResponse = await adoGet(
        `${baseUrl}/_apis/projects?api-version=7.1-preview`,
        token,
      );

      if (
        projectsResponse.status === 401 ||
        projectsResponse.status === 403
      ) {
        missingScopes.push('Project and Team: Read');
      }
    } catch {
      missingScopes.push('Project and Team: Read');
    }

    return {
      valid: missingScopes.length === 0,
      missingScopes,
      excessiveScopes,
    };
  }

  async clear(): Promise<void> {
    await unlink(this.credentialsPath);
  }
}
