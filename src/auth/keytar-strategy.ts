/**
 * KeytarStrategy -- Primary authentication strategy using OS keychain.
 *
 * Uses keytar to store and retrieve the PAT from the OS keychain
 * (macOS Keychain, Windows Credential Vault, Linux libsecret).
 *
 * The PAT is never logged, exposed in error messages, or returned
 * in any output. The Authorization header is constructed only inside
 * the ADO client, not here -- validate() is the sole exception where
 * we build a temporary auth header to probe ADO endpoints.
 */

import keytar from 'keytar';
import type { AuthStrategy, ValidationResult } from './auth-strategy.js';
import {
  KEYTAR_SERVICE,
  KEYTAR_ACCOUNT,
  ADO_TIMEOUT_MS,
} from '../shared/constants.js';

/** Probe service name -- distinct from real credentials to avoid side effects. */
const PROBE_SERVICE = 'sprint-pilot-probe';
const PROBE_ACCOUNT = 'probe';

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

export class KeytarStrategy implements AuthStrategy {
  /**
   * Probe whether the OS keychain is accessible.
   * Attempts a set/delete cycle on a dedicated probe service to confirm
   * actual keychain access, not just that keytar imported successfully.
   * Returns true if keychain is available, false otherwise.
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await keytar.setPassword(PROBE_SERVICE, PROBE_ACCOUNT, 'probe');
      await keytar.deletePassword(PROBE_SERVICE, PROBE_ACCOUNT);
      return true;
    } catch {
      return false;
    }
  }

  async store(token: string): Promise<void> {
    await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, token);
  }

  async retrieve(): Promise<string | null> {
    const password = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
    return password ?? null;
  }

  /**
   * Validate a PAT against Azure DevOps endpoints.
   *
   * 3-step validation:
   * 1. GET _apis/connectionData -- confirms PAT is valid and org is reachable.
   *    If not 200, the PAT is invalid or org is unreachable.
   * 2. GET _apis/wit/workItems?ids=0&api-version=7.1-preview -- 200 or 404 means
   *    Work Items scope is present. 401/403 means missing.
   * 3. GET _apis/projects?api-version=7.1-preview -- 200 means Project read scope
   *    is present. 401/403 means missing.
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
      // 200 or 404 means scope is present (404 = valid scope, item 0 doesn't exist)
    } catch {
      // Network errors during scope probing are treated as scope missing
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
      // 200 means scope is present
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
    await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
  }
}
