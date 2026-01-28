---
"@flowglad/nextjs": patch
"@flowglad/react": patch
"@flowglad/server": patch
"@flowglad/shared": patch
---

### ESM Build Fixes

- [99c16e59](https://github.com/flowglad/flowglad/commit/99c16e59425862b90ee610b492da5aa1cf63c487): Fix ESM build for `@flowglad/server` and `@flowglad/shared`
  - Resolves ESM import failures in SvelteKit and other ESM environments
  - Adds explicit `.mjs`/`.cjs` file extensions for proper module format detection
  - Uses `esbuild-fix-imports-plugin` to add `.mjs` extensions to relative imports
  - Removes need for `package.json` marker files in dist directories
  - Fixes issue #1500 where ESM imports failed with "Cannot find module" errors

### Better Auth Import Changes

- [12c2e01b](https://github.com/flowglad/flowglad/commit/12c2e01bd1c4b6fa8568f776bd71a32d368d0168): Remove better-auth re-exports from main entry point
  - Prevents module resolution errors when `better-auth` is not installed
  - Users should now import better-auth integration from `@flowglad/server/better-auth` directly
  - Fixes module resolution errors for users using other auth providers (next-auth, Clerk, Supabase Auth)

## Breaking Changes

⚠️ **Better Auth Import Path Change** - If you were importing better-auth helpers from `@flowglad/server`, you must now import from `@flowglad/server/better-auth`:

**Before:**
```typescript
import { flowgladPlugin } from '@flowglad/server';
```

**After:**
```typescript
import { flowgladPlugin } from '@flowglad/server/better-auth';
```
