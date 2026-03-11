/**
 * Unit tests for the sp-track-usage MCP tool.
 *
 * The tool is registered via server.tool() with a closure handler.
 * We capture the handler by providing a mock McpServer, then call
 * the handler directly with mock arguments.
 *
 * Only the UsageTracker dependency is mocked (module level via vi.mock()).
 * Mock instances are created with vi.hoisted() so they are available
 * inside hoisted vi.mock() factory functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// ---------------------------------------------------------------------------
// Hoisted mock instances -- available inside vi.mock() factories
// ---------------------------------------------------------------------------

const { mockTrackerInstance } = vi.hoisted(() => {
  const _mockTrackerInstance = {
    record: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { mockTrackerInstance: _mockTrackerInstance };
});

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/shared/usage-tracker.js', () => ({
  UsageTracker: vi.fn(() => mockTrackerInstance),
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------

import { registerSpTrackUsage } from '../../src/tools/sp-track-usage.js';

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

function parseResult(
  response: { content: Array<{ type: string; text: string }> },
): Record<string, unknown> {
  return JSON.parse(response.content[0].text) as Record<string, unknown>;
}

/** Default valid args for sp-track-usage. */
function makeValidArgs(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    command: 'sp-get-item',
    description: 'Fetched work item 123',
    duration_ms: 450,
    flow: 'US-101',
    tokens: 1200,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Re-register the tool to capture a fresh handler
  registerSpTrackUsage(mockServer as unknown as McpServer);

  // Default mock behaviors
  mockTrackerInstance.record.mockResolvedValue(undefined);
  mockTrackerInstance.flush.mockResolvedValue(undefined);
  mockTrackerInstance.close.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sp-track-usage', () => {
  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  it('registers tool with the server as sp-track-usage', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'sp-track-usage',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('registers with a description mentioning token usage and metrics', () => {
    const description = mockServer.tool.mock.calls[0][1] as string;

    expect(description).toContain('usage');
  });

  // -------------------------------------------------------------------------
  // Success path -- all fields provided
  // -------------------------------------------------------------------------

  describe('successful recording with all fields', () => {
    it('returns usage_recorded status', async () => {
      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['status']).toBe('usage_recorded');
    });

    it('returns text content type', async () => {
      const response = await toolHandler(makeValidArgs(), {});

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
    });

    it('passes all fields to tracker.record', async () => {
      await toolHandler(makeValidArgs(), {});

      expect(mockTrackerInstance.record).toHaveBeenCalledWith({
        command: 'sp-get-item',
        description: 'Fetched work item 123',
        durationMs: 450,
        flow: 'US-101',
        tokens: 1200,
      });
    });

    it('calls record, flush, close in correct order', async () => {
      const callOrder: string[] = [];
      mockTrackerInstance.record.mockImplementation(async () => {
        callOrder.push('record');
      });
      mockTrackerInstance.flush.mockImplementation(async () => {
        callOrder.push('flush');
      });
      mockTrackerInstance.close.mockImplementation(async () => {
        callOrder.push('close');
      });

      await toolHandler(makeValidArgs(), {});

      expect(callOrder).toEqual(['record', 'flush', 'close']);
    });
  });

  // -------------------------------------------------------------------------
  // Success path -- optional fields omitted
  // -------------------------------------------------------------------------

  describe('successful recording with optional fields omitted', () => {
    it('rejects when flow is omitted (flow is required)', async () => {
      const response = await toolHandler(makeValidArgs({ flow: undefined }), {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });

    it('defaults tokens to 0 when omitted', async () => {
      await toolHandler(makeValidArgs({ tokens: undefined }), {});

      expect(mockTrackerInstance.record).toHaveBeenCalledWith(
        expect.objectContaining({ tokens: 0 }),
      );
    });

    it('rejects when both flow and tokens are omitted (flow is required)', async () => {
      const args = {
        command: 'sp-get-item',
        description: 'Fetched work item 123',
        duration_ms: 450,
      };

      const response = await toolHandler(args, {});
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
    });
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  describe('input validation', () => {
    it('rejects empty command', async () => {
      const response = await toolHandler(
        makeValidArgs({ command: '' }),
        {},
      );
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
      expect(result['message']).toBeDefined();
    });

    it('rejects empty description', async () => {
      const response = await toolHandler(
        makeValidArgs({ description: '' }),
        {},
      );
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
      expect(result['message']).toBeDefined();
    });

    it('rejects negative duration_ms', async () => {
      const response = await toolHandler(
        makeValidArgs({ duration_ms: -1 }),
        {},
      );
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
      expect(result['message']).toBeDefined();
    });

    it('rejects non-integer duration_ms', async () => {
      const response = await toolHandler(
        makeValidArgs({ duration_ms: 1.5 }),
        {},
      );
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
      expect(result['message']).toBeDefined();
    });

    it('rejects negative tokens', async () => {
      const response = await toolHandler(
        makeValidArgs({ tokens: -10 }),
        {},
      );
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
      expect(result['message']).toBeDefined();
    });

    it('rejects extra fields via strict schema', async () => {
      const response = await toolHandler(
        makeValidArgs({ extra_field: 'unexpected' }),
        {},
      );
      const result = parseResult(response);

      expect(result['error']).toBe('validation_error');
      expect(result['message']).toBeDefined();
    });

    it('does not call tracker.record on validation failure', async () => {
      await toolHandler(makeValidArgs({ command: '' }), {});

      expect(mockTrackerInstance.record).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('returns normalized error when tracker.record() throws', async () => {
      mockTrackerInstance.record.mockRejectedValue(
        new Error('Disk write failed'),
      );

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['error']).toBeDefined();
      expect(result['message']).toBeDefined();
    });

    it('returns normalized error when tracker.flush() throws', async () => {
      mockTrackerInstance.flush.mockRejectedValue(
        new Error('Flush I/O error'),
      );

      const response = await toolHandler(makeValidArgs(), {});
      const result = parseResult(response);

      expect(result['error']).toBeDefined();
      expect(result['message']).toBeDefined();
    });

    it('returns text content type on error', async () => {
      mockTrackerInstance.record.mockRejectedValue(
        new Error('Unexpected failure'),
      );

      const response = await toolHandler(makeValidArgs(), {});

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
    });

    it('returns valid JSON on error', async () => {
      mockTrackerInstance.record.mockRejectedValue(
        new Error('Write failed'),
      );

      const response = await toolHandler(makeValidArgs(), {});

      expect(() => JSON.parse(response.content[0].text)).not.toThrow();
    });
  });
});
