---
description: 'Check if clarification questions have been answered in ADO'
---

You are executing the `/sp-check-answers` command. This checks Azure DevOps comments for replies to clarification questions posted by SprintPilot during Phase 1 (Discovery). It is used when a workflow is in the `waiting_for_answers` state.

## Prerequisites

### Check 1: Load clarification flow instructions

```
Tool: sp-instructions
Parameters: { "name": "clarification-flow" }
```

Read the full response, specifically the "Checking for Answers" and "Analyzing Answers" sections.

### Check 2: Find workflows waiting for answers

Read all `state.md` files in `.sprint-pilot/workflows/*/`. Parse the Phase field from each.

- If multiple workflows are in `waiting_for_answers` phase: list them and ask the user which one to check.

STOP: Wait for the user to select a workflow if multiple are waiting.

- If exactly one workflow is in `waiting_for_answers` phase: use that one.
- If no workflows are in `waiting_for_answers` phase: report "No workflows are currently waiting for answers." and suggest `/sp-status` to see all workflow states. Do NOT proceed further.

## Fetch and Analyze Comments

### Step 1: Get comments from ADO

```
Tool: sp-get-comments
Parameters: { "id": {WORK_ITEM_ID} }
```

### Step 2: Find the SprintPilot comment

Scan the comments array for the last comment where `isSprintPilot` is `true`. This is the most recent SprintPilot-posted clarification comment.

If no SprintPilot comment is found: report an error ("Could not find the original clarification comment on {TYPE}-{ID}"). This indicates the comment may have been deleted. Ask the user how to proceed.

### Step 3: Identify new comments

All comments with a `createdDate` after the SprintPilot comment's date are potential answers.

### Step 4: Map answers to questions

Read the original questions from the `## Clarifications` section of the workflow state file. For each question, determine whether a clear answer exists in the subsequent comments.

## Decision Tree

### Path A: All questions fully answered

Report findings:

```
Answers for {TYPE}-{ID} (Round {N}):

1. Q: {question text}
   A: "{answer text}" -- ANSWERED

2. Q: {question text}
   A: "{answer text}" -- ANSWERED
```

Then:
1. Update the `## Clarifications` section in the workflow state with Q&A pairs.
2. Update acceptance criteria in the state file if answers modify them.
3. Update phase to `development`.
4. If status was set to Blocked, ask: "Update status to In Progress?"

STOP: Wait for the user's response on the status update.

5. Ask: "All questions answered. Proceed to Phase 2 (Branch + Development)?"

STOP: Wait for the user's confirmation before proceeding.

### Path B: Partially answered

Report findings with status for each question:

```
Answers for {TYPE}-{ID} (Round {N}):

1. Q: {question text}
   A: "{answer text}" -- ANSWERED

2. Q: {question text}
   A: No response yet -- UNANSWERED

3. Q: {question text}
   A: "{partial answer}" -- PARTIALLY ANSWERED
```

Then present options:

```
{N} of {M} questions were answered. What would you like to do?
- Post follow-up questions for the unanswered items (Round {N+1})
- Proceed to development with the answers we have
- Wait and check again later
```

STOP: Wait for the user's choice.

- If follow-up: format using the clarification comment template with incremented round number. Get approval before posting to ADO.
- If proceed: log the decision, update state to `development`, move to Phase 2.
- If wait: no state change, inform the user they can run `/sp-check-answers` again later.

### Path C: No new comments

Report:

```
No new comments on {TYPE}-{ID} since the questions were posted ({TIME_ELAPSED} ago).
```

Do NOT change the workflow state. Present options:

```
You can:
- Check again later
- Proceed to development without answers
- Post a follow-up reminder
```

STOP: Wait for the user's choice.

## After Completing This

- If answers are complete, the autopilot continues at Phase 2 (Branch + Development) as described in CLAUDE.md.
- The full clarification flow is in `clarification-flow.md` (loaded via `sp-instructions` name "clarification-flow").
- To see all workflow statuses: `/sp-status`.
