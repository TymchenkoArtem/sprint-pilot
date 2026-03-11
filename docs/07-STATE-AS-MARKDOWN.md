# 07 — State as Markdown

**Parent:** `00-MASTER-OVERVIEW.md`
**Related:** `05-CLAUDE-MD.md`, `06-WORKFLOW-INSTRUCTIONS.md`

---

## 1. Philosophy

Workflow state is stored as human-readable `.md` files that the AI tool reads and writes directly. No JSON, no database, no custom file format. The AI understands markdown natively — it can read, update, and reason about it without any special parsing.

This also means a human can read the state file and immediately understand what's happening with any work item.

---

## 2. State File Location

```
.sprint-pilot/workflows/
├── US-12345.md
├── US-12401.md
├── BUG-8891.md
└── TASK-5501.md
```

Naming convention: `{WorkItemType-abbreviation}-{id}.md`
- User Story → `US-{id}.md`
- Bug → `BUG-{id}.md`
- Task → `TASK-{id}.md`

---

## 3. State File Template

File: `.sprint-pilot/templates/workflow-state.md`

```markdown
# {TYPE}-{ID}: {Title}

## Status
- Phase: {idle|discovery|waiting_for_answers|development|quality|testing|delivery|completed|paused}
- State: {specific sub-state}
- Updated: {ISO 8601 timestamp}
- Fix cycles used: {0-3}/3

## Work Item
- ID: {number}
- Type: {User Story|Bug|Task}
- Title: {string}
- ADO State: {current ADO state}
- Iteration: {iteration path}
- Branch: {branch name or "not created"}

## Description
{Full description from ADO}

## Acceptance Criteria
{Acceptance criteria from ADO}

## Clarifications
{Empty initially. Populated during clarification rounds.}

## Quality Gate
{Not yet run. Updated after quality gate execution.}

## Test Results
{Not yet run. Updated after testing.}

## Checkpoints
{Timestamped log of every phase transition.}
```

---

## 4. State Values

### 4.1 Phases

| Phase | Meaning |
|-------|---------|
| `idle` | Just created, not yet analyzed |
| `discovery` | Analyzing scope |
| `waiting_for_answers` | Clarification questions posted, waiting for responses |
| `development` | Branch created, Fabric CLI commands in progress |
| `quality` | Quality gate analysis in progress |
| `testing` | Running tests (unit + browser) |
| `delivery` | Committing and creating PR |
| `completed` | PR created, workflow done |
| `paused` | User paused to work on something else |

### 4.2 Specific Sub-States

| Phase | Possible States |
|-------|----------------|
| `discovery` | `analyzing`, `questions_generated`, `questions_posted` |
| `waiting_for_answers` | `round_1`, `round_2`, `round_3` |
| `development` | `branched`, `shaping_spec`, `writing_spec`, `creating_tasks`, `implementing` |
| `quality` | `analyzing`, `violations_found`, `passed` |
| `testing` | `running_unit_tests`, `running_browser_tests`, `fix_cycle_1`, `fix_cycle_2`, `fix_cycle_3`, `passed` |
| `delivery` | `preparing_commit`, `committed`, `creating_pr`, `pr_created` |
| `paused` | `paused_from_{previous_phase}` |

---

## 5. Example: Full Lifecycle State File

```markdown
# US-12345: Implement SSO Login

## Status
- Phase: completed
- State: pr_created
- Updated: 2026-03-04T15:46:40Z
- Fix cycles used: 1/3

## Work Item
- ID: 12345
- Type: User Story
- Title: Implement SSO login
- ADO State: Resolved
- Iteration: MyProject\Sprint 14
- Branch: features/12345-implement-sso-login

## Description
As a user, I want to log in using my company's SSO provider so that I don't need a separate password for this application.

## Acceptance Criteria
1. Support SAML 2.0 and OAuth 2.0 providers
2. Session timeout at 30 minutes
3. Graceful error handling for failed authentication
4. Redirect to original requested page after login

## Clarifications
### Round 1 (posted 2026-03-03 10:00 UTC, comment ID: 1001)
- Q: Which SSO providers should be supported? → A: SAML 2.0 and OAuth 2.0 (both required)
- Q: Should MFA be included in this US? → A: No, separate US for MFA
- Q: Session timeout: product doc says 30min, US says 1hr — which? → A: 30min per product doc
- Q: Error handling acceptance criteria needed? → A: Yes, added: "Graceful error handling for failed auth"

## Quality Gate
- Run date: 2026-03-04 15:30 UTC
- Standards: PASS
- Product alignment: PASS
- Requirements coverage: PASS (4/4 acceptance criteria covered)
- Violations: none

## Test Results
### Run 1 (2026-03-04 15:35 UTC)
- Unit tests: 24 passed, 2 failed
- Failures: SSO redirect flow (expected /dashboard, got /login), Session timeout (not triggered at 30min)
- Fix cycle 1 approved

### Run 2 (2026-03-04 15:42 UTC)
- Unit tests: 26 passed, 0 failed
- Browser tests: all acceptance criteria verified
- Console errors: none
- Network failures: none
- Performance: page load 1.2s (acceptable)
- Accessibility: no issues

## Checkpoints
- 2026-03-03 09:30 — Created, discovery started
- 2026-03-03 09:31 — Scope analyzed, 4 questions identified
- 2026-03-03 10:00 — Questions posted to ADO (round 1, comment 1001)
- 2026-03-03 10:01 — Status updated: Active → Blocked (approved)
- 2026-03-03 10:02 — Paused, switched to US-12401
- 2026-03-04 14:00 — Resumed from waiting_for_answers
- 2026-03-04 14:00 — Answers checked, all 4 questions resolved
- 2026-03-04 14:01 — Branch created: features/12345-implement-sso-login (approved)
- 2026-03-04 14:01 — Status updated: Blocked → Active (approved)
- 2026-03-04 14:05 — /shape-spec completed
- 2026-03-04 14:15 — /write-spec completed
- 2026-03-04 14:20 — /create-tasks completed
- 2026-03-04 15:00 — /implement-tasks completed
- 2026-03-04 15:30 — Quality gate: PASS
- 2026-03-04 15:35 — Test run 1: 2 failures
- 2026-03-04 15:36 — Fix-retest cycle 1 approved
- 2026-03-04 15:42 — Test run 2: all passed
- 2026-03-04 15:45 — Committed: #12345: implement sso login (approved)
- 2026-03-04 15:46 — PR #89 created (approved)
- 2026-03-04 15:46 — Status updated: Active → Resolved (approved)
- 2026-03-04 15:46 — Workflow completed
```

---

## 6. AI Read/Write Conventions

### 6.1 Reading State

The AI should read the entire file before taking any action. Key fields to check:
- `Phase` — determines which batch of steps to execute
- `State` — determines the specific step within the phase
- `Fix cycles used` — determines if more retries are available
- `Branch` — determines which branch to checkout on resume

### 6.2 Updating State

When updating, the AI should:
1. Read the current file
2. Update only the changed sections
3. Always update `Updated` timestamp
4. Always append to `Checkpoints`
5. Write the entire file back

### 6.3 Concurrent Access

Since only one AI session runs at a time per project, there are no concurrency concerns. The AI is the sole writer.

---

## 7. Activity Log Format

File: `.sprint-pilot/activity.md`

```markdown
# SprintPilot Activity Log

## 2026-03-03

- 09:30 [INIT] Project initialized: MyProject @ https://dev.azure.com/my-org
- 10:00 [MY-ITEMS] Queried items: 12 found (5 US, 4 Bug, 3 Task)
- 10:01 [GET-ITEM] Read US-12345: "Implement SSO login"
- 10:01 [QUALITY-GATE] Analyzed scope: 4 clarification questions
- 10:01 [APPROVE] User approved posting clarification questions
- 10:01 [POST-COMMENT] Comment posted on US-12345 (round 1, 4 questions)
- 10:02 [APPROVE] User approved status change: Active → Blocked
- 10:02 [UPDATE-STATUS] US-12345: Active → Blocked
- 10:02 [PAUSE] US-12345 paused at waiting_for_answers

## 2026-03-04

- 14:00 [RESUME] US-12345 resumed from waiting_for_answers
- 14:00 [GET-COMMENTS] Read comments on US-12345: 1 new response
- 14:00 [QUALITY-GATE] Answers analyzed: all 4 resolved
- 14:01 [APPROVE] User approved branch: features/12345-implement-sso-login
- 14:01 [CREATE-BRANCH] Branch created from develop
...
```

---

*End of state-as-markdown spec.*
