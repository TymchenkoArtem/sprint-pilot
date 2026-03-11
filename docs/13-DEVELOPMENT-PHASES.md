# 13 — Development Phases

**Parent:** `00-MASTER-OVERVIEW.md`
**Related:** All spec files

---

## 1. Overview

SprintPilot is built in 5 phases. Each phase has a clear deliverable and exit criteria. Phases are sequential — each builds on the previous.

Estimated total: 3-4 weeks for a single developer.

---

## 2. Phase 1: Foundation (Week 1, Days 1-3)

**Goal:** Working MCP server skeleton with auth and config.

### Tasks

| # | Task | Spec Reference |
|---|------|---------------|
| 1.1 | Project scaffold: package.json, tsconfig, tsup, vitest, eslint | `11-NPM-PACKAGE.md`, `12-CODING-STANDARDS.md` |
| 1.2 | MCP server skeleton with stdio transport (no tools yet) | `11-NPM-PACKAGE.md` §5 |
| 1.3 | Auth module: keytar strategy + file fallback | `03-AUTH-AND-KEYTAR.md` |
| 1.4 | ADO client: authenticated fetch wrapper with retry + error handling | `04-ADO-API-REFERENCE.md` §3-4 |
| 1.5 | Config module: Zod schema, config-manager (read/write config.md) | `11-NPM-PACKAGE.md` §2 |
| 1.6 | Security module: ScopeValidator, ResponseSanitizer | `01-SECURITY-MODEL.md` §3-4 |
| 1.7 | Error classes and activity logger | `12-CODING-STANDARDS.md` §2.3 |
| 1.8 | `/sp-init` tool (interactive setup flow) | `02-MCP-TOOLS.md` §2.1 |
| 1.9 | `/sp-config` tool (read/write config) | `02-MCP-TOOLS.md` §2.2 |

### Exit Criteria
- `sprint-pilot serve` starts and responds to MCP handshake
- CLI setup (`sprint-pilot setup-*`) collects PAT, stores in keytar, validates against ADO, writes config.md; `/sp-init` MCP tool is status-check only
- `/sp-config` reads and writes config
- Security: ScopeValidator unit tests pass (100% branch coverage)
- Auth: keytar and fallback tests pass

---

## 3. Phase 2: Core ADO Tools (Week 1, Days 4-5 + Week 2, Days 1-2)

**Goal:** All 10 MCP tools working with security enforcement.

### Tasks

| # | Task | Spec Reference |
|---|------|---------------|
| 2.1 | `/sp-my-items` — WIQL query + batch fetch + scope filter | `02-MCP-TOOLS.md` §2.3 |
| 2.2 | `/sp-get-item` — single item fetch + post-fetch scope check | `02-MCP-TOOLS.md` §2.4 |
| 2.3 | `/sp-get-comments` — comments fetch with SprintPilot marker detection | `02-MCP-TOOLS.md` §2.5 |
| 2.4 | `/sp-post-comment` — comment creation with marker validation | `02-MCP-TOOLS.md` §2.6 |
| 2.5 | `/sp-update-status` — status patch with mapping validation | `02-MCP-TOOLS.md` §2.7 |
| 2.6 | `/sp-create-branch` — branch creation with source ref validation | `02-MCP-TOOLS.md` §2.8 |
| 2.7 | `/sp-create-pr` — PR creation with target validation + work item linking | `02-MCP-TOOLS.md` §2.9 |
| 2.8 | `/sp-get-iterations` — iteration fetch for project | `02-MCP-TOOLS.md` §2.10 |
| 2.9 | Security tests for every scope restriction on every tool | `12-CODING-STANDARDS.md` §3.4 |
| 2.10 | Integration tests with mocked ADO responses | `12-CODING-STANDARDS.md` §3.3 |

### Exit Criteria
- All 10 tools callable via MCP
- Every tool rejects out-of-scope requests (verified by security tests)
- Every tool returns consistent error format
- Activity log records all tool calls
- Integration tests pass with mocked ADO

---

## 4. Phase 3: CLI & Setup (Week 2, Days 3-5)

**Goal:** `npm install -g sprint-pilot && sprint-pilot setup-claude` works end-to-end.

### Tasks

| # | Task | Spec Reference |
|---|------|---------------|
| 3.1 | CLI entry point with subcommand routing | `11-NPM-PACKAGE.md` §4 |
| 3.2 | `setup-claude` command: copy templates, patch .claude.json, .gitignore | `11-NPM-PACKAGE.md` §4.1 |
| 3.3 | `setup-cursor` command | `11-NPM-PACKAGE.md` §4.2 |
| 3.4 | `setup-copilot` command | `11-NPM-PACKAGE.md` §4.3 |
| 3.5 | `setup-augment` command | `11-NPM-PACKAGE.md` §4.4 |
| 3.6 | `serve` command (MCP server entry) | `11-NPM-PACKAGE.md` §4.5 |
| 3.7 | `init --reconfigure-pat` command | `11-NPM-PACKAGE.md` §4.6 |
| 3.8 | Template version detection for `--update-templates` | `11-NPM-PACKAGE.md` §7 |

### Exit Criteria
- `npm install -g sprint-pilot` installs cleanly
- `sprint-pilot setup-claude` in a project with Fabric creates all files and patches config
- AI tool (Claude CLI) can discover and call SprintPilot tools after setup
- Setup is idempotent (running twice doesn't break anything)

---

## 5. Phase 4: Instruction Files (Week 3, Days 1-3)

**Goal:** All `.md` instruction files written and tested with an AI tool.

### Tasks

| # | Task | Spec Reference |
|---|------|---------------|
| 4.1 | Write `CLAUDE.md` master instruction file | `05-CLAUDE-MD.md` |
| 4.2 | Write `workflow-overview.md` | `06-WORKFLOW-INSTRUCTIONS.md` §2 |
| 4.3 | Write `approval-points.md` | `06-WORKFLOW-INSTRUCTIONS.md` §3 |
| 4.4 | Write `ado-operations.md` | `06-WORKFLOW-INSTRUCTIONS.md` §4 |
| 4.5 | Write `git-conventions.md` | `06-WORKFLOW-INSTRUCTIONS.md` §5 |
| 4.6 | Write `quality-gate.md` | `06-WORKFLOW-INSTRUCTIONS.md` §6, `08-QUALITY-GATE.md` |
| 4.7 | Write `testing-verification.md` | `06-WORKFLOW-INSTRUCTIONS.md` §7, `09-TESTING-VERIFICATION.md` |
| 4.8 | Write `clarification-flow.md` | `06-WORKFLOW-INSTRUCTIONS.md` §8 |
| 4.9 | Write `delivery-flow.md` | `06-WORKFLOW-INSTRUCTIONS.md` §9, `10-DELIVERY-FLOW.md` |
| 4.10 | Write `session-start.md` | `06-WORKFLOW-INSTRUCTIONS.md` §10 |
| 4.11 | Write `workflow-state.md` template | `07-STATE-AS-MARKDOWN.md` §3 |
| 4.12 | Write `clarification-comment.md` template | `06-WORKFLOW-INSTRUCTIONS.md` §8 |
| 4.13 | Write `pr-description.md` template | `10-DELIVERY-FLOW.md` §5 |
| 4.14 | Test with Claude CLI: manual walkthrough of full workflow | — |

### Exit Criteria
- All instruction files written
- All template files written
- Claude CLI reads CLAUDE.md and correctly follows the autopilot flow
- AI correctly calls SprintPilot MCP tools for ADO operations
- AI correctly uses git commands for version control
- AI correctly references Fabric CLI commands
- Approval points trigger correctly (AI pauses and asks)

---

## 6. Phase 5: Testing & Polish (Week 3, Days 4-5 + Week 4)

**Goal:** End-to-end tested, documented, published.

### Tasks

| # | Task | Spec Reference |
|---|------|---------------|
| 5.1 | End-to-end test: full workflow from US selection to PR (real ADO) | All specs |
| 5.2 | Test pause/resume between multiple work items | `05-CLAUDE-MD.md` §3.5 |
| 5.3 | Test session start reminders | `05-CLAUDE-MD.md` §3.2 |
| 5.4 | Test clarification round-trip (post questions, check answers) | `06-WORKFLOW-INSTRUCTIONS.md` §8 |
| 5.5 | Test quality gate with real Fabric standards | `08-QUALITY-GATE.md` |
| 5.6 | Test browser verification with Playwright + DevTools MCP | `09-TESTING-VERIFICATION.md` |
| 5.7 | Test fix-retest cycle (shared 3 retries) | `09-TESTING-VERIFICATION.md` §7 |
| 5.8 | Test dev server lifecycle (start, wait, stop, port conflict) | `09-TESTING-VERIFICATION.md` §6 |
| 5.9 | Test edge cases: empty diff, PR exists, push rejected | `10-DELIVERY-FLOW.md` §9 |
| 5.10 | Write README.md for npm | — |
| 5.11 | Write CHANGELOG.md | — |
| 5.12 | Publish to npm | `11-NPM-PACKAGE.md` |

### Exit Criteria
- Full workflow completes successfully against real ADO instance
- All security tests pass (100% branch coverage on scope validation)
- All tool tests pass (90% coverage)
- Published to npm and installable globally
- README covers quick start, setup, and all 4 AI tool platforms

---

## 7. Risk Mitigation

| Risk | Mitigation | Phase |
|------|-----------|-------|
| Keytar not available on all platforms | File fallback with warnings | Phase 1 |
| ADO API changes or undocumented behavior | Pin API version, comprehensive error handling | Phase 2 |
| AI tool doesn't follow CLAUDE.md reliably | Test with real AI, iterate on instruction clarity | Phase 4 |
| Playwright/DevTools MCP not installed | Graceful skip with warning, don't hard-fail | Phase 5 |
| Large instruction file exceeds context window | Split into referenced sub-files, keep CLAUDE.md lean | Phase 4 |

---

## 8. Definition of Done (v1.0)

SprintPilot v1.0 is done when:

1. `npm install -g sprint-pilot` works
2. `sprint-pilot setup-claude` configures a project in under 5 minutes
3. User says "work on US-12345" and the autopilot runs through all 5 phases
4. All 7 approval points trigger correctly
5. ADO operations are security-scoped (no unauthorized access possible)
6. State persists across sessions (pause/resume works)
7. Quality gate analyzes against Fabric standards
8. Browser testing with Playwright + DevTools MCP works
9. PR is created in ADO with work item linked
10. Works with Claude CLI (primary), with setup commands for Cursor, Copilot, Augment

---

*End of development phases spec.*
