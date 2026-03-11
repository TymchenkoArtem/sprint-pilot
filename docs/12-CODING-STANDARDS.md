# 12 — Coding Standards

**Parent:** `00-MASTER-OVERVIEW.md`
**Related:** `11-NPM-PACKAGE.md`

---

## 1. TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

Key points:
- `strict: true` — all strict checks enabled
- `exactOptionalPropertyTypes: true` — extra safety for optional fields
- Target ES2022 for native `fetch`, top-level await, `structuredClone`

---

## 2. Code Conventions

### 2.1 File Naming
- All lowercase with hyphens: `sp-get-item.ts`, `scope-validator.ts`
- One primary export per file
- Test files: `{source-file}.test.ts` in matching `tests/` directory

### 2.2 Import Order
1. Node built-ins (`node:fs`, `node:path`)
2. External packages (`@modelcontextprotocol/sdk`, `zod`)
3. Internal absolute imports (`../auth/keytar-strategy`)
4. Blank line between each group

### 2.3 Error Handling
- Custom error classes extending `SprintPilotError` base
- Every error has: `code` (string enum), `message` (human-readable), optional `guidance`
- Never throw raw Error — always typed
- Never expose PAT or sensitive data in error messages
- Log errors to activity log before returning to AI

```typescript
export class SprintPilotError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly guidance?: string
  ) {
    super(message);
    this.name = 'SprintPilotError';
  }
}

export class ScopeViolationError extends SprintPilotError {
  constructor(reason: string) {
    super('scope_violation', reason, 'This operation is outside SprintPilot\'s configured scope.');
  }
}
```

### 2.4 Async/Await
- Always use `async/await` — no raw Promises, no `.then()` chains
- Always handle errors with try/catch at tool boundaries
- Use `Promise.all()` for independent parallel operations (e.g., batch item fetch)

### 2.5 Validation
- Every tool input validated with Zod schema before processing
- Every ADO response validated against expected shape before use
- Config validated on load with Zod schema

### 2.6 No Side Effects in Constructors
- Classes should be constructable without I/O
- Async initialization goes in static factory methods or explicit `init()` methods

---

## 3. Testing Standards

### 3.1 Framework
- `vitest` for all tests
- No mocking frameworks — use manual mocks and dependency injection

### 3.2 Test Structure

```typescript
describe('ScopeValidator', () => {
  describe('validateWorkItem', () => {
    it('allows item assigned to current user in configured project', async () => {
      // ...
    });

    it('rejects item assigned to different user', async () => {
      // ...
    });

    it('rejects item from different project', async () => {
      // ...
    });

    it('rejects item of unconfigured type', async () => {
      // ...
    });
  });
});
```

### 3.3 Test Categories

| Category | Directory | Scope |
|----------|-----------|-------|
| Unit | `tests/tools/` | Individual tool logic with mocked ADO client |
| Security | `tests/security/` | Scope validation — the most important tests |
| Auth | `tests/auth/` | Keytar interaction, fallback behavior |
| Integration | `tests/integration/` | Full tool flows with mocked HTTP |

### 3.4 Security Tests (Critical)

Every scope restriction MUST have a test that verifies it blocks unauthorized access:

```typescript
describe('Security: Scope Enforcement', () => {
  it('sp-get-item rejects item not assigned to current user', async () => {
    const mockItem = createMockWorkItem({ assignedTo: 'other@company.com' });
    mockAdoClient.getWorkItem.mockResolvedValue(mockItem);
    
    await expect(tool.execute({ id: 12345 }))
      .rejects.toThrow(ScopeViolationError);
  });

  it('sp-update-status rejects unmapped status', async () => {
    await expect(tool.execute({ id: 12345, status: 'Closed' }))
      .rejects.toThrow(ScopeViolationError);
  });

  it('sp-create-branch rejects source ref not matching base', async () => {
    await expect(tool.execute({ 
      name: 'features/test', 
      source_ref: 'refs/heads/main'  // config says 'develop'
    })).rejects.toThrow(ScopeViolationError);
  });

  it('sp-create-pr rejects target not matching config', async () => {
    // Ensure the tool doesn't even accept a target parameter
    // Target is always from config
  });
});
```

### 3.5 Coverage Requirements

| Area | Minimum Coverage |
|------|-----------------|
| Security (scope validation) | 100% branch coverage |
| Tools | 90% line coverage |
| Auth | 90% line coverage |
| Overall | 85% line coverage |

---

## 4. Build Configuration

### 4.1 tsup

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node18',
    outDir: 'dist'
  },
  {
    entry: ['src/cli/index.ts'],
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    target: 'node18',
    outDir: 'dist/cli'
  }
]);
```

### 4.2 ESLint

Use flat config (`eslint.config.js`) with:
- `@typescript-eslint/recommended`
- `@typescript-eslint/strict`
- No `any` allowed
- Require explicit return types on exported functions

---

## 5. Dependency Policy

- **Minimize dependencies.** Every dependency is a security surface.
- Only three runtime dependencies: `@modelcontextprotocol/sdk`, `keytar`, `zod`
- Use native `fetch` (no axios, node-fetch)
- Use native `crypto` for any hashing
- Use native `fs/promises` for file operations
- No lodash, no ramda — use native array/object methods

---

*End of coding standards spec.*
