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
3. **Check for parallelism issues** - Some tests may not be parallel-safe (see RLS tests)
4. **Investigate flaky tests** - See "Handling Flaky Tests" section below

### 6. Handling Flaky Tests

**CRITICAL: Do not simply re-run CI hoping tests will pass.** Flaky tests indicate real problems that must be diagnosed and fixed.

When a test passes locally but fails in CI (or fails intermittently):

#### Step 1: Identify the Flakiness Pattern

Run the failing test multiple times locally:
```bash
# Run 10 times to check for intermittent failures
for i in {1..10}; do bun test path/to/flaky.test.ts && echo "Pass $i" || echo "FAIL $i"; done
```

#### Step 2: Diagnose the Root Cause

Common causes of flaky tests:

| Symptom | Root Cause | Fix |
|---------|------------|-----|
| Different results each run | Non-deterministic data (random IDs, timestamps) | Use fixed test data or sort before comparing |
| Timeout failures | Async operation too slow or never resolves | Add proper await, increase timeout, or fix hanging promise |
| Race conditions | Test doesn't wait for async side effects | Use proper async/await, add waitFor(), or test the callback |
| Order-dependent failures | Test relies on state from previous test | Ensure proper setup/teardown isolation |
| Parallel execution conflicts | Tests share mutable state (DB, globals, env vars) | Use unique test data, proper isolation helpers |
| External service failures | Test depends on real API availability | Mock the service or handle unavailability gracefully |

#### Step 3: Fix the Test (Not Just Re-run)

**Always fix the underlying issue:**

```typescript
// BAD: Non-deterministic - order not guaranteed
const results = await db.query.users.findMany()
expect(results).toEqual([user1, user2])

// GOOD: Sort before comparing
const results = await db.query.users.findMany()
expect(results.sort((a, b) => a.id.localeCompare(b.id))).toEqual([user1, user2].sort((a, b) => a.id.localeCompare(b.id)))
```

```typescript
// BAD: Race condition - side effect may not be complete
triggerAsyncOperation()
expect(sideEffect).toBe(true)

// GOOD: Wait for the operation
await triggerAsyncOperation()
expect(sideEffect).toBe(true)
```

```typescript
// BAD: Timing-dependent
await sleep(100) // Hope this is enough time
expect(result).toBeDefined()

// GOOD: Poll for condition
await waitFor(() => expect(result).toBeDefined())
```

#### Step 4: Verify the Fix

After fixing:
1. Run the test 10+ times locally to confirm it's stable
2. Push and verify it passes in CI
3. If it still fails in CI, there's an environment difference to investigate

### 7. Push Fixes and Verify

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

### 8. Iterate Until Green

Repeat steps 4-7 until all checks pass. Common iteration scenarios:

- **New failures appear** - Your fix may have caused regressions
- **Flaky test still fails** - Revisit "Handling Flaky Tests" section, dig deeper into root cause
- **CI timeout** - Tests may be too slow, need optimization

**Remember:** The goal is a stable, passing test suite - not a lucky CI run. Every fix should address the root cause.

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
