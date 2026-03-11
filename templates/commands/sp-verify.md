---
description: 'Verify implementation against standards, product docs, and requirements'
---

You are executing the `/sp-verify` command. This is Phase 3 of the SprintPilot autopilot. It is auto-triggered after the post-implementation test run passes, OR it can be invoked manually as a standalone command.

> **AI Context:** You are performing a comprehensive verification of all code changes against the project's fabric/ documentation, coding standards, and the work item's requirements. Your role is to be a thorough, honest reviewer. You MUST catch real issues and MUST NOT invent problems. The expected outcome is a PASS, FAIL, or OVERRIDE decision that gates whether the code proceeds to Phase 4 (Delivery).

## Prerequisites

Verify these conditions before proceeding. If any check fails, stop and inform the user.

### Check 1: SprintPilot config

```
Tool: sp-config
Parameters: { "action": "read" }
```

Verify the config is valid and readable.

### Check 2: Determine active workflow

Read the `.sprint-pilot/workflows/` directory. Detect the current git branch with `git branch --show-current`.

- If an active workflow exists whose branch matches the current branch: use that workflow's work item data (acceptance criteria, description, clarifications from `state.md`).
- If the workflow is in `completed` or `delivery` phase: warn the user and ask to confirm before proceeding.
- If no matching workflow exists: ask the user for the work item ID. Call `sp-get-item` to fetch details. Create a minimal workflow entry to track verification results.

### Check 3: Load verification instructions

```
Tool: sp-instructions
Parameters: { "name": "sp-verify" }
```

Read the full response. This is the detailed verification procedure with analysis dimensions, severity definitions, and the approval flow.

## Verification Procedure

Follow the procedure from `sp-verify.md` exactly. The steps are:

1. **Context compilation** -- Read ALL inputs: git diff, fabric/standards/, fabric/product/, workflow state (requirements + acceptance criteria).
2. **File-by-file analysis** -- For every changed file, analyze against all three sources of truth (standards, product docs, requirements).
3. **Requirements traceability** -- Map every acceptance criterion to code that implements it. Flag gaps.
4. **Scope audit** -- Flag code that implements functionality NOT in the work item requirements (scope creep).
5. **Produce findings** -- Categorize each finding as error (blocks), warning (acknowledged), or info (suggestion).
6. **Write report** -- Write the structured verification report to the workflow state file.

STOP: Wait for user approval if errors are found.

```
Verification found {N} errors.
Options: [Fix] [Override]
```

- Fix: AI applies fixes, re-runs verification (max 2 re-runs).
- Override: User provides reason, logged to workflow state.

If no errors: report findings and proceed to Phase 4 (Delivery).

## After Completing This

- If verification passes (or is overridden): proceed to Phase 4 (Delivery). Run `/sp-deliver` or let the autopilot continue.
- The full verification procedure is in `sp-verify.md` (loaded via `sp-instructions` name "sp-verify").
- The master workflow is in CLAUDE.md (loaded via `sp-instructions` name "CLAUDE").
