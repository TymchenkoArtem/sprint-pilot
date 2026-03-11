# Workflow Overview

> **AI Context:** This is a quick-reference card. It summarizes the autopilot phases, approval points, tool usage, and state transitions at a glance. For detailed procedures, always consult the specific instruction file referenced in each section (e.g., `sp-verify.md` for verification). If this card conflicts with a detailed instruction file, the detailed file takes precedence.

---

## The 4-Phase Autopilot

```
  User says "work on US-{id}"
           |
           v
  +------------------+
  | Phase 1:         |
  | Discovery        |-----> waiting_for_answers (optional)
  +------------------+                |
           |                   answers arrive
           v                          |
  +------------------+ <--------------+
  | Phase 2:         |
  | Branch + Dev     |  (includes unit test creation)
  +------------------+
           |
           v
  +------------------+
  | Post-Impl:       |
  | Auto-Run Tests   |-----> fix loop (max 3 attempts)
  +------------------+
           |
           v
  +------------------+
  | Phase 3:         |
  | Verification     |-----> fix loop (max 2 re-runs)
  | (sp-verify)      |
  +------------------+
           |
           v
  +------------------+
  | Phase 4:         |
  | Delivery         |
  +------------------+
           |
           v
       completed
```

Any phase can transition to `paused` if the user switches to another work item.

The Post-Implementation step is NOT a separate phase. It is a mandatory gate between Phase 2 and Phase 3.

---

## Phase 1: Discovery

```
User says "work on US-{id}"
  |
  +-- sp-get-item -------------- fetch work item details
  +-- sp-get-comments ---------- read existing comments
  +-- Read fabric/standards/ --- load coding standards
  +-- Read fabric/product/ ----- load product documentation
  +-- AI analysis -------------- analyze scope and requirements
  +-- Create workflow state file
  |
  +-- Questions needed?
  |     |
  |     +-- YES
  |     |     |
  |     |     +-- Present numbered questions to user
  |     |     +-- APPROVAL #1: Post questions to ADO?
  |     |     |     +-- Approve --> sp-post-comment (formatted HTML)
  |     |     |     +-- Edit -----> user modifies, then sp-post-comment
  |     |     |     +-- Skip -----> proceed without asking
  |     |     |
  |     |     +-- APPROVAL #2: Update status to Blocked?
  |     |     |     +-- Approve --> sp-update-status "blocked"
  |     |     |     +-- Skip -----> leave status unchanged
  |     |     |
  |     |     +-- State: waiting_for_answers
  |     |     +-- Suggest switching to another work item
  |     |
  |     +-- NO --> Proceed to Phase 2
```

**Sub-states:** `analyzing` --> `questions_generated` --> `questions_posted`

---

## Phase 2: Branch + Development

```
  +-- Generate branch name from config template
  +-- APPROVAL #3: Create branch '{name}'?
  |     +-- Approve --> sp-create-branch
  |     +-- Edit -----> user provides name, then sp-create-branch
  |
  +-- git fetch origin && git checkout {branch}
  |
  +-- APPROVAL #4: Update status to In Progress?
  |     +-- Approve --> sp-update-status "inProgress"
  |     +-- Skip -----> leave status unchanged
  |
  +-- Compile spec context (US + clarifications + standards + product)
  |
  +-- Fabric CLI sequence (each step: fail --> ask "Retry or skip?")
  |     |
  |     +-- /shape-spec --- shape the specification
  |     +-- /write-spec --- write the specification
  |     +-- /create-tasks - break into implementation tasks
  |     +-- /implement-tasks - implement all tasks (INCLUDING unit tests)
  |
  +-- Update workflow state after each Fabric step
```

**CRITICAL:** Implementation MUST include creating unit tests. Tests are part of development, not a separate phase.

**Sub-states:** `branched` --> `shaping_spec` --> `writing_spec` --> `creating_tasks` --> `implementing`

---

## Post-Implementation: Auto-Run Tests

This runs automatically after Phase 2 completes. It catches regressions before Verification.

```
  +-- Read test command from config (testing.testCommand)
  |     +-- No command configured? --> skip with warning, go to Phase 3
  |
  +-- Run test command, capture output
  +-- Analyze results: total, passed, failed, skipped
  |
  +-- All pass? --> Log results, proceed to Phase 3
  +-- Failures?
        |
        +-- Analyze: new implementation vs. pre-existing failures
        +-- Fix implementation-related failures (no approval needed)
        +-- Re-run tests after each fix (max 3 attempts)
        +-- Still failing after 3 attempts?
              +-- Report to user
              +-- Ask: proceed to Phase 3 or pause for manual intervention
```

This is part of the development cycle, not a separate phase. Token usage is tracked under `Development`.

---

## Phase 3: Verification (sp-verify)

```
  +-- git diff {base}..HEAD -------- get all changes
  +-- Read fabric/standards/ ------- load ALL standards
  +-- Read fabric/product/ --------- load ALL product docs
  +-- Read workflow state ---------- load requirements + acceptance criteria
  +-- Read spec + tasks files ------ load implementation spec
  +-- AI analysis ------------------ analyze diff against all 3 sources
  |
  +-- File-by-file analysis:
  |     +-- Standards compliance
  |     +-- Product alignment
  |     +-- Test coverage audit
  |
  +-- Requirements traceability:
  |     +-- Map every AC to implementing code
  |     +-- Flag gaps (AC without code)
  |
  +-- Scope audit:
  |     +-- Flag code not in requirements (scope creep)
  |
  +-- Produce findings with severity:
  |     +-- error --- blocks delivery (must fix or override)
  |     +-- warning - acknowledged, logged, does not block
  |     +-- info ---- informational only
  |
  +-- Write verification report to workflow state
  |
  +-- Errors found?
  |     |
  |     +-- YES
  |     |     |
  |     |     +-- APPROVAL #5: Fix violations or override?
  |     |           +-- Fix -------> AI applies fixes, re-run (max 2 re-runs)
  |     |           +-- Override --> log override with reason, continue
  |     |
  |     +-- NO --> Continue to Phase 4
```

**Sub-states:** `analyzing` --> `violations_found` | `passed`

---

## Phase 4: Delivery

```
  +-- Pre-squash checks
  |     +-- Verify correct branch
  |     +-- Verify changes exist
  |     +-- Verify no uncommitted changes
  |
  +-- Squash: git merge-base + git reset --soft {base}
  +-- Generate commit message from config template
  |
  +-- APPROVAL #6: Commit and push?
  |     +-- Approve --> git commit + git push -u origin {branch}
  |     +-- Edit -----> user modifies message, then commit + push
  |
  +-- Generate PR description from template
  |
  +-- APPROVAL #7: Create PR?
  |     +-- Approve --> sp-create-pr (with work item link + sprint tag)
  |     +-- Edit -----> user modifies description, then sp-create-pr
  |
  +-- APPROVAL #8: Update status to In Review?
  |     +-- Approve --> sp-update-status "inReview"
  |     +-- Skip -----> leave status unchanged
  |
  +-- Mark workflow completed in state file
  +-- Report: "US-{id} complete. PR #{pr_id} created. URL: {url}"
```

**Sub-states:** `preparing_commit` --> `committed` --> `creating_pr` --> `pr_created`

---

## Tool Usage Summary

| Action | Tool | Type |
|---|---|---|
| Fetch assigned work items | `sp-my-items` | SprintPilot MCP |
| Read work item details | `sp-get-item` | SprintPilot MCP |
| Read work item comments | `sp-get-comments` | SprintPilot MCP |
| Post comment to work item | `sp-post-comment` | SprintPilot MCP |
| Update work item status | `sp-update-status` | SprintPilot MCP |
| Create branch in ADO | `sp-create-branch` | SprintPilot MCP |
| Create pull request | `sp-create-pr` | SprintPilot MCP |
| Get sprint iterations | `sp-get-iterations` | SprintPilot MCP |
| Git operations (checkout, diff, commit, push) | `git ...` | Shell command |
| Fabric CLI (shape-spec, write-spec, etc.) | `/shape-spec`, `/write-spec`, `/create-tasks`, `/implement-tasks` | Fabric CLI |
| Read standards and product docs | File read | Direct |
| Verification analysis, fix generation | AI reasoning | Direct |

---

## Approval Points Summary

All approval points are marked with the symbol below. The AI MUST stop and wait for an explicit user response at each one.

| # | Approval | Phase | Options |
|---|---|---|---|
| 1 | Post clarification questions | Discovery | Approve / Edit / Skip |
| 2 | Update status to Blocked | Discovery | Approve / Skip |
| 3 | Create branch | Branch + Dev | Approve / Edit |
| 4 | Update status to In Progress | Branch + Dev | Approve / Skip |
| 5 | Verification violations | Verification | Fix / Override |
| 6 | Commit and push | Delivery | Approve / Edit |
| 7 | Create pull request | Delivery | Approve / Edit |
| 8 | Update status to In Review | Delivery | Approve / Skip |

---

## State Transitions

```
                              +-------------------+
                              |      idle         |
                              +-------------------+
                                       |
                                       v
                              +-------------------+
                    +-------->|    discovery       |
                    |         +-------------------+
                    |            |             |
                    |            v             v
                    |   +-----------------+   |
                    |   | waiting_for_    |   |
                    |   | answers         |   |
                    |   +-----------------+   |
                    |            |             |
                    |            +------+------+
                    |                   |
                    |                   v
                    |         +-------------------+
                    |         |   development     |
                    |         +-------------------+
                    |                   |
  +-----------+     |                   v
  |  paused   |<----+         +-------------------+
  | (any      |<----+         |   verification    |
  |  phase)   |<----+         +-------------------+
  +-----------+     |                   |
       |            |                   v
       |            |         +-------------------+
       +------------+-------->|    delivery       |
     (resume)                 +-------------------+
                                       |
                                       v
                              +-------------------+
                              |   completed       |
                              +-------------------+
```

### Pause / Resume

- **Pause:** Any active phase can transition to `paused`. The AI stashes uncommitted changes and checks out the base branch.
- **Resume:** The AI reads the state file, checks out the workflow branch, pops the stash if one exists, and continues from the paused phase.
- **Waiting for answers:** This is a natural pause point. The user is encouraged to switch to another work item while waiting for clarification responses.

---

## Quick Decision Reference

| Situation | Action |
|---|---|
| User says "work on US-{id}" | Start Phase 1: Discovery |
| User says "check answers on US-{id}" | Read comments, analyze, resume if answered |
| User says "resume US-{id}" | Restore branch + stash, continue from paused phase |
| User says "pause" or "switch to US-{id}" | Stash, update state to paused, start new workflow |
| User says "show my work items" | Call `sp-my-items`, present results |
| Verification finds errors | Present findings, ask Fix or Override |
| Post-implementation tests fail | Fix implementation-related failures (max 3 attempts), no approval needed |
| PR already exists for branch | Inform user, skip PR creation, continue to status update |
| No changes in diff | Inform user, skip PR, offer to close workflow |
