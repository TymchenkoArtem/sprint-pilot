# Approval Points

> **AI Context:** This file defines ALL approval points in the SprintPilot autopilot. You MUST consult this file whenever you reach an approval point in any phase. Your role is to present each decision clearly and wait for the user's explicit response. The expected outcome is that no action is taken without the user's informed consent.

This document specifies every approval point in the SprintPilot autopilot workflow. You MUST follow these rules exactly. Approvals are the guardrails that keep the user in control.

---

## Rules

You MUST obey these rules for every approval point:

1. **CRITICAL:** You MUST NOT batch multiple approvals. Present them one at a time, sequentially. Never combine two approval prompts into a single message.
2. You MUST NOT skip an approval unless the user explicitly chooses "Skip."
3. **CRITICAL:** You MUST wait for an explicit user response before proceeding. Do not assume consent. Do not interpret silence as approval. Do not proceed after presenting an approval without receiving a response.
4. If the user edits a value, you MUST use their version exactly as provided.
5. If the user skips an approval, you MUST log the skip and continue to the next step.
6. **CRITICAL:** You MUST NOT auto-approve on behalf of the user under any circumstances. Even if the decision seems obvious or routine, you MUST still present it and wait.
7. You MUST present the approval clearly, showing what you are proposing and the available options.
8. You MUST log every approval decision to the current work item's `activity.md` (`.sprint-pilot/workflows/{{TYPE}}-{{ID}}/activity.md`).

---

## Approval #1: Post Clarification Questions

### Context

| Property | Value |
|---|---|
| Phase | Discovery |
| Trigger | Questions identified during scope analysis of the work item |
| Preceding step | AI has analyzed the work item against standards and product docs |
| Following step | Approval #2 (Update status to Blocked) if approved; Phase 2 if skipped |

### What to Present

Display a numbered list of the clarification questions the AI has identified. Each question MUST be specific and actionable. Example:

```
I identified the following clarification questions for US-12345:

1. Which SSO providers should be supported -- SAML 2.0 only, OAuth 2.0 only, or both?
2. Should MFA be included in the scope of this user story?
3. Session timeout: product doc says 30 minutes but the US description says 1 hour -- which is correct?
4. Are there specific error messages required for failed authentication attempts?

Post these questions to ADO?
Options: [Approve] [Edit] [Skip]
```

### Options

| Option | Action |
|---|---|
| **Approve** | Format questions using the template from `sp-instructions` (name "clarification-comment", category "templates"). Call `sp-post-comment` with the formatted HTML including the round marker `<!-- sprint-pilot:clarification:round:N -->`. |
| **Edit** | The user provides a modified list of questions. You MUST use their version exactly. Then post as above. |
| **Skip** | Do not post questions. Log the skip. Proceed directly to Phase 2 (Branch + Development). |

### Logging

- Approved: `- HH:MM [APPROVE] User approved posting clarification questions`
- Skipped: `- HH:MM [REJECT] User skipped posting clarification questions`

---

## Approval #2: Update Status to Blocked

### Context

| Property | Value |
|---|---|
| Phase | Discovery (immediately after Approval #1 is approved) |
| Trigger | Clarification questions have been posted to ADO |
| Preceding step | `sp-post-comment` succeeded |
| Following step | State transitions to `waiting_for_answers`; AI suggests switching to another work item |

### What to Present

```
Questions posted to ADO (comment ID: {commentId}).
Update work item status from "{currentStatus}" to Blocked?

Options: [Approve] [Skip]
```

### Options

| Option | Action |
|---|---|
| **Approve** | Call `sp-update-status` with `{ "id": {id}, "status": "blocked" }`. Update workflow state to `waiting_for_answers`. |
| **Skip** | Do not change the ADO status. Still transition workflow state to `waiting_for_answers` (SprintPilot tracks its own state independently of ADO). |

### Logging

- Approved: `- HH:MM [UPDATE-STATUS] US-{id}: {currentStatus} -> Blocked`
- Skipped: `- HH:MM [REJECT] User skipped status update to Blocked`

---

## Approval #3: Create Branch

### Context

| Property | Value |
|---|---|
| Phase | Branch + Development |
| Trigger | Before creating the feature branch |
| Preceding step | Discovery complete (or resumed from `waiting_for_answers`) |
| Following step | `sp-create-branch`, then `git fetch && git checkout` |

### What to Present

Show the generated branch name. The name is derived from the branch template in `config.md` using the work item ID and a slugified title.

```
Create branch: "features/12345-implement-sso-login-mfa-support"
Base: develop

Options: [Approve] [Edit]
```

### Options

| Option | Action |
|---|---|
| **Approve** | Call `sp-create-branch` with `{ "name": "{branch}", "source_ref": "refs/heads/{baseBranch}" }`. Then run `git fetch origin && git checkout {branch}`. |
| **Edit** | The user provides a different branch name. You MUST use their name exactly. Then create as above. |

### Logging

- Approved: `- HH:MM [CREATE-BRANCH] Branch created: {branchName} from {baseBranch}`

### Notes

- There is no "Skip" option. A branch is required to proceed with development.
- If `sp-create-branch` fails, report the error and ask the user how to proceed.

---

## Approval #4: Update Status to In Progress

### Context

| Property | Value |
|---|---|
| Phase | Branch + Development (immediately after branch creation) |
| Trigger | Branch has been created and checked out locally |
| Preceding step | `git checkout {branch}` succeeded |
| Following step | Compile spec context, run Fabric CLI sequence |

### What to Present

```
Branch "{branchName}" created and checked out.
Update work item status to In Progress?

Options: [Approve] [Skip]
```

### Options

| Option | Action |
|---|---|
| **Approve** | Call `sp-update-status` with `{ "id": {id}, "status": "inProgress" }`. |
| **Skip** | Do not change the ADO status. Continue with development. |

### Logging

- Approved: `- HH:MM [UPDATE-STATUS] US-{id}: {currentStatus} -> In Progress`
- Skipped: `- HH:MM [REJECT] User skipped status update to In Progress`

---

## Approval #5: Verification Violations

### Context

| Property | Value |
|---|---|
| Phase | Verification |
| Trigger | Errors (severity: `error`) found during verification analysis |
| Preceding step | AI completed verification analysis |
| Following step | If Fix: AI applies fixes and re-runs verification. If Override: log and continue to Phase 4 (Delivery). |

### What to Present

Show the full list of errors with severity, source, file, and recommendation. Include warnings and info items for context but make clear that only errors block.

```
Verification found 2 errors, 1 warning, 1 info item.

ERRORS (blocking):
1. [STANDARDS] src/auth/sso-handler.ts -- Error handling uses generic catch(e)
   instead of typed errors per fabric/standards/error-handling.md
2. [REQUIREMENTS] Acceptance criterion #4 "Redirect to original page after login"
   -- not implemented, login always redirects to /dashboard

WARNINGS (non-blocking):
1. [STANDARDS] src/auth/sso-config.ts -- Magic number 1800 should be a named
   constant (SESSION_TIMEOUT_SECONDS)

INFO:
1. [STANDARDS] Consider extracting SSO provider factory pattern per
   fabric/standards/design-patterns.md

Options: [Fix] [Override]
```

### Options

| Option | Action |
|---|---|
| **Fix** | AI analyzes each error, applies code fixes, then re-runs verification. Maximum 2 re-runs. If errors persist after 2 re-runs, force the user to choose Override or stop. |
| **Override** | Ask the user for a brief reason. Log the override with all overridden errors and the reason in the workflow state file. Continue to Phase 4 (Delivery). |

### Logging

- Fix chosen: `- HH:MM [VERIFY] Fix cycle initiated for {N} errors`
- Fix succeeded: `- HH:MM [VERIFY] Verification passed after fix cycle`
- Override chosen: `- HH:MM [OVERRIDE] Verification overridden: "{reason}"`

### Notes

- This approval ONLY triggers when there are `error`-severity findings. Warnings and info items do not trigger an approval.
- If verification passes with no errors, no approval is needed. Log the pass and continue.

---

## Approval #6: Commit and Push

### Context

| Property | Value |
|---|---|
| Phase | Delivery |
| Trigger | Before the final squash commit |
| Preceding step | All tests passed (or testing was overridden/skipped) |
| Following step | `git commit` + `git push -u origin {branch}` |

### What to Present

Show the generated commit message and a summary of what will be committed.

```
Ready to commit and push.

Commit message:
  #12345: implement sso login with saml and oauth

Files changed: 8 files (+342, -12)
Branch: features/12345-implement-sso-login -> origin

Options: [Approve] [Edit]
```

### Options

| Option | Action |
|---|---|
| **Approve** | Run `git commit -m "{message}"` followed by `git push -u origin {branch}`. |
| **Edit** | The user provides a modified commit message. You MUST use their message exactly. Then commit and push. |

### Logging

- Committed: `- HH:MM [COMMIT] Committed: {message}`
- Pushed: `- HH:MM [PUSH] Pushed {branch} to origin`

### Notes

- There is no "Skip" option. A commit is required for PR creation.
- If push fails (non-fast-forward, auth failure, network error), report the error and suggest resolution steps. Do not retry silently.

---

## Approval #7: Create Pull Request

### Context

| Property | Value |
|---|---|
| Phase | Delivery |
| Trigger | Before creating the PR in ADO |
| Preceding step | Code committed and pushed |
| Following step | `sp-create-pr` |

### What to Present

Show the PR title and the full generated description.

```
Create pull request:

Title: #12345: Implement SSO login
Target: develop
Tags: Sprint 14

Description:
---
## Summary
Implements SSO login supporting SAML 2.0 and OAuth 2.0 providers with
30-minute session timeout and graceful error handling.

## Work Item
- #12345: Implement SSO login
- Iteration: MyProject\Sprint 14

## Changes
 8 files changed, 342 insertions(+), 12 deletions(-)
 ...

## Verification
- Standards: PASS
- Product alignment: PASS
- Requirements coverage: 4/4
---

Options: [Approve] [Edit]
```

### Options

| Option | Action |
|---|---|
| **Approve** | Call `sp-create-pr` with `{ "source_branch": "{branch}", "title": "{title}", "description": "{description}", "work_item_id": {id}, "tags": ["{sprintTag}"] }`. |
| **Edit** | The user modifies the title and/or description. You MUST use their version exactly. Then create the PR. |

### Logging

- Created: `- HH:MM [CREATE-PR] PR #{prId} created: {prUrl}`

### Notes

- There is no "Skip" option. Creating a PR is the primary deliverable of the workflow.
- The sprint tag is extracted from the work item's iteration path (last segment).
- If `sp-create-pr` returns `pr_exists`, inform the user and continue to Approval #8.

---

## Approval #8: Update Status to In Review

### Context

| Property | Value |
|---|---|
| Phase | Delivery (final step) |
| Trigger | PR has been created in ADO |
| Preceding step | `sp-create-pr` succeeded |
| Following step | Workflow marked as completed |

### What to Present

```
PR #{prId} created successfully.
Update work item status to In Review?

Options: [Approve] [Skip]
```

### Options

| Option | Action |
|---|---|
| **Approve** | Call `sp-update-status` with `{ "id": {id}, "status": "inReview" }`. |
| **Skip** | Do not change the ADO status. Still mark the workflow as completed. |

### Logging

- Approved: `- HH:MM [UPDATE-STATUS] US-{id}: In Progress -> In Review`
- Skipped: `- HH:MM [REJECT] User skipped status update to In Review`

---

## Approval Presentation Format

When presenting any approval, you MUST follow this structure:

1. **Context line** -- A brief sentence explaining what just happened and why this decision is needed.
2. **Details** -- The specific content being proposed (questions, branch name, commit message, PR description, violation list).
3. **Options** -- Clearly labeled choices. Use the exact option names from this document.

You MUST NOT:
- Combine the details of multiple approvals into a single prompt.
- Present an approval as a rhetorical question (e.g., "I'll go ahead and create the branch" is not an approval).
- Proceed after presenting an approval without an explicit user response.
- Interpret silence as approval.

### Interactive Presentation

When your AI tool supports interactive selection (e.g., Claude Code's `AskUserQuestion`), you MUST present approval options as selectable choices rather than plain text. This allows the user to navigate options with arrow keys instead of typing.

**Format for interactive approvals:**
- Each option is a labeled choice with a short description
- The recommended option appears first
- Context is provided as the question text

**Example — Post Questions Approval:**
Instead of printing "Options: approve / edit / skip", present as:
- Question: "Post these 3 questions to ADO for {{TYPE}}-{{ID}}?"
- Option 1: "Approve" — Post questions as shown above
- Option 2: "Edit" — Modify questions before posting
- Option 3: "Skip" — Don't post, proceed to development

**Example — Auto-Proposed Answers:**
- Question: "Use these proposed answers for the spec-shaper questions?"
- Option 1: "Approve all" — Accept all proposed answers
- Option 2: "Edit" — Review and modify specific answers

**Example — Commit Message:**
- Question: "Commit with message: #12345: implement sso login?"
- Option 1: "Approve" — Commit and push with this message
- Option 2: "Edit" — Modify the commit message

If the AI tool does not support interactive selection, fall back to the text-based format described above.

---

## Activity Log Format Reference

All approval decisions are logged to the current work item's activity file (`.sprint-pilot/workflows/{TYPE}-{ID}/activity.md`) with this format:

```
- HH:MM [CATEGORY] Description
```

Categories used by approvals:

| Category | Used by |
|---|---|
| `APPROVE` | Any approval where the user selects Approve |
| `REJECT` | Any approval where the user selects Skip |
| `UPDATE-STATUS` | Approvals #2, #4, #8 when approved |
| `POST-COMMENT` | Approval #1 when approved |
| `CREATE-BRANCH` | Approval #3 when approved |
| `VERIFY` | Approval #5 when Fix is chosen |
| `OVERRIDE` | Approval #5 when Override is chosen (verification) |
| `COMMIT` | Approval #6 when approved |
| `PUSH` | Approval #6 when approved (separate log entry) |
| `CREATE-PR` | Approval #7 when approved |

---

## Quick Reference Table

| # | Name | Phase | Trigger | Options | Can Skip? |
|---|---|---|---|---|---|
| 1 | Post Clarification Questions | Discovery | Questions identified | Approve / Edit / Skip | Yes |
| 2 | Update Status to Blocked | Discovery | Questions posted | Approve / Skip | Yes |
| 3 | Create Branch | Branch + Dev | Before branch creation | Approve / Edit | No |
| 4 | Update Status to In Progress | Branch + Dev | Branch created | Approve / Skip | Yes |
| 5 | Verification Violations | Verification | Errors found | Fix / Override | No |
| 6 | Commit and Push | Delivery | Before final commit | Approve / Edit | No |
| 7 | Create Pull Request | Delivery | Before PR creation | Approve / Edit | No |
| 8 | Update Status to In Review | Delivery | PR created | Approve / Skip | Yes |
