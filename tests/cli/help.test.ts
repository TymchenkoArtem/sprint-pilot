/**
 * Unit tests for src/cli/help.ts -- printHelp()
 *
 * Verifies that printHelp() outputs all expected documentation sections
 * (Usage, Commands, Options, Setup Flow, Documentation URL).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { printHelp } from '../../src/cli/help.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capture console.log output for assertion. */
function captureConsoleLog(): string[] {
  const logs: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  });
  return logs;
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('printHelp', () => {
  it('calls console.log exactly once', () => {
    captureConsoleLog();
    printHelp();

    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it('includes the project description line', () => {
    const logs = captureConsoleLog();
    printHelp();

    const output = logs.join('\n');
    expect(output).toContain('Security-scoped MCP server for Azure DevOps');
  });

  it('includes the USAGE section', () => {
    const logs = captureConsoleLog();
    printHelp();

    const output = logs.join('\n');
    expect(output).toContain('USAGE');
    expect(output).toContain('sprint-pilot <command> [options]');
  });

  it('includes the COMMANDS section with all subcommands', () => {
    const logs = captureConsoleLog();
    printHelp();

    const output = logs.join('\n');
    expect(output).toContain('COMMANDS');
    expect(output).toContain('serve');
    expect(output).toContain('setup-claude');
    expect(output).toContain('setup-cursor');
    expect(output).toContain('setup-copilot');
    expect(output).toContain('setup-augment');
    expect(output).toContain('init');
    expect(output).toContain('--reconfigure-pat');
    expect(output).toContain('config');
    expect(output).toContain('set <key> <value>');
  });

  it('includes the OPTIONS section with help and version flags', () => {
    const logs = captureConsoleLog();
    printHelp();

    const output = logs.join('\n');
    expect(output).toContain('OPTIONS');
    expect(output).toContain('--help, -h');
    expect(output).toContain('--version, -v');
  });

  it('includes the SETUP FLOW section with init and config steps', () => {
    const logs = captureConsoleLog();
    printHelp();

    const output = logs.join('\n');
    expect(output).toContain('SETUP FLOW');
    expect(output).toContain('prompts for your PAT');
    expect(output).toContain('sprint-pilot init');
    expect(output).toContain('sprint-pilot config');
  });

  it('includes the --force flag in OPTIONS', () => {
    const logs = captureConsoleLog();
    printHelp();

    const output = logs.join('\n');
    expect(output).toContain('--force');
  });

  it('includes the DOCUMENTATION section with URL', () => {
    const logs = captureConsoleLog();
    printHelp();

    const output = logs.join('\n');
    expect(output).toContain('DOCUMENTATION');
    expect(output).toContain('https://github.com/');
  });

  it('does not start with a leading newline (trimStart applied)', () => {
    const logs = captureConsoleLog();
    printHelp();

    const output = logs[0];
    expect(output).not.toMatch(/^\n/);
    expect(output).toMatch(/^sprint-pilot/);
  });
});
