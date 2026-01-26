---
"@flowglad/nextjs": patch
"@flowglad/react": patch
"@flowglad/server": patch
"@flowglad/shared": patch
---

### Better Auth Plugin Improvements

- [790042dd](https://github.com/flowglad/flowglad/commit/790042dd): Rework Better Auth plugin with organization support
  - Organization customer resolution when `customerType="organization"` using `session.activeOrganizationId` (and adapter lookups) if no custom `getCustomer` is provided
  - Added `getExternalId`, `billing/pricing`, and `getUsageMeterBalances` endpoints integrated with Better Auth
  - Optimized organization lookup and added membership verification in billing endpoints for defense-in-depth
  - Expanded test coverage for endpoints, plugin behavior, and utilities
  - Updated example projects to use the plugin pattern and removed standalone `/api/flowglad` route requirement
  - Migration: Use `flowgladPlugin` in Better Auth and set `FlowgladProvider betterAuthBasePath="/api/auth"` in apps

- [037f19e2](https://github.com/flowglad/flowglad/commit/037f19e2): Update Better Auth documentation and type annotations
  - Clarified external ID resolution using `session.session.userId` and `session.session.activeOrganizationId`
  - Added notes about customer auto-creation hooks behavior
  - Updated examples and troubleshooting documentation
  - Documented optional `baseURL` parameter

### Usage Meter Hooks

- [3fd2a3ae](https://github.com/flowglad/flowglad/commit/3fd2a3ae): Add `useUsageMeters()` and `useUsageMeter()` hooks to `@flowglad/react`
  - Provides dedicated and efficient way to fetch usage meter balances without relying on the full billing payload
  - Wired `createUsageEvent` to invalidate caches for these new usage meter hooks, ensuring automatic refresh after usage events
  - Includes dev-mode support and comprehensive tests

- [71fd192a](https://github.com/flowglad/flowglad/commit/71fd192a): Implement server-side integration for `GetUsageMeterBalances` action
  - Added `getUsageMeterBalances` to `FlowgladServer` to call the platform endpoint
  - Created and registered new subroute handler for `GetUsageMeterBalances`
  - Wired the new action into the Better Auth plugin for authentication and authorization
  - Includes comprehensive tests for the new handler and updated auth mappings

- [9dcbf5eb](https://github.com/flowglad/flowglad/commit/9dcbf5eb): Add shared usage meter schema and action key
  - Introduced new authenticated action key (`usage-meters/balances`) and Zod schema in the shared SDK
  - Enables dedicated, narrow endpoint for fetching usage meter balances
  - Decouples usage meter reads from the larger `GetCustomerBilling` payload
  - Includes comprehensive tests for the new schema and action validator
