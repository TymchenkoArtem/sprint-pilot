# Test Report: {TYPE}-{ID} — Run {N}
- Date: {ISO 8601 timestamp}
- Fix cycle: {N}/3
- Token usage (this run): {N}

## Unit Tests
- Command: {test command from config}
- Total: {N}, Passed: {N}, Failed: {N}, Skipped: {N}
- Duration: {N}s
### Failures (if any)
- {test name} — {file}:{line} — {error message}
  Expected: {expected}
  Actual: {actual}

## Browser Verification (Playwright MCP)
- App URL: {url}
- Dev server: {command}
- Scenarios: {N total}, {N passed}, {N failed}, {N skipped}
### Scenario Results
| # | Description | Result | Screenshot | Notes |
|---|------------|--------|------------|-------|
| 1 | {description} | PASS | {filename} | |
| 2 | {description} | FAIL | {filename} | {error detail} |
### Playwright Actions Log
{Chronological log of navigate/click/type/assert actions and their outcomes}

## Browser Health (Chrome DevTools MCP)
### Console
- Errors: {N}
- Warnings: {N}
- Details:
  {timestamp} [ERROR] {message} — {source}:{line}
  {timestamp} [WARN]  {message} — {source}:{line}
- Filtered (expected): {list of ignored warnings with reason}
### Network
- Failed requests: {N}
- Details:
  | URL | Method | Status | Error |
  |-----|--------|--------|-------|
  | {url} | GET | 500 | {message} |
- Filtered (expected): {list of ignored 401s etc with reason}
### Performance
- Page load: {N}s
- Time to interactive: {N}s
- DOMContentLoaded: {N}s
### Accessibility
- Critical: {N}, Serious: {N}, Moderate: {N}, Minor: {N}
- Details:
  | Severity | Rule | Element | Description |
  |----------|------|---------|-------------|
  | critical | {rule-id} | {selector} | {description} |

## Screenshots
| Scenario | Result | File |
|----------|--------|------|
| {description} | PASS | {filename} |
| {description} | FAIL | {filename} |
