---
description: 'Resume a paused SprintPilot workflow'
---

You are executing the `/sp-resume` command. This resumes a workflow that was previously paused (via the pause procedure or session interruption). It restores the git branch, pops any stashed changes, and continues the autopilot from the phase where it was paused.

## Prerequisites

### Check 1: Find paused workflows

Read all `state.md` files in `.sprint-pilot/workflows/*/`. Parse the Phase field from each.

- If multiple workflows are in `paused` phase: list them with their details and ask the user which one to resume.

```
Multiple paused workflows found:

1. US-12345: "Implement SSO Login"
   Paused from: development / implementing
   Last updated: 2 hours ago
   Branch: features/12345-implement-sso-login

2. TASK-9012: "Update deployment script"
   Paused from: quality / analyzing
   Last updated: 5 hours ago
   Branch: features/9012-update-deployment-script

Which workflow would you like to resume? Say the number or ID.
```

STOP: Wait for the user to select a workflow.

- If exactly one workflow is in `paused` phase: present it and confirm with the user before resuming.

```
Found one paused workflow:

US-12345: "Implement SSO Login"
Paused from: development / implementing
Last updated: 2 hours ago
Branch: features/12345-implement-sso-login

Resume this workflow?
```

STOP: Wait for the user to confirm.

- If no workflows are in `paused` phase: check for `waiting_for_answers` workflows. If found, suggest running `/sp-check-answers` instead. If none found either, report "No paused or waiting workflows found." and suggest `/sp-start` or `/sp-status`. Do NOT proceed further.

### Check 2: Load session-start instructions

```
Tool: sp-instructions
Parameters: { "name": "session-start" }
```

Read the response for the resume procedure details.

## Resume Procedure

Once the user confirms which workflow to resume:

### Step 1: Read the workflow state file

Read `.sprint-pilot/workflows/{TYPE}-{ID}/state.md` to determine:
- The phase it was paused from (`paused_from_{PHASE}` in the State field)
- The branch name
- Whether a stash reference exists

### Step 2: Checkout the branch

```bash
git fetch origin
git checkout {BRANCH_NAME}
```

If the branch does not exist locally, `git checkout` will create a tracking branch from `origin/{BRANCH_NAME}`.

If checkout fails: report the error and ask the user how to proceed. Do NOT continue automatically.

### Step 3: Pop stash (if applicable)

If a stash reference exists in the state file:

```bash
# Find the stash by message
git stash list
# Look for the entry with message "sprint-pilot:{TYPE}-{ID}"
# Pop the matching stash
git stash pop stash@{N}
```

If the stash pop fails due to conflicts: report the conflict to the user. Ask them to resolve conflicts manually before continuing.

If no stash reference exists: skip this step.

### Step 4: Update workflow state

1. Restore the phase to the one before pause (e.g., `paused_from_development` becomes `development`).
2. Restore the sub-state to the last known sub-state before pause.
3. Update the `Updated` timestamp to current ISO 8601 time.
4. Append checkpoint: `{timestamp} -- Resumed from {PHASE}`

### Step 5: Log the resume

Log `RESUME` in the per-item activity log at `.sprint-pilot/workflows/{TYPE}-{ID}/activity.md`.

### Step 6: Continue the autopilot

CRITICAL: Continue from the phase where the workflow was paused. Do NOT restart from Phase 1.

- If paused from `development`: continue implementing (check what sub-state was active -- shaping_spec, writing_spec, creating_tasks, or implementing).
- If paused from `quality`: re-run the quality gate analysis.
- If paused from `testing`: check if a test plan exists. If yes, continue from test execution. If no, start test plan creation.
- If paused from `delivery`: continue from the delivery step that was interrupted.

The full phase procedures are defined in CLAUDE.md. Load it if not already loaded:

```
Tool: sp-instructions
Parameters: { "name": "CLAUDE" }
```

## After Completing This

- The autopilot continues from the resumed phase as described in CLAUDE.md.
- To pause again at any time: the user can say "pause" and the pause procedure will be followed.
- To see all workflow statuses: `/sp-status`.
- To start a different workflow: `/sp-start`.
