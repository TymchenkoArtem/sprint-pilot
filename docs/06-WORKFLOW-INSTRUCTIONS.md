# 06 — Workflow Instruction Files

**Parent:** `00-MASTER-OVERVIEW.md`
**Related:** `05-CLAUDE-MD.md`, `07-STATE-AS-MARKDOWN.md`

---

## 1. Overview

These `.md` files are installed into `.sprint-pilot/instructions/` and provide detailed reference material for the AI tool. CLAUDE.md references them when the AI needs specifics.

---

## 2. File: `workflow-overview.md`

High-level flow diagram in text. Summarizes all 5 phases with their steps. Acts as a quick reference card.

**Content to include:**
- The full autopilot sequence (Discovery → Branch+Dev → Quality → Testing → Delivery)
- Which steps are automatic vs. require approval
- Which steps use SprintPilot MCP vs. direct shell/Fabric
- State transitions per phase

---

## 3. File: `approval-points.md`

Detailed specification of all 7 approval types.

**Content per approval:**
- When it triggers
- What to present to the user
- Available options (approve / edit / skip / fix / override / stop)
- What to do for each option
- How to log the decision

---

## 4. File: `ado-operations.md`

How to use each SprintPilot MCP tool. This is the "cookbook" the AI follows when it needs to interact with ADO.

**Content to include:**

```markdown
## Fetching Work Items

To get the user's assigned work items:
Call `/sp-my-items` (no parameters needed).
The response contains items grouped by type and state.

## Reading a Work Item

To get full details of a specific work item:
Call `/sp-get-item` with `{ "id": <number> }`.
Response includes title, description, acceptance criteria, state, iteration.

## Posting Clarification Questions

1. Format questions using the template from `.sprint-pilot/templates/clarification-comment.md`
2. Call `/sp-post-comment` with `{ "id": <number>, "text": "<formatted HTML>" }`
3. The HTML must include the `<!-- sprint-pilot:clarification:round:N -->` marker

## Checking for Answers

1. Call `/sp-get-comments` with `{ "id": <number> }`
2. Find the last comment where `isSprintPilot` is true
3. All comments after that are potential answers

## Updating Status

Call `/sp-update-status` with `{ "id": <number>, "status": "<mapped-key>" }`.
Allowed mapped keys: "blocked", "inProgress", "inReview".
The actual ADO state name is resolved from config.

## Creating a Branch

Call `/sp-create-branch` with `{ "name": "<branch-name>", "source_ref": "refs/heads/<base>" }`.
The source_ref must match the configured base branch.
After creating in ADO, also run `git fetch && git checkout <branch>` locally.

## Creating a PR

Call `/sp-create-pr` with:
- `source_branch`: the workflow's branch name
- `title`: commit-style title with US number
- `description`: generated from PR template
- `work_item_id`: the US number
- `tags`: array of tags (e.g., sprint number)
```

---

## 5. File: `git-conventions.md`

All git-related rules for the AI to follow.

**Content to include:**

```markdown
## Branch Naming

Template from config (default): `features/{usNumber}-{slug}`

Slugification rules:
- Lowercase the US title
- Remove filler words: "as a", "i want to", "so that", "the", "a", "an"
- Replace non-alphanumeric characters with hyphens
- Collapse multiple consecutive hyphens
- Truncate to 50 characters
- Trim trailing hyphens

Example: "Implement SSO Login with MFA Support" → "implement-sso-login-mfa-support"
Full branch: "features/12345-implement-sso-login-mfa-support"

## Commit Message

Template from config (default): `#{usNumber}: {description}`
Description: lowercased, concise summary of changes.
Example: `#12345: implement sso login with saml and oauth`

## Squashing Before Commit

Before the final commit:
1. Find the merge-base: `git merge-base HEAD {base-branch}`
2. Soft reset: `git reset --soft {merge-base-commit}`
3. All changes are now staged
4. Single commit with the formatted message

## Stash for Pause/Resume

When pausing:
- `git stash push -m "sprint-pilot:US-{id}"`
- Record the stash ref (from `git stash list`)

When resuming:
- `git stash list` to find the right stash by message
- `git stash pop {stash-ref}`

## Push

Always push with upstream tracking: `git push -u origin {branch}`
```

---

## 6. File: `quality-gate.md`

How the AI performs the quality gate analysis. See also `08-QUALITY-GATE.md` for full spec.

**Content to include:**
- What to read (git diff, standards, product docs, requirements)
- How to structure the analysis
- Severity definitions (error = blocks commit, warning = acknowledge, info = informational)
- How to report findings
- Override process and logging

---

## 7. File: `testing-verification.md`

Complete testing procedure. See also `09-TESTING-VERIFICATION.md` for full spec.

**Content to include:**
- Step 1: Run existing test suite
- Step 2: Browser testing with Playwright MCP
- Step 3: Browser health with Chrome DevTools MCP
- Dev server lifecycle (auto-detect, start, wait, stop)
- Fix-retest loop rules (max 3 shared)
- Results recording in workflow state

---

## 8. File: `clarification-flow.md`

The clarification question cycle.

**Content to include:**

```markdown
## When to Ask Questions

During scope analysis, look for:
- Ambiguous requirements
- Missing acceptance criteria
- Contradictions between US description and product docs
- Undefined edge cases
- Missing error handling requirements
- Unclear scope boundaries

## Comment Format

Use the template from `.sprint-pilot/templates/clarification-comment.md`.
Always include the round marker: `<!-- sprint-pilot:clarification:round:N -->`

## Analyzing Answers

When checking for answers:
1. Read all comments after SprintPilot's last comment
2. Map each answer to the original question
3. Determine: fully answered, partially answered, or new questions raised
4. If fully answered: update workflow state, continue
5. If partially answered: present findings, offer to post follow-up (round N+1)

## Multi-Round Flow

Round 2+ comments use follow-up template.
Each round increments the marker: `round:1`, `round:2`, etc.
Track all Q&A pairs in the workflow state file.
```

---

## 9. File: `delivery-flow.md`

The commit and PR process. See also `10-DELIVERY-FLOW.md` for full spec.

**Content to include:**
- Squash strategy
- Commit message generation
- PR description generation (from template)
- Sprint tag resolution (from iteration)
- Work item linking
- Final status update

---

## 10. File: `session-start.md`

How to behave when a new session begins.

**Content to include:**
- Check `.sprint-pilot/workflows/` for existing workflows
- Summarize status of each
- Show reminders for waiting workflows (don't auto-check ADO)
- Present options to the user
- If no workflows exist: suggest browsing items with "show my work items"

---

*End of workflow instructions spec.*
