---
"@flowglad/nextjs": patch
"@flowglad/server": patch
"@flowglad/shared": patch
"@flowglad/react": patch
---

### Resource Management Support

- [5067fd7d](https://github.com/flowglad/flowglad/commit/5067fd7d): Add resource claim types and validation schemas (#1416)
  - Added `GetResources`, `ClaimResource`, `ReleaseResource`, and `ListResourceClaims` to `FlowgladActionKey` enum
  - Defined `ResourceUsage` and `ResourceClaim` TypeScript interfaces in `@flowglad/shared`
  - Implemented Zod schemas for resource claim operations with mutual exclusivity rules
  - Integrated schemas into `flowgladActionValidators` map
  - Exported all new types and schemas from shared package

- [cfaf9e5d](https://github.com/flowglad/flowglad/commit/cfaf9e5d): Add Resource feature type to setup schema (#1372)
  - Added Resource variant to feature discriminated union with `resourceSlug` references
  - Added `resources` array in setup schema with uniqueness validation
  - Resource reference validation for features that use Resource type
  - Full test coverage for Resource feature type support

### Better Auth Integration Enhancements

- [90725b60](https://github.com/flowglad/flowglad/commit/90725b60): Better Auth plugin endpoints (Patch 1 - GP-51) (#1342)
  - Exposed all 11 Flowglad billing endpoints through Better Auth plugin with automatic session authentication
  - Added automatic customer ID resolution for Better Auth sessions
  - Added `betterAuthBasePath` prop to React SDK for routing API calls through Better Auth endpoints
  - Configured public API exports for Better Auth functionality

- [67b36aa9](https://github.com/flowglad/flowglad/commit/67b36aa9): Use Better Auth routes for Flowglad API calls in playground (#1390)
  - Updated `FlowgladProviderWrapper` to use `betterAuthBasePath="/api/auth"`
  - All Flowglad API routes now go through Better Auth endpoints at `/api/auth/flowglad/*`

### Supabase Edge Functions Support

- [1fed5c4a](https://github.com/flowglad/flowglad/commit/1fed5c4a): Add Supabase edge handler implementation (#1353)
  - New `supabaseEdgeHandler` for seamless integration with Supabase Edge Functions
  - Supports explicit `basePath` configuration or auto-detects `/functions/v1/<function-name>/` pattern
  - Extracts query parameters for GET requests and JSON bodies for other methods
  - Returns consistent JSON responses with `data` and `error` fields
  - Exported via `@flowglad/server/supabase` subexport

### Subscription Management Improvements

- [43c30e53](https://github.com/flowglad/flowglad/commit/43c30e53): Refactor adjustSubscription API to use flexible parameter forms (#1284)
  - Replaced single signature with three mutually exclusive parameter forms validated at type level
  - Forms: `{ priceSlug, quantity?, ... }`, `{ priceId, quantity?, ... }`, `{ subscriptionItems, ... }`
  - Maintains backward compatibility with server and client-side auto-resolution of `subscriptionId`
  - Comprehensive test coverage for all three forms and validation rules

- [720c8b73](https://github.com/flowglad/flowglad/commit/720c8b73): Add adjustSubscription SDK method with terse positional API (#1178)
  - Terse API: `adjustSubscription('pro-monthly')` or `adjustSubscription('pro-monthly', { quantity: 5 })`
  - Accepts price ID or slug interchangeably via `priceIdOrSlug`
  - Auto-resolves subscriptionId when customer has exactly one subscription
  - Server-side price resolution: tries slug first, falls back to ID
  - Timing options: 'immediately', 'at_end_of_period', or 'auto'

### Bug Fixes

- [cf60b48f](https://github.com/flowglad/flowglad/commit/cf60b48f): Default error status to 500 when undefined (#1253)
  - Fixed bug where errors with message but no status property caused Express to crash
  - Request handler now defaults to HTTP 500 instead of passing `undefined` to Express
  - Ensures clients receive clean JSON error responses instead of HTML error pages

- [d87ceb80](https://github.com/flowglad/flowglad/commit/d87ceb80): Validate subscription ownership in createUsageEvent (#1224)
  - Added subscription ownership validation to prevent unauthorized usage event creation
  - Validates that `subscriptionId` belongs to the requesting customer before creating usage event
  - Returns 403 Forbidden error if subscription is not found among customer's current subscriptions
  - Aligns with existing validation in `bulkCreateUsageEvents`

### Updated Dependencies

- [b0159e7f](https://github.com/flowglad/flowglad/commit/b0159e7f): Upgrade `@flowglad/node` from 0.24.0 to 0.26.0 (#1415)
  - Updated React context to include new subscription fields (`isUpgrade`, `resolvedTiming`) for API compatibility
  - All packages (nextjs, react, server, shared) aligned with 0.26.0

## Breaking Changes

⚠️ **None** - All changes are additive or bug fixes. Existing functionality remains unchanged.
