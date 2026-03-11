# 01 — Security Model

**Parent:** `00-MASTER-OVERVIEW.md`
**Related:** `02-MCP-TOOLS.md`, `03-AUTH-AND-KEYTAR.md`

---

## 1. Core Security Principle

The AI tool never receives the ADO PAT token. SprintPilot MCP acts as a security boundary — a restricted proxy that validates every request against a strict scope before forwarding it to Azure DevOps.

This is the primary differentiator from Microsoft's `@azure-devops/mcp`, which passes the user's full credentials to the AI tool.

---

## 2. Threat Model

### 2.1 Threats Mitigated

| Threat | How SprintPilot prevents it |
|--------|---------------------------|
| AI accesses other users' work items | Every query filtered by `System.AssignedTo = @Me` |
| AI accesses other projects | Every request validated against `config.project` |
| AI modifies unconfigured work item types | Type checked against `config.allowedWorkItemTypes` |
| AI sets arbitrary status values | Status validated against `config.statusMapping` |
| AI creates branches from arbitrary refs | Base ref validated against `config.git.baseBranchOrTag` |
| AI creates PRs to wrong branches | Target validated against `config.git.prTargetBranch` |
| AI deletes work items, branches, PRs | No delete operations exposed — tools only support create/read/update |
| AI reads PAT from environment | PAT stored in OS keychain (keytar), never in env vars or files |
| AI accesses repos, pipelines, wiki, test plans | No tools exposed for these resources |
| AI modifies work item fields other than status | Only `System.State` field is writable via `/sp-update-status` |

### 2.2 Threats NOT Mitigated (Out of Scope)

| Threat | Why out of scope |
|--------|-----------------|
| AI writes harmful code during implementation | SprintPilot doesn't control code generation — that's the AI tool + Fabric CLI domain |
| AI runs destructive shell commands (rm -rf, etc.) | SprintPilot doesn't control shell access — that's the AI tool's sandbox |
| AI pushes to wrong remote | Git operations are run by the AI tool directly; SprintPilot only controls ADO-side branch creation |
| PAT has excessive scopes beyond what SprintPilot needs | User responsibility to create PAT with minimal scopes |

### 2.3 Trust Boundaries

```
UNTRUSTED                          TRUSTED
┌──────────────────┐              ┌──────────────────────────┐
│  AI Tool Input   │──validates──►│  SprintPilot MCP Server  │
│  (tool call args)│              │  (TypeScript, Zod)       │
└──────────────────┘              └───────────┬──────────────┘
                                              │ validated request
                                              ▼
                                  ┌──────────────────────────┐
                                  │  Azure DevOps REST API   │
                                  │  (PAT auth header added  │
                                  │   by SprintPilot only)   │
                                  └──────────────────────────┘
```

---

## 3. Scoping Rules

### 3.1 Triple Scope Filter

Every tool call that accesses ADO data passes through three filters. All three must pass:

```typescript
interface ScopeFilter {
  project: string;              // Must match config.ado.project
  assignedTo: "@Me";            // Always current user
  workItemTypes: string[];      // Must be in config.ado.allowedWorkItemTypes
}
```

### 3.2 Per-Tool Scope Enforcement

| Tool | Scope enforcement |
|------|------------------|
| `/sp-my-items` | WIQL query hardcodes `AssignedTo = @Me`, project from config, types from config |
| `/sp-get-item` | After fetch: verify `AssignedTo` matches current user, `TeamProject` matches config, `WorkItemType` in allowed list |
| `/sp-get-comments` | First validates item passes `/sp-get-item` scope check |
| `/sp-post-comment` | First validates item passes scope check; only creates new comments (no edit/delete) |
| `/sp-update-status` | First validates item passes scope check; new status must exist in `config.statusMapping` for this item's type |
| `/sp-create-branch` | Source ref must match `config.git.baseBranchOrTag`; repo must match configured project's default repo |
| `/sp-create-pr` | Source branch must be the workflow's branch; target must match `config.git.prTargetBranch` |
| `/sp-get-iterations` | Only returns iterations for `config.ado.project` |

### 3.3 Validation Implementation

Every tool follows this pattern:

```typescript
async execute(params: ToolInput): Promise<ToolOutput> {
  // 1. Validate input shape (Zod schema)
  const validated = this.schema.parse(params);
  
  // 2. Load config
  const config = await this.configManager.load();
  
  // 3. Scope check (tool-specific)
  await this.validateScope(validated, config);
  
  // 4. Execute ADO API call
  const result = await this.adoClient.call(/* ... */);
  
  // 5. Post-fetch scope verification (for reads)
  this.verifyScopeOnResponse(result, config);
  
  // 6. Return sanitized response
  return this.sanitize(result);
}
```

**Post-fetch verification** is critical for reads. Even though WIQL queries filter server-side, SprintPilot verifies the returned data matches scope before passing to the AI. This defends against:
- WIQL injection if AI manipulates query parameters
- ADO API bugs that return out-of-scope data

---

## 4. PAT Security

### 4.1 Storage

- PAT stored in OS keychain via `keytar` under service `sprint-pilot`, account `ado-pat`
- Never stored in: environment variables, config files, state files, log files, tool responses
- Fallback (only if keychain unavailable): `.sprint-pilot/credentials` file with `chmod 600`, user warned

### 4.2 PAT Scope Requirements (Least Privilege)

SprintPilot requires exactly these ADO PAT scopes and nothing more:

| Scope | Level | Why |
|-------|-------|-----|
| Work Items | Read & Write | Query, read, update status, post comments |
| Code | Read & Write | Create branches, create PRs |
| Project and Team | Read | List projects, read iterations |

During CLI setup (`sprint-pilot setup-claude`, etc.), SprintPilot validates the PAT has these scopes and warns about any missing ones. It also warns if the PAT has excessive scopes beyond what's needed.

### 4.3 PAT in Transit

- PAT added to `Authorization: Basic base64(:PAT)` header only inside SprintPilot's ADO client
- HTTPS enforced for all ADO API calls
- PAT never appears in error messages, logs, or tool responses

---

## 5. Response Sanitization

SprintPilot sanitizes ADO responses before returning to the AI tool:

- Strips any fields not needed by the workflow (e.g., internal ADO metadata)
- Never returns URLs containing tokens or session IDs
- Never returns data about other users (email addresses, display names of non-assignees are allowed but limited)
- Work item descriptions and comments are returned as-is (they may contain sensitive business data, but the user has authorized access to their own items)

---

## 6. Audit Trail

Every tool call is logged to `.sprint-pilot/activity.md`:

```markdown
## 2026-03-03

- 09:30 [INIT] Project initialized: MyProject @ https://dev.azure.com/my-org
- 10:00 [MY-ITEMS] Queried items: 12 found (5 US, 4 Bug, 3 Task)
- 10:01 [GET-ITEM] Read US-12345: "Implement SSO login"
- 10:01 [POST-COMMENT] Comment posted on US-12345 (round 1, 4 questions)
- 10:02 [UPDATE-STATUS] US-12345: Active → Blocked
- 10:02 [UPDATE-STATUS:BLOCKED] Attempted status "Invalid" on US-12345 — REJECTED (not in mapping)
```

Blocked/rejected operations are logged with reason. This provides audibility for enterprise compliance.

---

*End of security model spec.*
