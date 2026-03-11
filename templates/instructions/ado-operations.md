# ADO Operations

> **AI Context:** This file is the MCP tool cookbook. Consult it whenever you need to call a SprintPilot MCP tool. Your role is to use these tools correctly for all Azure DevOps interactions. The expected outcome is that every ADO operation goes through the MCP layer with correct parameters, proper error handling, and appropriate user approvals.

This is the comprehensive reference for interacting with Azure DevOps through SprintPilot MCP tools. You MUST follow these instructions for every ADO interaction.

---

## Rule: Use SprintPilot MCP for ALL Azure DevOps Operations

**CRITICAL:** You MUST use SprintPilot MCP tools for every ADO interaction. You MUST NOT make direct HTTP calls to ADO APIs. You MUST NOT access the PAT token or attempt to read it from any source (keychain, file, environment variable, config). The MCP server enforces scope restrictions, sanitizes responses, and logs all activity. Bypassing it would violate the security model.

---

## sp-my-items

**Purpose:** Fetch all work items assigned to you, scoped to the configured project and allowed work item types.

**Input:**
```json
{}
```
No parameters required.

**Response:** Items grouped by type (User Story, Bug, Task) then by state within each type. Includes `id`, `title`, `state`, and `iteration` for each item.

```json
{
  "status": "items_fetched",
  "total": 12,
  "items": {
    "User Story": {
      "Active": [
        { "id": 12345, "title": "Implement SSO login", "state": "Active", "iteration": "Sprint 14" }
      ],
      "New": [...]
    },
    "Bug": {...},
    "Task": {...}
  }
}
```

**When to use:**
- At session start, to show the user their current work
- When the user says "show my work items", "what am I working on", or similar
- When browsing for a new item to start

**Error handling:**
- `auth_expired` -- Inform the user their PAT may have expired and suggest running `sprint-pilot init --reconfigure-pat` in their terminal
- `ado_unreachable` -- Inform the user to check their VPN/network connection
- `no_items` (total = 0) -- Tell the user no work items are assigned to them

---

## sp-get-item

**Purpose:** Fetch full details of a single work item by its numeric ID.

**Input:**
```json
{
  "id": 12345
}
```

**Response:** Full work item with title, description, acceptance criteria, state, iteration, area path, tags, and timestamps.

```json
{
  "status": "item_fetched",
  "item": {
    "id": 12345,
    "type": "User Story",
    "title": "Implement SSO login",
    "description": "As a user I want to...",
    "acceptanceCriteria": "1. Support SAML...",
    "state": "Active",
    "assignedTo": "user@company.com",
    "iteration": "MyProject\\Sprint 14",
    "areaPath": "MyProject\\Backend",
    "tags": "sso, auth",
    "createdDate": "2026-02-28T10:00:00Z",
    "changedDate": "2026-03-02T14:30:00Z"
  }
}
```

**When to use:**
- When starting work on a specific item (e.g., user says "work on 12345" or "pick up US-12345")
- During the Discovery phase to analyze scope and requirements
- When you need to re-read acceptance criteria or description mid-workflow

**Error handling:**
- `not_found` -- The work item ID does not exist; ask the user to verify the number
- `scope_violation` -- The item is not assigned to the user, not in the configured project, or its type is not in the allowed list; inform the user of the specific reason

---

## sp-get-comments

**Purpose:** Read all comments on a work item, in chronological order.

**Input:**
```json
{
  "id": 12345
}
```

**Response:** Array of comments, each with `id`, `text` (HTML), `createdBy`, `createdDate`, and the `isSprintPilot` boolean flag.

```json
{
  "status": "comments_fetched",
  "item_id": 12345,
  "comments": [
    {
      "id": 1001,
      "text": "<h3>Clarification Questions...</h3>...",
      "createdBy": "user@company.com",
      "createdDate": "2026-03-03T10:00:00Z",
      "isSprintPilot": true
    },
    {
      "id": 1002,
      "text": "Answers: 1. We need SAML and OAuth...",
      "createdBy": "po@company.com",
      "createdDate": "2026-03-03T14:00:00Z",
      "isSprintPilot": false
    }
  ]
}
```

The `isSprintPilot` flag is `true` when the comment text contains the `<!-- sprint-pilot -->` HTML marker. Use this flag to detect SprintPilot-posted clarification comments and to find answers posted after them.

**When to use:**
- During the Discovery phase to check for existing clarifications
- When the user asks to check for answers to previously posted questions
- When resuming a workflow that was waiting on answers

**How to detect answers:**
1. Find the last comment where `isSprintPilot` is `true`
2. All comments with a `createdDate` after that SprintPilot comment are potential answers
3. Map the answer content to the original numbered questions

**Important:** You MUST NOT auto-check for answers on session start. Only check when the user explicitly requests it.

---

## sp-post-comment

**Purpose:** Post a new comment on a work item. Used exclusively for posting clarification questions.

**Input:**
```json
{
  "id": 12345,
  "text": "<formatted HTML content>"
}
```

**Response:** The created comment ID and URL.

```json
{
  "status": "comment_posted",
  "item_id": 12345,
  "comment_id": 1003,
  "url": "https://dev.azure.com/..."
}
```

**When to use:**
- After the user approves clarification questions (never post without explicit user approval)
- For follow-up questions in subsequent clarification rounds

**Format requirements:**
- You MUST format the comment text using the template from `sp-instructions` (name "clarification-comment", category "templates")
- You MUST include the `<!-- sprint-pilot:clarification:round:N -->` marker in the comment, where N is the clarification round number (starting at 1)
- Questions MUST be numbered for easy reference when answers come back
- The HTML should be well-formed and readable in the ADO web interface

**Example formatted text:**
```html
<!-- sprint-pilot:clarification:round:1 -->

## Clarification Questions

1. Should SSO support both SAML and OAuth, or only SAML?
2. What is the expected session timeout duration?
3. Should we support single-logout (SLO) in this iteration?

---
*Posted by SprintPilot. Please reply to this comment with your answers.*
```

**Constraints:**
- This tool only creates new comments. It cannot edit or delete comments.
- The Zod schema validates that the marker is present. The call will fail if the marker is missing.

---

## sp-update-status

**Purpose:** Update a work item's state field. Only accepts mapped status keys, not raw ADO state names.

**Input:**
```json
{
  "id": 12345,
  "status": "blocked"
}
```

**Allowed `status` keys:**
| Mapped Key | Typical ADO State | When to Use |
|---|---|---|
| `"blocked"` | Blocked | After posting clarification questions (with user approval) |
| `"inProgress"` | Active | When starting development on an item |
| `"inReview"` | Resolved | After creating a PR |

The actual ADO state name for each key is resolved from the project configuration (`config.statusMapping`). You MUST NOT pass raw ADO state names like `"Active"` or `"Resolved"` -- only the mapped keys above are accepted.

**Response:**
```json
{
  "status": "status_updated",
  "item_id": 12345,
  "previous_state": "Active",
  "new_state": "Blocked"
}
```

**When to use:**
- After an approval point where the user agrees to a status change
- You MUST always present the status change to the user and get approval before calling this tool

**Error handling:**
- `invalid_status` -- You used a key that is not one of `blocked`, `inProgress`, `inReview`
- `invalid_transition` -- ADO rejected the state transition (e.g., cannot go directly from "New" to "Resolved"); inform the user of the allowed transitions

---

## sp-create-branch

**Purpose:** Create a Git branch in Azure DevOps from the configured base branch.

**Input:**
```json
{
  "name": "features/12345-implement-sso-login",
  "source_ref": "refs/heads/develop"
}
```

**IMPORTANT:** The `source_ref` value MUST match `refs/heads/{config.git.baseBranchOrTag}`. If you pass a different source ref, the tool will reject the request with a `scope_violation` error. Always read the base branch from config before calling this tool.

**Response:**
```json
{
  "status": "branch_created",
  "name": "features/12345-implement-sso-login",
  "source": "refs/heads/develop",
  "commit": "abc123def456..."
}
```

**After creating the branch, you MUST run these local git commands:**
```bash
git fetch origin
git checkout features/12345-implement-sso-login
```

This fetches the newly created remote branch and switches the local working directory to it.

**When to use:**
- At the start of Phase 2 (Branch and Develop), after the user approves the branch name
- You MUST use this MCP tool to create branches -- do NOT use `git push origin` or any other method to create remote branches

**Error handling:**
- `scope_violation` -- The `source_ref` does not match the configured base branch; fix the ref and retry
- `branch_exists` -- A branch with this name already exists; ask the user whether to reuse it (just `git checkout` locally) or choose a different name

---

## sp-create-pr

**Purpose:** Create a pull request in Azure DevOps. The target branch is always taken from config -- you cannot specify a different target.

**Input:**
```json
{
  "source_branch": "features/12345-implement-sso-login",
  "title": "#12345: Implement SSO login",
  "description": "## Summary\n...",
  "work_item_id": 12345,
  "tags": ["Sprint 14"]
}
```

**Field details:**
- `source_branch` -- The branch name (without `refs/heads/` prefix) created during the workflow
- `title` -- The commit-style title with the work item ID prefix
- `description` -- Generated from the PR template via `sp-instructions` (name "pr-description", category "templates")
- `work_item_id` -- The numeric work item ID to link to the PR
- `tags` -- Array of tags; typically includes the current sprint name (resolve using `sp-get-iterations`)

**Response (new PR):**
```json
{
  "status": "pr_created",
  "pr_id": 89,
  "url": "https://dev.azure.com/...",
  "source": "features/12345-implement-sso-login",
  "target": "develop",
  "work_item_linked": true,
  "tags": ["Sprint 14"]
}
```

**Response (PR already exists):**
```json
{
  "status": "pr_exists",
  "pr_id": 89,
  "url": "https://dev.azure.com/..."
}
```

If a PR already exists for the source branch, the tool returns the existing PR details instead of creating a duplicate.

**When to use:**
- During Phase 5 (Delivery), after all quality checks and tests pass, and after the user approves the PR description

**Error handling:**
- `pr_exists` -- Not an error; inform the user and provide the existing PR URL
- `empty_diff` -- There are no changes between source and target; investigate whether changes were lost or the branch was already merged

---

## sp-get-iterations

**Purpose:** Fetch team sprints/iterations for the configured project.

**Input:**
```json
{}
```
No parameters required.

**Response:** List of iterations with the current iteration highlighted via the `timeFrame` field.

```json
{
  "status": "iterations_fetched",
  "current": { "name": "Sprint 14", "startDate": "2026-02-24", "endDate": "2026-03-07" },
  "iterations": [
    { "name": "Sprint 13", "startDate": "...", "endDate": "...", "timeFrame": "past" },
    { "name": "Sprint 14", "startDate": "...", "endDate": "...", "timeFrame": "current" },
    { "name": "Sprint 15", "startDate": "...", "endDate": "...", "timeFrame": "future" }
  ]
}
```

**When to use:**
- During PR creation to resolve the current sprint name for the PR tags
- When the user asks about sprint timelines

**To find the current sprint:** Look for the iteration with `"timeFrame": "current"` and use its `name` field.

---

## sp-config

**Purpose:** Read or update SprintPilot configuration stored in `.sprint-pilot/config.md`.

**Input (read):**
```json
{
  "action": "read"
}
```

**Input (write):**
```json
{
  "action": "write",
  "updates": {
    "git.branchTemplate": "feature/{id}-{slug}",
    "testing.devServerCommand": "npm run dev"
  }
}
```

**Updatable fields:** `allowedWorkItemTypes`, `statusMapping`, `git.baseBranchOrTag`, `git.prTargetBranch`, `git.branchTemplate`, `git.commitTemplate`, `testing.devServerCommand`, `testing.testCommand`.

**Not updatable via this tool:** `organizationUrl` and `project` (these require re-initialization via the CLI: `sprint-pilot setup-claude --force`). PAT is also managed exclusively through the CLI (`sprint-pilot init --reconfigure-pat`).

**When to use:** Rarely needed during normal workflows. Configuration is set via the CLI (sprint-pilot init or sprint-pilot setup-<tool>). You may use this to read config values (e.g., base branch name) when needed for branch creation or PR operations.

---

## sp-init

**Purpose:** Check whether SprintPilot is initialized and report status. Does **not** accept PAT or perform initialization -- all setup happens via the CLI (`sprint-pilot setup-claude`, etc.).

**Input:** None (empty object, strictly validated).

**Output:** Returns one of:
- `{ status: "initialized", pat_configured: true, auth_method: "os_keychain", config: {...} }` -- all good
- `{ status: "not_initialized", message: "Run 'sprint-pilot setup-claude' ...", checks: { fabric, product, config } }` -- not set up yet
- `{ status: "pat_missing", message: "Run 'sprint-pilot init --reconfigure-pat' ...", config: {...} }` -- config exists but PAT is gone

**When to use:** At session start to verify readiness. If status is `not_initialized` or `pat_missing`, inform the user to run the appropriate CLI command in their terminal.

You MUST NOT attempt to handle PAT through this tool or any MCP tool. PAT configuration is exclusively handled in the terminal via the CLI.

---

## Error Response Format (IMPORTANT -- Read Before Handling Any Error)

All tools return errors in a consistent structure. You MUST check the `error` field of every MCP response and handle it according to the table below.

```json
{
  "error": "error_code",
  "message": "Human-readable explanation",
  "reason": "Specific detail about what went wrong",
  "guidance": "What the user should do to fix it"
}
```

**CRITICAL -- Common error codes and how to handle them (do NOT silently swallow errors):**

| Error Code | Meaning | Action |
|---|---|---|
| `scope_violation` | Item not assigned to user, wrong project, wrong type, or wrong branch ref | Inform user of the specific reason; do not retry |
| `not_found` | Work item ID does not exist | Ask user to verify the ID |
| `auth_expired` | PAT has expired or been revoked | Suggest running `sprint-pilot init --reconfigure-pat` in the terminal |
| `ado_unreachable` | Cannot reach Azure DevOps | Suggest checking VPN/network |
| `invalid_status` | Used a raw ADO state name instead of a mapped key | Use only `blocked`, `inProgress`, or `inReview` |
| `invalid_transition` | ADO rejected the state change | Inform user of allowed transitions |
| `branch_exists` | Branch name already taken | Ask user whether to reuse or rename |
| `empty_diff` | No changes between source and target for PR | Investigate; changes may have been lost |
| `config_missing` | SprintPilot not initialized | Run `sprint-pilot setup-claude` (or setup-cursor, etc.) in the terminal |
| `validation_error` | Input failed Zod schema validation | Check input format and required fields |
