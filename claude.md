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

**React component tests** (`.test.tsx` files) require DOM APIs and must include this directive at the top of the file:
```typescript
/**
 * @vitest-environment jsdom
 */
```

This tells Vitest to run that specific test file in a jsdom environment where DOM APIs like `document`, `window`, and React Testing Library work correctly.


## After Finishing Edits

It is extremely recommended to run the following command(s) and examine the output to ensure everything is working as expected:
<finishing-edits-commands>
1. `bun run check` - this is our linting/formatting and typechecking command, make sure to carefully examine the output and make any changes to fix the errors. Keep in mind that you may need to run it a few times to fix all the errors.
</finishing-edits-commands>
