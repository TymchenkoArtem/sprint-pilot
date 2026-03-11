# Testing & Verification

> **AI Context:** This file covers the post-implementation test run -- the automatic test execution that happens after Phase 2 (Implementation) completes. It provides details on dev server lifecycle, fix-retest loops, and test report format for unit/integration tests. For the verification phase (Phase 3), see `sp-verify.md`.

## Overview

Testing in SprintPilot happens at one point in the workflow:

1. **Post-implementation (automatic):** Unit/integration tests run immediately after Phase 2 to catch regressions before Verification (Phase 3). See CLAUDE.md "Post-Implementation: Auto-Run Tests".

This file provides supporting details for the post-implementation test run.

---

## Post-Implementation Test Run

After Phase 2 (Implementation) completes, the autopilot automatically runs the project's existing test suite to catch regressions.

### Command

Use the test command from the SprintPilot configuration (`testing.testCommand`), for example:
- `npm test`
- `npx vitest run`
- `dotnet test`

If `testing.testCommand` is not configured: skip with a warning and proceed to Phase 3.

### Execution

Run the test command and capture stdout/stderr. Determine:
- Total tests, passed, failed, skipped
- For failures: test name, file, error message, expected vs actual
- Whether failures are caused by the new implementation or pre-existing

### On Failure

Fix implementation-related failures directly (no approval needed -- this is part of the implementation cycle). Re-run after each fix (max 3 attempts). If still failing after 3 attempts, report to user and ask whether to proceed to Phase 3 or pause.

---

## Test Report Files

After each test run, write a detailed report to the work item's folder:

```
.sprint-pilot/workflows/{TYPE}-{ID}/run-{N}.md
```

### Report Format

```markdown
# Test Report: {TYPE}-{ID} -- Run {N}
- Date: {ISO 8601 timestamp}
- Fix attempt: {N}/3
- Token usage (this run): {N}

## Unit Tests
- Command: {test command from config}
- Total: {N}, Passed: {N}, Failed: {N}, Skipped: {N}
- Duration: {N}s
### Failures (if any)
- {test name} -- {file}:{line} -- {error message}
  Expected: {expected}
  Actual: {actual}
```

---

## Dev Server Lifecycle

### Start

1. Run the dev server command from configuration (`testing.devServerCommand`) as a background process
2. Poll the app URL every 2 seconds
3. Timeout after 60 seconds (30 attempts)
4. If timeout: report error, skip tests that require the dev server

```bash
# Example: start in background
npm run dev &
DEV_SERVER_PID=$!

# Poll until ready
for i in {1..30}; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|304"; then
    echo "Dev server ready"
    break
  fi
  sleep 2
done
```

### Stop

You MUST stop the dev server after all tests complete.

```bash
kill $DEV_SERVER_PID
sleep 1
if kill -0 $DEV_SERVER_PID 2>/dev/null; then
  kill -9 $DEV_SERVER_PID
fi
```

### Port Conflicts

If the port is already in use:
1. Detect: dev server fails to start with "port in use" error
2. Report to user: "Port {N} is in use. Stop the existing process?"
3. If user approves: find and kill the existing process, retry start
4. If user declines: skip tests that require the dev server

---

## Fix-Retest Loop

```
Test failure detected
  |
  +-- Attempts remaining? (N < 3)
  |   |
  |   +-- YES
  |   |    Analyze the failure
  |   |    Apply the fix (no approval needed -- part of implementation)
  |   |    Re-run the test suite
  |   |    Increment attempt counter
  |   |    Check again
  |   |
  |   +-- NO (all 3 used)
  |        Report: "Still failing after 3 fix attempts."
  |        Options: [Proceed to Phase 3] [Pause for manual intervention]
```

### What You Do During a Fix Attempt

1. Read the test failure output carefully
2. Identify the root cause (wrong assertion, missing implementation, bug in code)
3. Apply the fix to the source code
4. Re-run the full test suite
5. If the fix causes new failures: these count as the same attempt -- fix those too
6. If all tests pass: proceed to Phase 3 (Verification)

---

## Rules Summary

- You MUST run the configured test command after Phase 2 completes
- You MUST fix implementation-related failures without approval (this is part of the dev cycle)
- You MUST write a detailed test report file for every test run
- You MUST stop the dev server after tests complete (if one was started)
- You MUST NOT exceed 3 fix attempts
- You MUST record token usage for each test run in the workflow state
- You MUST append checkpoints for each test run and fix attempt

---

## Checkpoints

You MUST append to the `## Checkpoints` section of the workflow state file:

- When post-implementation tests start: `{timestamp} -- Post-implementation tests started`
- After each test run: `{timestamp} -- Test run {N}: {summary}`
- After each fix attempt: `{timestamp} -- Fix attempt {N}/3 applied`
- When tests complete: `{timestamp} -- Post-implementation tests complete: {PASS|FAIL}`
