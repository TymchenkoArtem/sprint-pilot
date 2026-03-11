# sprint-pilot

**Security-scoped MCP server for Azure DevOps workflow automation**

[![npm version](https://img.shields.io/npm/v/sprint-pilot)](https://www.npmjs.com/package/sprint-pilot)
[![license](https://img.shields.io/npm/l/sprint-pilot)](https://github.com/TymchenkoArtem/sprint-pilot/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/sprint-pilot)](https://nodejs.org)

---

## What is SprintPilot?

SprintPilot is an [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) server that gives AI coding assistants **safe, scoped access** to Azure DevOps. It enforces principle of least privilege on every request -- the AI can only access your project, your work items, and your allowed work item types.

SprintPilot pairs 12 MCP tools with markdown instruction files that teach the AI a complete, repeatable development workflow -- from work item selection through pull request creation. Eight mandatory approval points ensure the developer retains control at every critical step.

### Key Features

- **Security-first** -- triple scope filter (project, assignment, work item type) on every operation
- **PAT never exposed** -- stored in OS keychain, never in config files, env vars, or AI responses
- **4-phase autopilot** -- Discovery, Branch + Development, Verification, Delivery
- **8 approval gates** -- the AI proposes, you decide
- **fabric/ optional** -- works with or without fabric-cli; falls back to codebase analysis
- **Smart complexity routing** -- uses fabric-cli for complex tasks, implements directly for small ones
- **Works with any MCP client** -- Claude CLI, Cursor, GitHub Copilot, Augment

---

## Quick Start

```bash
# Install globally
npm install -g sprint-pilot

# Set up for your AI tool (choose one)
cd your-project
sprint-pilot setup-claude
sprint-pilot setup-cursor
sprint-pilot setup-copilot
sprint-pilot setup-augment
```

The setup command will:

1. Install slash commands (for tools that support them)
2. Register the MCP server in your AI tool's config
3. Update `.gitignore` with SprintPilot entries
4. Check for `fabric/` and fabric-cli (warns if missing, does not block)
5. Prompt you interactively for:
   - **PAT** -- Personal Access Token with required scopes (masked input)
   - **Organization URL** -- e.g., `https://dev.azure.com/my-org`
   - **Project** -- the ADO project to scope to
   - **Team** -- (optional) ADO team name
   - **Base branch** -- auto-detected from git, defaults to `main`

Once set up, open your AI tool and say **"work on US-12345"** or run `/sp-start`.

---

## Setup by AI Tool

### Claude CLI

```bash
sprint-pilot setup-claude
```

Registers in `~/.claude.json` and installs `/sp-*` slash commands to `~/.claude/commands/`.

### Cursor

```bash
sprint-pilot setup-cursor
```

Registers in `~/.cursor/mcp.json` and installs `/sp-*` slash commands to `~/.cursor/commands/`.

### GitHub Copilot

```bash
sprint-pilot setup-copilot
```

Registers in VS Code's `mcp.json` (`%APPDATA%\Code\User\mcp.json` on Windows, `~/Library/Application Support/Code/User/mcp.json` on macOS, `~/.config/Code/User/mcp.json` on Linux). No slash commands (not supported).

### Augment

```bash
sprint-pilot setup-augment
```

Registers in `~/.augment/mcp.json`. No slash commands (not supported).

All setup commands are idempotent. The MCP server is registered globally (home directory) so it's available to all projects. Use `--force` to overwrite existing files.

---

## The 4-Phase Autopilot

SprintPilot teaches the AI a structured development workflow:

```
  "work on US-12345"
         |
         v
  Phase 1: Discovery
  Read work item, analyze scope, post clarification questions
         |
         v
  Phase 2: Branch + Development
  Create branch, implement changes (with unit tests)
         |
         v
  Post-Impl: Auto-Run Tests
  Run test suite, fix regressions (max 3 attempts)
         |
         v
  Phase 3: Verification (/sp-verify)
  Review all changes against standards, architecture, requirements
         |
         v
  Phase 4: Delivery
  Squash, commit, push, create PR, update status
         |
         v
     completed
```

### Phase 1: Discovery

The AI reads the work item details and comments, loads project standards (from `fabric/` or by analyzing the codebase), and assesses whether the requirements are complete. If clarification is needed, it drafts questions and -- with your approval -- posts them as an ADO comment.

### Phase 2: Branch + Development

The AI creates a feature branch, updates the work item status, and implements the changes. Implementation approach depends on task complexity:

| Task Type | Criteria | Approach |
|-----------|----------|----------|
| **Small** | 1-2 acceptance criteria, ≤3 files, single concern | Implement directly using codebase conventions |
| **Complex** | 3+ acceptance criteria, multiple modules, new architecture | Use fabric-cli (`/shape-spec`, `/write-spec`, `/create-tasks`, `/implement-tasks`) if available |

Unit tests are always created as part of implementation. After implementation, the test suite runs automatically -- failures are fixed before proceeding.

### Phase 3: Verification

A comprehensive AI review of all code changes against three sources:

- **Standards compliance** -- naming, patterns, error handling (from `fabric/standards/` or observed codebase)
- **Product alignment** -- architecture, tech stack, data flow (from `fabric/product/` or observed code)
- **Requirements coverage** -- every acceptance criterion mapped to implementing code

Produces a structured findings report with error/warning/info severity levels. Errors block delivery unless overridden.

### Phase 4: Delivery

Squashes commits, generates a commit message from the configured template, pushes to remote, and creates a pull request in ADO with the work item linked.

---

## Approval Points

The AI stops and waits for your explicit decision at each of these 8 gates:

| # | Approval | Phase | Options |
|---|----------|-------|---------|
| 1 | Post clarification questions to ADO | Discovery | approve / edit / skip |
| 2 | Update status to Blocked | Discovery | approve / skip |
| 3 | Create branch | Branch + Dev | approve / edit |
| 4 | Update status to In Progress | Branch + Dev | approve / skip |
| 5 | Verification violations found | Verification | fix / override |
| 6 | Commit and push | Delivery | approve / edit |
| 7 | Create PR | Delivery | approve / edit |
| 8 | Update status to In Review | Delivery | approve / skip |

---

## Slash Commands

For tools that support them (Claude CLI, Cursor):

| Command | Description |
|---------|-------------|
| `/sp-start` | Start the autopilot -- check status, pick a work item, run the workflow |
| `/sp-status` | Show current workflow status (phase, work item, branch) |
| `/sp-resume` | Resume a paused workflow from its last checkpoint |
| `/sp-items` | List your assigned work items from Azure DevOps |
| `/sp-verify` | Run verification against standards, product docs, and requirements |
| `/sp-deliver` | Jump to delivery -- squash, commit, push, create PR |
| `/sp-check-answers` | Check if clarification questions have been answered in ADO |
| `/sp-help` | Show all SprintPilot commands |

For tools without slash commands (GitHub Copilot, Augment), use natural language: "work on US-12345", "show my items", "verify the implementation", etc.

---

## MCP Tools Reference

SprintPilot exposes 12 tools via the Model Context Protocol:

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `sp-init` | Check initialization status. Reports config, PAT, and fabric/ availability. | _(none)_ |
| `sp-config` | Read or update configuration. Locked fields require re-initialization. | `action`, `updates` |
| `sp-my-items` | Fetch work items assigned to you, grouped by type and state. | _(none)_ |
| `sp-get-item` | Fetch a single work item with full details and acceptance criteria. | `id` |
| `sp-get-comments` | Fetch all comments on a work item with SprintPilot marker detection. | `id` |
| `sp-post-comment` | Post a comment on a work item. Create-only (no edit/delete). | `id`, `text` |
| `sp-update-status` | Update status using logical keys (`blocked`, `inProgress`, `inReview`). | `id`, `status` |
| `sp-create-branch` | Create a Git branch from the configured base. Validates source ref. | `name`, `source_ref` |
| `sp-create-pr` | Create a PR targeting the configured branch. Links work items, adds labels. | `source_branch`, `title`, `description`, `work_item_id`, `tags` |
| `sp-get-iterations` | Fetch team iterations (sprints) and identify the current one. | _(none)_ |
| `sp-track-usage` | Record token usage for a workflow. | `flow`, `command`, `description`, `tokens` |
| `sp-instructions` | Retrieve built-in workflow instructions and templates from the package. | `name`, `category` |

All inputs are validated with Zod `.strict()` schemas -- unknown keys are rejected.

---

## Security Model

### Triple Scope Filter

Every work item operation is validated against three dimensions:

1. **Project** -- the work item must belong to the configured ADO project
2. **Assignment** -- the work item must be assigned to the authenticated user
3. **Type** -- the work item type must be in the `allowedWorkItemTypes` list

Requests that fail any check return a `scope_violation` error. The AI never sees out-of-scope data.

### PAT Storage

The Personal Access Token is stored in the OS keychain via [keytar](https://github.com/nicholaschuayunzhi/node-keytar) (macOS Keychain, Windows Credential Vault, Linux libsecret). If keytar is unavailable, SprintPilot falls back to `~/.sprint-pilot/pat` with a warning. The PAT never appears in config files, environment variables, logs, or AI responses.

### Response Sanitization

ADO responses are sanitized before reaching the AI. Internal metadata, revision histories, and system fields are stripped. Only essential fields are returned.

### Git Scope Enforcement

- Branch creation validates `source_ref` matches the configured `baseBranchOrTag`
- PR creation always uses the configured `prTargetBranch` -- the AI cannot specify a different target
- Delete operations are not exposed

---

## Configuration

SprintPilot stores configuration in `.sprint-pilot/config.md` as structured markdown:

```markdown
# SprintPilot Configuration

## Azure DevOps
- Organization: https://dev.azure.com/my-org
- Project: MyProject
- Team: MyProject Team

## Work Item Types
- User Story
- Bug
- Task

## Status Mapping
### User Story
- blocked: Blocked
- inProgress: Active
- inReview: Resolved

### Bug
- blocked: Blocked
- inProgress: Active
- inReview: Resolved

## Git
- Base branch: main
- PR target: main
- Branch template: features/{id}-{slug}
- Commit template: #{id}: {description}

## Testing
- Test command: npm test
```

**Locked fields** (`Organization`, `Project`) cannot be changed via `sp-config` -- run `sprint-pilot setup-<tool> --force` to reconfigure.

**Updatable fields** can be changed via the `sp-config` MCP tool or CLI:
- `allowedWorkItemTypes`, `statusMapping`, `team`
- `git.baseBranchOrTag`, `git.prTargetBranch`, `git.branchTemplate`, `git.commitTemplate`
- `testing.testCommand`, `testing.devServerCommand`

---

## Working With and Without fabric/

SprintPilot adapts to your environment:

| Environment | Behavior |
|-------------|----------|
| `fabric/` exists + fabric-cli installed | Full workflow. Standards from docs. CLI for complex tasks. |
| `fabric/` exists, no fabric-cli | Standards from docs. Always implements directly. |
| No `fabric/`, fabric-cli installed | Codebase analysis for standards. CLI for complex tasks. |
| No `fabric/`, no fabric-cli | Codebase analysis for standards. Always implements directly. |

**fabric/ detection:** Checks for `fabric/` directory in the project root (project-level standards and product docs).

**fabric-cli detection:** Checks for `~/fabric/` directory (standard fabric-cli global installation location).

When `fabric/` is missing, SprintPilot shows a warning during setup and `/sp-start` but continues. Verification falls back to analyzing the existing codebase for conventions and patterns rather than checking against documented standards.

---

## CLI Reference

```
sprint-pilot <command> [options]

COMMANDS
  serve              Start the MCP server (stdio transport)
  setup-claude       Configure for Claude CLI
  setup-cursor       Configure for Cursor IDE
  setup-copilot      Configure for GitHub Copilot
  setup-augment      Configure for Augment
  init               Re-run interactive initialization
    --reconfigure-pat  Re-run PAT setup only
  config             Display current configuration
    set <key> <value>  Update a configuration field

OPTIONS
  --force            Overwrite existing files during setup
  --help, -h         Show help message
  --version, -v      Show version number
```

---

## Workflow State Management

Each work item gets its own folder in `.sprint-pilot/workflows/{TYPE}-{ID}/`:

```
.sprint-pilot/workflows/US-12345/
  state.md        -- Current phase, sub-state, acceptance criteria, verification results
  activity.md     -- Timestamped log of all actions taken
  usage.md        -- Token usage tracking per phase
```

State files are plain markdown -- human-readable and version-control friendly. The AI reads state before every action and updates it after every significant step.

### Pause and Resume

Workflows can be paused at any point to switch to another work item:

- **Pause:** Stashes uncommitted changes, records the stash ref in state, checks out the base branch
- **Resume:** Checks out the workflow branch, pops the stash, continues from the paused phase

---

## Requirements

- **Node.js** >= 18
- **Azure DevOps PAT** with the following scopes:
  - Work Items: **Read & Write**
  - Code: **Read & Write**
  - Project and Team: **Read**

### Optional

- **fabric-cli** -- enables spec shaping and task breakdown for complex work items
- **fabric/ directory** -- project-level standards and product documentation for standards-based verification

---

## Dependencies

SprintPilot follows dependency minimalism -- exactly three runtime dependencies:

| Dependency | Purpose |
|-----------|---------|
| `@modelcontextprotocol/sdk` | MCP server protocol implementation |
| `keytar` | OS keychain access for PAT storage |
| `zod` | Input validation with strict schemas |

---

## Development

```bash
# Clone and install
git clone <repo-url>
cd sprint-pilot
npm install

# Build
npm run build

# Run tests (602 tests)
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run format
```

### Project Structure

```
src/
  ado/           -- Azure DevOps API client, endpoints, types
  auth/          -- PAT storage strategies (keytar, file fallback)
  cli/           -- CLI commands (setup, init, config, serve, help)
  config/        -- Configuration schema, parser, manager
  security/      -- Scope validator, response sanitizer
  shared/        -- Constants, errors, logger, tool context, usage tracker
  tools/         -- 12 MCP tool implementations
  index.ts       -- MCP server entry point

templates/
  commands/      -- Slash command definitions (sp-start, sp-verify, etc.)
  instructions/  -- Workflow instruction files (CLAUDE.md, session-start, etc.)
  templates/     -- File templates (workflow state, PR description, etc.)

tests/           -- Mirror of src/ structure, vitest
```

---

## License

[MIT](LICENSE) -- TechFabric LLC by Artem Tymchenko
