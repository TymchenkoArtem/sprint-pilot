import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock keytar module -- vi.hoisted ensures variables are available when
// vi.mock factory runs (vi.mock is hoisted above all imports).
// ---------------------------------------------------------------------------

const { mockSetPassword, mockGetPassword, mockDeletePassword, mockFetch } = vi.hoisted(() => ({
  mockSetPassword: vi.fn(),
  mockGetPassword: vi.fn(),
  mockDeletePassword: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock('keytar', () => ({
  default: {
    setPassword: mockSetPassword,
    getPassword: mockGetPassword,
    deletePassword: mockDeletePassword,
  },
}));

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Import after mocks are in place
// ---------------------------------------------------------------------------

import { KeytarStrategy } from '../../src/auth/keytar-strategy.js';
import { KEYTAR_SERVICE, KEYTAR_ACCOUNT } from '../../src/shared/constants.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_TOKEN = 'test-pat-token-value';
const TEST_ORG_URL = 'https://dev.azure.com/my-org';

function createMockResponse(status: number): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
  } as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KeytarStrategy', () => {
  let strategy: KeytarStrategy;

  beforeEach(() => {
    strategy = new KeytarStrategy();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // isAvailable
  // -----------------------------------------------------------------------

  describe('isAvailable', () => {
    it('returns true when keytar probe succeeds', async () => {
      mockSetPassword.mockResolvedValue(undefined);
      mockDeletePassword.mockResolvedValue(true);

      const result = await KeytarStrategy.isAvailable();

      expect(result).toBe(true);
      expect(mockSetPassword).toHaveBeenCalledWith(
        'sprint-pilot-probe',
        'probe',
        'probe',
      );
      expect(mockDeletePassword).toHaveBeenCalledWith(
        'sprint-pilot-probe',
        'probe',
      );
    });

    it('returns false when keytar probe throws', async () => {
      mockSetPassword.mockRejectedValue(new Error('Keychain unavailable'));

      const result = await KeytarStrategy.isAvailable();

      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // store
  // -----------------------------------------------------------------------

  describe('store', () => {
    it('calls keytar.setPassword with correct service and account', async () => {
      mockSetPassword.mockResolvedValue(undefined);

      await strategy.store(TEST_TOKEN);

      expect(mockSetPassword).toHaveBeenCalledWith(
        KEYTAR_SERVICE,
        KEYTAR_ACCOUNT,
        TEST_TOKEN,
      );
    });
  });

  // -----------------------------------------------------------------------
  // retrieve
  // -----------------------------------------------------------------------

  describe('retrieve', () => {
    it('returns token from keytar.getPassword', async () => {
      mockGetPassword.mockResolvedValue(TEST_TOKEN);

      const result = await strategy.retrieve();

      expect(result).toBe(TEST_TOKEN);
      expect(mockGetPassword).toHaveBeenCalledWith(
        KEYTAR_SERVICE,
        KEYTAR_ACCOUNT,
      );
    });

    it('returns null when keytar.getPassword returns null', async () => {
      mockGetPassword.mockResolvedValue(null);

      const result = await strategy.retrieve();

      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // clear
  // -----------------------------------------------------------------------

  describe('clear', () => {
    it('calls keytar.deletePassword with correct service and account', async () => {
      mockDeletePassword.mockResolvedValue(true);

      await strategy.clear();

      expect(mockDeletePassword).toHaveBeenCalledWith(
        KEYTAR_SERVICE,
        KEYTAR_ACCOUNT,
      );
    });
  });

  // -----------------------------------------------------------------------
  // validate
  // -----------------------------------------------------------------------

  describe('validate', () => {
    it('returns valid when all 3 ADO endpoints respond 200', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200)) // connectionData
        .mockResolvedValueOnce(createMockResponse(200)) // workItems
        .mockResolvedValueOnce(createMockResponse(200)); // projects

      const result = await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      expect(result.valid).toBe(true);
      expect(result.missingScopes).toEqual([]);
      expect(result.excessiveScopes).toEqual([]);
    });

    it('returns invalid when connectionData returns non-200', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(401));

      const result = await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toEqual([
        'All (PAT invalid or org unreachable)',
      ]);
      expect(result.excessiveScopes).toEqual([]);
      // Should not have made additional calls after connectionData failure
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('detects missing Work Items scope when step 2 returns 401', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200)) // connectionData OK
        .mockResolvedValueOnce(createMockResponse(401)) // workItems 401
        .mockResolvedValueOnce(createMockResponse(200)); // projects OK

      const result = await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toContain('Work Items: Read & Write');
      expect(result.missingScopes).not.toContain('Project and Team: Read');
    });

    it('detects missing Work Items scope when step 2 returns 403', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200)) // connectionData OK
        .mockResolvedValueOnce(createMockResponse(403)) // workItems 403
        .mockResolvedValueOnce(createMockResponse(200)); // projects OK

      const result = await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toContain('Work Items: Read & Write');
    });

    it('detects missing Project scope when step 3 returns 401', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200)) // connectionData OK
        .mockResolvedValueOnce(createMockResponse(200)) // workItems OK
        .mockResolvedValueOnce(createMockResponse(401)); // projects 401

      const result = await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toContain('Project and Team: Read');
      expect(result.missingScopes).not.toContain('Work Items: Read & Write');
    });

    it('detects missing Project scope when step 3 returns 403', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200)) // connectionData OK
        .mockResolvedValueOnce(createMockResponse(200)) // workItems OK
        .mockResolvedValueOnce(createMockResponse(403)); // projects 403

      const result = await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toContain('Project and Team: Read');
    });

    it('detects multiple missing scopes simultaneously', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200)) // connectionData OK
        .mockResolvedValueOnce(createMockResponse(403)) // workItems 403
        .mockResolvedValueOnce(createMockResponse(403)); // projects 403

      const result = await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toContain('Work Items: Read & Write');
      expect(result.missingScopes).toContain('Project and Team: Read');
      expect(result.missingScopes).toHaveLength(2);
    });

    it('handles network errors on connectionData call', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toEqual([
        'All (PAT invalid or org unreachable)',
      ]);
    });

    it('handles network errors on work items scope check', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200)) // connectionData OK
        .mockRejectedValueOnce(new Error('Network error')) // workItems fails
        .mockResolvedValueOnce(createMockResponse(200)); // projects OK

      const result = await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toContain('Work Items: Read & Write');
      expect(result.missingScopes).not.toContain('Project and Team: Read');
    });

    it('handles network errors on projects scope check', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200)) // connectionData OK
        .mockResolvedValueOnce(createMockResponse(200)) // workItems OK
        .mockRejectedValueOnce(new Error('Network error')); // projects fails

      const result = await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toContain('Project and Team: Read');
      expect(result.missingScopes).not.toContain('Work Items: Read & Write');
    });

    it('strips trailing slashes from orgUrl', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200))
        .mockResolvedValueOnce(createMockResponse(200))
        .mockResolvedValueOnce(createMockResponse(200));

      await strategy.validate(TEST_TOKEN, 'https://dev.azure.com/my-org///');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://dev.azure.com/my-org/_apis/connectionData',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('treats workItems 404 as scope present (item 0 does not exist)', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200)) // connectionData OK
        .mockResolvedValueOnce(createMockResponse(404)) // workItems 404
        .mockResolvedValueOnce(createMockResponse(200)); // projects OK

      const result = await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      expect(result.valid).toBe(true);
      expect(result.missingScopes).toEqual([]);
    });

    it('sends correct Authorization header format', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200))
        .mockResolvedValueOnce(createMockResponse(200))
        .mockResolvedValueOnce(createMockResponse(200));

      await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      const expectedAuth =
        'Basic ' + Buffer.from(':' + TEST_TOKEN).toString('base64');

      const firstCallOptions = mockFetch.mock.calls[0]?.[1];
      expect(firstCallOptions?.headers).toEqual(
        expect.objectContaining({
          Authorization: expectedAuth,
        }),
      );
    });
  });
});
