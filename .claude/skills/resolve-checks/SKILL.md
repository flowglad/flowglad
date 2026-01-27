---
name: resolve-checks
description: Resolve all failing CI checks on the current branch's PR by running tests locally, fixing failures, and ensuring CI passes. Use when CI is red or before merging.
---

# Resolve Checks

Systematically resolve all failing CI checks by running tests locally first, fixing issues, and verifying CI passes.

## When to Use

- When CI checks are failing on your PR
- Before attempting to merge a PR
- When you want to proactively verify all checks pass
- After making changes and before pushing

## Core Principle

**Run tests locally first, don't wait for CI.** You have access to the full test suite locally. Catching failures locally is faster than waiting for CI round-trips.

## Reference Documentation

For detailed information on test types, setup files, utilities, and common failure patterns, see [test-reference.md](test-reference.md).

## Process

### 1. Identify the PR

```bash
# Get current branch
git branch --show-current
```

Use GitHub MCP to find the PR:
```
mcp__github__list_pull_requests with state: "open" and head: "<branch-name>"
```

### 2. Run Local Test Suite

Run all tests locally before checking CI status:

```bash
cd platform/flowglad-next

# Step 1: Type checking and linting (catches most issues)
bun run check

# Step 2: Backend tests (unit + db combined)
bun run test:backend

# Step 3: Frontend tests
bun run test:frontend

# Step 4: RLS tests (run serially)
bun run test:rls

# Step 5: Integration tests (end-to-end with real APIs)
bun run test:integration

# Step 6: Behavior tests (if credentials available)
bun run test:behavior
```

**Run these sequentially.** Fix failures at each step before proceeding to the next.

**Note:** `test:backend` combines unit and db tests for convenience. You can also run them separately with `test:unit` and `test:db`.

### 3. Fix Local Failures

When tests fail locally:

1. **Read the error output carefully** - Understand what's actually failing
2. **Reproduce the specific failure** - Run the single failing test file:
   ```bash
   bun test path/to/failing.test.ts
   ```
3. **Fix the issue** - Make the necessary code changes
4. **Re-run the specific test** - Verify your fix works
5. **Re-run the full suite** - Ensure no regressions

#### Common Failure Patterns

| Failure Type | Likely Cause |
|--------------|--------------|
| Type errors | Schema/interface mismatch |
| Lint errors | Style violations |
| Unit test failures | Logic errors, missing MSW mock |
| DB test failures | Schema changes, test data collisions |
| RLS test failures | Policy misconfiguration, parallel execution |
| Integration failures | Invalid credentials, service unavailable |

See [test-reference.md](test-reference.md) for detailed failure patterns and fixes.

### 4. Check CI Status

After local tests pass, check CI:

```
mcp__github__get_pull_request_status with owner, repo, and pull_number
```

Review each check's status. For failing checks:

1. **Get the failure details** from GitHub
2. **Compare with local results** - Did it pass locally?
3. **If CI-only failure**, investigate environment differences:
   - Missing environment variables
   - Different Node/Bun versions
   - Timing/race conditions
   - External service availability

### 5. Fix CI-Specific Failures

For failures that only occur in CI:

1. **Check the CI logs** - Look for the actual error message
2. **Check environment differences**:
   ```bash
   # Compare local vs CI environment
   bun --version
   node --version
   ```
3. **Look for flaky tests** - Tests that depend on timing, external services, or non-deterministic behavior
4. **Check for parallelism issues** - Some tests may not be parallel-safe (see RLS tests)

### 6. Push Fixes and Verify

After fixing issues:

```bash
# Stage and commit fixes
git add -A
git commit -m "fix: resolve failing checks

- [describe what was fixed]

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to trigger CI
git push
```

Then wait for CI to complete and verify all checks pass:
```
mcp__github__get_pull_request_status with owner, repo, and pull_number
```

### 7. Iterate Until Green

Repeat steps 4-6 until all checks pass. Common iteration scenarios:

- **New failures appear** - Your fix may have caused regressions
- **Flaky test passes locally but fails in CI** - May need to make test more deterministic
- **CI timeout** - Tests may be too slow, need optimization

## Quick Reference

| Command | What It Tests |
|---------|---------------|
| `bun run check` | TypeScript types + ESLint |
| `bun run test:unit` | Pure functions, isolated logic |
| `bun run test:db` | Database operations, queries |
| `bun run test:backend` | Combined unit + db tests |
| `bun run test:rls` | Row Level Security policies (run serially) |
| `bun run test:frontend` | React components and hooks |
| `bun run test:integration` | End-to-end with real services |
| `bun run test:behavior` | Invariants across dependency combinations |

For detailed test types, setup files, utilities, failure patterns, and parallel safety rules, see [test-reference.md](test-reference.md).

## Output

Report the final status:

**If all checks pass:**
- Confirm all local tests pass
- Confirm all CI checks are green
- List any notable fixes made

**If checks still fail:**
- List which checks are still failing
- Describe what was attempted
- Explain what remains to be investigated
