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

### Test Environments
The test suite defaults to the `node` environment to ensure MSW (Mock Service Worker) can properly intercept HTTP requests for mocking external APIs like Stripe.

**React component tests** (`.test.tsx` files) require DOM APIs and must include this directive at the top of the file:
```typescript
/**
 * @vitest-environment jsdom
 */
```

This tells Vitest to run that specific test file in a jsdom environment where DOM APIs like `document`, `window`, and React Testing Library work correctly.

## When Writing TRPC Code
1. Always specify mutation and query outputs using `.output()`
2. If possible, do not write raw ORM code in the procedures. It's pure tech debt. Instead, use db/tableMethods/fooMethods.ts where you can.
3. If you can't, parse the outputs using the appropriate zod schema.
4. Speaking of zod schema, always bias towards using the zod schema found in db/schema

## Write Tests Coverage for Changes to Backend Business Logic

After you are at a good place with your changes, begin writing tests. 

Do this in four steps:
1. Plan test cases — see [@new-test-1-outline-test-cases.md](llm-prompts/new-test-1-outline-test-cases.md)
2. Stub tests — see [@new-test-2-planning-stubs.md](llm-prompts/new-test-2-planning-stubs.md)
3. Prepare global setup — see [@new-test-3-before-each-setup.md](llm-prompts/new-test-3-before-each-setup.md)
4. Implement tests — see [@new-test-4-implementation.md](llm-prompts/new-test-4-implementation.md)

### Use ast-grep instead of grep

You run in an environment where `ast-grep` is available; whenever a search requires syntax-aware or structural matching, default to `ast-grep --lang rust -p '<pattern>'` (or set `--lang` appropriately) and avoid falling back to text-only tools like `rg` or `grep` unless I explicitly request a plain-text search.
