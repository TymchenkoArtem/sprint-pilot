/**
 * Unit tests for src/index.ts -- MCP server creation and transport binding.
 *
 * The entry module creates an McpServer, registers tools, creates a
 * StdioServerTransport, and calls server.connect(transport).
 *
 * Since src/index.ts is a top-level script (runs on import), we use
 * vi.resetModules() + vi.doMock() before each dynamic import to ensure
 * fresh execution per test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock instances
// ---------------------------------------------------------------------------

const {
  mockConnect,
  mockRegisterTools,
  mockTransportInstance,
} = vi.hoisted(() => {
  return {
    mockConnect: vi.fn().mockResolvedValue(undefined),
    mockRegisterTools: vi.fn(),
    mockTransportInstance: { type: 'stdio' },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set up all mocks and import the entry module.
 * Must be called inside each test so vi.resetModules() gives a fresh run.
 */
async function importEntryModule(): Promise<void> {
  vi.resetModules();

  vi.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: vi.fn(() => ({
      connect: mockConnect,
    })),
  }));

  vi.doMock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: vi.fn(() => mockTransportInstance),
  }));

  vi.doMock('../../src/tools/register.js', () => ({
    registerTools: mockRegisterTools,
  }));

  await import('../../src/index.js');
}

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockConnect.mockClear();
  mockRegisterTools.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('server entry (src/index.ts)', () => {
  it('creates an McpServer with correct name and version', async () => {
    await importEntryModule();

    const { McpServer } = await import(
      '@modelcontextprotocol/sdk/server/mcp.js'
    );

    expect(McpServer).toHaveBeenCalledWith({
      name: 'sprint-pilot',
      version: '1.0.0',
    });
  });

  it('calls registerTools with the server instance', async () => {
    await importEntryModule();

    expect(mockRegisterTools).toHaveBeenCalledTimes(1);
    // The first argument to registerTools should be an object with connect
    const serverArg = mockRegisterTools.mock.calls[0][0] as Record<string, unknown>;
    expect(serverArg).toHaveProperty('connect');
  });

  it('creates a StdioServerTransport', async () => {
    await importEntryModule();

    const { StdioServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/stdio.js'
    );

    expect(StdioServerTransport).toHaveBeenCalledTimes(1);
  });

  it('calls server.connect() with the transport instance', async () => {
    await importEntryModule();

    expect(mockConnect).toHaveBeenCalledWith(mockTransportInstance);
  });

  it('calls registerTools before connect', async () => {
    const callOrder: string[] = [];
    mockRegisterTools.mockImplementation(() => {
      callOrder.push('registerTools');
    });
    mockConnect.mockImplementation(async () => {
      callOrder.push('connect');
    });

    await importEntryModule();

    expect(callOrder).toEqual(['registerTools', 'connect']);
  });
});
