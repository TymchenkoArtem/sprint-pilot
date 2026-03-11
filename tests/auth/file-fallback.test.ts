import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FileFallbackStrategy } from '../../src/auth/file-fallback.js';

// ---------------------------------------------------------------------------
// Mock global fetch for validate() tests
// ---------------------------------------------------------------------------

const mockFetch = vi.fn<[string | URL | Request, RequestInit?], Promise<Response>>();
vi.stubGlobal('fetch', mockFetch);

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
// Test setup: real temp directory for file operations
// ---------------------------------------------------------------------------

let tempDir: string;
let credentialsPath: string;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'sp-file-fallback-test-'));
  credentialsPath = join(tempDir, 'nested', 'pat');
  stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  vi.clearAllMocks();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FileFallbackStrategy', () => {
  // -----------------------------------------------------------------------
  // store
  // -----------------------------------------------------------------------

  describe('store', () => {
    it('creates the file with token content', async () => {
      const strategy = new FileFallbackStrategy(credentialsPath);

      await strategy.store(TEST_TOKEN);

      const content = await readFile(credentialsPath, 'utf-8');
      expect(content).toBe(TEST_TOKEN);
    });

    it('creates parent directory if it does not exist', async () => {
      // credentialsPath is in tempDir/nested/pat -- "nested" dir does not exist yet
      const strategy = new FileFallbackStrategy(credentialsPath);

      await strategy.store(TEST_TOKEN);

      const parentDir = join(tempDir, 'nested');
      const parentStat = await stat(parentDir);
      expect(parentStat.isDirectory()).toBe(true);
    });

    it('creates deeply nested parent directories', async () => {
      const deepPath = join(tempDir, 'a', 'b', 'c', 'pat');
      const strategy = new FileFallbackStrategy(deepPath);

      await strategy.store(TEST_TOKEN);

      const content = await readFile(deepPath, 'utf-8');
      expect(content).toBe(TEST_TOKEN);
    });

    it('outputs stderr warning about keychain unavailability', async () => {
      const strategy = new FileFallbackStrategy(credentialsPath);

      await strategy.store(TEST_TOKEN);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: OS keychain unavailable'),
      );
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('less secure than keychain storage'),
      );
    });

    it('overwrites existing file content on repeated store', async () => {
      const strategy = new FileFallbackStrategy(credentialsPath);

      await strategy.store('first-token');
      await strategy.store('second-token');

      const content = await readFile(credentialsPath, 'utf-8');
      expect(content).toBe('second-token');
    });
  });

  // -----------------------------------------------------------------------
  // retrieve
  // -----------------------------------------------------------------------

  describe('retrieve', () => {
    it('returns file content when file exists', async () => {
      const strategy = new FileFallbackStrategy(credentialsPath);

      await strategy.store(TEST_TOKEN);
      const result = await strategy.retrieve();

      expect(result).toBe(TEST_TOKEN);
    });

    it('returns null when file does not exist (ENOENT)', async () => {
      const nonExistentPath = join(tempDir, 'does-not-exist');
      const strategy = new FileFallbackStrategy(nonExistentPath);

      const result = await strategy.retrieve();

      expect(result).toBeNull();
    });

    it('returns null when parent directory does not exist', async () => {
      const missingDirPath = join(tempDir, 'no-such-dir', 'pat');
      const strategy = new FileFallbackStrategy(missingDirPath);

      const result = await strategy.retrieve();

      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // clear
  // -----------------------------------------------------------------------

  describe('clear', () => {
    it('deletes the credentials file', async () => {
      const strategy = new FileFallbackStrategy(credentialsPath);

      await strategy.store(TEST_TOKEN);
      await strategy.clear();

      // File should no longer exist; retrieve should return null
      const result = await strategy.retrieve();
      expect(result).toBeNull();
    });

    it('throws when file does not exist', async () => {
      const nonExistentPath = join(tempDir, 'does-not-exist');
      const strategy = new FileFallbackStrategy(nonExistentPath);

      await expect(strategy.clear()).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // validate
  // -----------------------------------------------------------------------

  describe('validate', () => {
    let strategy: FileFallbackStrategy;

    beforeEach(() => {
      strategy = new FileFallbackStrategy(credentialsPath);
    });

    it('returns valid when all 3 ADO endpoints return 200', async () => {
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
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns invalid when connectionData throws network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

      const result = await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toEqual([
        'All (PAT invalid or org unreachable)',
      ]);
    });

    it('detects missing Work Items scope (401 on step 2)', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200)) // connectionData OK
        .mockResolvedValueOnce(createMockResponse(401)) // workItems 401
        .mockResolvedValueOnce(createMockResponse(200)); // projects OK

      const result = await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toContain('Work Items: Read & Write');
      expect(result.missingScopes).not.toContain('Project and Team: Read');
    });

    it('detects missing Work Items scope (403 on step 2)', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200)) // connectionData OK
        .mockResolvedValueOnce(createMockResponse(403)) // workItems 403
        .mockResolvedValueOnce(createMockResponse(200)); // projects OK

      const result = await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toContain('Work Items: Read & Write');
    });

    it('detects missing Project scope (401 on step 3)', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200)) // connectionData OK
        .mockResolvedValueOnce(createMockResponse(200)) // workItems OK
        .mockResolvedValueOnce(createMockResponse(401)); // projects 401

      const result = await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toContain('Project and Team: Read');
      expect(result.missingScopes).not.toContain('Work Items: Read & Write');
    });

    it('detects missing Project scope (403 on step 3)', async () => {
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
        .mockResolvedValueOnce(createMockResponse(401)); // projects 401

      const result = await strategy.validate(TEST_TOKEN, TEST_ORG_URL);

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toContain('Work Items: Read & Write');
      expect(result.missingScopes).toContain('Project and Team: Read');
      expect(result.missingScopes).toHaveLength(2);
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

  // -----------------------------------------------------------------------
  // constructor
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('does not perform any I/O', () => {
      // If this threw, it would mean the constructor tried file operations
      const strategy = new FileFallbackStrategy('/non/existent/path/pat');
      expect(strategy).toBeInstanceOf(FileFallbackStrategy);
    });
  });
});
