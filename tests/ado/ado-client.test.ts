import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

import { AdoClient } from '../../src/ado/ado-client.js';
import {
  SprintPilotError,
  AuthMissingError,
  AuthExpiredError,
  AdoUnreachableError,
  AdoNotFoundError,
  AdoForbiddenError,
} from '../../src/shared/errors.js';
import type { AuthStrategy } from '../../src/auth/auth-strategy.js';

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn<[string | URL | Request, RequestInit?], Promise<Response>>();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_ORG_URL = 'https://dev.azure.com/my-org';

function createMockAuthStrategy(token: string | null = 'test-pat-token'): AuthStrategy {
  return {
    store: vi.fn(),
    retrieve: vi.fn().mockResolvedValue(token),
    validate: vi.fn(),
    clear: vi.fn(),
  };
}

function mockConnectionDataResponse(): Response {
  return new Response(
    JSON.stringify({
      authenticatedUser: {
        id: 'user-guid',
        properties: { Account: { $value: 'user@example.com' } },
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function mockJsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const SimpleSchema = z.object({ value: z.string() });

/**
 * Helper to create a fully initialized AdoClient for method-level tests.
 * Mocks the connection data call during create(), then clears mock state.
 */
async function createTestClient(authToken = 'test-pat-token'): Promise<AdoClient> {
  const authStrategy = createMockAuthStrategy(authToken);
  mockFetch.mockResolvedValueOnce(mockConnectionDataResponse());
  const client = await AdoClient.create(TEST_ORG_URL, authStrategy);
  mockFetch.mockClear();
  return client;
}

/**
 * Make setTimeout resolve immediately for retry tests.
 * Returns a restore function.
 */
function mockImmediateTimers(): () => void {
  const originalSetTimeout = globalThis.setTimeout;
  vi.stubGlobal('setTimeout', (fn: () => void, _ms?: number) => {
    return originalSetTimeout(fn, 0);
  });
  return () => {
    vi.stubGlobal('setTimeout', originalSetTimeout);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AdoClient', () => {
  // -----------------------------------------------------------------------
  // AdoClient.create()
  // -----------------------------------------------------------------------

  describe('create()', () => {
    it('rejects HTTP URLs with validation_error', async () => {
      const authStrategy = createMockAuthStrategy();

      await expect(
        AdoClient.create('http://dev.azure.com/my-org', authStrategy),
      ).rejects.toThrow(SprintPilotError);

      try {
        await AdoClient.create('http://dev.azure.com/my-org', authStrategy);
      } catch (error) {
        expect(error).toBeInstanceOf(SprintPilotError);
        expect((error as SprintPilotError).code).toBe('validation_error');
        expect((error as SprintPilotError).message).toContain('HTTPS');
      }
    });

    it('throws AuthMissingError when authStrategy.retrieve() returns null', async () => {
      const authStrategy = createMockAuthStrategy(null);

      await expect(
        AdoClient.create(TEST_ORG_URL, authStrategy),
      ).rejects.toThrow(AuthMissingError);
    });

    it('creates client successfully when auth strategy returns PAT and connectionData succeeds', async () => {
      const authStrategy = createMockAuthStrategy('valid-pat');
      mockFetch.mockResolvedValueOnce(mockConnectionDataResponse());

      const client = await AdoClient.create(TEST_ORG_URL, authStrategy);

      expect(client).toBeInstanceOf(AdoClient);
      expect(authStrategy.retrieve).toHaveBeenCalledOnce();
    });

    it('sets currentUserEmail from connectionData response', async () => {
      const authStrategy = createMockAuthStrategy('valid-pat');
      mockFetch.mockResolvedValueOnce(mockConnectionDataResponse());

      const client = await AdoClient.create(TEST_ORG_URL, authStrategy);

      expect(client.getCurrentUserId()).toBe('user@example.com');
    });
  });

  // -----------------------------------------------------------------------
  // AdoClient.get()
  // -----------------------------------------------------------------------

  describe('get()', () => {
    it('returns parsed data on 200 response matching Zod schema', async () => {
      const client = await createTestClient();
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ value: 'hello' }),
      );

      const result = await client.get('_apis/test', SimpleSchema);

      expect(result).toEqual({ value: 'hello' });
    });

    it('throws SprintPilotError with code ado_unreachable when response does not match Zod schema', async () => {
      const client = await createTestClient();
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ wrong: 'shape' }),
      );

      await expect(
        client.get('_apis/test', SimpleSchema),
      ).rejects.toThrow(SprintPilotError);

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ wrong: 'shape' }),
      );

      try {
        await client.get('_apis/test', SimpleSchema);
      } catch (error) {
        expect((error as SprintPilotError).code).toBe('ado_unreachable');
      }
    });

    it('throws AuthExpiredError on 401', async () => {
      const client = await createTestClient();
      mockFetch.mockResolvedValueOnce(mockJsonResponse({}, 401));

      await expect(
        client.get('_apis/test', SimpleSchema),
      ).rejects.toThrow(AuthExpiredError);
    });

    it('throws SprintPilotError with code ado_forbidden on 403', async () => {
      const client = await createTestClient();
      mockFetch.mockResolvedValueOnce(mockJsonResponse({}, 403));

      try {
        await client.get('_apis/test', SimpleSchema);
      } catch (error) {
        expect(error).toBeInstanceOf(SprintPilotError);
        expect((error as SprintPilotError).code).toBe('ado_forbidden');
      }
    });

    it('throws SprintPilotError with code ado_not_found on 404', async () => {
      const client = await createTestClient();
      mockFetch.mockResolvedValueOnce(mockJsonResponse({}, 404));

      try {
        await client.get('_apis/test', SimpleSchema);
      } catch (error) {
        expect(error).toBeInstanceOf(SprintPilotError);
        expect((error as SprintPilotError).code).toBe('ado_not_found');
      }
    });

    it('throws SprintPilotError with code validation_error on 409', async () => {
      const client = await createTestClient();
      mockFetch.mockResolvedValueOnce(mockJsonResponse({}, 409));

      try {
        await client.get('_apis/test', SimpleSchema);
      } catch (error) {
        expect(error).toBeInstanceOf(SprintPilotError);
        expect((error as SprintPilotError).code).toBe('validation_error');
      }
    });

    it('throws SprintPilotError with code validation_error on other 4xx (e.g. 400)', async () => {
      const client = await createTestClient();
      mockFetch.mockResolvedValueOnce(mockJsonResponse({}, 400));

      try {
        await client.get('_apis/test', SimpleSchema);
      } catch (error) {
        expect(error).toBeInstanceOf(SprintPilotError);
        expect((error as SprintPilotError).code).toBe('validation_error');
      }
    });

    it('extracts detail message from error response body on 403', async () => {
      const client = await createTestClient();
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ message: 'Insufficient permissions' }, 403),
      );

      try {
        await client.get('_apis/test', SimpleSchema);
      } catch (error) {
        expect((error as SprintPilotError).message).toBe(
          'Insufficient permissions',
        );
      }
    });

    it('uses default message when error response body has no message field', async () => {
      const client = await createTestClient();
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ noMessage: true }, 404),
      );

      try {
        await client.get('_apis/test', SimpleSchema);
      } catch (error) {
        expect((error as SprintPilotError).message).toContain(
          'not found',
        );
      }
    });

    it('handles non-JSON error response bodies gracefully', async () => {
      const client = await createTestClient();
      mockFetch.mockResolvedValueOnce(
        new Response('Not JSON', { status: 404 }),
      );

      try {
        await client.get('_apis/test', SimpleSchema);
      } catch (error) {
        expect(error).toBeInstanceOf(SprintPilotError);
        expect((error as SprintPilotError).code).toBe('ado_not_found');
      }
    });

    it('throws SprintPilotError with ado_unreachable when JSON response is invalid', async () => {
      const client = await createTestClient();
      mockFetch.mockResolvedValueOnce(
        new Response('not json at all', { status: 200 }),
      );

      try {
        await client.get('_apis/test', SimpleSchema);
      } catch (error) {
        expect(error).toBeInstanceOf(SprintPilotError);
        expect((error as SprintPilotError).code).toBe('ado_unreachable');
        expect((error as SprintPilotError).message).toContain(
          'Failed to parse JSON',
        );
      }
    });
  });

  // -----------------------------------------------------------------------
  // Retry behavior
  //
  // These tests mock setTimeout to resolve immediately so retries happen
  // without real delays and without fake-timer / microtask ordering issues.
  // -----------------------------------------------------------------------

  describe('retry behavior', () => {
    let restoreTimers: () => void;

    beforeEach(() => {
      restoreTimers = mockImmediateTimers();
    });

    afterEach(() => {
      restoreTimers();
    });

    it('retries on 429 and returns result on success', async () => {
      const client = await createTestClient();

      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({}, 429))
        .mockResolvedValueOnce(mockJsonResponse({ value: 'ok' }));

      const result = await client.get('_apis/test', SimpleSchema);

      expect(result).toEqual({ value: 'ok' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 500 and returns result on success', async () => {
      const client = await createTestClient();

      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({}, 500))
        .mockResolvedValueOnce(mockJsonResponse({ value: 'ok' }));

      const result = await client.get('_apis/test', SimpleSchema);

      expect(result).toEqual({ value: 'ok' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 502 and returns result on success', async () => {
      const client = await createTestClient();

      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({}, 502))
        .mockResolvedValueOnce(mockJsonResponse({ value: 'ok' }));

      const result = await client.get('_apis/test', SimpleSchema);

      expect(result).toEqual({ value: 'ok' });
    });

    it('retries on 503 and returns result on success', async () => {
      const client = await createTestClient();

      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({}, 503))
        .mockResolvedValueOnce(mockJsonResponse({ value: 'ok' }));

      const result = await client.get('_apis/test', SimpleSchema);

      expect(result).toEqual({ value: 'ok' });
    });

    it('retries on 504 and returns result on success', async () => {
      const client = await createTestClient();

      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({}, 504))
        .mockResolvedValueOnce(mockJsonResponse({ value: 'ok' }));

      const result = await client.get('_apis/test', SimpleSchema);

      expect(result).toEqual({ value: 'ok' });
    });

    it('throws AdoUnreachableError after exhausting retries on 5xx', async () => {
      const client = await createTestClient();

      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({}, 500))
        .mockResolvedValueOnce(mockJsonResponse({}, 500))
        .mockResolvedValueOnce(mockJsonResponse({}, 500));

      await expect(
        client.get('_apis/test', SimpleSchema),
      ).rejects.toThrow(AdoUnreachableError);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('retries on network fetch failure (TypeError)', async () => {
      const client = await createTestClient();

      mockFetch
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(mockJsonResponse({ value: 'ok' }));

      const result = await client.get('_apis/test', SimpleSchema);

      expect(result).toEqual({ value: 'ok' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws AdoUnreachableError after exhausting retries on network failures', async () => {
      const client = await createTestClient();

      mockFetch
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(
        client.get('_apis/test', SimpleSchema),
      ).rejects.toThrow(AdoUnreachableError);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('does NOT retry on 401', async () => {
      const client = await createTestClient();
      mockFetch.mockResolvedValueOnce(mockJsonResponse({}, 401));

      await expect(
        client.get('_apis/test', SimpleSchema),
      ).rejects.toThrow(AuthExpiredError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry on 403', async () => {
      const client = await createTestClient();
      mockFetch.mockResolvedValueOnce(mockJsonResponse({}, 403));

      await expect(
        client.get('_apis/test', SimpleSchema),
      ).rejects.toThrow(SprintPilotError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does NOT retry on 404', async () => {
      const client = await createTestClient();
      mockFetch.mockResolvedValueOnce(mockJsonResponse({}, 404));

      await expect(
        client.get('_apis/test', SimpleSchema),
      ).rejects.toThrow(SprintPilotError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('honors Retry-After header on 429 responses', async () => {
      const client = await createTestClient();

      // Track the delay passed to setTimeout
      const delays: number[] = [];
      const originalSetTimeout = globalThis.setTimeout;
      // Restore the immediate mock and install a tracking one
      restoreTimers();
      vi.stubGlobal(
        'setTimeout',
        (fn: () => void, ms?: number) => {
          delays.push(ms ?? 0);
          return originalSetTimeout(fn, 0);
        },
      );

      mockFetch
        .mockResolvedValueOnce(
          mockJsonResponse({}, 429, { 'Retry-After': '5' }),
        )
        .mockResolvedValueOnce(mockJsonResponse({ value: 'ok' }));

      const result = await client.get('_apis/test', SimpleSchema);

      expect(result).toEqual({ value: 'ok' });
      // The retry delay should be 5000ms (5 seconds from Retry-After header)
      expect(delays).toContain(5000);
    });
  });

  // -----------------------------------------------------------------------
  // AdoClient.post()
  // -----------------------------------------------------------------------

  describe('post()', () => {
    it('sends body as JSON', async () => {
      const client = await createTestClient();
      const body = { key: 'value' };

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ value: 'created' }),
      );

      await client.post('_apis/test', body, SimpleSchema);

      const [, requestInit] = mockFetch.mock.calls[0]!;
      expect(requestInit?.method).toBe('POST');
      expect(requestInit?.body).toBe(JSON.stringify(body));
    });

    it('includes Authorization header', async () => {
      const client = await createTestClient();

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ value: 'created' }),
      );

      await client.post('_apis/test', { data: 1 }, SimpleSchema);

      const [, requestInit] = mockFetch.mock.calls[0]!;
      const headers = requestInit?.headers as Record<string, string>;
      expect(headers['Authorization']).toMatch(/^Basic /);
    });
  });

  // -----------------------------------------------------------------------
  // AdoClient.patch()
  // -----------------------------------------------------------------------

  describe('patch()', () => {
    it('sends body as JSON with PATCH method', async () => {
      const client = await createTestClient();
      const body = { field: 'updated' };

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ value: 'patched' }),
      );

      await client.patch('_apis/test', body, SimpleSchema);

      const [, requestInit] = mockFetch.mock.calls[0]!;
      expect(requestInit?.method).toBe('PATCH');
      expect(requestInit?.body).toBe(JSON.stringify(body));
    });

    it('includes Authorization header', async () => {
      const client = await createTestClient();

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ value: 'patched' }),
      );

      await client.patch('_apis/test', { data: 1 }, SimpleSchema);

      const [, requestInit] = mockFetch.mock.calls[0]!;
      const headers = requestInit?.headers as Record<string, string>;
      expect(headers['Authorization']).toMatch(/^Basic /);
    });
  });

  // -----------------------------------------------------------------------
  // getCurrentUserId()
  // -----------------------------------------------------------------------

  describe('getCurrentUserId()', () => {
    it('returns the email set during create()', async () => {
      const client = await createTestClient();
      expect(client.getCurrentUserId()).toBe('user@example.com');
    });
  });

  // -----------------------------------------------------------------------
  // URL construction
  // -----------------------------------------------------------------------

  describe('URL construction', () => {
    it('constructs full URL from orgUrl and endpoint', async () => {
      const client = await createTestClient();
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ value: 'test' }),
      );

      await client.get('_apis/some/endpoint', SimpleSchema);

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://dev.azure.com/my-org/_apis/some/endpoint');
    });

    it('strips trailing slashes from orgUrl', async () => {
      const authStrategy = createMockAuthStrategy('valid-pat');
      mockFetch.mockResolvedValueOnce(mockConnectionDataResponse());

      const client = await AdoClient.create(
        'https://dev.azure.com/my-org///',
        authStrategy,
      );

      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ value: 'test' }),
      );

      await client.get('_apis/test', SimpleSchema);

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://dev.azure.com/my-org/_apis/test');
    });
  });
});
