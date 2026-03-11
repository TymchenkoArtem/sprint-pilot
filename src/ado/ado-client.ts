import { z } from 'zod';

import {
  ADO_TIMEOUT_MS,
  ADO_RETRY_MAX_ATTEMPTS,
  ADO_RETRY_BASE_DELAY_MS,
} from '../shared/constants.js';
import {
  SprintPilotError,
  AuthMissingError,
  AuthExpiredError,
  AdoUnreachableError,
  AdoNotFoundError,
  AdoForbiddenError,
  sanitizeMessage,
} from '../shared/errors.js';
import type { AuthStrategy } from '../auth/auth-strategy.js';
import { ConnectionDataSchema } from './types.js';
import type { ConnectionData } from './types.js';
import { connectionDataEndpoint } from './endpoints.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sleep for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Status codes eligible for retry with exponential backoff. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

// ---------------------------------------------------------------------------
// AdoClient
// ---------------------------------------------------------------------------

/**
 * Authenticated HTTP wrapper for Azure DevOps REST API.
 *
 * The PAT never leaves this module -- it is encoded into a Basic auth header
 * at construction time and never serialized to logs, errors, or return values.
 */
export class AdoClient {
  private readonly orgUrl: string;
  private readonly authHeader: string;
  private currentUserEmail: string = '';

  // -- Construction ----------------------------------------------------------

  private constructor(orgUrl: string, pat: string) {
    // Normalize: strip trailing slashes
    this.orgUrl = orgUrl.replace(/\/+$/, '');
    // Pre-build Basic header: base64(`:PAT`)
    this.authHeader = `Basic ${btoa(`:${pat}`)}`;
  }

  /**
   * Factory that creates, authenticates, and returns a ready-to-use client.
   *
   * 1. Retrieves the PAT via the provided AuthStrategy.
   * 2. Constructs the client.
   * 3. Calls getConnectionData() to resolve the current user identity.
   */
  static async create(
    orgUrl: string,
    authStrategy: AuthStrategy,
  ): Promise<AdoClient> {
    // HTTPS-only guard
    if (orgUrl.startsWith('http://')) {
      throw new SprintPilotError(
        'validation_error',
        'Azure DevOps connections require HTTPS.',
        'Change the organization URL to use https://.',
      );
    }

    const pat = await authStrategy.retrieve();
    if (pat === null) {
      throw new AuthMissingError();
    }

    const client = new AdoClient(orgUrl, pat);

    // Resolve authenticated user identity
    const connectionData = await client.getConnectionData();
    client.currentUserEmail =
      connectionData.authenticatedUser.properties.Account.$value;

    return client;
  }

  // -- Public API ------------------------------------------------------------

  /** GET request with Zod response validation. */
  async get<T>(endpoint: string, schema: z.ZodType<T>): Promise<T> {
    return this.request('GET', endpoint, undefined, schema);
  }

  /** POST request with Zod response validation. */
  async post<T>(
    endpoint: string,
    body: unknown,
    schema: z.ZodType<T>,
  ): Promise<T> {
    return this.request('POST', endpoint, body, schema);
  }

  /** PATCH request with Zod response validation. */
  async patch<T>(
    endpoint: string,
    body: unknown,
    schema: z.ZodType<T>,
  ): Promise<T> {
    return this.request('PATCH', endpoint, body, schema);
  }

  /** Fetch connection data (authenticated user identity). */
  async getConnectionData(): Promise<ConnectionData> {
    return this.get(connectionDataEndpoint(), ConnectionDataSchema);
  }

  /** Returns the email / account identifier of the authenticated user. */
  getCurrentUserId(): string {
    return this.currentUserEmail;
  }

  // -- Private HTTP layer ----------------------------------------------------

  /**
   * Core request method with retry and error mapping.
   *
   * Retries only on 429 and 5xx (500, 502, 503, 504).
   * All other error codes are mapped immediately without retry.
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body: unknown | undefined,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const url = `${this.orgUrl}/${endpoint}`;

    const contentType = method === 'PATCH'
      ? 'application/json-patch+json'
      : 'application/json';

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      'Content-Type': contentType,
      Accept: 'application/json',
    };

    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(ADO_TIMEOUT_MS),
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    let lastError: unknown;

    for (let attempt = 1; attempt <= ADO_RETRY_MAX_ATTEMPTS; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, init);
      } catch (error: unknown) {
        // Network-level failure (DNS, connection refused, timeout, etc.)
        lastError = error;
        if (attempt < ADO_RETRY_MAX_ATTEMPTS) {
          await sleep(ADO_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
          continue;
        }
        throw new AdoUnreachableError();
      }

      // -- Success path ------------------------------------------------------
      if (response.ok) {
        return this.parseResponse(response, schema);
      }

      // -- Non-retryable errors ----------------------------------------------
      const status = response.status;

      if (!RETRYABLE_STATUS_CODES.has(status)) {
        return this.handleNonRetryableError(status, response);
      }

      // -- Retryable errors (429, 5xx) ---------------------------------------
      lastError = new AdoUnreachableError();

      if (attempt < ADO_RETRY_MAX_ATTEMPTS) {
        const delay = this.computeRetryDelay(response, attempt);
        await sleep(delay);
        continue;
      }
    }

    // Exhausted all retries
    if (lastError instanceof SprintPilotError) {
      throw lastError;
    }
    throw new AdoUnreachableError();
  }

  /**
   * Parse a successful response body and validate it against the Zod schema.
   * Schema mismatch throws SprintPilotError with code `ado_unreachable`.
   */
  private async parseResponse<T>(
    response: Response,
    schema: z.ZodType<T>,
  ): Promise<T> {
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new SprintPilotError(
        'ado_unreachable',
        'Failed to parse JSON response from Azure DevOps.',
        'The response was not valid JSON. This may indicate a transient issue.',
      );
    }

    const result = schema.safeParse(json);
    if (!result.success) {
      throw new SprintPilotError(
        'ado_unreachable',
        sanitizeMessage(
          `Unexpected response shape from Azure DevOps: ${result.error.message}`,
        ),
        'The API response did not match the expected schema.',
      );
    }
    return result.data;
  }

  /**
   * Map non-retryable HTTP status codes to the correct SprintPilotError.
   * This method always throws -- the return type `never` satisfies the caller.
   */
  private async handleNonRetryableError(
    status: number,
    response: Response,
  ): Promise<never> {
    // Try to extract a message from the response body
    let detail = '';
    try {
      const body: unknown = await response.json();
      if (
        typeof body === 'object' &&
        body !== null &&
        'message' in body &&
        typeof (body as Record<string, unknown>).message === 'string'
      ) {
        detail = sanitizeMessage(
          (body as Record<string, unknown>).message as string,
        );
      }
    } catch {
      // Ignore body parsing failures for error responses
    }

    switch (status) {
      case 401:
        throw new AuthExpiredError();
      case 403:
        throw new AdoForbiddenError(detail || undefined);
      case 404:
        throw new AdoNotFoundError(detail || undefined);
      case 409:
        throw new SprintPilotError(
          'validation_error',
          detail || 'Conflict: the resource state does not allow this operation.',
        );
      default:
        // Other 4xx
        throw new SprintPilotError(
          'validation_error',
          detail || `Azure DevOps returned HTTP ${status}.`,
        );
    }
  }

  /**
   * Compute the retry delay for a retryable status code.
   *
   * For 429 responses, honours the Retry-After header if present.
   * Otherwise uses exponential backoff: base * 2^(attempt-1).
   */
  private computeRetryDelay(response: Response, attempt: number): number {
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter !== null) {
        const seconds = Number(retryAfter);
        if (!Number.isNaN(seconds) && seconds > 0) {
          return seconds * 1_000;
        }
      }
    }
    return ADO_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
  }
}
