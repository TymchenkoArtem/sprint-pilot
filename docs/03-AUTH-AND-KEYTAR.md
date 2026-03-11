# 03 — Authentication & Keytar

**Parent:** `00-MASTER-OVERVIEW.md`
**Related:** `01-SECURITY-MODEL.md`, `02-MCP-TOOLS.md`

---

## 1. Authentication Strategy

SprintPilot uses the **Strategy pattern** for authentication, with PAT as the current implementation and OAuth Device Code Flow as a future option.

```typescript
interface AuthStrategy {
  store(token: string): Promise<void>;
  retrieve(): Promise<string>;
  validate(token: string, orgUrl: string): Promise<ValidationResult>;
  clear(): Promise<void>;
}
```

### 1.1 Current: PAT Strategy

Personal Access Token stored in OS keychain via `keytar`.

### 1.2 Future: OAuth Device Code Flow (v2+)

Browser-based OAuth login without manual PAT creation. Planned but not in scope for v1.

---

## 2. Keytar Integration

### 2.1 Storage Details

| Property | Value |
|----------|-------|
| Service name | `sprint-pilot` |
| Account name | `ado-pat` |
| Storage backend (macOS) | Keychain Access |
| Storage backend (Windows) | Credential Vault |
| Storage backend (Linux) | Secret Service API (GNOME Keyring / KWallet) |

### 2.2 API Usage

```typescript
import * as keytar from 'keytar';

const SERVICE = 'sprint-pilot';
const ACCOUNT = 'ado-pat';

// Store
await keytar.setPassword(SERVICE, ACCOUNT, pat);

// Retrieve
const pat = await keytar.getPassword(SERVICE, ACCOUNT);

// Delete (for re-init)
await keytar.deletePassword(SERVICE, ACCOUNT);
```

### 2.3 Fallback (Keychain Unavailable)

Some environments (CI, Docker, headless Linux without Secret Service) don't have a keychain. Fallback:

1. Detect keychain availability by attempting `keytar.setPassword` with a test value
2. If fails: warn user prominently
3. Store PAT in `.sprint-pilot/credentials` file
4. Set file permissions: `chmod 600 .sprint-pilot/credentials`
5. File format: plain text, just the PAT string (no JSON wrapper)
6. Ensure `.sprint-pilot/credentials` is in `.gitignore`
7. Log warning to activity log on every startup

The fallback is a last resort. The CLI should recommend fixing the keychain setup.

---

## 3. PAT Validation

During CLI setup (`sprint-pilot setup-claude`, etc.) or `sprint-pilot init --reconfigure-pat`, SprintPilot validates the PAT:

### 3.1 Basic Connectivity

```
GET https://dev.azure.com/{org}/_apis/connectionData
Authorization: Basic base64(:{PAT})
```

If this returns 200, the PAT is valid and can reach the org.

### 3.2 Scope Validation

Test each required scope by making a minimal API call:

| Scope | Test Call | Expected |
|-------|----------|----------|
| Work Items: Read | `GET /_apis/wit/workItems?ids=0` | 200 or 404 (not 401/403) |
| Work Items: Write | Inferred from Read test + scope check in response headers |
| Code: Read | `GET /{project}/_apis/git/repositories` | 200 |
| Code: Write | Inferred from Read |
| Project: Read | `GET /_apis/projects` | 200 |

### 3.3 Excessive Scope Warning

If the PAT grants more than the required scopes (detectable via `X-VSS-UserData` header or by testing additional endpoints), warn:

```
⚠️  Your PAT has more permissions than SprintPilot needs.
    For best security, create a PAT with only:
    - Work Items: Read & Write
    - Code: Read & Write
    - Project and Team: Read
```

---

## 4. Auth Header Construction

Every ADO API call made by SprintPilot:

```typescript
async function makeAdoRequest(endpoint: string, options: RequestOptions): Promise<Response> {
  const pat = await this.authStrategy.retrieve();
  if (!pat) {
    throw new AuthError('PAT not found. Run sprint-pilot init.');
  }
  
  const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');
  
  const response = await fetch(`${this.orgUrl}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    }
  });
  
  if (response.status === 401) {
    throw new AuthError('PAT expired or invalid. Run sprint-pilot init to update.');
  }
  
  if (response.status === 403) {
    throw new AuthError('Insufficient permissions. Check PAT scopes.');
  }
  
  return response;
}
```

**Critical:** The PAT is never:
- Returned in any tool response
- Written to any log file
- Included in error messages
- Stored in workflow state files
- Passed to the AI tool in any form

---

## 5. Current User Resolution

SprintPilot needs to know who "@Me" is for scope filtering. On first authenticated call:

```
GET https://dev.azure.com/{org}/_apis/connectionData
```

Response includes `authenticatedUser.id` and `authenticatedUser.properties.Account.$value` (email). Cache this for the session.

---

## 6. PAT Rotation

When a user needs to update their PAT (expiration, scope change):

```bash
sprint-pilot init --reconfigure-pat
```

This:
1. Prompts for new PAT
2. Validates against ADO
3. Replaces in keytar
4. Does NOT re-run full init (project, types, branches stay the same)

---

*End of auth and keytar spec.*
