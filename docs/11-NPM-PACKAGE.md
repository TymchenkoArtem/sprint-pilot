# 11 — NPM Package & Installation

**Parent:** `00-MASTER-OVERVIEW.md`
**Related:** `02-MCP-TOOLS.md`, `12-CODING-STANDARDS.md`

---

## 1. Package Identity

| Property | Value |
|----------|-------|
| Name | `sprint-pilot` |
| Binary | `sprint-pilot` |
| Scope | Unscoped (not @org/sprint-pilot) |
| Registry | npm public registry |
| License | MIT |

---

## 2. Package Structure

```
sprint-pilot/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── README.md
├── LICENSE
│
├── src/
│   ├── index.ts                    # MCP server entry point
│   ├── cli/
│   │   ├── index.ts                # CLI entry point (sprint-pilot command)
│   │   ├── setup-claude.ts         # setup-claude subcommand
│   │   ├── setup-cursor.ts         # setup-cursor subcommand
│   │   ├── setup-copilot.ts        # setup-copilot subcommand
│   │   ├── setup-augment.ts        # setup-augment subcommand
│   │   └── init.ts                 # Interactive init flow
│   │
│   ├── tools/
│   │   ├── sp-init.ts
│   │   ├── sp-config.ts
│   │   ├── sp-my-items.ts
│   │   ├── sp-get-item.ts
│   │   ├── sp-get-comments.ts
│   │   ├── sp-post-comment.ts
│   │   ├── sp-update-status.ts
│   │   ├── sp-create-branch.ts
│   │   ├── sp-create-pr.ts
│   │   └── sp-get-iterations.ts
│   │
│   ├── security/
│   │   ├── scope-validator.ts      # Triple scope filter logic
│   │   └── response-sanitizer.ts   # Strip sensitive data from responses
│   │
│   ├── auth/
│   │   ├── auth-strategy.ts        # Interface
│   │   ├── keytar-strategy.ts      # OS keychain implementation
│   │   └── file-fallback.ts        # Fallback for headless environments
│   │
│   ├── ado/
│   │   ├── ado-client.ts           # Authenticated HTTP client
│   │   ├── endpoints.ts            # API endpoint builders
│   │   └── types.ts                # ADO response types
│   │
│   ├── config/
│   │   ├── config-manager.ts       # Read/write/validate config.md
│   │   ├── config-schema.ts        # Zod schemas
│   │   └── config-types.ts         # TypeScript types
│   │
│   └── shared/
│       ├── errors.ts               # Custom error classes
│       ├── logger.ts               # Activity log appender
│       └── constants.ts            # Service names, defaults
│
├── templates/                       # Copied into projects during setup
│   ├── instructions/
│   │   ├── CLAUDE.md
│   │   ├── workflow-overview.md
│   │   ├── approval-points.md
│   │   ├── ado-operations.md
│   │   ├── git-conventions.md
│   │   ├── quality-gate.md
│   │   ├── testing-verification.md
│   │   ├── clarification-flow.md
│   │   ├── delivery-flow.md
│   │   └── session-start.md
│   │
│   └── templates/
│       ├── workflow-state.md
│       ├── clarification-comment.md
│       └── pr-description.md
│
├── dist/                            # Built output (gitignored, published)
│   ├── index.js                    # MCP server
│   ├── index.d.ts
│   └── cli/
│       └── index.js                # CLI binary
│
└── tests/
    ├── tools/                      # Tool-level tests
    ├── security/                   # Scope validation tests
    ├── auth/                       # Auth strategy tests
    └── integration/                # End-to-end flow tests (mocked ADO)
```

---

## 3. package.json

```json
{
  "name": "sprint-pilot",
  "version": "1.0.0",
  "description": "Security-scoped MCP server for Azure DevOps development workflow automation",
  "keywords": ["mcp", "azure-devops", "automation", "ai", "claude", "fabric"],
  "license": "MIT",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "sprint-pilot": "dist/cli/index.js"
  },
  "files": [
    "dist",
    "templates",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build && npm run test && npm run typecheck"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.x",
    "keytar": "^7.x",
    "zod": "^3.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tsup": "^8.x",
    "vitest": "^2.x",
    "eslint": "^9.x",
    "prettier": "^3.x",
    "@types/node": "^20.x"
  },
  "engines": {
    "node": ">=18"
  }
}
```

---

## 4. CLI Commands

### 4.1 `sprint-pilot setup-claude`

Sets up SprintPilot for Claude CLI.

Steps:
1. Run interactive init (PAT, org, project, types, mappings, git config)
2. Copy `templates/instructions/` → `.sprint-pilot/instructions/`
3. Copy `templates/templates/` → `.sprint-pilot/templates/`
4. Create `.sprint-pilot/workflows/` directory
5. Create `.sprint-pilot/activity.md` with header
6. Patch `.claude.json` to add SprintPilot MCP server:
   ```json
   {
     "mcpServers": {
       "sprint-pilot": {
         "type": "stdio",
         "command": "npx",
         "args": ["-y", "sprint-pilot", "serve"]
       }
     }
   }
   ```
7. Append reference to project's `CLAUDE.md` (create if doesn't exist):
   ```markdown
   ## SprintPilot
   See `.sprint-pilot/instructions/CLAUDE.md` for the SprintPilot development workflow.
   ```
8. Add to `.gitignore`:
   ```
   .sprint-pilot/workflows/
   .sprint-pilot/activity.md
   .sprint-pilot/credentials
   ```

### 4.2 `sprint-pilot setup-cursor`

Same as setup-claude but:
- Patches `.cursor/mcp.json` instead of `.claude.json`
- Copies Cursor-specific instruction format (`.cursorrules` reference)

### 4.3 `sprint-pilot setup-copilot`

Same but:
- Patches `.vscode/mcp.json`
- Adds reference to `.github/copilot-instructions.md`

### 4.4 `sprint-pilot setup-augment`

Same but:
- Patches Augment's MCP config
- Adds reference to Augment's rules file

### 4.5 `sprint-pilot serve`

Starts the MCP server in stdio mode. This is what the AI tool calls.

```bash
sprint-pilot serve
```

### 4.6 `sprint-pilot init --reconfigure-pat`

Re-run just the PAT configuration step without full re-init.

---

## 5. MCP Server Registration

### 5.1 stdio Transport

SprintPilot uses stdio transport (stdin/stdout). This is the simplest and most compatible with all AI tools.

```typescript
// src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'sprint-pilot',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {}
  }
});

// Register all 10 tools
registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## 6. Versioning

- Follow semver
- Breaking changes to tool inputs/outputs → major version
- New tools → minor version
- Bug fixes → patch version
- Template file changes → minor version (users may need to re-run setup)

---

## 7. Update Flow

When user updates sprint-pilot:

```bash
npm update -g sprint-pilot
```

Templates may be outdated in existing projects. The CLI detects this:

```bash
sprint-pilot setup-claude --update-templates
```

This re-copies template files without re-running init. Compares versions and only overwrites if newer.

---

*End of NPM package spec.*
