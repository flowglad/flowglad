## Package Manager
**IMPORTANT**: This project uses `bun` as its package manager. ALWAYS use `bun` for all package management operations. Never use `npm` or `yarn`.

Examples:
- Install dependencies: `bun run install-packages` (N.B. - this project is in a monorepo but installs its own packages, hence the custom install script)
- Add a package: `bun add <package-name>`
- Build: `bun run build`
- Lint and typecheck: `bun run check`

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

### bun:test Patterns and Pitfalls

**Mock Restoration**: When using `spyOn()`, always use `mock.restore()` in `afterEach` - not `mock.clearAllMocks()`. The difference:
- `mock.clearAllMocks()` - Only resets call counts and arguments
- `mock.restore()` - Actually restores the original function implementations

Without `mock.restore()`, spied functions leak across test files causing mysterious failures.

```typescript
import { afterEach, beforeEach, mock, spyOn } from 'bun:test'

beforeEach(() => {
  spyOn(someModule, 'someFunction').mockResolvedValue(mockValue)
})

afterEach(() => {
  mock.restore() // REQUIRED - restores original implementations
})
```

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
