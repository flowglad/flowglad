# Test Reference

Detailed reference for the Flowglad test infrastructure. Consult this when diagnosing test failures or understanding test behavior.

## Test Commands

All commands run from `platform/flowglad-next/`:

| Command | Pattern | Database | External APIs | Use For |
|---------|---------|----------|---------------|---------|
| `bun run test:unit` | `*.unit.test.ts` | Blocked | Blocked (MSW strict) | Pure logic, no side effects |
| `bun run test:db` | `*.db.test.ts` | Allowed | Blocked (MSW strict) | Database operations, queries |
| `bun run test:backend` | unit + db | Mixed | Blocked | Combined backend tests |
| `bun run test:frontend` | `*.test.tsx` | Blocked | Warned (MSW warn) | React components, hooks |
| `bun run test:rls` | `*.rls.test.ts` | Allowed | Mocked | Row Level Security policies |
| `bun run test:integration` | `*.integration.test.ts` | Allowed | Real APIs | End-to-end with real services |
| `bun run test:behavior` | `*.behavior.test.ts` | Allowed | Real APIs | Invariants across configurations |
| `bun run test` | All patterns | Mixed | Mixed | Full suite (unit+db+frontend+rls+integration) |

### Test Script Implementation

All test commands use the unified `run-bun-tests.ts` script:

```bash
bun run src/scripts/run-bun-tests.ts <setup-file> '<pattern>' [--timeout ms] [--concurrency n]
```

### Prerequisites

```bash
# Setup test database (required for db/integration/rls/behavior tests)
bun run test:setup

# Teardown when done
bun run test:teardown
```

### CI Pipeline

The CI runs tests in this order:
1. `test:unit` - Unit tests
2. `test:db` - Database tests
3. `test:frontend` - Frontend tests
4. `test:rls` - RLS tests
5. `test:integration` - Integration tests
6. `test:behavior` - Behavior tests (with real Stripe credentials)

### Database Safety

The DATABASE_URL safety check uses **lazy validation** - it only runs when a script imports the database module (`@/db`).

**Scripts that don't import `@/db` are never blocked**, regardless of DATABASE_URL:
- `bun run check` (type checking, linting)
- `bun run build`
- `bun run lint`

**Scripts that import `@/db` are blocked** if DATABASE_URL points to a remote database, unless:
- `VERCEL` is set (Vercel deployments)
- `CI` is set (CI/CD pipelines)
- `DANGEROUSLY_ALLOW_REMOTE_DB` is set (explicit opt-out)

## Test Types

### Unit Tests (`*.unit.test.ts`)

Pure function testing with no external dependencies.

**Characteristics:**
- No database access (throws error if attempted)
- MSW strict mode (unhandled HTTP requests fail the test)
- All external calls must be mocked
- Fastest execution

**When tests fail:**
- Logic errors in pure functions
- Missing mock for an external call
- Type mismatches

**Example:**
```typescript
// src/app/checkout/guard.unit.test.ts
describe('shouldBlockCheckout', () => {
  it('blocks when active paid subscription exists and price is subscription type', () => {
    const result = shouldBlockCheckout({
      hasActivePaidSubscription: true,
      priceType: 'subscription'
    })
    expect(result).toBe(true)
  })
})
```

### Database Tests (`*.db.test.ts`)

Tests that interact with a real test database.

**Characteristics:**
- Full database access via seeded test DB
- MSW strict mode (external services blocked)
- Must use unique identifiers to avoid test collisions
- Requires `bun run test:setup` first

**When tests fail:**
- Schema mismatches (run migrations)
- Test data collisions (use nanoid/timestamps)
- Missing database setup
- Query logic errors

**Setup pattern:**
```typescript
import { setupOrg, setupCustomer } from '@/test/helpers/databaseHelpers'

let organization: Organization.Record
let customer: Customer.Record

beforeEach(async () => {
  const orgSetup = await setupOrg()
  organization = orgSetup.organization

  customer = await setupCustomer({
    organizationId: organization.id,
    email: `customer+${nanoid()}@test.com`, // Unique per test
  })
})
```

### Frontend Tests (`*.test.tsx`)

React component and hook tests.

**Characteristics:**
- Requires DOM APIs via happy-dom
- React Testing Library utilities available
- MSW warn mode (logs unhandled requests)
- Jest-dom matchers extended

**When tests fail:**
- Component rendering errors
- Hook state issues
- Missing DOM environment setup
- Async timing issues

### RLS Tests (`*.rls.test.ts`)

Row Level Security policy verification.

**Characteristics:**
- Located in `src/db/` alongside schema
- Database access enabled
- **Must run serially**: `--max-concurrency 1`
- Tests data isolation via `authenticatedTransaction`

**When tests fail:**
- RLS policy misconfiguration
- Missing policy for new table
- Parallel execution (must be serial)

### Integration Tests (`*.integration.test.ts`)

Real API calls to external services.

**Characteristics:**
- Real API calls enabled (Stripe, Redis, etc.)
- Database access allowed
- Requires credentials from `.env.development`
- MSW bypassed for real external APIs

**When tests fail:**
- External service unavailable
- Invalid/expired credentials
- Rate limiting
- Network issues

**Required environment:**
```typescript
process.env.STRIPE_INTEGRATION_TEST_MODE = 'true'
process.env.REDIS_INTEGRATION_TEST_MODE = 'true'
```

### Behavior Tests (`*.behavior.test.ts`)

Test invariants across combinations of dependencies.

**Characteristics:**
- Framework in `/src/test/behaviorTest/`
- Tests same behavior across multiple configurations
- Cartesian product of dependency implementations
- Uses integration setup (real APIs enabled)
- 60 second timeout (longer than other tests)
- Runs in CI with real Stripe credentials

**When tests fail:**
- Behavior invariant violated for specific dependency combination
- Stripe API errors (rate limits, invalid credentials)
- Missing test setup for new dependency implementations

**Location:** `src/test/behaviorTest/behaviorTests/`

## Setup Files Architecture

Located in `platform/flowglad-next/`:

| File | Purpose | Imports |
|------|---------|---------|
| `bun.mocks.ts` | Core module mocks (MUST be imported first) | - |
| `bun.unit.setup.ts` | Unit test lifecycle | `bun.mocks.ts` |
| `bun.db.test.setup.ts` | DB test lifecycle | `bun.mocks.ts` |
| `bun.integration.setup.ts` | Integration test lifecycle | `bun.mocks.ts` |
| `bun.rls.setup.ts` | RLS test lifecycle | `bun.mocks.ts` |
| `bun.frontend.setup.ts` | Frontend test lifecycle | `bun.mocks.ts` |
| `bun.dom.preload.ts` | DOM/happy-dom preload | - |

**Critical:** `bun.mocks.ts` must be imported before any module that gets mocked.

## Mock Infrastructure

### MSW (Mock Service Worker)

Controls HTTP request interception:

| Mode | Behavior | Used By |
|------|----------|---------|
| `error` (strict) | Unhandled requests fail test | Unit, DB tests |
| `warn` | Unhandled requests logged | Frontend tests |
| `bypass` (silent) | Real requests allowed | Integration tests |

**Mock handlers location:** `mocks/`
- `stripeServer.ts` - Stripe API mocks
- `svixServer.ts` - Svix webhook mocks
- `unkeyServer.ts` - Unkey SDK mocks
- `triggerServer.ts` - Trigger.dev mocks

### Module Mocks

Located in `mocks/`:
- `module-mocks.ts` - Common module mocks (trigger tasks, auth, server-only)
- `unkey-sdk-mock.ts` - Unkey SDK implementation
- `redis-mock.ts` - Redis client mock
- `svix-mock.ts` - Svix webhook mock

## Test Utilities

### Isolation Helpers (`src/test/isolation/`)

**Environment Tracking:**
```typescript
import { createAutoEnvTracker } from '@/test/isolation/envTracker'

// Automatic - captures process.env at test start, restores in afterEach
```

**Spy Management:**
```typescript
import { trackSpy } from '@/test/isolation/spyManager'
import { spyOn } from 'bun:test'

beforeEach(() => {
  trackSpy(spyOn(someModule, 'fn').mockResolvedValue(value))
})
// Spies automatically restored - no afterEach needed
```

**Global State Guard:**
```typescript
// Automatically resets __mockedAuthSession and other __mock* globals
```

### Test Context (`src/test/helpers/testIsolation.ts`)

```typescript
import { createTestContext, createScopedEnv, preserveEnv } from '@/test/helpers/testIsolation'

// Full context helper
const ctx = createTestContext()
beforeEach(() => {
  ctx.env.set('API_KEY', 'test-key')
  ctx.setAuth({ id: 'user_123', email: 'test@example.com' })
})
afterEach(() => {
  ctx.cleanup()
})

// Scoped environment only
const env = createScopedEnv()
env.set('FEATURE_FLAG', 'enabled')
// ... test ...
env.restore()

// Preserve specific keys
const restore = preserveEnv(['API_KEY', 'DEBUG'])
process.env.API_KEY = 'test-key'
// ... test ...
restore()
```

### Spy Tracker (`src/test/spyTracker.ts`)

For manual spy lifecycle control:

```typescript
import { createSpyTracker } from '@/test/spyTracker'

const tracker = createSpyTracker()

beforeEach(() => {
  tracker.reset()
  tracker.track(spyOn(module, 'fn').mockResolvedValue(value))
})

afterEach(() => {
  tracker.restoreAll() // Only restores tracked spies, not module mocks
})
```

### Database Helpers (`src/test/helpers/databaseHelpers.ts`)

Setup functions for common test data:
- `setupOrg()` - Create test organization
- `setupCustomer()` - Create test customer
- Other entity setup helpers

## Common Failure Patterns

### Type Errors (`bun run check`)

| Error | Cause | Fix |
|-------|-------|-----|
| Property does not exist | Schema/interface changed | Update type definitions |
| Type X not assignable to Y | Return type mismatch | Fix function return type |
| Cannot find module | Missing import/typo | Check import path |

### Unit Test Failures

| Error | Cause | Fix |
|-------|-------|-----|
| "Unhandled request" | Missing MSW mock | Add handler to appropriate mock file |
| Unexpected value | Logic error | Fix the implementation |
| Mock not called | Function path changed | Update mock target |

### Database Test Failures

| Error | Cause | Fix |
|-------|-------|-----|
| "relation does not exist" | Missing migration | Run `bun run migrations:generate` and apply |
| Unique constraint violation | Test data collision | Use nanoid/timestamp for unique values |
| Connection refused | Test DB not running | Run `bun run test:setup` |
| Unexpected row count | Query logic error | Check WHERE clauses, JOINs |

### RLS Test Failures

| Error | Cause | Fix |
|-------|-------|-----|
| Permission denied | RLS policy blocking | Check policy definition |
| Data visible across tenants | Missing RLS policy | Add policy for table |
| Flaky results | Parallel execution | Run with `--max-concurrency 1` |

### Integration Test Failures

| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Invalid/expired credentials | Check `.env.development` |
| 429 Too Many Requests | Rate limited | Wait and retry, or use mocks |
| Network error | Service unavailable | Check service status |
| Timeout | Slow external API | Increase timeout or mock |

### Frontend Test Failures

| Error | Cause | Fix |
|-------|-------|-----|
| "document is not defined" | Missing DOM environment | Check setup file imports |
| Act warning | Async state update | Wrap in `act()` or use `waitFor()` |
| Element not found | Incorrect query | Check component renders correctly |

## Parallel Safety Rules

1. **Never use global `mock.restore()`** - Breaks module mocks
2. **Use `trackSpy()` for spies** - Automatic cleanup without affecting modules
3. **Use unique test data** - nanoid/timestamps prevent collisions
4. **RLS tests run serially** - They modify database roles
5. **Don't assume query ordering** - Always sort before assertions

## Running Specific Tests

```bash
# Single file
bun test path/to/file.test.ts

# Pattern match
bun test --grep "should handle"

# With verbose output
bun test --verbose path/to/file.test.ts

# Serial execution (for RLS or debugging)
bun test --max-concurrency 1 path/to/file.test.ts
```

## Debugging Tips

1. **Add `--verbose`** to see detailed output
2. **Run single test file** to isolate the failure
3. **Check MSW mode** - strict mode may block needed requests
4. **Verify test setup ran** - `bun run test:setup` for DB tests
5. **Check environment variables** - integration tests need real credentials
6. **Look for parallel pollution** - run with `--max-concurrency 1`

## Flaky Test Patterns

**Never re-run CI hoping flaky tests pass.** Always diagnose and fix the root cause.

### Non-Deterministic Results

```typescript
// FLAKY: Array order not guaranteed
const users = await db.query.users.findMany()
expect(users).toEqual([userA, userB])

// FIXED: Sort before comparing
const users = await db.query.users.findMany()
const sorted = users.sort((a, b) => a.id.localeCompare(b.id))
expect(sorted).toEqual([userA, userB].sort((a, b) => a.id.localeCompare(b.id)))
```

### Race Conditions

```typescript
// FLAKY: Doesn't wait for async completion
emitEvent('userCreated')
expect(handler.called).toBe(true)

// FIXED: Wait for the side effect
await emitEvent('userCreated')
await waitFor(() => expect(handler.called).toBe(true))
```

### Timing Dependencies

```typescript
// FLAKY: Arbitrary sleep may not be enough
await sleep(100)
expect(cache.get('key')).toBeDefined()

// FIXED: Poll for condition
await waitFor(() => expect(cache.get('key')).toBeDefined(), { timeout: 5000 })
```

### Shared State Between Tests

```typescript
// FLAKY: Uses global counter that persists across tests
let counter = 0
it('increments counter', () => {
  counter++
  expect(counter).toBe(1) // Fails if another test ran first
})

// FIXED: Reset in beforeEach
let counter: number
beforeEach(() => { counter = 0 })
it('increments counter', () => {
  counter++
  expect(counter).toBe(1)
})
```

### Test Data Collisions

```typescript
// FLAKY: Fixed email collides in parallel runs
await createUser({ email: 'test@example.com' })

// FIXED: Unique email per test
await createUser({ email: `test+${nanoid()}@example.com` })
```

### Verifying a Fix is Stable

Run the test multiple times before pushing:
```bash
for i in {1..10}; do bun test path/to/test.ts || exit 1; done
```
