---
description: 'List my current sprint work items from ADO'
---

You are executing the `/sp-items` command. This fetches all work items assigned to the current user in the configured Azure DevOps project and presents them for selection.

## Prerequisites

### Check 1: SprintPilot initialization

Call the `sp-init` MCP tool to verify SprintPilot is initialized:

```
Tool: sp-init
Parameters: {}
```

- If NOT initialized: inform the user to run `/sp-start` first, which will guide them through setup. Do NOT proceed further.
- If initialized: continue.

## Fetch Work Items

Call the `sp-my-items` MCP tool:

```
Tool: sp-my-items
Parameters: {}
```

## Handle Results

### If the response contains work items

Present the results as a numbered list grouped by type. Use this exact format:

```
Your current sprint work items:

User Stories
1. US-12345: "Implement SSO login" (Active)
2. US-12401: "Add CSV export to reports" (New)

Bugs
3. BUG-8891: "Fix pagination offset in search" (Active)

Tasks
4. TASK-9012: "Update deployment script" (New)
```

Rules for the output:
- Group by work item type: User Stories, then Bugs, then Tasks.
- Number items sequentially across all groups (not per group).
- Show the work item ID with its type prefix (US-, BUG-, TASK-).
- Show the title in quotes.
- Show the current state in parentheses.
- Omit any group that has zero items (do not show an empty "Bugs" section).

### If the response is empty (no work items)

Display:

```
No work items assigned to you in the current sprint.

This could mean:
- You have no items in the active sprint/iteration
- The sprint has not started yet
- Items are assigned to a different account

You can also provide a work item ID directly: "Work on US-{id}"
```

### If the call fails

Display the error from the MCP tool response. Suggest the user verify their configuration with `/sp-start`.

## Present Selection Prompt

STOP: Wait for the user's response before taking any action.

After listing items, ask:

```
Which item would you like to work on? Say the number or ID.
```

CRITICAL: Do NOT automatically start working on any item. Wait for the user to select one explicitly.

## After Completing This

- When the user selects an item, begin the autopilot at Phase 1 (Discovery) as described in `/sp-start`.
- To see existing workflow status: `/sp-status`.
- Full workflow documentation is in CLAUDE.md (loaded via `sp-instructions` name "CLAUDE").
