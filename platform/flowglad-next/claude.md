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

## When Writing TRPC Code
1. Always specify mutation and query outputs using `.output()`
2. If possible, do not write raw ORM code in the procedures. It's pure tech debt. Instead, use db/tableMethods/fooMethods.ts where you can.
3. If you can't, parse the outputs using the appropriate zod schema.
4. Speaking of zod schema, always bias towards using the zod schema found in db/schema

## Client/Server Code Separation in tableMethods

Some table methods files import server-only modules (e.g., `cache-recomputable.ts` which depends on postgres). When client code transitively imports these files, the build fails.

**Convention:** Use `src/db/tableMethods/shared/` for client-safe utilities that need to be imported by files in the client bundle's import chain.

- Files in `shared/` **MUST NOT** import server-only modules (`cache-recomputable`, `db/client`, etc.)
- Files in `shared/` **CAN** import `tableUtils`, schemas, and types
- Re-export shared utilities from the main table methods file for backwards compatibility

Example:
```typescript
// shared/subscriptionItemUtils.ts - client-safe
export const derivePricingModelIdFromSubscriptionItem = ...

// subscriptionItemMethods.ts - can have server-only imports
export { derivePricingModelIdFromSubscriptionItem } from './shared/subscriptionItemUtils'
import { cachedRecomputable } from '@/utils/cache-recomputable' // safe here

// subscriptionItemFeatureMethods.ts - in client import chain
import { derivePricingModelIdFromSubscriptionItem } from './shared/subscriptionItemUtils'
// NOT from './subscriptionItemMethods' (would pull in server-only code)
```

See `src/db/tableMethods/shared/README.md` for full documentation.

## Write Tests Coverage for Changes to Backend Business Logic

After you are at a good place with your changes, begin writing tests. 

Do this in four steps:
1. Plan test cases — see [@new-test-1-outline-test-cases.md](llm-prompts/new-test-1-outline-test-cases.md)
2. Stub tests — see [@new-test-2-planning-stubs.md](llm-prompts/new-test-2-planning-stubs.md)
3. Prepare global setup — see [@new-test-3-before-each-setup.md](llm-prompts/new-test-3-before-each-setup.md)
4. Implement tests — see [@new-test-4-implementation.md](llm-prompts/new-test-4-implementation.md)

### Use ast-grep instead of grep

You run in an environment where `ast-grep` is available; whenever a search requires syntax-aware or structural matching, default to `ast-grep --lang rust -p '<pattern>'` (or set `--lang` appropriately) and avoid falling back to text-only tools like `rg` or `grep` unless I explicitly request a plain-text search.
