# 05 — CLAUDE.md Specification

**Parent:** `00-MASTER-OVERVIEW.md`
**Related:** `06-WORKFLOW-INSTRUCTIONS.md`, `07-STATE-AS-MARKDOWN.md`

---

## 1. Purpose

The `CLAUDE.md` file is the master instruction file that teaches the AI tool how to orchestrate the entire SprintPilot workflow. It is the "brain" — the AI reads it and follows the autopilot process, calling SprintPilot MCP tools for ADO operations and handling everything else natively.

Equivalent files for other AI tools: `.cursorrules` (Cursor), `copilot-instructions.md` (Copilot), Augment rules.

---

## 2. Location

Installed by `sprint-pilot setup-claude` to:
- Claude CLI: `.sprint-pilot/instructions/CLAUDE.md` (referenced from project CLAUDE.md or `.claude/commands/`)
- The project's root `CLAUDE.md` should include a reference: `See .sprint-pilot/instructions/CLAUDE.md for SprintPilot workflow.`

---

## 3. CLAUDE.md Content Specification

The file must cover these sections in this order:

### 3.1 Identity Block

```markdown
# SprintPilot — Autopilot Workflow

You have access to the SprintPilot MCP server, which provides secure, scoped access to Azure DevOps. You also have access to Playwright MCP and Chrome DevTools MCP for browser testing.

Your role: orchestrate the full development workflow from work item selection to pull request, following the process below. You handle git, Fabric CLI commands, testing, quality analysis, and state management directly. You use SprintPilot MCP only for Azure DevOps operations.
```

### 3.2 Session Start Rules

```markdown
## On Session Start

When a new session begins:
1. Check if `.sprint-pilot/workflows/` contains any `.md` files
2. If yes, read each and summarize the status to the user:
   - Which US, current phase, how long it's been in that state
   - If any are in "waiting_for_answers" state, remind the user (but do NOT auto-check ADO)
3. Ask the user what they'd like to do:
   - Resume a paused workflow
   - Check answers on a waiting workflow
   - Start a new work item
```

### 3.3 Autopilot Flow

```markdown
## The Autopilot Flow

When the user says "work on US-{id}" or "start US-{id}" or selects a work item:

### Phase 1: Discovery
1. Call `/sp-get-item` with the ID
2. Call `/sp-get-comments` to read existing comments
3. Read `fabric/standards/` directory contents
4. Read `fabric/product/` directory contents
5. Analyze the US against standards and product docs
6. Create `.sprint-pilot/workflows/US-{id}.md` from template
7. If clarification questions are needed:
   a. Present questions to user
   b. ⏸ APPROVAL: "Post these questions to ADO?" (approve / edit / skip)
   c. If approved: call `/sp-post-comment` with formatted HTML
   d. ⏸ APPROVAL: "Update status to Blocked?" (approve / skip)
   e. If approved: call `/sp-update-status` with "blocked"
   f. State: waiting_for_answers — suggest switching to another US
8. If no questions: proceed to Phase 2

### Phase 2: Branch + Development
1. Generate branch name from template in config.md
2. ⏸ APPROVAL: "Create branch '{name}'?" (approve / edit)
3. Call `/sp-create-branch`
4. Run locally: `git fetch origin && git checkout {branch}`
5. ⏸ APPROVAL: "Update status to In Progress?" (approve / skip)
6. If approved: call `/sp-update-status` with "inProgress"
7. Compile spec context (US details + clarifications + standards + product)
8. Run Fabric CLI commands in sequence:
   - /shape-spec (with compiled context)
   - /write-spec
   - /create-tasks
   - /implement-tasks
   Each command: if fails, ask user "Retry or skip?"
9. Update workflow state after each step

### Phase 3: Quality Gate
1. Run `git diff {base}..HEAD` to get all changes
2. Read `fabric/standards/`, `fabric/product/`, US requirements from workflow state
3. Analyze the diff against all three sources
4. Report findings with severity (error / warning / info)
5. If errors found:
   a. ⏸ APPROVAL: "Fix violations or override?" (fix / override)
   b. If fix: apply fixes, re-run quality gate
   c. If override: log override in workflow state, continue

### Phase 4: Testing
1. Run existing test suite: detect command from config.md, execute
2. If tests pass: proceed to browser testing
3. If tests fail: ⏸ APPROVAL: "Approve fix-retest cycle 1/3?" (approve / stop)
4. Start dev server (auto-detected from config.md)
5. Use Playwright MCP:
   - Navigate to app URL
   - Execute acceptance criteria as test scenarios
   - Capture screenshots on failure
6. Use Chrome DevTools MCP:
   - Check console for JS errors
   - Check network for failed requests
   - Performance/load time check
   - Accessibility check
7. Stop dev server
8. If failures: ⏸ APPROVAL: "Approve fix-retest cycle N/3?"
9. Max 3 retries shared across all test types

### Phase 5: Delivery
1. Run: `git add -A && git reset --soft {base-commit}` to squash
2. Generate commit message from config template
3. ⏸ APPROVAL: "Commit '{message}'?" (approve / edit)
4. Run: `git commit -m "{message}" && git push -u origin {branch}`
5. Generate PR description from template
6. ⏸ APPROVAL: "Create PR to {target}?" (approve / edit)
7. Call `/sp-create-pr`
8. ⏸ APPROVAL: "Update status to In Review?" (approve / skip)
9. If approved: call `/sp-update-status` with "inReview"
10. Mark workflow complete in state file
11. Report: "US-{id} complete. PR #{pr_id} created. URL: {url}"
```

### 3.4 Approval Protocol

```markdown
## Approval Points

There are 7 types of approvals. When you reach one:
1. Stop and present the decision clearly
2. Show what you're proposing (questions, branch name, commit message, etc.)
3. Wait for the user's response
4. Only proceed after explicit approval
5. If the user edits: use their version
6. If the user skips: log the skip and move to the next step
7. NEVER batch multiple approvals — always one at a time, sequentially
```

### 3.5 Pause/Resume Rules

```markdown
## Pause and Resume

When the user wants to switch to another US:
1. Update current workflow state to "paused" with current phase
2. Run: `git stash push -m "sprint-pilot:US-{id}"` if there are uncommitted changes
3. Record stash ref in workflow state
4. Run: `git checkout {base-branch}`
5. Start the new US workflow

When resuming:
1. Read workflow state to find where it paused
2. Run: `git checkout {branch}`
3. If stash ref exists: `git stash pop`
4. Continue the autopilot from the paused phase
```

### 3.6 Check Answers Rules

```markdown
## Checking Clarification Answers

When the user asks to check answers on a waiting US:
1. Call `/sp-get-comments` for the work item
2. Find the last SprintPilot comment (by `isSprintPilot` flag)
3. Identify all comments posted after SprintPilot's last comment
4. Analyze responses against the original questions
5. If all answered: update state, proceed to Phase 2
6. If partially answered: present findings, ask if user wants to post follow-up questions
7. If no new comments: inform user, no state change
```

### 3.7 State Management Rules

```markdown
## State Management

Workflow state is stored as `.md` files in `.sprint-pilot/workflows/`.
- Read the state file before every action to know where you are
- Update the state file after every significant step
- Follow the template in `.sprint-pilot/templates/workflow-state.md`
- Always update the "Updated" timestamp
- Always append to the Checkpoints section
- See `07-STATE-AS-MARKDOWN.md` for the full format specification
```

### 3.8 Activity Logging Rules

```markdown
## Activity Logging

Append every significant action to `.sprint-pilot/activity.md`:
- Format: `- HH:MM [CATEGORY] Description`
- Add a date header (`## YYYY-MM-DD`) for each new day
- Categories: INIT, MY-ITEMS, GET-ITEM, POST-COMMENT, UPDATE-STATUS, CREATE-BRANCH, CREATE-PR, GET-ITERATIONS, QUALITY, TEST, COMMIT, PUSH, PAUSE, RESUME, APPROVE, REJECT, OVERRIDE, ERROR
- Log blocked/rejected operations with reason
```

---

## 4. CLAUDE.md File Size Considerations

The full CLAUDE.md with all sections will be approximately 3,000-4,000 words. This is within Claude CLI's instruction file limits. However, detailed reference material (ADO operations, templates, test verification steps) should remain in separate instruction files that CLAUDE.md references:

```markdown
For ADO operation details, see `.sprint-pilot/instructions/ado-operations.md`
For testing procedures, see `.sprint-pilot/instructions/testing-verification.md`
For clarification comment format, see `.sprint-pilot/templates/clarification-comment.md`
```

This keeps CLAUDE.md focused on the flow and decision logic, with details in referenced files.

---

*End of CLAUDE.md spec.*
