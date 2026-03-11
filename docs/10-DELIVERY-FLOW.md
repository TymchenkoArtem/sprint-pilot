# 10 — Delivery Flow

**Parent:** `00-MASTER-OVERVIEW.md`
**Related:** `02-MCP-TOOLS.md`, `05-CLAUDE-MD.md`

---

## 1. Overview

The delivery phase converts working, tested code into a clean commit and pull request in ADO. It runs after all tests pass (or after override).

Steps:
1. Squash commits into a single clean commit
2. Generate and approve commit message
3. Push to remote
4. Generate and approve PR description
5. Create PR in ADO via `/sp-create-pr`
6. Update work item status to In Review

---

## 2. Squash Strategy

During development, the AI may have made many commits (Fabric CLI steps, fixes, quality gate fixes, test fixes). The delivery phase squashes everything into one commit.

### 2.1 Process

```bash
# Find the merge base (where the feature branch diverged from base)
MERGE_BASE=$(git merge-base HEAD develop)

# Soft reset to merge base — all changes become staged
git reset --soft $MERGE_BASE

# Now all changes are staged, ready for a single commit
```

### 2.2 Pre-Squash Checks

Before squashing:
1. Verify on the correct branch: `git branch --show-current` should match workflow's branch
2. Verify there are changes: `git diff --cached --stat` should not be empty
3. Verify no uncommitted changes: `git status --porcelain` should show only staged files

---

## 3. Commit Message

### 3.1 Template

From `config.md` (default): `#{usNumber}: {description}`

Variables:
- `{usNumber}` — work item ID
- `{description}` — AI-generated summary of changes, lowercase, concise

### 3.2 Generation

The AI generates the description by:
1. Reading the US title
2. Reading the diff summary (`git diff --stat`)
3. Summarizing in 5-10 words what was done

Examples:
- `#12345: implement sso login with saml and oauth`
- `#8891: fix pagination offset in user search api`
- `#5501: add csv export button to reports dashboard`

### 3.3 Approval

```
⏸ APPROVAL: "Commit message:"
  #12345: implement sso login with saml and oauth

  Options: [Approve] [Edit]
```

If user edits: use their version verbatim.

---

## 4. Push

```bash
git commit -m "{approved message}"
git push -u origin {branch-name}
```

If push fails:
- **Rejected (non-fast-forward):** Pull and rebase, then push again
- **Auth failure:** Report error, suggest checking git credentials
- **Network error:** Retry once, then report

---

## 5. PR Description

### 5.1 Template

File: `.sprint-pilot/templates/pr-description.md`

```markdown
## Summary
{AI-generated summary of what changed and why}

## Work Item
- #{usNumber}: {title}
- Iteration: {iteration}

## Changes
{git diff --stat output, formatted}

## Acceptance Criteria Coverage
{For each criterion: ✅ Covered / ❌ Not covered / ⚠️ Partial}

## Quality Gate
- Standards: {PASS/FAIL/OVERRIDE}
- Product alignment: {PASS/FAIL/OVERRIDE}
- Requirements coverage: {N/N}

## Testing
- Unit tests: {N passed, N failed}
- Browser tests: {summary}
- Browser health: {summary}

## Notes
{Any overrides, skipped steps, or things the reviewer should know}
```

### 5.2 Generation

The AI fills the template using data from the workflow state file. Everything is already recorded there — quality gate results, test results, acceptance criteria.

### 5.3 Approval

```
⏸ APPROVAL: "Create PR with this description?"
  [Shows generated PR description]

  Options: [Approve] [Edit]
```

---

## 6. PR Creation

### 6.1 MCP Call

```json
{
  "source_branch": "features/12345-implement-sso-login",
  "title": "#12345: Implement SSO login",
  "description": "{approved PR description}",
  "work_item_id": 12345,
  "tags": ["Sprint 14"]
}
```

### 6.2 Sprint Tag Resolution

The tag comes from the work item's iteration path:
- `MyProject\Sprint 14` → tag: `Sprint 14`
- Extract the last segment of the iteration path

### 6.3 Work Item Linking

`/sp-create-pr` automatically links the work item to the PR using ADO's `workItemRefs` field. The PR will show as linked in the work item's "Development" section.

---

## 7. Final Status Update

```
⏸ APPROVAL: "Update status to In Review?"
  Options: [Approve] [Skip]
```

If approved: call `/sp-update-status` with `"inReview"`.

---

## 8. Workflow Completion

After PR creation:
1. Update workflow state to `phase: completed`, `state: pr_created`
2. Record PR ID and URL in state file
3. Append final checkpoint
4. Report to user:

```
✅ US-12345 complete!

PR #89 created: https://dev.azure.com/.../pullrequest/89
Branch: features/12345-implement-sso-login → develop
Status: In Review

Quality gate: PASS
Tests: 26 passed, 0 failed
Fix cycles used: 1/3
```

---

## 9. Edge Cases

### 9.1 PR Already Exists

If `/sp-create-pr` returns `pr_exists`:
- Report to user: "PR #89 already exists for this branch"
- Offer to update the existing PR description (not supported in v1 — just inform)
- Continue to status update

### 9.2 Empty Diff

If no changes between source and target (e.g., someone already merged):
- Report: "No changes to create PR for"
- Skip PR creation
- Offer to close the workflow

### 9.3 Push Rejected

If push fails due to branch protection rules:
- Report the error
- Suggest: "Your branch may require a PR-based workflow. Create PR from the current state?"
- If approved: proceed with PR creation without the final push

---

*End of delivery flow spec.*
