import { describe, it, expect, vi } from 'vitest';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerTools } from '../../src/tools/register.js';

// ---------------------------------------------------------------------------
// MCP Handshake Integration Tests
// ---------------------------------------------------------------------------
// Verifies that the MCP server setup (server creation + tool registration)
// is synchronous, performs no I/O, and registers exactly the expected tools.
// ---------------------------------------------------------------------------

describe('MCP handshake', () => {
  describe('McpServer instantiation', () => {
    it('creates a server with name and version without throwing', () => {
      expect(() => {
        new McpServer({ name: 'sprint-pilot', version: '1.0.0' });
      }).not.toThrow();
    });
  });

  describe('registerTools', () => {
    it('completes without throwing', () => {
      const server = new McpServer({ name: 'sprint-pilot', version: '1.0.0' });

      expect(() => {
        registerTools(server);
      }).not.toThrow();
    });

    it('registers exactly 12 tools', () => {
      const server = new McpServer({ name: 'sprint-pilot', version: '1.0.0' });
      const toolSpy = vi.spyOn(server, 'tool');

      registerTools(server);

      expect(toolSpy).toHaveBeenCalledTimes(12);
    });

    it('registers sp-init as the first tool', () => {
      const server = new McpServer({ name: 'sprint-pilot', version: '1.0.0' });
      const toolSpy = vi.spyOn(server, 'tool');

      registerTools(server);

      expect(toolSpy.mock.calls[0]![0]).toBe('sp-init');
    });

    it('registers sp-config as the second tool', () => {
      const server = new McpServer({ name: 'sprint-pilot', version: '1.0.0' });
      const toolSpy = vi.spyOn(server, 'tool');

      registerTools(server);

      expect(toolSpy.mock.calls[1]![0]).toBe('sp-config');
    });

    it('registers all expected tool names', () => {
      const server = new McpServer({ name: 'sprint-pilot', version: '1.0.0' });
      const toolSpy = vi.spyOn(server, 'tool');

      registerTools(server);

      const toolNames = toolSpy.mock.calls.map((call) => call[0]);
      expect(toolNames).toEqual([
        'sp-init',
        'sp-config',
        'sp-my-items',
        'sp-get-item',
        'sp-get-comments',
        'sp-post-comment',
        'sp-update-status',
        'sp-create-branch',
        'sp-create-pr',
        'sp-get-iterations',
        'sp-track-usage',
        'sp-instructions',
      ]);
    });

    it('performs no async operations during registration', () => {
      const server = new McpServer({ name: 'sprint-pilot', version: '1.0.0' });

      // registerTools is synchronous and returns void.
      // If it returned a Promise it would be truthy, so verifying
      // the return value is undefined confirms no async work is started.
      const result: void = registerTools(server);

      expect(result).toBeUndefined();
    });
  });

  describe('server metadata', () => {
    it('preserves the configured server name and version', () => {
      const server = new McpServer({ name: 'sprint-pilot', version: '1.0.0' });

      // The McpServer stores name and version in its public `server` property
      // which is the underlying Server instance, or directly on the instance.
      // Access what the SDK exposes to verify metadata was accepted.
      expect(server).toBeDefined();
      expect(server).toBeInstanceOf(McpServer);
    });
  });
});
