# Test Plan: {{TYPE}}-{{ID}}

- Date: {{TIMESTAMP}}
- Work Item: {{TITLE}}
- Branch: {{BRANCH}}
- Changes: {{FILES_CHANGED}} files, +{{LINES_ADDED}}/-{{LINES_REMOVED}}

## Sources

### Requirements
<!-- Summarize the acceptance criteria and requirements driving these test cases -->

### Standards Referenced
<!-- List fabric/standards/ files consulted and relevant rules -->

### Product Docs Referenced
<!-- List fabric/product/ files consulted and relevant architecture decisions -->

### Code Changes Summary
<!-- Brief summary of what changed, which files, what patterns were used -->

## Test Cases: Unit Tests

<!-- Test cases for existing test suite (Step 1). Each case maps to a requirement or code change. -->

| # | Category | Test Case | Requirement | File(s) Under Test | Expected Result | Priority |
|---|----------|-----------|-------------|---------------------|-----------------|----------|
| U-1 | {category} | {description} | {REQ/AC reference} | {file path} | {expected outcome} | {P0/P1/P2} |

### Pre-existing Tests
<!-- List any existing tests that cover the changed code. Note if they need updating. -->

| Test File | Tests | Status | Notes |
|-----------|-------|--------|-------|
| {path} | {count} | {exists/needs-update/new} | {notes} |

## Test Cases: Browser Verification (Playwright)

<!-- Test scenarios for Playwright MCP (Step 2). Each scenario maps to an acceptance criterion. -->

### Prerequisites
- App URL: {{APP_URL}}
- Dev server command: {{DEV_SERVER_COMMAND}}
- Auth required: {yes/no — describe auth setup if needed}
- Test data: {any test data or preconditions needed}

### Scenarios

#### Scenario B-1: {title}
- **Requirement:** {acceptance criterion reference}
- **Preconditions:** {any setup needed}
- **Steps:**
  1. Navigate to {URL}
  2. {action — click, type, wait}
  3. {action}
- **Expected:** {what should be visible/changed}
- **Screenshot:** {what to capture}
- **Priority:** {P0/P1/P2}

<!-- Repeat for each scenario -->

## Test Cases: Browser Health (DevTools)

<!-- Health checks for Chrome DevTools MCP (Step 3). -->

### Console Checks
| # | Check | Expected | Severity if Failed |
|---|-------|----------|-------------------|
| H-1 | No unexpected JS errors on {page} | Zero errors (excluding known warnings) | blocking |
| H-2 | {specific check} | {expected} | {blocking/warning} |

### Network Checks
| # | Check | Expected | Severity if Failed |
|---|-------|----------|-------------------|
| N-1 | All API calls on {flow} return 2xx | No 4xx/5xx (except expected 401s) | blocking |
| N-2 | {specific endpoint check} | {expected status} | {blocking/warning} |

### Performance Checks
| # | Check | Target | Severity if Failed |
|---|-------|--------|-------------------|
| P-1 | Page load time for {page} | < 3 seconds | blocking if > 5s, warning if > 3s |

### Accessibility Checks
| # | Check | Expected | Severity if Failed |
|---|-------|----------|-------------------|
| A-1 | No critical WCAG violations on {page} | 0 critical, 0 serious | blocking |

## Coverage Matrix

<!-- Maps each acceptance criterion to the test cases that cover it -->

| Acceptance Criterion | Unit Tests | Browser Tests | Health Checks | Coverage |
|---------------------|------------|---------------|---------------|----------|
| {AC-1 description} | U-1, U-2 | B-1 | H-1, N-1 | Full |
| {AC-2 description} | U-3 | B-2, B-3 | N-1 | Full |
| {AC-N — uncovered} | — | — | — | GAP |

## Risks and Notes
<!-- Any testing risks, known limitations, or items that cannot be automatically tested -->
