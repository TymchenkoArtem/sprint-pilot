/**
 * Print CLI usage and subcommand documentation.
 */
export function printHelp(): void {
  const help = `
sprint-pilot -- Security-scoped MCP server for Azure DevOps

USAGE
  sprint-pilot <command> [options]

COMMANDS
  serve              Start the MCP server (stdio transport)
  setup-claude       Configure SprintPilot for Claude CLI
  setup-cursor       Configure SprintPilot for Cursor IDE
  setup-copilot      Configure SprintPilot for GitHub Copilot
  setup-augment      Configure SprintPilot for Augment
  init               Re-run interactive initialization (PAT, org, project, branch)
    --reconfigure-pat  Re-run PAT setup only
  config             Display current SprintPilot configuration
    set <key> <value>  Update a configuration field (e.g., git.branchTemplate)

OPTIONS
  --force            Overwrite existing files during setup
  --help, -h         Show this help message
  --version, -v      Show version number

SETUP FLOW
  1. Run "sprint-pilot setup-claude" (or your preferred AI tool)
  2. The setup copies files, prompts for your PAT, and configures everything
  3. Open your AI tool -- SprintPilot tools are now available
  4. Use --force to overwrite template files on subsequent runs
  5. Run "sprint-pilot init" to reconfigure credentials and project settings
  6. Run "sprint-pilot config" to view or update individual settings

DOCUMENTATION
  https://github.com/TymchenkoArtem/sprint-pilot
`.trimStart();

  console.log(help);
}
