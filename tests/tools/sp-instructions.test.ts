/**
 * Unit tests for the sp-instructions MCP tool.
 *
 * This tool serves markdown files from the package's templates/ directory.
 * No auth, config, or ADO client required -- purely read-only filesystem access.
 *
 * All external dependencies are mocked at the module level via vi.mock().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// ---------------------------------------------------------------------------
// Hoisted mock instances
// ---------------------------------------------------------------------------

const { mockReadFile, mockReaddir, mockFileURLToPath } = vi.hoisted(() => {
  const _mockReadFile = vi.fn();
  const _mockReaddir = vi.fn();
  const _mockFileURLToPath = vi.fn();

  return {
    mockReadFile: _mockReadFile,
    mockReaddir: _mockReaddir,
    mockFileURLToPath: _mockFileURLToPath,
  };
});

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
  readdir: mockReaddir,
}));

vi.mock('node:url', () => ({
  fileURLToPath: mockFileURLToPath,
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------

import { registerSpInstructions } from '../../src/tools/sp-instructions.js';

// ---------------------------------------------------------------------------
// Handler capture
// ---------------------------------------------------------------------------

type ToolHandler = (
  args: Record<string, unknown>,
  extra: unknown,
) => Promise<{ content: Array<{ type: string; text: string }> }>;

let toolHandler: ToolHandler;

const mockServer = {
  tool: vi.fn(
    (
      _name: string,
      _desc: string,
      _schema: unknown,
      handler: ToolHandler,
    ) => {
      toolHandler = handler;
    },
  ),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an ENOENT error matching Node's filesystem error shape. */
function makeEnoent(path: string): NodeJS.ErrnoException {
  const err = new Error(`ENOENT: no such file or directory, open '${path}'`) as NodeJS.ErrnoException;
  err.code = 'ENOENT';
  return err;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockServer.tool.mockClear();
  mockReadFile.mockReset();
  mockReaddir.mockReset();
  mockFileURLToPath.mockReset();

  // Default: fileURLToPath returns a fake dist/tools/ path
  mockFileURLToPath.mockReturnValue('/fake/dist/tools/sp-instructions.js');

  registerSpInstructions(mockServer as unknown as McpServer);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sp-instructions', () => {
  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  describe('registration', () => {
    it('registers with name "sp-instructions" on McpServer', () => {
      expect(mockServer.tool).toHaveBeenCalledWith(
        'sp-instructions',
        expect.any(String),
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('registration is synchronous (returns void)', () => {
      const result = registerSpInstructions(mockServer as unknown as McpServer);
      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('happy path', () => {
    it('returns instruction file content when given a valid name', async () => {
      const content = '# CLAUDE Instructions\n\nFollow these rules...';
      mockReadFile.mockResolvedValue(content);

      const response = await toolHandler({ name: 'CLAUDE' }, {});

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      expect(response.content[0].text).toBe(content);
    });

    it('returns template file content when given category "templates"', async () => {
      const content = '# PR Description Template\n\n## Summary\n...';
      mockReadFile.mockResolvedValue(content);

      const response = await toolHandler(
        { name: 'pr-description', category: 'templates' },
        {},
      );

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      expect(response.content[0].text).toBe(content);
    });

    it('defaults category to "instructions" when omitted', async () => {
      mockReadFile.mockResolvedValue('# Default instructions');

      await toolHandler({ name: 'session-start' }, {});

      // readFile should have been called with a path ending in instructions/<name>.md
      const calledPath = mockReadFile.mock.calls[0][0] as string;
      expect(calledPath).toMatch(/instructions[/\\]session-start\.md$/);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('returns helpful error with available files list when file not found', async () => {
      mockReadFile.mockRejectedValue(makeEnoent('/fake/templates/instructions/MISSING.md'));
      mockReaddir.mockResolvedValue(['CLAUDE.md', 'session-start.md', 'commit-review.md']);

      const response = await toolHandler({ name: 'MISSING' }, {});

      expect(response.content).toHaveLength(1);
      const text = response.content[0].text;
      expect(text).toContain('File "MISSING.md" not found in instructions');
      expect(text).toContain('Available instructions:');
      expect(text).toContain('CLAUDE');
      expect(text).toContain('session-start');
      expect(text).toContain('commit-review');
    });

    it('returns error when category directory does not exist', async () => {
      mockReadFile.mockRejectedValue(makeEnoent('/fake/templates/instructions/gone.md'));
      mockReaddir.mockRejectedValue(makeEnoent('/fake/templates/instructions'));

      const response = await toolHandler({ name: 'gone' }, {});

      expect(response.content).toHaveLength(1);
      const text = response.content[0].text;
      expect(text).toContain('File "gone.md" not found in instructions');
      expect(text).toContain('No files found in category "instructions"');
    });

    it('rejects unknown keys (strict schema)', async () => {
      const response = await toolHandler(
        { name: 'CLAUDE', extra: 'bad' },
        {},
      );

      expect(response.content).toHaveLength(1);
      const result = JSON.parse(response.content[0].text) as Record<string, unknown>;
      expect(result['error']).toBe('validation_error');
    });
  });

  // -------------------------------------------------------------------------
  // Path resolution
  // -------------------------------------------------------------------------

  describe('path resolution', () => {
    it('resolves paths relative to dist/tools/ for instructions', async () => {
      mockReadFile.mockResolvedValue('content');

      await toolHandler({ name: 'CLAUDE' }, {});

      const calledPath = mockReadFile.mock.calls[0][0] as string;
      // From /fake/dist/tools/ -> ../../templates/instructions/CLAUDE.md
      // join('/fake/dist/tools', '..', '..', 'templates', 'instructions', 'CLAUDE.md')
      // = /fake/templates/instructions/CLAUDE.md
      expect(calledPath).toMatch(/fake[/\\]templates[/\\]instructions[/\\]CLAUDE\.md$/);
    });

    it('resolves paths relative to dist/tools/ for templates', async () => {
      mockReadFile.mockResolvedValue('content');

      await toolHandler({ name: 'pr-description', category: 'templates' }, {});

      const calledPath = mockReadFile.mock.calls[0][0] as string;
      expect(calledPath).toMatch(/fake[/\\]templates[/\\]templates[/\\]pr-description\.md$/);
    });
  });
});
