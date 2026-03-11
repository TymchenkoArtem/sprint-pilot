---
description: 'Deliver current work: squash, commit, push, create PR'
---

You are executing the `/sp-deliver` command. This is Phase 5 (Delivery) of the SprintPilot autopilot. It produces a clean commit, pushes to remote, creates a pull request in ADO, and updates the work item status.

## Prerequisites

### Check 1: Active workflow must exist

Read the `.sprint-pilot/workflows/` directory. Detect the current git branch with `git branch --show-current`. Find the workflow whose branch matches the current branch.

- If no matching workflow exists: inform the user that no active workflow was found for the current branch. Suggest running `/sp-start` to begin a workflow or `/sp-status` to see existing workflows. Do NOT proceed.
- If the matching workflow is in `completed` phase: inform the user that this workflow is already complete and a PR has been created. Do NOT proceed.
- If a matching workflow exists and is not completed: read the full `state.md` file to get the work item ID, branch name, base branch, acceptance criteria, quality gate results, and test results.

### Check 2: Load delivery instructions

```
Tool: sp-instructions
Parameters: { "name": "delivery-flow" }
```

Read the full response. This defines all delivery steps, PR template details, and edge case handling.

## Step 1: Pre-Squash Checks

Verify all three conditions:

1. **Correct branch:** `git branch --show-current` must match the branch in the workflow state file.
2. **Changes exist:** `git log {BASE_BRANCH}..HEAD` must show at least one commit.
3. **Clean working tree:** `git status --porcelain` must show no uncommitted changes.

If any check fails, report the specific issue and stop. Do NOT proceed with a squash on the wrong branch or with uncommitted work.

## Step 2: Squash Commits

```bash
MERGE_BASE=$(git merge-base HEAD {BASE_BRANCH})
git reset --soft $MERGE_BASE
```

After the soft reset, verify with `git diff --cached --stat` that the staged changes look correct.

## Step 3: Generate Commit Message

Generate the commit message using the template from `config.md` (default: `#{ID}: {DESCRIPTION}`). The description is a concise, lowercase summary of changes (5-10 words).

STOP: Present the commit message for approval.

```
Commit message:
  #{ID}: {description}

Options: [Approve] [Edit]
```

- If approved: use as-is.
- If edited: use the user's version verbatim. Do NOT modify their edits.

## Step 4: Commit and Push

```bash
git commit -m "{APPROVED_MESSAGE}"
git push -u origin {BRANCH_NAME}
```

If push fails:
- Non-fast-forward: pull with rebase, then push again.
- Auth failure: report error, suggest checking git credentials.
- Network error: retry once, then report.
- CRITICAL: Do NOT force-push.

## Step 5: Generate PR Description

Retrieve the PR description template:

```
Tool: sp-instructions
Parameters: { "name": "pr-description", "category": "templates" }
```

Fill the template with data from the workflow state file: changes summary, work item link, acceptance criteria coverage, quality gate results, test results, diff stat.

STOP: Present the PR description for approval.

```
Create PR to {TARGET_BRANCH} with this description?

{Generated PR description}

Options: [Approve] [Edit]
```

- If approved: use as-is.
- If edited: use the user's version verbatim.

## Step 6: Create PR

Resolve the sprint tag from the work item's iteration path (last segment, e.g., `MyProject\Sprint 14` becomes `Sprint 14`).

```
Tool: sp-create-pr
Parameters: {
  "source_branch": "{BRANCH_NAME}",
  "title": "#{ID}: {WORK_ITEM_TITLE}",
  "description": "{APPROVED_PR_DESCRIPTION}",
  "work_item_id": {ID},
  "tags": ["{SPRINT_TAG}"]
}
```

- If the tool returns `pr_exists`: inform the user ("PR #{N} already exists for this branch"), skip PR creation, continue to Step 7.
- If the call fails: report the error and ask the user how to proceed.

## Step 7: Update Work Item Status

STOP: Ask for approval before updating status.

```
Update status to In Review?
Options: [Approve] [Skip]
```

If approved:
```
Tool: sp-update-status
Parameters: { "id": {WORK_ITEM_ID}, "status": "inReview" }
```

If skipped: log the skip and continue.

## Step 8: Complete Workflow

1. Update workflow state: phase `completed`, state `pr_created`.
2. Record the PR ID and URL in the state file.
3. Append final checkpoint.
4. Report results to the user:

```
{TYPE}-{ID} complete!

PR #{PR_NUMBER} created: {PR_URL}
Branch: {BRANCH} --> {BASE_BRANCH}
Status: In Review

Quality gate: {PASS|FAIL|OVERRIDE}
Tests: {N} passed, {N} failed
Fix cycles used: {N}/3
```

## After Completing This

- The full delivery procedure is in `delivery-flow.md` (loaded via `sp-instructions` name "delivery-flow").
- To see workflow status: `/sp-status`.
- The master workflow is in CLAUDE.md (loaded via `sp-instructions` name "CLAUDE").
