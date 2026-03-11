# Verification -- Standards, Product, and Requirements Review

> **AI Context:** This file is loaded during Phase 3 of the autopilot. You are performing a comprehensive, multi-dimensional review of ALL code changes. Your role is to be a thorough, honest, and meticulous reviewer -- catching real issues while never inventing problems that don't exist. The expected outcome is a structured findings report with a PASS, FAIL, or OVERRIDE decision that gates whether the code proceeds to Delivery.

## Purpose

The verification phase is the single quality gate in the SprintPilot autopilot. It replaces what used to be separate "Quality Gate" and "Testing" phases with one comprehensive, unified review.

This is NOT a linter or static analysis tool. It is **AI reasoning** about whether the code meets the project's specific standards, aligns with product architecture, and fulfills every aspect of the work item's requirements. You MUST treat this as a mandatory gate -- no code proceeds to delivery without passing or being explicitly overridden by the user.

---

## The Three Sources of Truth

| Source | Location | Validates |
|--------|----------|-----------|
| **Standards** | `fabric/standards/` | Coding conventions, patterns, naming, architecture rules, test patterns |
| **Product** | `fabric/product/` | Product architecture, tech stack, data flow, integration patterns |
| **Requirements** | `.sprint-pilot/workflows/{TYPE}-{ID}/state.md` | Description, acceptance criteria, clarification answers |

**CRITICAL:** All three MUST pass. A violation in any source blocks delivery unless the user explicitly overrides.

---

## Step 1: Context Compilation

You MUST compile the COMPLETE review context before beginning analysis. Partial context leads to inaccurate or incomplete analysis.

### Required Inputs (read ALL of these -- no exceptions)

```
1. git diff {base-branch}..HEAD               -- every line of every change
2. git diff --stat {base-branch}..HEAD         -- summary of files changed
3. Read standards source (see below)           -- coding standards, patterns, conventions
4. Read product source (see below)             -- architecture, tech stack, integration patterns
5. Read the workflow state file                -- requirements, acceptance criteria, clarifications
6. Read the spec file (if exists)              -- fabric/specs/{spec-folder}/spec.md
7. Read the tasks file (if exists)             -- fabric/specs/{spec-folder}/tasks.md
```

### Standards and Product Sources

**If `fabric/` directory exists:** Read EVERY file in `fabric/standards/` and EVERY file in `fabric/product/` cover to cover. These are the authoritative sources of truth. You MUST NOT skip any file. You MUST NOT skim or summarize.

**If `fabric/` directory does NOT exist:** Derive standards and architecture context from the existing codebase:
- Read `package.json`, `tsconfig.json` (or equivalent config files) to understand tech stack and tooling
- Read project entry points and key module files to understand architecture patterns
- Read existing test files to understand testing conventions (file naming, structure, assertion style)
- Read recently modified files (from `git log --oneline -20 --name-only`) to understand active patterns
- Examine folder structure, naming conventions, import patterns, and error handling approaches
- These observed patterns become the de facto standards for this verification

**CRITICAL:** When using codebase-derived standards, your findings MUST cite specific observed patterns (e.g., "Existing services in `src/services/` use PascalCase class names with a `Service` suffix") rather than referencing a fabric/ file that does not exist.

### How to Locate Files

- Base branch: Read from SprintPilot config (`git.baseBranchOrTag`)
- Workflow state: `.sprint-pilot/workflows/{TYPE}-{ID}/state.md`
- Standards (if fabric/ exists): `ls fabric/standards/` then read each file
- Product (if fabric/ exists): `ls fabric/product/` then read each file
- Standards (no fabric/): Analyze codebase as described above

---

## Step 2: File-by-File Analysis

For **every changed file** in the diff, perform a systematic analysis against all three sources of truth. Do not skip files. Do not batch files together and make generic statements.

### 2A: Standards Compliance

**If `fabric/standards/` exists:** Check each changed file against EVERY rule in `fabric/standards/`. The standards files are your rulebook -- if a rule exists there, it applies.

**If `fabric/standards/` does NOT exist:** Check each changed file against the conventions observed in the existing codebase during context compilation. The existing code is your reference -- new code must be consistent with established patterns.

**What to check:**

- **Naming conventions** -- File names, component names, variable names, function names, class names. Match the exact patterns from standards or observed in the codebase.
- **Code organization** -- Folder structure, module boundaries, barrel exports (index files), separation of concerns. Does the file belong where it was placed?
- **Error handling patterns** -- Try-catch usage, custom error classes, error propagation, error messages. Does the code follow the documented or observed error handling strategy?
- **Logging conventions** -- Log levels, log format, what is logged vs. what is not. Are sensitive values excluded from logs?
- **Import ordering** -- Are imports grouped and ordered consistently with the rest of the codebase?
- **TypeScript patterns** -- Strict mode compliance, proper typing (no `any`), null handling, type assertions. Are types explicit where required?
- **Component patterns** -- If applicable: component structure, props interface, state management, hook usage, render patterns.
- **API patterns** -- If applicable: route structure, middleware usage, request/response format, validation, serialization.
- **Test patterns** -- File naming (`.test.ts` vs `.spec.ts`), describe/it structure, assertion library, mock patterns, test data factories.

**CRITICAL (with fabric/):** For each finding, you MUST cite the EXACT standard file and rule. Example: "Violates `fabric/standards/naming.md` rule: 'All service classes must use PascalCase with a Service suffix'." Do NOT make vague references like "violates naming standards."

**CRITICAL (without fabric/):** For each finding, you MUST cite the specific codebase pattern observed. Example: "Inconsistent with existing pattern in `src/services/user.service.ts` -- all service classes in this codebase use PascalCase with a `Service` suffix." Do NOT cite fabric/ rules that do not exist. Do NOT invent standards from general knowledge -- only cite patterns actually present in the codebase.

### 2B: Product Alignment

**If `fabric/product/` exists:** Check each changed file against `fabric/product/` documentation. Product docs define HOW the system should work at an architectural level.

**If `fabric/product/` does NOT exist:** Check each changed file against the architectural patterns observed in the existing codebase. Analyze folder structure, module dependencies, and data flow patterns to understand the established architecture.

**What to check:**

- **Architecture consistency** -- Does the change fit the documented or observed architecture? Are layers respected (e.g., controller → service → repository)? Are boundaries between modules maintained?
- **Tech stack compliance** -- Are the right libraries, frameworks, and tools used? Does the code use approved or established dependencies? Are there unexpected new dependencies?
- **Data flow patterns** -- Does data flow match the documented patterns? Are DTOs, entities, and view models used correctly? Is data transformation happening in the right layer?
- **Integration patterns** -- Are external services accessed through documented patterns (e.g., via adapters, clients, or gateways)? Are API contracts followed?
- **Security patterns** -- Authentication, authorization, input validation, output encoding. Are the documented security patterns applied consistently?
- **Configuration patterns** -- Are environment variables, feature flags, and configuration values managed as documented?

### 2C: Requirements Coverage

This is the most critical dimension. You MUST verify that EVERY acceptance criterion from the work item has corresponding, working code.

**What to check:**

**For each acceptance criterion (from the workflow state file):**

1. **Find the code.** Trace through the diff to identify exactly which files and functions implement this criterion. If you cannot find code for a criterion, it is a gap -- flag it as an error.

2. **Verify completeness.** Does the code fully satisfy the criterion, or only partially? A criterion that says "users can filter by date range AND status" is not satisfied by code that only filters by date range.

3. **Verify edge cases.** If the acceptance criteria or clarification answers mention specific edge cases, verify they are handled in the code. Example: "Empty search results should show a message" -- is there code for the empty state?

4. **Verify error handling.** If the requirements mention error scenarios, verify the code handles them. Example: "Show error if file upload exceeds 10MB" -- is there a size check?

5. **Map criterion to code.** Produce an explicit mapping:
   ```
   AC-1: "User can log in with email and password"
     → src/auth/login.controller.ts:handleLogin()
     → src/auth/login.service.ts:authenticate()
     → Status: COVERED

   AC-2: "Show validation error for invalid email format"
     → src/auth/login.controller.ts:validateInput()
     → Status: COVERED

   AC-3: "Lock account after 5 failed attempts"
     → Status: NOT FOUND -- no lockout logic in the diff
   ```

**CRITICAL:** You MUST produce this mapping for every acceptance criterion. This is not optional. The mapping is what makes the verification trustworthy.

---

## Step 3: Scope Audit

Check for **scope creep** -- code that implements functionality NOT described in the work item requirements.

**What to look for:**

- New features or capabilities not mentioned in the acceptance criteria
- New API endpoints not in the requirements
- New UI components or pages not requested
- New database tables, columns, or migrations not implied by the requirements
- New configuration options not needed for the requirements

**Classification:**
- If the extra code is a reasonable implementation detail (e.g., a helper function, a type definition), classify as **info** -- not scope creep.
- If the extra code adds user-facing functionality beyond what was requested, classify as **error** (scope creep).
- If unclear, classify as **warning** and explain why.

---

## Step 4: Test Coverage Audit

Verify that the implementation includes appropriate unit tests.

**What to check:**

- Are there unit test files for the new/changed source files?
- Do the tests cover the main acceptance criteria flows?
- Do the tests follow the test patterns defined in `fabric/standards/`?
- Are edge cases from the acceptance criteria covered by tests?

**Classification:**
- Missing unit tests for core acceptance criteria: **error**
- Missing tests for edge cases: **warning**
- Missing tests for utility/helper functions: **info**

---

## Step 5: Assign Severity Levels

For every finding from Steps 2-4, assign a severity:

| Severity | Meaning | Impact | Examples |
|----------|---------|--------|----------|
| **error** | Violates a documented standard, breaks documented architecture, misses a requirement, or introduces scope creep | **Blocks delivery** -- must fix or override | Missing acceptance criterion implementation, wrong error handling pattern, unauthorized dependency, scope creep |
| **warning** | Potential issue, could be improved, minor deviation from convention | **Does NOT block** -- acknowledged and logged | Magic numbers that could be constants, slightly unconventional naming, missing JSDoc on a public function |
| **info** | Observation, suggestion, nice-to-have improvement | **Informational only** | Performance optimization opportunity, alternative pattern suggestion, code style preference |

### Severity Rules

1. **Reserve `error` for genuine violations.** A finding is an `error` ONLY if it violates a specific, documented rule in `fabric/standards/` or `fabric/product/`, OR if it fails to implement a specific acceptance criterion. Vague concerns are never errors.

2. **Be reasonable about `warning`.** Minor style deviations that do not affect code quality or readability are `info`, not `warning`.

3. **CRITICAL: Do not hallucinate standards.** Only cite rules that ACTUALLY EXIST in the `fabric/` files. If you cannot find a specific rule for something, do NOT invent one. If something seems off but no rule covers it, classify it as `info` at most.

4. **Consider context.** If a pattern deviation is necessary for the specific implementation (e.g., a third-party library requires a different approach), note it as `info` rather than `error`.

---

## Step 6: Write Verification Report

You MUST write a structured report to the `## Verification` section of the workflow state file.

### Report Format

```markdown
## Verification
- Run date: {YYYY-MM-DD HH:MM} UTC
- Standards: PASS | FAIL (N errors, N warnings)
- Product alignment: PASS | FAIL (N errors, N warnings)
- Requirements coverage: PASS | FAIL (N/N criteria covered)
- Test coverage: PASS | FAIL (N errors, N warnings)
- Scope audit: PASS | FAIL (N scope creep findings)
- Overall: PASS | FAIL | OVERRIDE

### Requirements Traceability
| AC # | Criterion | Status | Implementing Code |
|------|-----------|--------|-------------------|
| 1 | {criterion text} | COVERED | {file:function} |
| 2 | {criterion text} | COVERED | {file:function} |
| 3 | {criterion text} | NOT FOUND | -- |

### Errors
1. [STANDARDS] `src/path/file.ts` -- {Description of violation}. Rule: `fabric/standards/{filename}.md` -- "{exact rule text or summary}"
2. [REQUIREMENTS] AC-{N} "{criterion text}" -- not implemented / partially implemented. Missing: {what is missing}
3. [SCOPE] `src/path/file.ts` -- {Description of scope creep}. Not in requirements.
4. [TESTS] `src/path/file.ts` -- {Description of missing test coverage}

### Warnings
1. [STANDARDS] `src/path/file.ts` -- {Description of minor deviation}
2. [PRODUCT] `src/path/file.ts` -- {Description of alignment concern}
3. [TESTS] `src/path/file.test.ts` -- {Description of incomplete test}

### Info
1. [STANDARDS] Suggestion for improvement
2. [PRODUCT] Alternative approach consideration
```

**CRITICAL:** You MUST include ALL sections (Requirements Traceability, Errors, Warnings, Info) even if empty -- write "None" if no findings for a subsection.

**CRITICAL:** The Requirements Traceability table is MANDATORY. Every acceptance criterion must appear in it with a clear status.

---

## Step 7: Approval Flow

```
Verification runs
  |
  +-- All PASS (no errors) --> Present report, continue to Delivery
  |
  +-- Errors found
       |
       Present the FULL findings report to the user.
       |
       APPROVAL: "Verification found {N} errors. Fix or override?"
       |
       +-- Fix
       |    AI analyzes each error
       |    AI applies code fixes
       |    AI re-runs verification (go back to Step 1)
       |    Max 2 re-runs total
       |    If still fails after 2 re-runs --> force approval decision
       |
       +-- Override
            Ask user for a brief reason
            Log override with ALL overridden errors and the reason
            Continue to Delivery
```

**STOP -- Wait for user response before continuing.**

**CRITICAL:** You MUST get explicit user approval before overriding errors. You MUST NOT silently skip errors or auto-select "Fix" without presenting the approval.

---

## Override Logging

When the user chooses to override, you MUST update the verification section:

```markdown
## Verification
- Run date: {YYYY-MM-DD HH:MM} UTC
- Overall: OVERRIDE
- Override reason: "{user-provided reason}"
- Overridden errors:
  1. [STANDARDS] Description of overridden error
  2. [REQUIREMENTS] Description of overridden error
```

You MUST record the override reason. You MUST NOT leave it blank.

---

## Verification Principles

These principles guide how you approach the verification. They are as important as the mechanical steps above.

### Principle 1: Be Thorough, Not Performative

Read every line of every changed file. If fabric/ exists, read every line of every standard and product doc. If fabric/ does not exist, thoroughly analyze the existing codebase patterns. Do not skim. Do not assume you remember a rule or pattern -- go back and read it. The value of this verification is in its completeness.

### Principle 2: Be Specific and Actionable

Every finding must tell the developer exactly:
- What is wrong (the specific issue)
- Where it is (file and line/function)
- Why it is wrong (the rule or requirement it violates, with citation)
- What should change (the fix or expected behavior)

Bad: "Error handling doesn't follow standards."
Good (with fabric/): "[STANDARDS] `src/auth/login.service.ts:authenticate()` -- Uses generic `catch(e)` instead of typed error classes. Rule: `fabric/standards/error-handling.md` -- 'All catch blocks must use typed error classes from src/errors/'. Fix: Replace `catch(e)` with `catch(e: AuthenticationError | NetworkError)` and handle each case."
Good (without fabric/): "[STANDARDS] `src/auth/login.service.ts:authenticate()` -- Uses generic `catch(e)` instead of typed error classes. Pattern observed in `src/services/user.service.ts` and `src/services/order.service.ts` -- all existing catch blocks use typed error classes. Fix: Replace `catch(e)` with `catch(e: AuthenticationError | NetworkError)` and handle each case."

### Principle 3: Be Honest, Not Generous

Do not give a PASS because "it's mostly right" or "the developer clearly intended to do X." If an acceptance criterion is not implemented, it is not implemented -- regardless of how much other good work was done. If a standard is violated, it is violated -- regardless of whether the code "works."

### Principle 4: Be Fair, Not Pedantic

Reserve `error` for genuine issues that matter. A missing semicolon (if the linter allows it) is not an error. A variable named `data` instead of `userData` is a warning at most. But a missing acceptance criterion implementation IS an error. A security pattern violation IS an error. Focus your error-severity findings on things that would cause a code review to be rejected.

### Principle 5: Never Hallucinate

**With fabric/:** If you cannot find a specific rule in `fabric/standards/` or `fabric/product/`, do not invent one. Do not cite "industry best practices" or "common conventions" as standards violations. Only cite rules that exist in the project's own documentation. If something seems wrong but no rule covers it, use `info` severity with a suggestion.

**Without fabric/:** Only cite patterns that you have actually observed in the existing codebase. Do not invent conventions that do not exist in the code. Do not cite "industry best practices" as if they were project standards. If the codebase does not have a consistent pattern for something, do not fabricate one. Only flag inconsistencies where a clear, established pattern exists in the code. When in doubt, use `info` severity.

---

## Checkpoints

You MUST append to the `## Checkpoints` section of the workflow state file:

- When verification starts: `{timestamp} -- Verification started`
- When verification completes: `{timestamp} -- Verification: {PASS|FAIL|OVERRIDE}`
- When a re-run starts: `{timestamp} -- Verification re-run {N}`
- When an override is applied: `{timestamp} -- Verification overridden: "{reason}"`

---

## Activity Log

Log to `.sprint-pilot/workflows/{TYPE}-{ID}/activity.md`:

```
- HH:MM [VERIFY] Verification started -- {N} tokens
- HH:MM [VERIFY] Verification complete: {PASS|FAIL} ({N} errors, {N} warnings, {N} info) -- {N} tokens
- HH:MM [APPROVE] Verification fix cycle initiated
- HH:MM [OVERRIDE] Verification overridden: "{reason}"
```

---

## Next Step

After verification passes (or is overridden), proceed to Phase 4 (Delivery) -- see `delivery-flow.md` for the full delivery procedure.
