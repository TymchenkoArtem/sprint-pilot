# 08 — Quality Gate

**Parent:** `00-MASTER-OVERVIEW.md`
**Related:** `05-CLAUDE-MD.md`, `09-TESTING-VERIFICATION.md`

---

## 1. Purpose

The quality gate is an AI-powered analysis step that reviews all code changes against three sources of truth before allowing commit. It runs after Fabric CLI completes implementation and before testing begins.

This is NOT a linter or static analysis tool — it's the AI reasoning about whether the code meets the project's specific standards, aligns with product architecture, and fulfills the work item's requirements.

---

## 2. The Three Sources of Truth

| Source | Location | What it validates |
|--------|----------|------------------|
| **Standards** | `fabric/standards/` | Coding conventions, patterns, naming, architecture rules |
| **Product** | `fabric/product/` | Product architecture, tech stack, data flow, integration patterns |
| **Requirements** | `.sprint-pilot/workflows/US-{id}.md` | US description, acceptance criteria, clarification answers |

All three must pass. A violation in any source blocks the commit (unless overridden).

---

## 3. Analysis Process

### 3.1 Context Compilation

The AI compiles a review context by reading:

```
1. git diff {base-branch}..HEAD          — all changes in the feature branch
2. git diff --stat {base-branch}..HEAD   — summary of files changed
3. fabric/standards/**/*.md              — all standard files
4. fabric/product/**/*.md                — all product files
5. .sprint-pilot/workflows/US-{id}.md    — work item details, acceptance criteria, clarifications
```

### 3.2 Analysis Dimensions

The AI evaluates each changed file against:

**Standards compliance:**
- Naming conventions (files, components, variables, functions)
- Code organization patterns (folder structure, module boundaries)
- Error handling patterns
- Logging conventions
- Import ordering
- TypeScript strict mode compliance
- Component patterns (if frontend)
- API patterns (if backend)
- Test patterns (file naming, describe/it structure)

**Product alignment:**
- Architecture consistency (does the change fit the documented architecture?)
- Tech stack compliance (are the right libraries/frameworks used?)
- Data flow patterns (does data flow match the documented patterns?)
- Integration patterns (are external services accessed correctly?)
- Security patterns (auth, authorization, input validation)

**Requirements coverage:**
- Each acceptance criterion has corresponding code
- Edge cases mentioned in clarifications are handled
- Error handling matches requirements
- No scope creep (code doing things not in the US)

### 3.3 Severity Levels

| Severity | Meaning | Impact |
|----------|---------|--------|
| **error** | Violates a standard, breaks architecture, or misses a requirement | Blocks commit — must fix or override |
| **warning** | Potential issue, could be improved, minor deviation | Does NOT block — acknowledged and logged |
| **info** | Observation, suggestion, nice-to-have | Informational only |

---

## 4. Quality Gate Report Format

The AI produces a structured report in the workflow state file:

```markdown
## Quality Gate
- Run date: 2026-03-04 15:30 UTC
- Standards: PASS | FAIL (N errors, N warnings)
- Product alignment: PASS | FAIL (N errors, N warnings)
- Requirements coverage: PASS | FAIL (N/N criteria covered)
- Overall: PASS | FAIL | OVERRIDE

### Errors
1. [STANDARDS] `src/auth/sso-handler.ts` — Error handling uses generic `catch(e)` instead of typed errors per `fabric/standards/error-handling.md`
2. [REQUIREMENTS] Acceptance criterion #4 "Redirect to original page after login" — not implemented, login always redirects to /dashboard

### Warnings
1. [STANDARDS] `src/auth/sso-config.ts` — Magic number 1800 should be a named constant (SESSION_TIMEOUT_SECONDS)
2. [PRODUCT] `src/auth/oauth-client.ts` — Using `axios` but product docs specify `fetch` as the HTTP client

### Info
1. [STANDARDS] Consider extracting SSO provider factory pattern per `fabric/standards/design-patterns.md`
```

---

## 5. Approval Flow

```
Quality gate runs
  │
  ├── All PASS (no errors) → Continue to testing
  │
  └── Errors found
       │
       ⏸ APPROVAL: "Quality gate found {N} errors. Fix or override?"
       │
       ├── Fix
       │    AI applies fixes
       │    Re-run quality gate (recursive, max 2 re-runs)
       │    If still fails → force approval decision
       │
       └── Override
            Log override with reason to workflow state
            Log to activity log
            Continue to testing
```

### Override Logging

When user overrides:

```markdown
## Quality Gate
- Run date: 2026-03-04 15:30 UTC
- Overall: OVERRIDE
- Override reason: "Known pattern deviation, will refactor in tech debt sprint"
- Overridden errors:
  1. [STANDARDS] Error handling in sso-handler.ts
```

---

## 6. Quality Gate Instruction File

The file `.sprint-pilot/instructions/quality-gate.md` tells the AI how to perform this analysis:

```markdown
## How to Run the Quality Gate

1. Get the diff: `git diff {base}..HEAD`
2. Get the file list: `git diff --stat {base}..HEAD`
3. Read ALL files in `fabric/standards/`
4. Read ALL files in `fabric/product/`
5. Read the current workflow state file for requirements
6. For each changed file, analyze against all three sources
7. Produce findings with severity
8. Write report to workflow state
9. If any errors: pause for approval
10. If only warnings/info: report and continue

## Analysis Principles

- Be specific: cite the exact standard/product doc being violated
- Be actionable: explain what needs to change
- Don't hallucinate standards: only cite rules that actually exist in the fabric/ files
- Scope check: flag code that does things not in the US requirements (scope creep)
- Be reasonable: minor style deviations that don't affect quality are "info", not "error"
```

---

*End of quality gate spec.*
