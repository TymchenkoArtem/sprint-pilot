# 04 — ADO REST API Reference

**Parent:** `00-MASTER-OVERVIEW.md`
**Related:** `02-MCP-TOOLS.md`, `01-SECURITY-MODEL.md`

---

## 1. API Configuration

- Base URL: `https://dev.azure.com/{organization}`
- API Version: `7.1-preview` (all endpoints)
- Auth: `Authorization: Basic base64(:{PAT})` (see `03-AUTH-AND-KEYTAR.md`)
- Content-Type: `application/json`

---

## 2. Endpoints by Tool

### 2.1 `/sp-my-items` → WIQL Query

**Request:**
```
POST /{project}/_apis/wit/wiql?api-version=7.1-preview.2
```
```json
{
  "query": "SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.IterationPath] FROM WorkItems WHERE [System.AssignedTo] = @Me AND [System.TeamProject] = 'MyProject' AND [System.WorkItemType] IN ('User Story', 'Bug', 'Task') ORDER BY [System.ChangedDate] DESC"
}
```

**Response:** Returns list of `{ id, url }` objects. Follow up with batch get for full details.

### Batch Get Work Items

```
GET /_apis/wit/workItems?ids={id1},{id2},{id3}&$expand=all&api-version=7.1-preview.3
```

---

### 2.2 `/sp-get-item` → Single Work Item

**Request:**
```
GET /_apis/wit/workItems/{id}?$expand=all&api-version=7.1-preview.3
```

**Response fields used:**
| Field Path | Maps to |
|-----------|---------|
| `fields["System.Id"]` | `id` |
| `fields["System.Title"]` | `title` |
| `fields["System.Description"]` | `description` |
| `fields["Microsoft.VSTS.Common.AcceptanceCriteria"]` | `acceptanceCriteria` |
| `fields["System.State"]` | `state` |
| `fields["System.WorkItemType"]` | `type` |
| `fields["System.AssignedTo"].uniqueName` | `assignedTo` |
| `fields["System.IterationPath"]` | `iteration` |
| `fields["System.AreaPath"]` | `areaPath` |
| `fields["System.Tags"]` | `tags` |
| `fields["System.TeamProject"]` | `project` (for scope validation) |
| `fields["System.CreatedDate"]` | `createdDate` |
| `fields["System.ChangedDate"]` | `changedDate` |

---

### 2.3 `/sp-get-comments` → Work Item Comments

**Request:**
```
GET /_apis/wit/workItems/{id}/comments?api-version=7.1-preview.4
```

**Response fields:**
```json
{
  "comments": [
    {
      "id": 1001,
      "text": "<h3>Clarification Questions...</h3>",
      "createdBy": { "displayName": "...", "uniqueName": "user@company.com" },
      "createdDate": "2026-03-03T10:00:00Z"
    }
  ]
}
```

SprintPilot checks each comment's `text` for `<!-- sprint-pilot` marker to set `isSprintPilot` flag.

---

### 2.4 `/sp-post-comment` → Add Comment

**Request:**
```
POST /_apis/wit/workItems/{id}/comments?api-version=7.1-preview.4
```
```json
{
  "text": "<!-- sprint-pilot:clarification:round:1 -->\n<h3>🔍 Clarification Questions (Round 1)</h3>\n..."
}
```

---

### 2.5 `/sp-update-status` → Patch Work Item

**Request:**
```
PATCH /_apis/wit/workItems/{id}?api-version=7.1-preview.3
Content-Type: application/json-patch+json
```
```json
[
  {
    "op": "replace",
    "path": "/fields/System.State",
    "value": "Blocked"
  }
]
```

---

### 2.6 `/sp-create-branch` → Create Git Ref

**First, get repo ID:**
```
GET /{project}/_apis/git/repositories?api-version=7.1-preview.1
```
Use the first (default) repository.

**Get source commit:**
```
GET /_apis/git/repositories/{repoId}/refs?filter=heads/{branchName}&api-version=7.1-preview.2
```

**Create branch:**
```
POST /_apis/git/repositories/{repoId}/refs?api-version=7.1-preview.2
```
```json
[
  {
    "name": "refs/heads/features/12345-implement-sso-login",
    "oldObjectId": "0000000000000000000000000000000000000000",
    "newObjectId": "{sourceCommitSha}"
  }
]
```

---

### 2.7 `/sp-create-pr` → Create Pull Request

**Check existing:**
```
GET /_apis/git/repositories/{repoId}/pullrequests?searchCriteria.sourceRefName=refs/heads/{branch}&api-version=7.1-preview.2
```

**Create PR:**
```
POST /_apis/git/repositories/{repoId}/pullrequests?api-version=7.1-preview.2
```
```json
{
  "sourceRefName": "refs/heads/features/12345-implement-sso-login",
  "targetRefName": "refs/heads/develop",
  "title": "#12345: Implement SSO login",
  "description": "## Summary\n...",
  "workItemRefs": [{ "id": "12345" }],
  "labels": [{ "name": "Sprint 14" }]
}
```

---

### 2.8 `/sp-get-iterations` → Team Iterations

**Request:**
```
GET /{project}/{team}/_apis/work/teamsettings/iterations?api-version=7.1-preview.1
```

Team is auto-resolved: use `{project} Team` as default, or fetch from `GET /{project}/_apis/teams`.

---

### 2.9 `/sp-init` → Fetch Work Item Type States

Used during init to discover available workflow states per type:

```
GET /{project}/_apis/wit/workitemtypes/{typeName}/states?api-version=7.1-preview.1
```

Returns:
```json
{
  "value": [
    { "name": "New", "color": "b2b2b2", "category": "Proposed" },
    { "name": "Active", "color": "007acc", "category": "InProgress" },
    { "name": "Resolved", "color": "ff9d00", "category": "Resolved" },
    { "name": "Closed", "color": "339933", "category": "Completed" }
  ]
}
```

---

## 3. Error Responses from ADO

| HTTP Status | Meaning | SprintPilot handling |
|------------|---------|---------------------|
| 200 | Success | Process response |
| 400 | Bad request | Parse error message, return to AI |
| 401 | Unauthorized | `auth_expired` error |
| 403 | Forbidden | `auth_insufficient` error with scope guidance |
| 404 | Not found | `not_found` error |
| 409 | Conflict (e.g., branch exists) | `conflict` error with details |
| 429 | Rate limited | Retry with backoff (max 3 retries) |
| 500+ | Server error | `ado_server_error`, suggest retry |

---

## 4. Rate Limiting

ADO has rate limits. SprintPilot handles:
- Respect `Retry-After` header
- Exponential backoff: 1s, 2s, 4s
- Max 3 retries per request
- Log rate limit events to activity log

---

*End of ADO API reference spec.*
