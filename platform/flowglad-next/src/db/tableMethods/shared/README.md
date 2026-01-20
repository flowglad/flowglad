# Shared Table Method Utilities

This directory contains **client-safe** utility functions that can be imported by both client and server code.

## Why This Directory Exists

Some table methods files (e.g., `subscriptionItemMethods.ts`) import server-only modules like `cache-recomputable.ts` which depend on Node.js APIs (postgres, net, tls, fs). When other files import utilities from these table methods, the bundler includes all their imports, causing build failures when bundled for the client.

## Convention

Files in this directory **MUST NOT** import:
- `@/utils/cache-recomputable`
- `@/db/client` or any direct database client
- Any module that uses `server-only`
- Any Node.js built-in modules

Files in this directory **CAN** import:
- `@/db/tableUtils` (safe utility functions)
- `@/db/schema/*` (Zod schemas and types)
- `@/db/types` (type definitions)
- Other shared utilities

## Usage

When you need to share utility functions between table methods files and those functions don't require server-only dependencies:

1. Create a file in this directory (e.g., `fooUtils.ts`)
2. Move the client-safe utilities to this file
3. Re-export from the main table methods file for backwards compatibility
4. Update any imports that come from client-accessible code paths to import from the shared file directly

## Example

```typescript
// In shared/subscriptionItemUtils.ts (client-safe)
export const derivePricingModelIdFromSubscriptionItem = ...

// In subscriptionItemMethods.ts (server-only)
export { derivePricingModelIdFromSubscriptionItem } from './shared/subscriptionItemUtils'
import { cachedRecomputable } from '@/utils/cache-recomputable' // server-only import is safe here

// In subscriptionItemFeatureMethods.ts (needs to be client-importable)
import { derivePricingModelIdFromSubscriptionItem } from './shared/subscriptionItemUtils'
// NOT: import { ... } from './subscriptionItemMethods' // would pull in server-only code
```
