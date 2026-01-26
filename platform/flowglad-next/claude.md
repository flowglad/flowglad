## Package Manager
**IMPORTANT**: This project uses `bun` as its package manager. ALWAYS use `bun` for all package management operations. Never use `npm` or `yarn`.

Examples:
- Install dependencies: `bun run install-packages` (N.B. - this project is in a monorepo but installs its own packages, hence the custom install script)
- Add a package: `bun add <package-name>`
- Build: `bun run build`
- Lint and typecheck: `bun run check`

## Environment Configuration (NODE_ENV)

This project uses a NODE_ENV-based environment system that automatically selects the correct `.env` file:

| NODE_ENV | Env File | Use Case |
|----------|----------|----------|
| `development` | `.env.development` | Local dev with Vercel credentials (DEFAULT) |
| `test` | `.env.test` | Running tests against local test database |
| `production` | `.env.production` | Production builds/deploys |

**Key behaviors:**
- **Development is the default** - When NODE_ENV is unset, it defaults to `development`
- **Test scripts auto-detect** - Scripts starting with "test" automatically use `.env.test`
- **Database safety check** - A preload script blocks execution if DATABASE_URL points to a non-local database (prevents accidental production writes)

**Safety check bypass:**
- `CI=1` - Automatically set in CI environments
- `VERCEL=1` - Automatically set on Vercel deployments
- `DANGEROUSLY_ALLOW_REMOTE_DB=1` - Explicit opt-out for remote database access

**Bootstrap scripts** (skip env validation entirely):
- `user` - Creates `.env_user` file
- `vercel:env-pull:*` - Pulls env files from Vercel
- `install-packages` - Installs dependencies

**Note:** `NODE_ENV=production` does NOT bypass the safety check (too easy for AI agents to accidentally use). Use `DANGEROUSLY_ALLOW_REMOTE_DB=1` for intentional remote database access.

### The `fbr` Command (Flowglad Bun Run)

A convenience wrapper for `bun run` that sets NODE_ENV:

```bash
# Install (one-time setup)
cp bin/fbr ~/bin/fbr && fbr --install

# Usage: fbr <script> [environment]
fbr dev                      # NODE_ENV=development bun run dev
fbr migrations:push test     # NODE_ENV=test bun run migrations:push
fbr build production         # NODE_ENV=production bun run build
```

The `fbr` command provides shell completions for both script names and environments.

## Installing Dependencies 

## On Every Change
Whenever you complete a task, confirm that everything lints and typechecks as expected:
```bash
bun run check
```

## Running Tests
If you are trying to run tests to see whether they pass, you must use `bun run test`. `bun run test:watch` will run the test suite in watch mode and leave you waiting for timeouts.

**IMPORTANT**: Always pass `CLAUDECODE=1` when running tests to silence verbose logger output (cache stats, etc.). This produces cleaner output and consumes fewer tokens:
```bash
CLAUDECODE=1 bun run test:backend
```

**Test Database Setup**: Before running tests, ensure the test database is running:
```bash
bun run test:setup   # Starts Docker postgres, creates .env.test, runs migrations
```

In CI environments, tests run with `CI=1` which bypasses the database safety check. For local development with a remote DATABASE_URL in `.env.local`, you may need `CI=1` to run tests against the local test database.

### Test Categories (Isolation by Default)

This project uses isolated-by-default test infrastructure. Tests are categorized by their isolation level:

| Category | File Pattern | Database | External APIs | Setup File |
|----------|--------------|----------|---------------|------------|
| **Pure Unit** | `*.unit.test.ts` | BLOCKED | MSW strict | `bun.unit.setup.ts` |
| **DB-Backed** | `*.db.test.ts` | Transaction-isolated | MSW strict | `bun.db.test.setup.ts` |
| **Backend** (legacy) | `*.test.ts` | Full access | MSW warn | `bun.setup.ts` |
| **Integration** | `*.integration.test.ts` | Full access | Real APIs | `bun.integration.setup.ts` |
| **RLS** | `*.rls.test.ts` | Full access | MSW | `bun.rls.setup.ts` |

**Test Commands:**
```bash
# Pure unit tests (no DB, strict isolation)
bun run test:pure-unit

# DB-backed tests (transaction-isolated)
bun run test:db

# Legacy backend tests (existing pattern)
bun run test:backend

# All tests (backend + frontend)
bun run test

# Integration tests (real APIs)
bun run test:integration

# Everything
bun run test:all
```

**When to use which pattern:**

- **Pure Unit (`*.unit.test.ts`)**: Schema validation, utility functions, UI logic, pure business rules. Database imports will throw an error - if your test needs DB, use `*.db.test.ts`.

- **DB-Backed (`*.db.test.ts`)**: Table methods, services with database access, business logic requiring real data. Each test runs in a savepoint that rolls back automatically.

- **Legacy Backend (`*.test.ts`)**: Existing tests. Migrate to `*.unit.test.ts` or `*.db.test.ts` for better isolation.

- **Integration (`*.integration.test.ts`)**: Real API calls to Stripe, real external services. Located in `integration-tests/` directory.

### Automatic Isolation (No Opt-In Required)

The test setup files automatically provide isolation:

| Feature | How It Works |
|---------|--------------|
| Env vars | Auto-snapshot at test start, auto-restore in afterEach |
| Spies | Use `trackSpy(spyOn(...))` - auto-restored in afterEach |
| Global state | All `__mock*` globals reset automatically |
| MSW | Unhandled requests FAIL the test in strict mode |
| Database (db.test) | Each test in savepoint that rolls back |

**Using trackSpy for automatic spy cleanup:**
```typescript
import { trackSpy } from '@/test/isolation'
import { spyOn } from 'bun:test'

beforeEach(() => {
  // Spy is automatically restored after each test
  trackSpy(spyOn(myModule, 'myFunction').mockResolvedValue('mocked'))
})
// No afterEach cleanup needed!
```

### Parallel-Safe Test Patterns

Tests run in parallel by default. Follow these patterns to ensure tests don't interfere with each other:

#### 1. Mock Module Registration Order

Mock module registration order is critical in bun:test. All `mock.module()` calls are centralized in `bun.mocks.ts` and must be imported **before** any other imports that might load the mocked modules:

```typescript
// bun.setup.ts (correct order)
import './bun.mocks'  // MUST be first - registers mock.module() calls
import { afterAll, afterEach, beforeAll } from 'bun:test'
// ... other imports
```

The setup files (`bun.unit.setup.ts`, `bun.db.test.setup.ts`, `bun.setup.ts`) already handle this correctly.

#### 2. Spy Restoration with trackSpy

**Never use global `mock.restore()`** when using `spyOn()` alongside `mock.module()`. The global restore can undo module-level mocks, breaking subsequent tests. Instead, use `trackSpy()`:

```typescript
import { trackSpy } from '@/test/isolation'
import { spyOn } from 'bun:test'

beforeEach(() => {
  // Spies registered with trackSpy are auto-restored in afterEach
  trackSpy(spyOn(someModule, 'someFunction').mockResolvedValue(mockValue))
  trackSpy(spyOn(otherModule, 'otherFunction').mockReturnValue(otherValue))
})
// No manual cleanup needed - setup files handle restoration
```

#### 3. Environment Variable Isolation

Tests that modify `process.env` are automatically isolated. The setup files snapshot `process.env` before each test and restore it afterward:

- **Automatic**: Just modify `process.env` in your test - it's restored automatically
- **Manual** (if needed): Use helpers from `@/test/helpers/testIsolation`:

```typescript
import { preserveEnv, createScopedEnv } from '@/test/helpers/testIsolation'

// Option 1: Preserve specific keys
const restore = preserveEnv(['API_KEY', 'DEBUG'])
process.env.API_KEY = 'test-key'
// ... test ...
restore()

// Option 2: Scoped environment
const env = createScopedEnv()
env.set('FEATURE_FLAG', 'enabled')
// ... test ...
env.restore()
```

#### 4. MSW Strict Mode

In `*.unit.test.ts` and `*.db.test.ts` files, MSW runs in **strict mode**: any unhandled HTTP request will **fail the test**. This ensures:

- Tests don't accidentally make real network requests
- All external dependencies are explicitly mocked
- Tests are deterministic and fast

If a test legitimately needs real API calls, use `*.integration.test.ts` instead.

#### 5. Database Savepoint Isolation (db.test only)

For `*.db.test.ts` files, each test runs inside a database savepoint that automatically rolls back:

```typescript
// In *.db.test.ts files:
// - A persistent outer transaction wraps all tests
// - Each test creates a savepoint before running
// - The savepoint rolls back after each test
// - No manual cleanup or data deletion needed

it('creates a customer', async () => {
  // This insert is automatically rolled back after the test
  await insertCustomer({ name: 'Test', email: 'test@example.com' }, transaction)
  // ... assertions ...
})
```

This provides true isolation without the overhead of recreating the database for each test.

#### 6. Global Mock State

Global mocks (e.g., `globalThis.__mockedAuthSession`) are automatically reset after each test. The setup files call `resetAllGlobalMocks()` which:

- Clears (not deletes) mocks registered by `mock.module()` in `bun.mocks.ts`
- Deletes any `__mock*` globals added by individual tests

For custom global state, use `createTestContext()`:

```typescript
import { createTestContext } from '@/test/helpers/testIsolation'

const ctx = createTestContext()

beforeEach(() => {
  ctx.setAuth({ id: 'user_123', email: 'test@example.com' })
  ctx.onCleanup(() => { /* custom cleanup */ })
})

afterEach(() => {
  ctx.cleanup()  // Restores env, auth, and runs custom cleanups
})
```

### Test Environments
The test suite defaults to the `node` environment to ensure MSW (Mock Service Worker) can properly intercept HTTP requests for mocking external APIs like Stripe.

**Tests using React or DOM APIs** must include this directive at the top of the file:
```typescript
/**
 * @vitest-environment jsdom
 */
```

This includes:
- React component tests (`.test.tsx` files)
- React hook tests using `renderHook` from `@testing-library/react`
- Any test that needs DOM APIs like `document` or `window`

This tells Vitest to run that specific test file in a jsdom environment.

### Test Organization by Type

Tests are organized into different directories based on their purpose:

- **`src/`** - Unit tests and integration tests for regular functionality
- **`slow-tests/`** - Tests that require significant setup time or database seeding
- **`rls-tests/`** - Row Level Security (RLS) tests that verify PostgreSQL RLS policies

**RLS Tests**: All tests that verify Row Level Security policies must:
- Be placed in the `rls-tests/` directory
- Follow the naming convention `foo.rls.test.ts`
- Test organization-based data isolation via `authenticatedTransaction`
- Verify that users cannot access data from other organizations

### bun:test Patterns and Pitfalls

**Mock Restoration**: When using `spyOn()` alongside `mock.module()`, restore spies individually - not with `mock.restore()`. The global `mock.restore()` can undo `mock.module()` overrides, breaking subsequent tests that rely on those module mocks.

```typescript
import { afterEach, beforeEach, spyOn } from 'bun:test'

// Store spy references for cleanup
let spies: Array<{ mockRestore: () => void }> = []

beforeEach(() => {
  spies = []
  spies.push(spyOn(someModule, 'someFunction').mockResolvedValue(mockValue))
  spies.push(spyOn(otherModule, 'otherFunction').mockResolvedValue(otherValue))
})

afterEach(() => {
  // Restore each spy individually to preserve mock.module() overrides
  spies.forEach((spy) => spy.mockRestore())
})
```

If you have NO `mock.module()` calls in your test file, you can use `mock.restore()` globally. But when mixing `spyOn()` with `mock.module()`, always restore spies individually.

**Assertion Patterns**: Avoid `.resolves.not.toThrow()` - it doesn't work correctly in bun:test for functions that return values. Instead, just await the function:

```typescript
// BAD - returns "Thrown value: undefined" even on success
await expect(someAsyncFunction()).resolves.not.toThrow()

// GOOD - if it throws, the test fails
await someAsyncFunction()
```

**Database Result Ordering**: Never assume database query ordering unless explicitly specified. Sort results before asserting:

```typescript
// BAD - assumes database returns items in a specific order
expect(result[0].name).toBe('Item 1')

// GOOD - sort first for deterministic assertions
const sorted = [...result].sort((a, b) => a.name.localeCompare(b.name))
expect(sorted[0].name).toBe('Item 1')
```

**Filtering Tests**: Use `--test-name-pattern` to filter by test name:
```bash
bun test --test-name-pattern "should insert usage event"
```

## When Writing TRPC Code
1. Always specify mutation and query outputs using `.output()`
2. If possible, do not write raw ORM code in the procedures. It's pure tech debt. Instead, use db/tableMethods/fooMethods.ts where you can.
3. If you can't, parse the outputs using the appropriate zod schema.
4. Speaking of zod schema, always bias towards using the zod schema found in db/schema

## Client/Server Code Separation in tableMethods

Some table methods files import server-only modules (e.g., `cache-recomputable.ts` which depends on postgres). When client code transitively imports these files, the build fails.

**Convention:** Use `fooMethods.server.ts` for functions that depend on server-only modules like `cachedRecomputable`, direct database connections, or other Node.js APIs.

- **`fooMethods.ts`** - Client-safe functions (basic CRUD, selects, inserts)
- **`fooMethods.server.ts`** - Server-only functions (cached queries, complex joins with server deps)

Example:
```typescript
// subscriptionItemMethods.ts - client-safe, basic operations
export const selectSubscriptionItems = createSelectFunction(...)
export const insertSubscriptionItem = ...

// subscriptionItemMethods.server.ts - server-only, uses cachedRecomputable
import { cachedRecomputable } from '@/utils/cache-recomputable'
export const selectSubscriptionItemsWithPricesBySubscriptionId = cachedRecomputable(...)
export const selectRichSubscriptionsAndActiveItems = ...
```

## Write Tests Coverage for Changes to Backend Business Logic

After you are at a good place with your changes, begin writing tests. 

Do this in four steps:
1. Plan test cases — see [@new-test-1-outline-test-cases.md](llm-prompts/new-test-1-outline-test-cases.md)
2. Stub tests — see [@new-test-2-planning-stubs.md](llm-prompts/new-test-2-planning-stubs.md)
3. Prepare global setup — see [@new-test-3-before-each-setup.md](llm-prompts/new-test-3-before-each-setup.md)
4. Implement tests — see [@new-test-4-implementation.md](llm-prompts/new-test-4-implementation.md)

### Use ast-grep instead of grep

You run in an environment where `ast-grep` is available; whenever a search requires syntax-aware or structural matching, default to `ast-grep --lang rust -p '<pattern>'` (or set `--lang` appropriately) and avoid falling back to text-only tools like `rg` or `grep` unless I explicitly request a plain-text search.
