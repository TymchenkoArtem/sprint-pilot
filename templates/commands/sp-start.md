---
description: 'Start the SprintPilot autopilot workflow'
---

You are executing the `/sp-start` command. This is the primary entry point for SprintPilot. It initializes a session, checks for existing workflows, and either resumes prior work or starts a new 4-phase autopilot on a selected work item.

## Prerequisites

Before taking any action, verify these conditions in order. If any check fails, stop at that point.

### Check 1: SprintPilot initialization

Call the `sp-init` MCP tool (no parameters). Inspect the response:

```
Tool: sp-init
Parameters: {}
```

- If the response indicates SprintPilot is NOT initialized: inform the user to run the CLI setup command in their terminal (`npx sprint-pilot setup-project` or `npx sprint-pilot setup-auth`). Do NOT proceed further.
- If initialized: continue to Check 2.

### Check 2: fabric/ folder and fabric-cli

Check whether the `fabric/` directory exists in the project root (`ls fabric/`) and whether fabric-cli is installed globally (`~/fabric/` directory exists).

The `sp-init` response includes a `fabric` object with `project_docs`, `product_docs`, and `cli_installed` flags. Use these to determine the environment.

**If `fabric/` does NOT exist:** Display this warning but DO NOT stop:

```
Warning: fabric/ directory not found in this project.

SprintPilot will operate in lightweight mode:
- Standards and product docs from fabric/ will NOT be available
- Verification will use codebase analysis and general best practices instead
- For full standards-based workflow, set up fabric-cli and initialize the fabric/ folder

Continuing without fabric/ documentation...
```

**If fabric-cli is NOT installed** (no `~/fabric/` directory): Display this additional note:

```
Note: fabric-cli not detected (~/fabric/ not found).
For complex tasks, fabric-cli provides spec shaping and task breakdown.
SprintPilot will implement tasks directly using best practices.
```

**If both exist:** No warning needed. Continue silently.

Record the fabric availability in the workflow state when a work item starts (see CLAUDE.md for details on how this affects Phase 2 and Phase 3 behavior).

## Load Instructions

Call the `sp-instructions` MCP tool twice, in this exact order:

```
Tool: sp-instructions
Parameters: { "name": "CLAUDE" }
```

Read the full response. This is the master workflow document (CLAUDE.md). It defines all phases, approval points, state management rules, and key rules.

```
Tool: sp-instructions
Parameters: { "name": "session-start" }
```

Read the full response. This defines the exact session-start procedure with steps 0-6.

IMPORTANT: You must read and internalize BOTH responses before proceeding. These documents are your source of truth for the entire workflow.

## Execute Session Start Procedure

Follow the procedure from `session-start.md` exactly:

### Step 1: Check for existing workflows

Read the `.sprint-pilot/workflows/` directory. Look for subdirectories (e.g., `US-12345/`, `BUG-8891/`).

- If subdirectories exist: read each `state.md` file, parse the Status and Work Item sections, classify each workflow (Active-Paused, Active-Waiting, Active-In Progress, Completed, Idle), and present a summary to the user.
- If no subdirectories exist (or directory does not exist): skip to presenting options for starting new work.

### Step 2: Present options

STOP: Wait for the user's response before taking any action.

Present tailored options based on what workflows exist:
- "Resume {TYPE}-{ID}" -- for paused workflows
- "Check answers on {TYPE}-{ID}" -- for waiting_for_answers workflows
- "Start new work item" or "Show my work items" -- always available
- "Work on {TYPE}-{ID}" -- if user already knows which item

When no active workflows exist OR when the user says "Start new work item", automatically call `sp-my-items` and present items for selection.

CRITICAL: Do NOT auto-check ADO for answers on waiting workflows. Only check when the user explicitly requests it.

### Step 3: Handle user's choice

Once the user responds, follow the appropriate path as defined in `session-start.md` Step 6:

- **Resume:** Follow the resume procedure (read state, checkout branch, pop stash, restore phase).
- **Check answers:** Follow the check-answers procedure (call `sp-get-comments`, map answers to questions).
- **Start new / Work on {ID}:** Begin the 4-phase autopilot at Phase 1 (Discovery).

## The 4-Phase Autopilot

When a work item is selected, execute phases sequentially as described in CLAUDE.md:

- **Phase 1: Discovery** -- Understand the work item, identify gaps, post clarification questions if needed.
- **Phase 2: Branch + Development** -- Create branch, update status, implement (using Fabric CLI for complex tasks when available, or directly for small tasks).
- **Post-Implementation: Auto-Run Tests** -- Run the project's test suite (unit/integration tests from `config.md` testCommand). Fix regressions before proceeding. This is NOT a separate phase but a mandatory gate between Phase 2 and Phase 3.
- **Phase 3: Verification (`/sp-verify`)** -- Verify all changes comply with standards, product architecture, and requirements.
- **Phase 4: Delivery** -- Squash, commit, push, create PR, update status.

CRITICAL: Never skip a phase unless the user explicitly instructs you to.

CRITICAL: Follow ALL approval points. There are 8 approval points (clarification questions, status to blocked, branch name, status to in progress, verification override, commit message, PR creation, status to in review). Each must be presented individually and explicitly approved before proceeding.

## After Completing This

- The full phase procedures are defined in CLAUDE.md (loaded via `sp-instructions` name "CLAUDE").
- Individual phases can be invoked directly: `/sp-verify` for Phase 3, `/sp-deliver` for Phase 4.
- To check workflow status at any time: `/sp-status`.
- To resume a paused workflow: `/sp-resume`.
