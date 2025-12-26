---
"@flowglad/nextjs": patch
"@flowglad/react": patch
"@flowglad/server": patch
"@flowglad/shared": patch
---

### SDK Helper Functions

- [17e39425](https://github.com/flowglad/javascript/commit/17e39425): Add `hasPurchased` helper function to SDK
  - New `hasPurchased` helper function available in `@flowglad/react` and `@flowglad/server`
  - Checks if a customer has purchased a product by slug
  - Exposed via `FlowgladContext` and `FlowgladServer` through `BillingWithChecks`
  - Added to SDK types and re-exported for TypeScript support
  - Playground UI updated to show purchase state for top-ups

### Usage Meter Support

- [f01bc21d](https://github.com/flowglad/javascript/commit/f01bc21d): Add usage meter support to `createUsageEvent`
  - `createUsageEvent` now accepts `usageMeterId` or `usageMeterSlug` parameters
  - Validation ensures exactly one identifier is provided (either price or usage meter)
  - Prevents mixing price and meter identifiers in the same request
  - Added comprehensive test coverage for valid inputs and invalid combinations

### Request Handler Standardization

- [e3c8066c](https://github.com/flowglad/javascript/commit/e3c8066c): Standardize request handling across Next.js and Express
  - Introduced unified `requestHandler<TRequest>` API that extracts `customerExternalId` via `getCustomerExternalId`
  - Updated Next.js handlers: `nextRouteHandler` and `pagesRouteHandler` now use `requestHandler` pattern
  - Removed deprecated `createAppRouterRouteHandler` and `createPagesRouterRouteHandler` functions
  - Added `expressRouter` in `@flowglad/server/express` with optional middleware support
  - Replaced `createRequestHandler` exports with `requestHandler` in server/next packages
  - Removed deprecated `@flowglad/express` package (CHANGELOG and README removed)

## Breaking Changes

⚠️ **Request Handler API Changes**

The request handler API has been standardized across all frameworks. If you're using Express or Next.js route handlers, you'll need to update your code:

**Express Migration:**

**Before:**
```typescript
import { createFlowgladExpressRouter } from "@flowglad/express";
```

**After:**
```typescript
import { expressRouter } from "@flowglad/server/express";
// Provide getCustomerExternalId(req) and flowglad(id)
```

**Next.js Migration:**

**Before:**
```typescript
import { createAppRouterRouteHandler } from "@flowglad/nextjs";
// or
import { createPagesRouterRouteHandler } from "@flowglad/nextjs";
```

**After:**
```typescript
import { nextRouteHandler } from "@flowglad/nextjs";
// or
import { pagesRouteHandler } from "@flowglad/nextjs";
// Use with getCustomerExternalId and flowglad factory
```

**General Migration:**

If you were using `createRequestHandler` directly, update to `requestHandler`:
- Update imports from `createRequestHandler` to `requestHandler`
- Request handlers now require `getCustomerExternalId` and a `flowglad` factory
- Handlers receive both route payload and the original request object

## Updated Dependencies

- `@flowglad/express` package has been removed from the repository
- All functionality moved to `@flowglad/server/express` subpath export
