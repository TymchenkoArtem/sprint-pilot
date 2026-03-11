# SprintPilot — Master Overview

**Version:** 2.0.0-draft
**Date:** March 2026
**Status:** Specification — Pre-development

---

## 1. Executive Summary

SprintPilot is a **security-scoped MCP server** paired with a **set of `.md` instruction files** that together automate the end-to-end software development workflow — from Azure DevOps work item selection to pull request creation.

The MCP server acts as a **security gateway** to Azure DevOps, enforcing principle of least privilege. The AI tool never receives the raw PAT token and can only perform a restricted set of operations scoped to the current user, configured project, and allowed work item types. This is the core differentiator from Microsoft's `@azure-devops/mcp`, which grants full unrestricted access.

The `.md` instruction files teach the AI tool (Claude CLI, Cursor, Copilot, Augment) the complete autopilot workflow. The AI orchestrates SprintPilot MCP (for ADO), Fabric CLI commands (for spec-driven development), Playwright MCP (for browser testing), Chrome DevTools MCP (for browser health), and native git/shell operations into a seamless flow.

### Core Principles

- **Security first** — PAT stored in OS keychain via keytar; AI never sees it; every operation validated and scoped
- **Autopilot by default** — one command starts the entire flow; AI batches non-interactive steps and only pauses at decision points
- **7 mandatory approval points** — every mutation requires explicit user consent; sequential, never batched
- **State as markdown** — workflow state stored as human-readable `.md` files the AI reads and writes
- **Pause and resume** — switch between work items; state persists across sessions
- **Leverage existing tools** — Fabric CLI for development, Playwright/DevTools MCP for testing, git for version control; SprintPilot only builds what doesn't exist

---

## 2. Architecture

### 2.1 System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                       Developer Machine                           │
│                                                                   │
│  ┌──────────────┐    MCP     ┌───────────────────────────────┐  │
│  │  Claude CLI   │◄─────────►│  SprintPilot MCP Server       │  │
│  │  (or Cursor,  │   stdio   │  (Security-Scoped ADO Gateway) │  │
│  │   Copilot,    │           │                                │  │
│  │   Augment)    │           │  ● 10 restricted ADO tools     │  │
│  │               │           │  ● Input validation (Zod)      │  │
│  │  Reads:       │           │  ● Scope enforcement           │  │
│  │  .sprint-pilot│           │  ● Keytar PAT management       │  │
│  │  /instructions│           └──────────┬────────────────────┘  │
│  │               │                      │                        │
│  │  Also uses:   │                      │ HTTPS (PAT auth)       │
│  │  ● Fabric CLI │                      ▼                        │
│  │    commands   │           ┌───────────────────────────────┐  │
│  │  ● git (native│           │   Azure DevOps REST API       │  │
│  │  ● shell cmds)│           │   (scoped access only)        │  │
│  │  ● Playwright │           │   ● Work Items (own, typed)   │  │
│  │    MCP        │           │   ● Comments (on own items)   │  │
│  │  ● DevTools   │           │   ● Status (mapped only)      │  │
│  │    MCP        │           │   ● Branches (from base only) │  │
│  └──────────────┘           │   ● PRs (to target only)      │  │
│                              │   ● Iterations (read only)    │  │
│  ┌──────────────┐           └───────────────────────────────┘  │
│  │  /fabric      │                                               │
│  │  ├─standards/ │  ← AI reads directly for quality gate         │
│  │  ├─product/   │  ← AI reads directly for quality gate         │
│  │  └─specs/     │  ← Fabric CLI writes specs here               │
│  └──────────────┘                                               │
│                                                                   │
│  ┌──────────────┐  ┌──────────────────┐                         │
│  │Playwright MCP│  │Chrome DevTools   │ ← AI calls directly     │
│  │              │  │MCP               │   for verification       │
│  └──────────────┘  └──────────────────┘                         │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Security Boundary

```
┌─────────────────────────────────────────────────┐
│          AI Tool (Claude CLI)                    │
│  Can do:                                         │
│  ● Read/write local files (state, logs, specs)  │
│  ● Run git commands                              │
│  ● Run shell commands (npm test, fabric-cli)    │
│  ● Call Playwright MCP                           │
│  ● Call Chrome DevTools MCP                      │
│                                                  │
│  Cannot do:                                      │
│  ● Access PAT token                              │
│  ● Call ADO API directly                         │
│  ● Bypass SprintPilot's scope restrictions      │
└────────────────┬────────────────────────────────┘
                 │ MCP calls only
                 ▼
┌─────────────────────────────────────────────────┐
│       SprintPilot MCP (Security Gateway)         │
│                                                  │
│  Validates every request:                        │
│  ● Is this work item assigned to current user?  │
│  ● Is this work item in the configured project? │
│  ● Is this work item of a configured type?      │
│  ● Is this status in the configured mapping?    │
│  ● Is this branch from the configured base?     │
│  ● Is this PR targeting the configured branch?  │
│                                                  │
│  Blocks everything else.                         │
└────────────────┬────────────────────────────────┘
                 │ Authenticated HTTPS
                 ▼
┌─────────────────────────────────────────────────┐
│            Azure DevOps REST API                 │
└─────────────────────────────────────────────────┘
```

### 2.3 Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Node.js >= 18 LTS | MCP SDK maturity, async I/O |
| Language | TypeScript (strict mode) | Type safety for security validation |
| MCP SDK | `@modelcontextprotocol/sdk` | Official SDK |
| HTTP | Native `fetch` | Node 18+ built-in, no extra deps |
| Secrets | `keytar` | OS keychain — PAT never in env vars or files |
| Validation | `zod` | Input validation on every tool call |
| Build | `tsup` | Fast TypeScript bundling |
| Testing | `vitest` | Security validation tests |
| Linting | `eslint` + `prettier` | Consistent code style |
| Package Manager | npm | Published as `sprint-pilot` |

### 2.4 What SprintPilot Does NOT Build

These are handled by existing tools:

| Capability | Handled by |
|-----------|-----------|
| Development workflow (spec → tasks → implement) | Fabric CLI (`.md` commands native to AI tool) |
| Git operations (branch, commit, push, stash) | AI tool runs git directly |
| Test execution (unit, integration) | AI tool runs `npm test` / `vitest` directly |
| Browser testing | Playwright MCP (separate server) |
| Browser health checks | Chrome DevTools MCP (separate server) |
| Code analysis / quality judgment | AI tool's native reasoning |

---

## 3. Spec File Index

| # | File | Scope |
|---|------|-------|
| 00 | `00-MASTER-OVERVIEW.md` | This file — architecture, principles, index |
| 01 | `01-SECURITY-MODEL.md` | Threat model, scoping rules, validation, blocked operations |
| 02 | `02-MCP-TOOLS.md` | All 10 tools: inputs, validation, outputs, errors |
| 03 | `03-AUTH-AND-KEYTAR.md` | PAT storage, retrieval, scope validation, fallback |
| 04 | `04-ADO-API-REFERENCE.md` | REST endpoints, request/response shapes, tool-to-API mapping |
| 05 | `05-CLAUDE-MD.md` | Master CLAUDE.md spec — autopilot logic, AI behavior |
| 06 | `06-WORKFLOW-INSTRUCTIONS.md` | All instruction `.md` files content specs |
| 07 | `07-STATE-AS-MARKDOWN.md` | Workflow state format, templates, conventions |
| 08 | `08-QUALITY-GATE.md` | AI analysis process, checks, severity, overrides |
| 09 | `09-TESTING-VERIFICATION.md` | Unit + Playwright + DevTools, dev server, fix-retest |
| 10 | `10-DELIVERY-FLOW.md` | Commit, PR generation, sprint tags, status updates |
| 11 | `11-NPM-PACKAGE.md` | package.json, CLI commands, setup, publishing |
| 12 | `12-CODING-STANDARDS.md` | TypeScript config, testing, conventions |
| 13 | `13-DEVELOPMENT-PHASES.md` | Phased build plan with tasks and exit criteria |

---

## 4. The 7 Approval Points

Every approval pauses the autopilot, presents the decision to the user, and waits for response. Always sequential — one at a time.

| # | Approval | Options | When |
|---|----------|---------|------|
| 1 | Post clarification questions to ADO | approve / edit / skip | After scope analysis finds gaps |
| 2 | Update ADO status | approve / skip | After posting questions, after branch, after PR |
| 3 | Branch name | approve / edit | Before creating feature branch (always asked) |
| 4 | Quality gate override | fix / override | Only if violations found |
| 5 | Fix-retest cycle | approve / stop | After test failures (max 3 shared across all types) |
| 6 | Commit message | approve / edit | Before committing |
| 7 | PR creation | approve / edit | Before creating PR in ADO |

---

## 5. Installation

```bash
npm install -g sprint-pilot
cd /path/to/project        # Fabric CLI already installed
sprint-pilot setup-claude   # or setup-cursor, setup-copilot, setup-augment
```

`setup-claude` does:
1. Runs interactive init: PAT → keytar, ADO org/project, work item types, status mapping, branch config
2. Patches `.claude.json` to register SprintPilot MCP server
3. Copies `.sprint-pilot/instructions/` and `templates/` into project
4. Writes `.sprint-pilot/config.md`
5. Adds `.sprint-pilot/workflows/` and `.sprint-pilot/activity.md` to `.gitignore`
6. Verifies `fabric/` and `fabric/product/` exist

---

*End of master overview. See individual spec files for detailed specifications.*
