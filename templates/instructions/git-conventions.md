# Git Conventions

> **AI Context:** This file covers all Git operations. Consult it whenever performing branch creation, commits, squashing, stashing, or pushing. Your role is to execute Git operations safely and consistently according to these conventions. The expected outcome is clean, traceable Git history with one squashed commit per work item.

This is the comprehensive reference for all Git operations within SprintPilot workflows. You MUST follow these conventions for branch naming, commit messages, squashing, stashing, and pushing.

---

## Branch Naming

### Template

The branch name template is defined in config (default: `features/{id}-{slug}`).

- `{id}` is replaced with the numeric work item ID
- `{slug}` is replaced with a slugified version of the work item title

### Slugification Rules

To convert a work item title into a branch slug, apply these rules in order:

1. **Take the work item title** as returned by `sp-get-item`
2. **Lowercase** the entire string
3. **Remove filler words:** strip these words/phrases:
   - `as a`
   - `i want to`
   - `so that`
   - `the`
   - `a`
   - `an`
4. **Replace non-alphanumeric characters** with hyphens (any character that is not `a-z` or `0-9` becomes `-`)
5. **Collapse consecutive hyphens** into a single hyphen (`---` becomes `-`)
6. **Truncate to 50 characters** (to keep branch names manageable)
7. **Trim trailing hyphens** (remove any `-` at the end after truncation)

### Example

Work item title: `"Implement SSO Login with MFA Support"`

1. Lowercase: `"implement sso login with mfa support"`
2. Remove filler words: `"implement sso login with mfa support"` (no filler words present)
3. Replace non-alphanumeric: `"implement-sso-login-with-mfa-support"`
4. Collapse hyphens: `"implement-sso-login-with-mfa-support"` (no change needed)
5. Truncate to 50: `"implement-sso-login-with-mfa-support"` (38 chars, no truncation)
6. Trim trailing: no change

Full branch name: `features/12345-implement-sso-login-with-mfa-support`

### Another Example (with filler words and truncation)

Work item title: `"As a User I Want to Be Able to Reset the Password So That I Can Recover My Account"`

1. Lowercase: `"as a user i want to be able to reset the password so that i can recover my account"`
2. Remove filler words: `"user be able to reset password i can recover my account"`
3. Replace non-alphanumeric: `"user-be-able-to-reset-password-i-can-recover-my-account"`
4. Collapse hyphens: `"user-be-able-to-reset-password-i-can-recover-my-account"`
5. Truncate to 50: `"user-be-able-to-reset-password-i-can-recover-my-a"`
6. Trim trailing: `"user-be-able-to-reset-password-i-can-recover-my-a"`

Full branch name: `features/67890-user-be-able-to-reset-password-i-can-recover-my-a`

---

## Commit Message

### Template

The commit message template is defined in config (default: `#{id}: {description}`).

- `{id}` is replaced with the numeric work item ID
- `{description}` is an AI-generated, lowercased, concise summary (5-10 words)

### Rules for the Description

- You MUST lowercase the entire description
- You MUST keep it concise: 5 to 10 words
- You MUST describe what was done, not how
- You MUST NOT include the work item type prefix (e.g., do not write "US-12345")
- You MUST NOT end with a period

### Examples

```
#12345: implement sso login with saml and oauth
#67890: fix null pointer in password reset flow
#11111: add unit tests for payment service
#22222: refactor user profile component to use hooks
```

---

## Squashing Before Final Commit

Before creating the final commit for a work item, you MUST squash all intermediate commits into a single commit. This keeps the Git history clean and associates one commit with one work item.

### Pre-Squash Checks

Before squashing, verify all of the following:

1. **Correct branch:** You are on the feature branch, not on the base branch
2. **Changes exist:** There are commits ahead of the base branch
3. **Nothing unstaged:** All changes are either committed or intentionally excluded
4. **No uncommitted work:** `git status` shows a clean working tree (or only untracked files that should not be committed)

### Squash Procedure

1. **Find the merge-base:**
   ```bash
   git merge-base HEAD {base-branch}
   ```
   This returns the commit SHA where the feature branch diverged from the base branch.

2. **Soft reset to the merge-base:**
   ```bash
   git reset --soft {merge-base-sha}
   ```
   This unstages all commits made on the feature branch but keeps all changes staged. The working tree is unchanged.

3. **All changes are now staged as one commit.** Create the final commit:
   ```bash
   git commit -m "#{id}: {description}"
   ```

### Important

- **CRITICAL:** You MUST NOT use `git rebase -i` for squashing (interactive rebase is not supported in this environment)
- You MUST NOT lose any changes during squashing -- verify with `git diff` before and after
- If the soft reset results in no staged changes, something went wrong -- investigate before proceeding

---

## Stash for Pause/Resume

When the user needs to pause work on a work item (e.g., to switch to another task), use Git stash to preserve uncommitted changes.

### Pause (Stashing)

```bash
git stash push -m "sprint-pilot:US-{id}"
```

- The message format `sprint-pilot:US-{id}` is required so the stash can be found later during resume
- After stashing, record the stash reference in the workflow state file
- You MUST verify the stash was created successfully by checking `git stash list`

### Resume (Unstashing)

1. **Find the stash** by scanning the stash list for the work item ID:
   ```bash
   git stash list
   ```
   Look for the entry with message `sprint-pilot:US-{id}`, e.g., `stash@{2}: On features/12345-...: sprint-pilot:US-12345`

2. **Pop the stash** using the reference:
   ```bash
   git stash pop stash@{2}
   ```

3. **Verify** the working tree has the expected changes restored

### Important

- You MUST use `git stash pop` (not `git stash apply`) to remove the stash entry after restoring
- If the pop fails due to conflicts, inform the user and help resolve them before continuing

---

## Push

### Standard Push

Always push with upstream tracking on the first push:

```bash
git push -u origin {branch-name}
```

On subsequent pushes (upstream already set):

```bash
git push
```

### Error Handling

| Error | Action |
|---|---|
| Non-fast-forward rejection | Pull with rebase, then push: `git pull --rebase origin {branch} && git push` |
| Authentication failure | Inform the user; likely a PAT or credential issue |
| Network error | Inform the user to check connectivity |
| Remote branch not found | Verify the branch was created via `sp-create-branch` first |

---

## Rules Summary

You MUST follow all of these rules without exception:

1. You MUST use SprintPilot MCP (`sp-create-branch`) to create branches in Azure DevOps. You MUST NOT create remote branches by any other method (e.g., `git push origin HEAD:refs/heads/...`).

2. You MUST use `git` commands for all local operations: checkout, stash, commit, push, diff, status, log, merge-base, reset.

3. **CRITICAL:** You MUST NOT force push. Never use `git push --force` or `git push -f`. If a push is rejected, use pull-rebase-push instead.

4. You MUST NOT commit directly to the base branch. All work MUST be done on a feature branch created through the workflow.

5. You MUST follow the branch naming template from config. Do not invent branch name formats.

6. You MUST follow the commit message template from config. Do not use arbitrary commit message formats.

7. You MUST squash all intermediate commits into a single commit before creating the PR. The final commit message MUST follow the commit template.

8. You MUST use the `sprint-pilot:US-{id}` message format when stashing, so that stashes can be identified during resume.
