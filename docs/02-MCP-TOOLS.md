# 02 — MCP Tools

**Parent:** `00-MASTER-OVERVIEW.md`
**Related:** `01-SECURITY-MODEL.md`, `04-ADO-API-REFERENCE.md`

---

## 1. Tool Summary

| # | Tool | Category | Description |
|---|------|----------|-------------|
| 1 | `/sp-init` | Setup | Check SprintPilot initialization status |
| 2 | `/sp-config` | Setup | Read or update project configuration |
| 3 | `/sp-my-items` | Discovery | Fetch work items assigned to current user |
| 4 | `/sp-get-item` | Discovery | Read a single work item's full details |
| 5 | `/sp-get-comments` | Clarification | Read comments on a work item |
| 6 | `/sp-post-comment` | Clarification | Post a new comment on a work item |
| 7 | `/sp-update-status` | Workflow | Update a work item's status (mapped only) |
| 8 | `/sp-create-branch` | Development | Create a branch from configured base |
| 9 | `/sp-create-pr` | Delivery | Create a PR to configured target branch |
| 10 | `/sp-get-iterations` | Context | Read sprints/iterations for the project |

---

## 2. Tool Specifications

### 2.1 `/sp-init`

**Purpose:** Check whether SprintPilot is initialized and report status. Does **not** accept PAT or perform initialization — all setup happens via the CLI (`sprint-pilot setup-claude`, etc.).

**Inputs:** None (empty object, strictly validated).

**Behavior:**
1. Check if `fabric/` directory exists
2. Check if `fabric/product/` directory exists
3. Check if `.sprint-pilot/config.md` exists → if yes, load it
4. Check if a PAT is stored (OS keychain or file fallback)
5. Return a status summary based on these checks

**Output — initialized (all checks pass):**
```json
{
  "status": "initialized",
  "pat_configured": true,
  "auth_method": "os_keychain",
  "config": { "organizationUrl": "...", "project": "...", ... }
}
```

**Output — not initialized (config missing):**
```json
{
  "status": "not_initialized",
  "message": "Run 'sprint-pilot setup-claude' in your terminal to initialize.",
  "checks": { "fabric": true, "product": true, "config": false }
}
```

**Output — PAT missing (config exists but PAT not stored):**
```json
{
  "status": "pat_missing",
  "message": "PAT not configured. Run 'sprint-pilot init --reconfigure-pat' in your terminal.",
  "config": { "organizationUrl": "...", "project": "...", ... }
}
```

**Errors:**
- Unknown keys in input → `{ error: "validation_error", message: "Unrecognized key(s) in object: ..." }`
- Unexpected failure → `{ error: "internal_error", message: "..." }`

---

### 2.2 `/sp-config`

**Purpose:** Read or update project configuration.

**Inputs:**
```json
{
  "action": "read" | "write",
  "updates": { ... }  // only for "write"
}
```

**For `read`:** Returns current config from `.sprint-pilot/config.md`.

**For `write`:** Validates updates against Zod schema, merges with existing config, writes back.

**Updatable fields:** `allowedWorkItemTypes`, `statusMapping`, `git.baseBranchOrTag`, `git.prTargetBranch`, `git.branchTemplate`, `git.commitTemplate`, `testing.devServerCommand`, `testing.testCommand`.

**Not updatable via this tool:** `organizationUrl`, `project` (require re-init via CLI: `sprint-pilot setup-claude --force`), PAT (use CLI: `sprint-pilot init --reconfigure-pat`).

---

### 2.3 `/sp-my-items`

**Purpose:** Fetch all work items assigned to the current user, scoped to configured project and types.

**Inputs:** None.

**Behavior:**
1. Build WIQL query:
   ```sql
   SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.IterationPath]
   FROM WorkItems
   WHERE [System.AssignedTo] = @Me
     AND [System.TeamProject] = '{config.project}'
     AND [System.WorkItemType] IN ('{type1}', '{type2}', ...)
   ORDER BY [System.ChangedDate] DESC
   ```
2. Execute via ADO API
3. Fetch details for returned IDs (batched)
4. Group by type, then by state
5. Post-fetch: verify every item matches scope (defense in depth)

**Output:**
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

**Errors:**
- ADO unreachable → `{ error: "ado_unreachable" }`
- PAT expired → `{ error: "auth_expired", guidance: "Run 'sprint-pilot init --reconfigure-pat' in your terminal" }`
- No items found → `{ status: "no_items", total: 0, items: {} }`

---

### 2.4 `/sp-get-item`

**Purpose:** Read full details of a single work item.

**Inputs:**
```json
{
  "id": 12345
}
```

**Behavior:**
1. Fetch work item via ADO API: `GET /_apis/wit/workItems/{id}?$expand=all`
2. **Scope check:** verify `AssignedTo` = current user, `TeamProject` = config project, `WorkItemType` in config types
3. Return sanitized details

**Output:**
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

**Errors:**
- Item not found → `{ error: "not_found", id: 12345 }`
- Item out of scope (wrong user) → `{ error: "scope_violation", reason: "Work item not assigned to you" }`
- Item out of scope (wrong project) → `{ error: "scope_violation", reason: "Work item not in configured project" }`
- Item out of scope (wrong type) → `{ error: "scope_violation", reason: "Work item type 'Epic' not in allowed types" }`

---

### 2.5 `/sp-get-comments`

**Purpose:** Read all comments on a work item.

**Inputs:**
```json
{
  "id": 12345
}
```

**Behavior:**
1. Validate item passes scope check (same as `/sp-get-item`)
2. Fetch comments via ADO API: `GET /_apis/wit/workItems/{id}/comments`
3. Return chronologically ordered

**Output:**
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

The `isSprintPilot` flag is detected by checking for `<!-- sprint-pilot -->` HTML marker in the comment text.

---

### 2.6 `/sp-post-comment`

**Purpose:** Post a new comment on a work item.

**Inputs:**
```json
{
  "id": 12345,
  "text": "<h3>Clarification Questions (Round 1)</h3>..."
}
```

**Behavior:**
1. Validate item passes scope check
2. Post comment via ADO API: `POST /_apis/wit/workItems/{id}/comments`
3. Return comment ID and URL

**Constraints:**
- Only creates new comments (no edit, no delete)
- Comment text must include `<!-- sprint-pilot:clarification:round:N -->` marker (validated by Zod schema)

**Output:**
```json
{
  "status": "comment_posted",
  "item_id": 12345,
  "comment_id": 1003,
  "url": "https://dev.azure.com/..."
}
```

---

### 2.7 `/sp-update-status`

**Purpose:** Update a work item's status field. Only allows mapped statuses.

**Inputs:**
```json
{
  "id": 12345,
  "status": "blocked"
}
```

The `status` field accepts the mapped keys from config: `"blocked"`, `"inProgress"`, `"inReview"`.

**Behavior:**
1. Validate item passes scope check
2. Resolve mapped key → actual ADO state name (e.g., `"blocked"` → `"Blocked"`)
3. Validate the target state is valid for this item's type in config
4. Update via ADO API: `PATCH /_apis/wit/workItems/{id}` with `[{ op: "replace", path: "/fields/System.State", value: "Blocked" }]`
5. Log to activity log

**Constraints:**
- Only `System.State` field can be modified
- Only mapped statuses are allowed
- Raw ADO state names are NOT accepted — must use mapped keys

**Output:**
```json
{
  "status": "status_updated",
  "item_id": 12345,
  "previous_state": "Active",
  "new_state": "Blocked"
}
```

**Errors:**
- Unmapped status → `{ error: "invalid_status", provided: "Resolved", allowed: ["blocked", "inProgress", "inReview"] }`
- Invalid transition in ADO → `{ error: "invalid_transition", from: "New", to: "Blocked", allowed_transitions: [...] }`

---

### 2.8 `/sp-create-branch`

**Purpose:** Create a feature branch in ADO, only from the configured base.

**Inputs:**
```json
{
  "name": "features/12345-implement-sso-login",
  "source_ref": "refs/heads/develop"
}
```

**Behavior:**
1. Validate `source_ref` matches `config.git.baseBranchOrTag` (resolved to full ref)
2. Get the latest commit SHA of the source ref
3. Create branch via ADO API: `POST /_apis/git/repositories/{repo}/refs`
4. Return branch info

**Constraints:**
- `source_ref` must match configured base branch/tag — reject if different
- Only creates branches — no delete, no force push
- Repository is auto-resolved from the configured project's default repo

**Output:**
```json
{
  "status": "branch_created",
  "name": "features/12345-implement-sso-login",
  "source": "refs/heads/develop",
  "commit": "abc123..."
}
```

**Errors:**
- Source ref mismatch → `{ error: "scope_violation", reason: "Source must be 'develop', got 'main'" }`
- Branch already exists → `{ error: "branch_exists", name: "features/12345-implement-sso-login" }`

---

### 2.9 `/sp-create-pr`

**Purpose:** Create a pull request in ADO, only to the configured target branch.

**Inputs:**
```json
{
  "source_branch": "features/12345-implement-sso-login",
  "title": "#12345: Implement SSO login",
  "description": "## Summary\n...",
  "work_item_id": 12345,
  "tags": ["Sprint 14"]
}
```

**Behavior:**
1. Validate `source_branch` exists
2. Validate target is `config.git.prTargetBranch` (hardcoded, not in input)
3. Check if PR already exists for this source → return existing if so
4. Check diff is not empty
5. Create PR via ADO API: `POST /_apis/git/repositories/{repo}/pullrequests`
6. Link work item to PR
7. Add tags

**Constraints:**
- Target branch always from config — AI cannot specify a different target
- Only creates PRs — no update, no close, no approve
- Work item ID validated against scope

**Output:**
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

**Errors:**
- PR already exists → `{ status: "pr_exists", pr_id: 89, url: "..." }`
- Empty diff → `{ error: "empty_diff", message: "No changes between source and target" }`

---

### 2.10 `/sp-get-iterations`

**Purpose:** Read sprints/iterations for the configured project.

**Inputs:** None (uses project + team from config).

**Behavior:**
1. Fetch iterations via ADO API: `GET /{project}/{team}/_apis/work/teamsettings/iterations`
2. Return with current iteration highlighted

**Output:**
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

---

## 3. Error Response Format

All tools return errors in a consistent format:

```json
{
  "error": "error_code",
  "message": "Human-readable explanation",
  "reason": "Specific detail",
  "guidance": "What the user should do"
}
```

Error codes: `scope_violation`, `not_found`, `auth_expired`, `ado_unreachable`, `invalid_status`, `invalid_transition`, `branch_exists`, `empty_diff`, `config_missing`, `fabric_missing`, `product_missing`, `pat_invalid`, `validation_error`.

---

*End of MCP tools spec.*
