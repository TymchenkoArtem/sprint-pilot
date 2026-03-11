# Session Start

> **AI Context:** This file is loaded when `/sp-start` is invoked or at the beginning of any new SprintPilot session. You are the autopilot orchestrator. Your role is to assess the current state of all workflows, present a clear summary, and let the user decide what to do next. The expected outcome is that the user chooses an action (resume, check answers, or start new work) and you hand off to the appropriate phase.

This file defines the exact procedure you MUST follow at the beginning of every new session. Session start is the entry point to the SprintPilot autopilot. It determines whether to resume existing work, check for answers, or begin a new work item.

---

## Step 0: Check fabric/ Folder and fabric-cli Availability

Before anything else, check the environment for fabric/ docs and fabric-cli. The `sp-init` response includes a `fabric` object with `project_docs`, `product_docs`, and `cli_installed` flags.

You can also check directly:
- **Project fabric docs:** `ls fabric/` in the project root
- **fabric-cli installed:** `~/fabric/` directory exists (standard fabric-cli location)

### If `fabric/` does NOT exist

Display this warning but **continue** (do NOT stop):

```
Warning: fabric/ directory not found in this project.

SprintPilot will operate in lightweight mode:
- Standards and product docs from fabric/ will NOT be available
- Verification will use codebase analysis and general best practices instead
- For full standards-based workflow, set up fabric-cli and initialize the fabric/ folder

Continuing without fabric/ documentation...
```

### If fabric-cli is NOT installed (no `~/fabric/` directory)

Display this additional note:

```
Note: fabric-cli not detected (~/fabric/ not found).
For complex tasks, fabric-cli provides spec shaping and task breakdown.
SprintPilot will implement tasks directly using best practices.
```

### If both exist

No warning needed. Proceed silently to Step 1.

### What changes without fabric/

| Capability | With fabric/ | Without fabric/ |
|-----------|-------------|----------------|
| Standards compliance | Check against `fabric/standards/` | Analyze existing codebase patterns + general best practices |
| Product alignment | Check against `fabric/product/` | Analyze existing architecture from code |
| Verification (Phase 3) | Full standards/product/requirements review | Requirements coverage + codebase pattern analysis |
| Context for implementation | Read fabric docs for conventions | Read existing code for conventions |

### What changes without fabric-cli

| Capability | With fabric-cli | Without fabric-cli |
|-----------|----------------|-------------------|
| Complex tasks | Use `/shape-spec`, `/write-spec`, `/create-tasks`, `/implement-tasks` | Implement directly using best practices |
| Small tasks | Implement directly (no CLI needed) | Implement directly (same behavior) |

Proceed to Step 1 regardless of fabric/ availability.

---

## Step 1: Check for Existing Workflows

You MUST check the `.sprint-pilot/workflows/` directory for any subdirectories as your very first action.

- If the directory does not exist, treat it as empty.
- If the directory exists but contains no subdirectories, treat it as empty.
- If the directory contains subdirectories (e.g., `US-12345/`, `BUG-8891/`), proceed to Step 2.
- If the directory is empty, skip directly to Step 5.

---

## Step 2: Read and Parse Each Workflow

For each subdirectory found in `.sprint-pilot/workflows/`, read its `state.md` file and extract the following from the **Status** section:

- **Phase** -- The current workflow phase (idle, discovery, waiting_for_answers, development, verification, delivery, completed, paused)
- **State** -- The specific sub-state within the phase
- **Updated** -- The ISO 8601 timestamp of the last update
- **Fix cycles used** -- The number of fix-retest cycles consumed (N/3)

And from the **Work Item** section:

- **ID** -- The work item number
- **Type** -- User Story, Bug, or Task
- **Title** -- The work item title
- **Branch** -- The branch name (or "not created")
- **Token usage** -- The cumulative total from the `## Token Usage` section

Calculate the elapsed time since the `Updated` timestamp. Express it in human-readable form:
- Less than 1 hour: "{{N}} minutes ago"
- 1-24 hours: "{{N}} hours ago"
- More than 24 hours: "{{N}} days ago"

You MUST classify each workflow into one of these categories:

| Category | Condition | User Action Available |
|----------|-----------|----------------------|
| **Active -- Paused** | Phase is `paused` | Resume |
| **Active -- Waiting** | Phase is `waiting_for_answers` | Check answers, Resume |
| **Active -- In Progress** | Phase is `development`, `verification`, or `delivery` | Resume |
| **Completed** | Phase is `completed` | No action needed |
| **Idle** | Phase is `idle` or `discovery` | Resume |

You MUST NOT include completed workflows in the summary unless they were completed in the last 24 hours. Completed workflows older than 24 hours are informational only and should not be presented as actionable.

---

## Step 3: Present the Summary

Present a clear summary to the user. Group workflows by their category.

### Format for Active Workflows

```
Pending SprintPilot workflows:

1. US-12345: "Implement SSO Login"
   Phase: paused (was in development / implementing)
   Last updated: 2 hours ago
   Branch: features/12345-implement-sso-login
   Token usage: 45,200

2. BUG-8891: "Fix pagination offset in user search"
   Phase: waiting_for_answers (round 1)
   Last updated: 1 day ago
   Branch: not created
   Token usage: 8,100
```

### Highlighting Waiting Workflows

If any workflow is in `waiting_for_answers` state, you MUST highlight it with a reminder:

```
Note: BUG-8891 has been waiting for answers for 1 day. You can ask me to check for new comments.
```

**CRITICAL:** You MUST NOT automatically call `sp-get-comments` to check for answers. Only check when the user explicitly asks you to. This is a firm rule -- auto-checking would generate unexpected ADO API calls.

### Format for Recently Completed Workflows

```
Recently completed:
- US-12401: "Add CSV export to reports" -- PR #92 created (3 hours ago)
```

---

## Step 4: Present Options

After the summary, present the available options to the user. Tailor the options based on what workflows exist.

### When Paused Workflows Exist

```
What would you like to do?
- "Resume US-12345" -- continue from where it paused
- "Check answers on BUG-8891" -- check for new ADO comments
- "Start new work item" -- begin a new workflow
- "Show my work items" -- list your assigned items from ADO
```

### When Only Waiting Workflows Exist

```
What would you like to do?
- "Check answers on BUG-8891" -- check for new ADO comments
- "Start new work item" -- begin a new workflow
- "Show my work items" -- list your assigned items from ADO
```

### When Only In-Progress Workflows Exist

```
What would you like to do?
- "Resume US-12345" -- continue from the current phase
- "Start new work item" -- begin a new workflow
```

You MUST NOT present options that do not apply. For example, do not offer "Check answers" if no workflows are in `waiting_for_answers` state.

**STOP -- Wait for user response before continuing.**

You MUST wait for the user's response before taking any action.

---

## Step 5: When No Workflows Exist

If no active workflow files were found (or all are completed), automatically fetch assigned work items and present them for selection:

1. Call `sp-my-items` to fetch the user's assigned work items.
2. Present the results grouped by type (User Story, Bug, Task) and state.
3. Let the user pick one, or provide a specific work item ID.

```
No pending SprintPilot workflows found. Here are your assigned work items:

[results from sp-my-items]

Which item would you like to work on? You can also say "Work on US-{id}" for a specific item.
```

When no active workflows exist, automatically fetch assigned work items using `sp-my-items` and present them for selection.

**STOP -- Wait for user response before continuing.**

---

## Step 6: Handling the User's Choice

### Resume a Paused Workflow

When the user says "Resume US-{{ID}}" or similar:

1. Read the workflow state file `.sprint-pilot/workflows/{{TYPE}}-{{ID}}/state.md`.
2. Verify the phase is `paused`. If it is not paused (e.g., it is `waiting_for_answers`), inform the user of the actual state and suggest the appropriate action.
3. Determine the phase it was paused from: the state field will be `paused_from_{{PHASE}}`.
4. Checkout the branch: `git checkout {{BRANCH_NAME}}`
   - If the branch does not exist locally: `git fetch origin && git checkout {{BRANCH_NAME}}`
   - If checkout fails: report the error and ask the user how to proceed.
5. If a stash reference exists in the state file:
   - Run `git stash list` to find the stash by message `sprint-pilot:{{TYPE}}-{{ID}}`.
   - Run `git stash pop stash@{N}` with the matching stash index.
   - If the stash pop fails (conflicts): report the conflict and ask the user to resolve it manually.
6. Update the workflow state:
   - Restore the phase to the one before pause (e.g., `paused_from_development` becomes `development`).
   - Restore the sub-state to the last known sub-state before pause.
   - Update the `Updated` timestamp.
   - Append a checkpoint: `Resumed from {{PHASE}}`
7. Log: `RESUME` in the activity log with the work item ID.
8. Continue the autopilot from the resumed phase. Do NOT restart from Phase 1.

### Check Answers on a Waiting Workflow

When the user says "Check answers on US-{{ID}}" or similar:

1. Read the workflow state file to confirm it is in `waiting_for_answers` state.
2. Call `sp-get-comments` with the work item ID.
3. Find the last SprintPilot comment by looking for the `isSprintPilot` flag.
4. Identify all comments posted after SprintPilot's last comment.
5. **If new comments exist:**
   - Analyze each comment against the original questions in the workflow state.
   - Map answers to questions.
   - Determine: fully answered, partially answered, or unrelated.
   - **Fully answered:** Report the answers to the user. Update the Clarifications section in the state file. Update state to `development` phase. Ask the user: "All questions answered. Proceed to Phase 2 (Branch + Development)?"
   - **Partially answered:** Report which questions were answered and which remain. Ask the user: "Some questions remain unanswered. Post follow-up questions? Or proceed with what we have?"
6. **If no new comments:**
   - Inform the user: "No new comments on {{TYPE}}-{{ID}} since the questions were posted ({{TIME_ELAPSED}} ago)."
   - Do NOT change the workflow state.
   - Suggest: "You can check again later, or proceed without answers."
7. Log: `GET-COMMENTS` in the activity log.

### Start a New Work Item

When the user says "Start new work item", "Show my work items", or "Work on US-{{ID}}":

- **"Show my work items":** Call `sp-my-items`. Present the results grouped by type (User Story, Bug, Task) and state. Let the user pick one.
- **"Work on US-{{ID}}":** Begin the autopilot at Phase 1 (Discovery) with the specified work item ID. After the user selects a work item, return to CLAUDE.md Phase 1: Discovery.

Before starting a new work item, check if any in-progress workflows need to be paused first. If a branch is currently checked out for another workflow, you MUST pause that workflow before starting the new one.

---

## Rules Summary

1. You MUST check for existing workflows at the start of every session.
2. **CRITICAL:** You MUST NOT auto-check ADO for answers on waiting workflows.
3. When no active workflows exist, automatically call `sp-my-items` to present available work items.
4. You MUST present a clear summary with elapsed time for each workflow.
5. You MUST wait for the user's explicit choice before taking action.
6. You MUST NOT present options that do not apply to the current state.
7. You MUST pause any in-progress workflow before starting a new one.
8. You MUST handle stash references when resuming paused workflows.
9. You MUST update the workflow state file and activity log for every resume, check, or start action.
10. You MUST NOT restart from Phase 1 when resuming -- continue from the paused phase.
