---
description: 'List all SprintPilot slash commands'
---

You are executing the `/sp-help` command. Display the SprintPilot command reference and workflow overview below.

## Command Reference

| Command | Description |
|---------|-------------|
| `/sp-start` | Start the SprintPilot autopilot -- check for existing workflows, pick a work item, and run the full workflow |
| `/sp-status` | Show current workflow status (phase, work item, branch, fix cycles, token usage) |
| `/sp-resume` | Resume a paused workflow from its last checkpoint |
| `/sp-items` | List your assigned work items from Azure DevOps |
| `/sp-verify` | Verify implementation against standards, product docs, and requirements (Phase 3) |
| `/sp-deliver` | Jump to delivery phase -- squash, commit, push, and create a PR (Phase 4) |
| `/sp-check-answers` | Check if clarification questions have been answered in ADO |
| `/sp-help` | Show this help message |

## Autopilot Flow

The SprintPilot autopilot executes these phases sequentially for each work item:

```
/sp-start
    |
    v
Phase 1: Discovery
    Fetch work item, read standards, identify gaps, post clarification questions
    |
    v  (if questions posted, wait for answers --> /sp-check-answers)
    |
Phase 2: Branch + Development
    Create branch, update status, implement via Fabric CLI (including unit tests)
    |
    v
Auto-Tests (mandatory gate)
    Run project test suite (unit/integration tests from config)
    Fix regressions if any (up to 3 attempts)
    |
    v
Phase 3: Verification (/sp-verify)
    Verify changes against standards, product docs, and requirements
    |
    v
Phase 4: Delivery (/sp-deliver)
    Squash commits, push, create PR, update status
```

## Getting Started

Run `/sp-start` to begin. SprintPilot will check your setup and tell you what to do if anything is missing (CLI setup, fabric/ folder, etc.).

## Common Scenarios

**First time:** `/sp-start` -- guides you through setup and work item selection.

**Pick up where you left off:** `/sp-resume` -- restores your branch, pops stashed changes, continues from the paused phase.

**Check on blockers:** `/sp-check-answers` -- checks ADO for replies to your clarification questions.

**Quick status:** `/sp-status` -- see all active workflows at a glance.

**Run verification:** `/sp-verify` -- verify your implementation against standards and requirements.

**Skip to delivery:** `/sp-deliver` -- squash, commit, push, and create PR for the current branch.
