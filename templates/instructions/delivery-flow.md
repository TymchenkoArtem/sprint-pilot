# Delivery Flow

> **AI Context:** This file is loaded during Phase 4 (Delivery). You are preparing the final commit, push, and PR creation. Your role is to produce a clean, squashed commit and a well-formatted pull request in ADO. The expected outcome is a merged-ready PR linked to the work item, with the work item status updated to In Review.

## Overview

The delivery phase converts working, verified code into a clean commit and pull request in ADO. It runs after verification passes (or after override).

### Steps

1. Pre-squash checks
2. Squash commits into a single clean commit
3. Generate and approve commit message
4. Push to remote
5. Generate and approve PR description
6. Create PR via SprintPilot MCP
7. Update work item status to In Review
8. Mark workflow complete

You MUST execute these steps in order. You MUST NOT skip steps unless an edge case requires it (documented below).

---

## Step 1: Pre-Squash Checks

Before squashing, verify all three conditions:

1. **Correct branch:** `git branch --show-current` must match the branch recorded in the workflow state file
2. **Changes exist:** `git diff --cached --stat` or `git log {base-branch}..HEAD` must show changes
3. **Clean working tree:** `git status --porcelain` must show no uncommitted changes (only staged files after squash)

If any check fails, report the issue to the user and stop. You MUST NOT proceed with a squash on the wrong branch or with uncommitted work.

---

## Step 2: Squash Commits

During development, many commits may have accumulated (implementation steps, verification fixes, test fixes). The delivery phase squashes everything into one clean commit.

```bash
# Find the merge base (where the feature branch diverged from base)
MERGE_BASE=$(git merge-base HEAD {base-branch})

# Soft reset to merge base -- all changes become staged
git reset --soft $MERGE_BASE

# All changes are now staged, ready for a single commit
```

After the soft reset, verify with `git diff --cached --stat` that the staged changes look correct.

---

## Step 3: Generate and Approve Commit Message

### Template

Use the commit message template from configuration (default: `#{id}: {description}`).

Variables:
- `{id}` -- work item ID
- `{description}` -- AI-generated summary of changes

### Description Generation

Generate the description by:
1. Reading the work item title
2. Reading the diff summary (`git diff --cached --stat`)
3. Summarizing in 5-10 words what was done, lowercase, concise

Examples:
- `#12345: implement sso login with saml and oauth`
- `#8891: fix pagination offset in user search api`
- `#5501: add csv export button to reports dashboard`

### Approval

You MUST get explicit approval for the commit message:

```
APPROVAL: "Commit message:"
  #{id}: {description}

Options: [Approve] [Edit]
```

**STOP -- Wait for user response before continuing.**

If the user edits: use their version verbatim. You MUST NOT modify the user's edited message.

---

## Step 4: Push to Remote

```bash
git commit -m "{approved-message}"
git push -u origin {branch}
```

### Push Failure Handling

| Failure | Action |
|---------|--------|
| Non-fast-forward (rejected) | Pull with rebase, then push again |
| Auth failure | Report error, suggest checking git credentials |
| Network error | Retry once, then report error |
| Branch protection | Report error, suggest PR-based workflow (see Edge Cases) |

You MUST NOT force-push. If a non-fast-forward push fails after pull-rebase, report to the user.

---

## Step 5: Generate and Approve PR Description

### Template

Use the PR description template from `sp-instructions` (name "pr-description", category "templates").

### Generation

Fill all template sections using data from the workflow state file:
- `{{CHANGES_SUMMARY}}` -- AI-generated summary of what changed and why
- `{{WORK_ITEM_ID}}` -- work item ID number
- `{{WORK_ITEM_TITLE}}` -- work item title
- `{{ITERATION}}` -- iteration path from work item
- `{{DIFF_STAT}}` -- output of `git diff --stat {base-branch}..HEAD`, formatted
- `{{ACCEPTANCE_CRITERIA_COVERAGE}}` -- for each criterion, mark as covered, not covered, or partial
- `{{STANDARDS_RESULT}}` -- PASS, FAIL, or OVERRIDE from verification
- `{{PRODUCT_RESULT}}` -- PASS, FAIL, or OVERRIDE from verification
- `{{REQUIREMENTS_RESULT}}` -- N/N criteria covered from verification
- `{{TEST_RESULTS}}` -- N passed, N failed
- `{{NOTES}}` -- any overrides, skipped steps, or reviewer notes

### Approval

You MUST get explicit approval for the PR description:

```
APPROVAL: "Create PR with this description?"
[Shows generated PR description]

Options: [Approve] [Edit]
```

**STOP -- Wait for user response before continuing.**

---

## Step 6: Create PR via SprintPilot MCP

Call `sp-create-pr` with the following parameters:

```json
{
  "source_branch": "{branch-name}",
  "title": "#{id}: {work-item-title}",
  "description": "{approved PR description}",
  "work_item_id": {id},
  "tags": ["{sprint-tag}"]
}
```

### Sprint Tag Resolution

The sprint tag comes from the work item's iteration path:
- `MyProject\Sprint 14` --> tag: `Sprint 14`
- Extract the last segment of the iteration path

### Work Item Linking

`sp-create-pr` automatically links the work item to the PR using ADO's `workItemRefs` field. The PR will appear in the work item's "Development" section.

### If PR Already Exists

If `sp-create-pr` returns `pr_exists`: inform the user ("PR #{N} already exists for this branch"), skip PR creation, and continue to Step 7.

---

## Step 7: Update Status to In Review

You MUST get explicit approval before updating the status:

```
APPROVAL: "Update status to In Review?"
Options: [Approve] [Skip]
```

**STOP -- Wait for user response before continuing.**

If approved: call `sp-update-status` with `"inReview"`.
If skipped: log the skip and continue to Step 8.

---

## Step 8: Workflow Completion

1. Update workflow state: `Phase: completed`, `State: pr_created`
2. Record the PR ID and URL in the workflow state file
3. Append final checkpoint to the `## Checkpoints` section
4. Report results to the user:

```
{TYPE}-{ID} complete!

PR #{pr-number} created: {pr-url}
Branch: {branch} --> {base-branch}
Status: In Review

Quality gate: {PASS|FAIL|OVERRIDE}
Tests: {N} passed, {N} failed
Fix cycles used: {N}/3
```

---

## Edge Cases

### PR Already Exists

If `sp-create-pr` returns that a PR already exists:
- Inform the user: "PR #{N} already exists for this branch"
- Skip PR creation
- Continue to status update (Step 7)
- You MUST NOT attempt to create a duplicate PR

### Empty Diff

If there are no changes between source and target branch:
- Report: "No changes to create PR for"
- Skip PR creation
- Offer to close the workflow
- You MUST NOT create a PR with an empty diff

### Push Rejected

If push fails due to branch protection rules:
- Report the error to the user
- Suggest: "Your branch may require a PR-based workflow. Create PR from the current state?"
- If user approves: proceed with PR creation without the final push
- You MUST NOT force-push or attempt to bypass branch protection

---

## Checkpoints

You MUST append to the `## Checkpoints` section of the workflow state file:

- When delivery starts: `{timestamp} -- Delivery started`
- After squash: `{timestamp} -- Commits squashed`
- After commit: `{timestamp} -- Committed: {commit-message} (approved)`
- After push: `{timestamp} -- Pushed to origin/{branch}`
- After PR creation: `{timestamp} -- PR #{N} created (approved)`
- After status update: `{timestamp} -- Status updated: {old} --> {new} (approved)`
- When workflow completes: `{timestamp} -- Workflow completed`

---

## Next Step

This is the final phase. After completing delivery, mark the workflow as completed (Phase: `completed`, State: `pr_created`). The workflow folder remains for reference but no further autopilot phases follow.
