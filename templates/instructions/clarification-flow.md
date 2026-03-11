# Clarification Flow

> **AI Context:** This file is loaded during Phase 1 (Discovery) when clarification questions are identified. Your role is to analyze requirements gaps, classify questions as business vs. technical, and post approved questions to ADO. The expected outcome is that the Product Owner receives well-formed, specific questions and the workflow transitions to `waiting_for_answers`.

This is the comprehensive reference for the clarification question cycle in SprintPilot. You MUST follow this process whenever ambiguities or gaps are found during Discovery (Phase 1).

---

## When to Ask Questions

During scope analysis in Phase 1, you MUST actively look for the following types of issues. If any are found, clarification questions are needed before proceeding to development.

### Issue Types to Detect

1. **Ambiguous requirements** -- The description or acceptance criteria can be interpreted in more than one way. If two developers could reasonably build different things from the same text, it is ambiguous.

2. **Missing acceptance criteria** -- The work item has a description but no acceptance criteria, or the criteria do not cover all aspects of the described functionality.

3. **Contradictions between description and product docs** -- The work item says one thing, but the files in `fabric/product/` describe a different pattern, architecture, or behavior. For example, the work item describes a REST endpoint but the product docs specify GraphQL.

4. **Undefined edge cases** -- The happy path is described but there is no guidance on what happens when things go wrong. Examples: What if the input is empty? What if the user is not authenticated? What if the external service is down?

5. **Missing error handling requirements** -- The work item specifies what should happen on success but does not define error states, error messages, or recovery behavior.

6. **Unclear scope boundaries** -- It is not clear what is included in this work item versus what belongs to a future item. For example: "Implement user profile" -- does this include avatar upload? Email verification? Password change?

7. **Dependencies on other work items not mentioned** -- The implementation requires functionality that does not exist yet and is not referenced in the work item. For example, the work item says "add SSO login" but there is no mention of the identity provider configuration that would need to exist first.

### Question Classification

Before presenting any question to the user, you MUST classify it as either a **Business Question** or a **Technical Question**. Only business questions are posted to ADO for the Product Owner. Technical questions are deferred to Phase 2 spec-shaping.

#### Business Questions (post to ADO for PO)

These are questions where the answer depends on product decisions, not engineering judgment:

- **Scope boundaries** -- What is included vs. excluded from this work item
- **Acceptance criteria gaps** -- Missing or ambiguous criteria that affect what "done" means
- **Priority decisions** -- Whether to include a sub-feature now or defer it
- **User experience decisions** -- Where to redirect, what to show, what labels to use
- **Integration choices visible to users** -- Which providers to support, which external services to expose
- **Operational scope** -- Which environments, who gets alerts, what SLAs apply

#### Technical Questions (defer to Phase 2 spec-shaping)

These are questions where the answer depends on engineering judgment and can be resolved by the AI using project standards and best practices:

- **Architecture choices** -- Service design, class structure, design patterns
- **Implementation approach** -- SDK configuration, library usage, API format
- **Code-level decisions** -- Migration strategy, naming conventions, file organization
- **Performance strategy** -- Sampling rates, caching approach, bundling strategy
- **Internal security details** -- Sanitization approach, data collection settings, internal auth patterns

#### Classification Rule

> **CRITICAL:** You MUST classify each question as Business or Technical before presenting to the user. Only business questions are posted to ADO. Technical questions are noted in the workflow state under `## Technical Decisions (Pending)` and resolved during Phase 2 spec-shaping, where the AI will propose answers based on `fabric/standards/`, `fabric/product/`, and industry best practices. If you are unsure whether a question is business or technical, classify it as business (err on the side of asking the PO).

### When NOT to Ask Questions

- You MUST NOT ask questions about implementation details that are clearly the developer's decision (e.g., variable names, internal function structure, choice of utility library).
- You MUST NOT ask questions that are already answered in the work item description, acceptance criteria, or product docs.
- You MUST NOT generate questions just to be thorough -- every question must address a genuine gap that would affect the implementation.

---

## Question Format

### Generating Questions

When you identify gaps, generate a numbered list of questions. Each question MUST:

1. Be specific and actionable -- the person answering should know exactly what decision you need from them
2. Provide context -- explain briefly why you are asking (what ambiguity or gap you found)
3. Offer options when possible -- "Should we support SAML only, or both SAML and OAuth?" is better than "What authentication protocols should we support?"

### Presenting to the User

Before posting anything to ADO, you MUST present the questions to the user for review, separated by classification.

Format your presentation as follows:

```
I found the following gaps in requirements for {{TYPE}}-{{ID}}:

**Questions for PO (will be posted to ADO):**
1. [Business question with context]
2. [Business question with context]

**Technical decisions (will be resolved during spec-shaping):**
3. [Technical question — AI will propose answer based on standards]
4. [Technical question — AI will propose answer based on standards]

Post the PO questions to ADO?
```

If there are **no business questions** (only technical), skip the ADO posting entirely and note the technical questions in the workflow state under `## Technical Decisions (Pending)`.

If there are **no technical questions** (only business), present only the business questions for posting.

The user can:
- **Approve** -- Post the business questions as-is to ADO
- **Edit** -- Provide revised questions (use their version exactly, do not merge or modify)
- **Skip** -- Do not post questions; proceed to Phase 2 without clarification (log the skip in the workflow state)

Technical questions are always recorded in the workflow state under `## Technical Decisions (Pending)` regardless of the user's approval choice for business questions.

---

## Comment Template

When posting questions to ADO, you MUST use the template from `sp-instructions` (name "clarification-comment", category "templates").

### Template Structure

```html
<!-- sprint-pilot:clarification:round:{{ROUND}} -->

## Clarification Questions

{{QUESTIONS}}

---
*Posted by SprintPilot. Please reply to this comment with your answers.*
```

### Template Fields

- `{{ROUND}}` -- The clarification round number, starting at 1. Increments for each follow-up round.
- `{{QUESTIONS}}` -- The numbered questions formatted in HTML/Markdown.

### Marker Requirement

You MUST include the `<!-- sprint-pilot:clarification:round:N -->` marker in every clarification comment. This marker is:
- Used by `sp-get-comments` to set the `isSprintPilot` flag on the comment
- Used to identify which round a comment belongs to
- Validated by the `sp-post-comment` tool -- the call will fail if the marker is missing

### Example: Round 1 Comment

```html
<!-- sprint-pilot:clarification:round:1 -->

## Clarification Questions

1. The acceptance criteria mention "support SSO login" but do not specify the protocol. Should we implement SAML, OAuth 2.0, or both?

2. The work item description says "users should be redirected after login." Where should they be redirected to -- the page they came from, or always to the dashboard?

3. Should we handle the case where the identity provider is unreachable? If so, what should the user see (error page, fallback to password login, etc.)?

---
*Posted by SprintPilot. Please reply to this comment with your answers.*
```

---

## Posting Questions (Approval Required)

This is the step-by-step procedure for posting clarification questions to ADO.

### Step 1: Generate Questions

After analyzing the work item scope (using `sp-get-item` data, `sp-get-comments` history, `fabric/standards/`, and `fabric/product/`), generate numbered questions for each gap found.

### Step 2: Present to User

Show the questions to the user with the approval prompt. **CRITICAL:** You MUST NOT post questions to ADO without explicit user approval.

**STOP -- Wait for user response before continuing.**

### Step 3: Handle User Response

| Response | Action |
|---|---|
| **Approve** | Proceed to Step 4 |
| **Edit** | Accept the user's revised questions exactly as provided. Proceed to Step 4 with the edited version. |
| **Skip** | Log `"clarification_skipped"` in the workflow state. Do NOT post anything to ADO. Proceed directly to Phase 2. |

### Step 4: Format and Post

1. Format the approved questions using the clarification comment template
2. Set the round marker to the current round number (1 for the first round)
3. Call `sp-post-comment` with `{ "id": <work-item-id>, "text": "<formatted-html>" }`
4. Verify the response: confirm `comment_posted` status and record the `comment_id`

### Step 5: Offer Status Update

After posting, present a second approval:

```
Questions posted to {{TYPE}}-{{ID}}. Update status to Blocked?
Options: approve / skip
```

**STOP -- Wait for user response before continuing.**

| Response | Action |
|---|---|
| **Approve** | Call `sp-update-status` with `{ "id": <work-item-id>, "status": "blocked" }` |
| **Skip** | Do not change the status. Log the skip. |

### Step 6: Update Workflow State

1. Update the workflow state file:
   - Phase: `waiting_for_answers`
   - State: `round_1` (or `round_N` for follow-up rounds)
   - Record the questions in the `## Clarifications` section
2. Append a checkpoint: `Questions posted (round N)`
3. Log `POST-COMMENT` in the activity log

### Step 7: Suggest Next Action

After posting questions, suggest to the user:

```
This item is now waiting for answers. Would you like to:
- Work on another item ("show my work items")
- Wait and check back later ("check answers on {{TYPE}}-{{ID}}")
```

After posting questions and transitioning to `waiting_for_answers`, suggest switching to another work item. The current item cannot proceed until answers arrive.

---

## Checking for Answers

When the user asks to check for answers on a work item in `waiting_for_answers` state, follow this procedure.

### Step 1: Fetch Comments

Call `sp-get-comments` with `{ "id": <work-item-id> }`.

### Step 2: Find the SprintPilot Comment

Scan the comments array for the last comment where `isSprintPilot` is `true`. This is the most recent SprintPilot-posted clarification comment.

### Step 3: Identify Answers

All comments with a `createdDate` after the SprintPilot comment are potential answers. Read their text content.

### Step 4: Map Answers to Questions

For each original numbered question (from the workflow state file), determine:
- Is there a clear answer in the subsequent comments?
- Is the answer complete or partial?
- Does the answer raise new questions?

### Step 5: Present Findings

Report the analysis to the user with clear status for each question:

```
Answers for {{TYPE}}-{{ID}} (Round {{N}}):

1. Q: Should we support SAML, OAuth, or both?
   A: "Both SAML and OAuth 2.0" -- ANSWERED

2. Q: Where should users be redirected after login?
   A: No response yet -- UNANSWERED

3. Q: How should we handle identity provider downtime?
   A: "Show an error page with retry option" -- ANSWERED
```

---

## Analyzing Answers

Based on the findings from the check, take one of three paths:

### Path A: Fully Answered

All questions have clear, complete answers.

1. Update the `## Clarifications` section in the workflow state with Q&A pairs:
   ```markdown
   ## Clarifications
   - Q: Should we support SAML, OAuth, or both? -> A: Both SAML and OAuth 2.0
   - Q: Where should users be redirected? -> A: To the page they came from (referer)
   - Q: How to handle IdP downtime? -> A: Show error page with retry button
   ```
2. Update acceptance criteria in the workflow state if answers modify or extend them
3. Update phase to `development`
4. If the work item status was set to Blocked, offer to update it: "Update status to In Progress?"
5. Proceed to Phase 2

### Path B: Partially Answered

Some questions are answered, some are not.

1. Present the findings to the user (which answered, which not)
2. Record the answered Q&A pairs in the workflow state
3. Offer to post follow-up questions for the unanswered items:
   ```
   2 of 3 questions were answered. Post follow-up for the unanswered question?
   Options: approve / edit / skip
   ```
4. If approved: Format as a round N+1 comment (see Multi-Round Flow below)
5. If skipped: Proceed to Phase 2 with the partial information. Log the decision.

### Path C: No New Comments

No comments were posted after the SprintPilot clarification comment.

1. Inform the user:
   ```
   No new comments on {{TYPE}}-{{ID}} since the questions were posted on {{DATE}}.
   ```
2. Do NOT change the workflow state
3. Suggest options:
   - Check again later
   - Proceed without answers (user's decision)
   - Post a follow-up or reminder

---

## Multi-Round Flow

When follow-up questions are needed (Path B above), a new round begins.

### Round Numbering

- Round 1: Initial clarification questions
- Round 2: Follow-up after partial answers to Round 1
- Round 3: Follow-up after partial answers to Round 2
- And so on (no hard limit, but more than 3 rounds is unusual)

Each round increments the marker in the comment:
- `<!-- sprint-pilot:clarification:round:1 -->`
- `<!-- sprint-pilot:clarification:round:2 -->`
- `<!-- sprint-pilot:clarification:round:3 -->`

### Follow-Up Comment Format

Follow-up comments use the same template but should reference the previous round:

```html
<!-- sprint-pilot:clarification:round:2 -->

## Follow-Up Questions (Round 2)

Thank you for the answers to Round 1. We have a few remaining questions:

1. [Unanswered question from Round 1, rephrased if needed]
2. [New question raised by the answers]

---
*Posted by SprintPilot. Please reply to this comment with your answers.*
```

### Tracking in Workflow State

All Q&A pairs from all rounds are tracked in the `## Clarifications` section of the workflow state file:

```markdown
## Clarifications

### Round 1 (posted 2026-03-03)
- Q: Should we support SAML, OAuth, or both? -> A: Both SAML and OAuth 2.0
- Q: Where should users be redirected after login? -> A: (unanswered, followed up in Round 2)
- Q: How to handle IdP downtime? -> A: Show error page with retry button

### Round 2 (posted 2026-03-04)
- Q: Where should users be redirected after login -- referer page or dashboard? -> A: Referer page, with dashboard as fallback
```

### State Updates per Round

| Event | Phase | State |
|---|---|---|
| Round 1 posted | `waiting_for_answers` | `round_1` |
| Round 1 answered, follow-up needed | `waiting_for_answers` | `round_2` |
| Round 2 posted | `waiting_for_answers` | `round_2` |
| All questions answered | `development` | `branched` (or next sub-state) |

---

## Rules

These rules apply at all times during the clarification flow:

1. You MUST NOT auto-check ADO for answers on session start. Only check when the user explicitly requests it (e.g., "check answers on US-12345").

2. **CRITICAL:** You MUST present questions to the user for approval before posting to ADO. Never post questions without explicit user consent.

3. You MUST use the clarification comment template from `sp-instructions` (name "clarification-comment", category "templates") with the `<!-- sprint-pilot:clarification:round:N -->` marker.

4. You MUST track all clarification rounds in the workflow state file under the `## Clarifications` section, using the `Q: ... -> A: ...` format.

5. You MUST NOT modify or delete previously posted clarification comments. The `sp-post-comment` tool only supports creating new comments.

6. You MUST NOT assume answers. If a comment is ambiguous or could be interpreted multiple ways, flag it as partially answered and seek confirmation from the user.

7. You MUST offer to update the work item status to Blocked after posting clarification questions. This is a separate approval point -- do not combine it with the question-posting approval.

8. You MUST log all clarification actions (POST-COMMENT, UPDATE-STATUS) in the activity log with the work item ID and round number.

9. You MUST increment the round number for each new set of follow-up questions. Never reuse a round number.

10. You MUST suggest switching to another work item after posting questions, since the current item cannot proceed until answers arrive.
