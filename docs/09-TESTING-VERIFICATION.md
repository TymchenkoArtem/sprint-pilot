# 09 — Testing & Verification

**Parent:** `00-MASTER-OVERVIEW.md`
**Related:** `08-QUALITY-GATE.md`, `05-CLAUDE-MD.md`

---

## 1. Overview

Testing runs after the quality gate passes. Three types of verification execute in sequence, with a shared pool of 3 fix-retest cycles across all types.

```
Step 1: Existing test suite (unit + integration)
  └── Fastest feedback, catches regressions
Step 2: Browser verification (Playwright MCP)
  └── Acceptance criteria as test scenarios
Step 3: Browser health (Chrome DevTools MCP)
  └── Console, network, performance, accessibility
```

Failures in Step 1 block Steps 2 and 3. No point testing in a browser if unit tests are broken.

---

## 2. Shared Fix-Retest Pool

| Property | Value |
|----------|-------|
| Max cycles | 3 total |
| Shared across | All three test types |
| Per-cycle approval | Required (approval point #5) |
| Tracking | `Fix cycles used: N/3` in workflow state |

Example: If unit tests fail twice (2 fix cycles), only 1 browser test cycle remains. If all 3 are used up, the workflow pauses and asks the user to decide (manual intervention, skip testing, or abandon).

---

## 3. Step 1: Existing Test Suite

### 3.1 Command Detection

During `/sp-init`, SprintPilot detects the test command from `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration"
  }
}
```

Priority order for detection:
1. `test` script (most common)
2. `test:unit` + `test:integration` (run separately)
3. If none found: warn during init, skip this step at runtime

Stored in `config.md` as `testing.testCommand`.

### 3.2 Execution

```bash
# AI runs directly
npm test
# or
npx vitest run
# or whatever config.md says
```

### 3.3 Result Analysis

The AI reads stdout/stderr and determines:
- Total tests, passed, failed, skipped
- For failures: test name, file, error message, expected vs actual
- Whether failures are related to the current changes or pre-existing

### 3.4 On Failure

```
Tests failed: 2 of 26
  ✗ SSO redirect flow — expected /dashboard, got /login
  ✗ Session timeout — timeout not triggered at 30min

⏸ APPROVAL: "2 tests failed. Approve fix-retest cycle 1/3?"
  Options: [Approve fix] [Stop — manual intervention needed]
```

If approved: AI analyzes failures, applies fixes, re-runs tests.

---

## 4. Step 2: Browser Verification (Playwright MCP)

### 4.1 Prerequisites

- Dev server running (auto-managed, see Section 6)
- Playwright MCP server registered in AI tool's MCP config

### 4.2 Test Scenarios

The AI generates test scenarios from the acceptance criteria in the workflow state file:

```markdown
Acceptance Criteria:
1. Support SAML 2.0 and OAuth 2.0 providers
2. Session timeout at 30 minutes
3. Graceful error handling for failed authentication
4. Redirect to original requested page after login
```

Becomes Playwright actions:
```
Scenario 1: Navigate to /login, verify SSO options (SAML + OAuth) are visible
Scenario 2: Login via SSO, verify session active, wait/simulate timeout
Scenario 3: Attempt login with invalid credentials, verify error message displayed
Scenario 4: Navigate to /protected-page while logged out, login, verify redirect to /protected-page
```

### 4.3 Execution via Playwright MCP

The AI uses Playwright MCP tools to:
1. Navigate to the app URL
2. Interact with the page (click, type, wait)
3. Assert expected outcomes (element visibility, URL, text content)
4. Capture screenshots on any failure

### 4.4 Screenshot Storage

Screenshots saved to `.sprint-pilot/workflows/screenshots/`:
```
.sprint-pilot/workflows/screenshots/
├── US-12345-run1-scenario3-failure.png
└── US-12345-run2-scenario1-pass.png
```

### 4.5 Result Recording

Written to workflow state:
```markdown
### Browser Tests (Run 1)
- Scenario 1 (SSO options visible): PASS
- Scenario 2 (Session timeout): SKIP (requires wait simulation)
- Scenario 3 (Error handling): FAIL — screenshot: US-12345-run1-scenario3-failure.png
- Scenario 4 (Redirect after login): PASS
```

---

## 5. Step 3: Browser Health (Chrome DevTools MCP)

### 5.1 Prerequisites

- Dev server still running from Step 2
- Chrome DevTools MCP registered in AI tool's MCP config
- Browser still open from Playwright session (or re-navigate)

### 5.2 Checks

**Console errors:**
- Use DevTools MCP to read console logs
- Filter for `error` and `warning` levels
- Ignore known/expected warnings (e.g., React dev mode, hot reload)
- Report unexpected errors

**Network failures:**
- Read network tab for failed requests (4xx, 5xx, timeout)
- Report endpoint, status, and error
- Ignore expected 401s for unauthenticated scenarios

**Performance:**
- Measure page load time (navigation to DOMContentLoaded)
- Report if > 3 seconds (configurable threshold)
- Measure time to interactive if measurable

**Accessibility:**
- Run basic accessibility audit via DevTools
- Report issues by severity (critical, serious, moderate, minor)
- Focus on critical and serious issues

### 5.3 Result Recording

```markdown
### Browser Health (Run 1)
- Console errors: 0 errors, 2 warnings (React dev mode — expected)
- Network failures: none
- Performance: page load 1.2s, TTI 1.8s
- Accessibility: 0 critical, 0 serious, 1 moderate (color contrast on footer)
```

### 5.4 Failure Criteria

Browser health blocks if:
- Any unexpected console errors
- Any network failures on primary flows
- Page load > 5 seconds
- Any critical or serious accessibility issues

Warnings/moderate issues are logged but don't block.

---

## 6. Dev Server Lifecycle

### 6.1 Auto-Detection

During `/sp-init`, detect from `package.json`:

Priority order:
1. `dev` script → `npm run dev`
2. `start` script → `npm start`
3. If none: warn, skip browser tests

Stored in `config.md` as `testing.devServerCommand`.

App URL detection:
- Parse script for port number (e.g., `--port 3000`, `:3000`)
- Default: `http://localhost:3000`
- Stored in `config.md` as `testing.appUrl`

### 6.2 Start Sequence

```bash
# AI runs in background
npm run dev &
DEV_SERVER_PID=$!

# Wait for ready (poll the URL)
for i in {1..30}; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|304"; then
    echo "Dev server ready"
    break
  fi
  sleep 2
done
```

The AI should:
1. Start the dev server as a background process
2. Poll the app URL every 2 seconds
3. Timeout after 60 seconds (30 attempts × 2s)
4. If timeout: report error, skip browser tests

### 6.3 Stop Sequence

After all browser tests complete:
```bash
kill $DEV_SERVER_PID
# Verify it stopped
sleep 1
if kill -0 $DEV_SERVER_PID 2>/dev/null; then
  kill -9 $DEV_SERVER_PID
fi
```

### 6.4 Port Conflicts

If the port is already in use:
1. Detect: dev server fails to start with "port in use" error
2. Report to user: "Port 3000 is in use. Stop the existing process?"
3. If user approves: find and kill the process, retry
4. If not: skip browser tests

---

## 7. Fix-Retest Loop

```
Test failure detected
  │
  ├── Fix cycles remaining? (N < 3)
  │     │
  │     ⏸ APPROVAL: "Approve fix-retest cycle {N+1}/3?"
  │     │
  │     ├── Approve
  │     │     AI analyzes failure
  │     │     AI applies fix
  │     │     Re-run the failed test type
  │     │     (if unit tests failed, re-run unit tests first)
  │     │     Increment fix cycle counter
  │     │     Loop back to check
  │     │
  │     └── Stop
  │           Log decision
  │           Workflow pauses — user handles manually
  │
  └── No cycles remaining (N = 3)
        │
        Report: "All 3 fix-retest cycles used."
        Options: [Continue anyway] [Pause for manual intervention]
```

### 7.1 What the AI Does During a Fix Cycle

1. Read the test failure output
2. Identify the root cause (wrong assertion, missing implementation, bug in code)
3. Apply the fix to the source code
4. Re-run only the relevant test type (not the full suite if only unit tests failed)
5. If the fix causes new failures: count as the same cycle, fix those too
6. If all tests pass: continue to next step

---

## 8. Testing Instruction File

The file `.sprint-pilot/instructions/testing-verification.md` provides these details to the AI in a format it can follow step-by-step.

---

*End of testing and verification spec.*
