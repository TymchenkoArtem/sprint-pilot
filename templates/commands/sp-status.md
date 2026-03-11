---
description: 'Show current SprintPilot workflow status'
---

You are executing the `/sp-status` command. This reads all workflow state files and presents a summary of current and recent SprintPilot workflows. It is a read-only operation -- it does not modify any state or call any MCP tools.

## Procedure

### Step 1: Read workflow files

List all subdirectories in `.sprint-pilot/workflows/`. For each subdirectory, read the `state.md` file.

If `.sprint-pilot/workflows/` does not exist or contains no subdirectories, report:

```
No SprintPilot workflows found. Use /sp-start to begin.
```

Do NOT proceed further.

### Step 2: Parse each state file

From each `state.md`, extract:

From the **Status** section:
- **Phase** -- current phase (idle, discovery, waiting_for_answers, development, quality, testing, delivery, completed, paused)
- **State** -- specific sub-state within the phase
- **Updated** -- ISO 8601 timestamp
- **Fix cycles used** -- N/3

From the **Work Item** section:
- **ID** -- work item number
- **Type** -- User Story, Bug, or Task
- **Title** -- work item title
- **Branch** -- branch name or "not created"

From the **Token Usage** section:
- **Total** -- cumulative token usage

Calculate elapsed time since the `Updated` timestamp:
- Less than 1 hour: "{N} minutes ago"
- 1-24 hours: "{N} hours ago"
- More than 24 hours: "{N} days ago"

### Step 3: Classify and present

Group workflows into two categories:

**Active** -- any workflow where phase is NOT `completed`, OR was completed within the last 24 hours.

**Completed (older than 24 hours)** -- silently omit these. Do not show them.

### Output format

```
SprintPilot Workflow Status

Active workflows:

1. US-12345: "Implement SSO Login"
   Phase: paused (was in development / implementing)
   Last updated: 2 hours ago
   Branch: features/12345-implement-sso-login
   Fix cycles: 0/3
   Token usage: 45,200

2. BUG-8891: "Fix pagination offset in user search"
   Phase: waiting_for_answers (round 1)
   Last updated: 1 day ago
   Branch: not created
   Fix cycles: 0/3
   Token usage: 8,100

Recently completed:
- US-12401: "Add CSV export to reports" -- PR #92 created (3 hours ago)
```

If any workflow is in `waiting_for_answers` state, add a reminder:

```
Note: BUG-8891 has been waiting for answers for 1 day. Run /sp-check-answers to check for replies.
```

### If only completed workflows exist (all older than 24 hours)

Report:

```
No active SprintPilot workflows. All previous workflows are completed.
Use /sp-start to begin a new workflow.
```

## After Completing This

- To resume a paused workflow: `/sp-resume`
- To check for answers on a waiting workflow: `/sp-check-answers`
- To start a new workflow: `/sp-start`
- To list your work items: `/sp-items`
