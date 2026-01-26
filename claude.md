## Package Manager
**IMPORTANT**: This project uses `bun` as its package manager. ALWAYS use `bun` for all package management operations. Never use `npm` or `yarn`.

Examples:
- Install dependencies: `bun install`
- Add a package: `bun add <package-name>`
- Run scripts: `bun run <script-name>`
- Build: `bun run build`

## Init
Run the following command EVERY TIME you are in a new context:
```bash
bun run init:flowglad-next
```

**Note:** This requires two environment variables to be set:
- `FLOWGLAD_VERCEL_PROJECT_ID` - The Vercel project ID
- `FLOWGLAD_LOCAL_USER` - Your local username for env var prefixing (e.g., BROOKS)

## Resources

### ast-grep

You run in an environment where `ast-grep` is available; whenever a search requires syntax-aware or structural matching, default to `ast-grep --lang <language> -p '<pattern>'` (e.g., `--lang typescript` for TypeScript files) and avoid falling back to text-only tools like `rg` or `grep` unless I explicitly request a plain-text search.

## Database Migrations

**IMPORTANT**: NEVER manually create or write migration files. This project uses Drizzle ORM with auto-generated migrations.

When making database schema changes:
1. Modify the schema definition files (e.g., files in `platform/flowglad-next/src/db/schema/`)
2. Run `bun run migrations:generate` from `platform/flowglad-next` to auto-generate the migration SQL

**NEVER run `bun run migrations:push`** - applying migrations to the database should only be done by the user, not by agents.

Drizzle Kit analyzes your schema changes and generates the appropriate migration files automatically. Manually created migration files will likely have incorrect formatting, missing metadata, or cause conflicts with the migration system.

## Testing Guidelines

Please use the following guidelines when implementing new tests:

- No mocking functions, unless the mocked function makes a network call whose response needs to be controlled for this test
- No .spyOn
- No dynamic imports
- No stubbed-out tests
- No usage of type "any"
- Each it should describe one scenario / set of inputs, and exhaustively test its behavior. we should not have multiple its if we are testing the same inputs each time, instead they should be all grouped under the same it with expectation assertions for each of the different things we expect inside of the single it
- Do not use toBeDefined - instead opt for tests to have more detailed assertions that make explicit the expectation of specific values
- Each it should have a specific, well articulated statement of what outcome it will expect (e.g. no "it should handle .... correctly" or "should handle [condition]").

### Test Types

**Unit Tests** - Test individual functions or modules in isolation. Good for pure functions, business logic validation, edge cases, and fast feedback during development.

**Integration Tests** - Test how multiple components work together against real infrastructure (database, APIs). Good for verifying database operations, testing specific scenarios end-to-end, and confirming API contracts.

**Behavior Tests** - Test behaviors across the cartesian product of dependency implementations, asserting universal invariants. Good for ensuring behavior is consistent across all valid configurations, catching regressions when new implementations are added, and reducing test boilerplate when the same behavior must hold for many variants. See `src/test/behaviorTest/` for the framework.

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

## Result Types and Error Handling

This codebase uses the `better-result` library for type-safe error handling. When working with Result types:

### Using Result.gen() for Multi-Step Operations

Use `Result.gen()` to compose multiple Result-returning operations:

```typescript
import { Result } from 'better-result'

const myFunction = async (): Promise<Result<Output, Error>> =>
  Result.gen(async function* () {
    // Use yield* Result.await() to unwrap async Results
    const value1 = yield* Result.await(asyncResultOperation1())
    const value2 = yield* Result.await(asyncResultOperation2(value1))

    // Return success
    return Result.ok(value2)
  })
```

### Important: Use `Result.await()` for Async Operations

**Always use `yield* Result.await(...)` instead of `yield* await ...`** inside `Result.gen()` async generators:

```typescript
// ✅ Correct - use Result.await()
const value = yield* Result.await(someAsyncResultFunction())

// ❌ Incorrect - don't use plain await
const value = yield* await someAsyncResultFunction()
```

Per the better-result library documentation: "Use Result.await to yield Promise in async generators - required for async operations inside Result.gen".

### Checking Result Types

Use static methods to check Result types:

```typescript
import { Result } from 'better-result'

// ✅ Correct - use static methods
if (Result.isOk(result)) {
  console.log(result.value)
}
if (Result.isError(result)) {
  console.log(result.error)
}

// ❌ Incorrect - instance methods don't exist
if (result.isOk()) { ... }
if (result.isErr()) { ... }
```

### Unwrapping Results

Use `.unwrap()` to extract the value (throws on error):

```typescript
const result = await someResultFunction()
const value = result.unwrap() // Throws if result is an error
```

### Tagged Error Types

Use tagged error classes from `@/errors` for Result errors:

```typescript
import { ValidationError, NotFoundError, ConflictError } from '@/errors'

// Return typed errors
return Result.err(new ValidationError('field', 'reason'))
return Result.err(new NotFoundError('Resource', 'id'))
return Result.err(new ConflictError('Resource', 'conflict description'))
```

## After Finishing Edits

It is extremely recommended to run the following command(s) and examine the output to ensure everything is working as expected:
<finishing-edits-commands>
1. `bun run check` - this is our linting/formatting and typechecking command, make sure to carefully examine the output and make any changes to fix the errors. Keep in mind that you may need to run it a few times to fix all the errors.
</finishing-edits-commands>
