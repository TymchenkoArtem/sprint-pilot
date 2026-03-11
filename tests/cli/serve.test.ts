/**
 * Unit tests for src/cli/serve.ts -- runServe()
 *
 * The serve module dynamically imports ../index.js to start the MCP server.
 * We mock the dynamic import to verify it is called without actually
 * booting the server.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock -- intercept dynamic import of '../index.js'
// ---------------------------------------------------------------------------

const { mockIndexModule } = vi.hoisted(() => {
  return {
    mockIndexModule: vi.fn().mockResolvedValue({}),
  };
});

vi.mock('../../src/index.js', () => {
  mockIndexModule();
  return {};
});

// ---------------------------------------------------------------------------
// Import the module under test AFTER vi.mock() declarations
// ---------------------------------------------------------------------------

import { runServe } from '../../src/cli/serve.js';

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runServe', () => {
  it('triggers the dynamic import of the index module', async () => {
    await runServe();

    // The mock factory for '../index.js' runs when the module is imported.
    // Since vitest caches modules, the factory runs once during this test file.
    expect(mockIndexModule).toHaveBeenCalled();
  });

  it('returns a promise that resolves to void', async () => {
    const result = await runServe();

    expect(result).toBeUndefined();
  });
});
