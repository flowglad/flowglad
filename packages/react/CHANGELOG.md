# @flowglad/react

## 0.17.0

### Minor Changes

- 6248889: ### React SDK Hook Architecture

  - [2b46e4e3](https://github.com/flowglad/flowglad/commit/2b46e4e3): Refactor the React SDK to a hook-first architecture for billing and pricing
    - `useBilling` now loads on mount and `FlowgladProvider` no longer accepts `loadBilling`
    - Added `usePricingModel` and `usePricing` for public pricing model retrieval
    - Expanded hook test coverage across billing and pricing utilities

  ### Hybrid Pricing Model Retrieval

  - [acae46d7](https://github.com/flowglad/flowglad/commit/acae46d7): Add `GetPricingModel` action with authenticated pricing + default fallback
    - Hybrid routing for optional-auth pricing model fetches
    - Shared types and validators for `{ pricingModel, source }` responses
    - Next.js and server handlers updated to support the new pricing model endpoint

  ### Default Usage Prices & Pricing Utilities

  - [6e667596](https://github.com/flowglad/flowglad/commit/6e667596): Support default usage prices and unify pricing lookups
    - Shared pricing utilities now resolve usage prices from products consistently
    - Updated usage price behaviors to ensure a default is always active

  ### Resource Claims Scope Update

  - [a3e4ed7d](https://github.com/flowglad/flowglad/commit/a3e4ed7d): Remove `subscriptionItemFeatureId` from resource claims
    - Resource claims now scope to `(subscriptionId, resourceId)` and support `expiredAt`
    - Server resource-claim queries and tests updated for the new schema

  ### Documentation Updates

  - [cbf4efdb](https://github.com/flowglad/flowglad/commit/cbf4efdb): Refresh SDK docs to use `usePricing` and remove `loadBilling`

### Patch Changes

- Updated dependencies [6248889]
  - @flowglad/shared@0.17.0

## 0.16.4

### Patch Changes

- e4cc2c6: ### Upgrade to @flowglad/node 0.29.0

  - [f3249ae8](https://github.com/flowglad/flowglad/commit/f3249ae8): Bump @flowglad/node from 0.28.0 to 0.29.0 across all packages
    - Adds proper typing for `UsageMeter.prices` field in the SDK
    - Removes the need for type cast workarounds when accessing usage meter prices

  ### Catalog → PricingModel Migration

  - [275550da](https://github.com/flowglad/flowglad/commit/275550da): Rename `catalog` to `pricingModel` in shared utilities

    - `constructGetProduct`, `constructGetPrice`, and `constructHasPurchased` now accept `pricingModel` parameter
    - Type safety improvements by removing `UsageMeterWithPrices` cast workaround

  - [17792466](https://github.com/flowglad/flowglad/commit/17792466): Replace `catalog` with `pricingModel` across packages

    - `@flowglad/react`: `useCatalog` hook renamed to `usePricingModel`
    - `@flowglad/server`: Updated `FlowgladServer` to use `pricingModel` internally
    - `@flowglad/shared`: Renamed `types/catalog.ts` to `types/pricingModel.ts`, `Catalog` type renamed to `PricingModel`
    - Documentation updated to reflect new naming

  - [ddaa0fca](https://github.com/flowglad/flowglad/commit/ddaa0fca): Add deprecated aliases for backward compatibility
    - `Catalog` type alias (deprecated, use `PricingModel`)
    - `useCatalog` hook (deprecated, use `usePricingModel`)
    - `catalog` property remains available in billing context (deprecated, use `pricingModel`)

  ## Migration Guide

  ### Hook Migration

  **Before:**

  ```typescript
  import { useCatalog } from "@flowglad/react";
  const catalog = useCatalog();
  ```

  **After:**

  ```typescript
  import { usePricingModel } from "@flowglad/react";
  const pricingModel = usePricingModel();
  ```

  ### Type Migration

  **Before:**

  ```typescript
  import type { Catalog } from "@flowglad/shared";
  ```

  **After:**

  ```typescript
  import type { PricingModel } from "@flowglad/shared";
  ```

  ## Breaking Changes

  ⚠️ **None** - All changes include backward-compatible deprecated aliases. The `catalog` property, `useCatalog` hook, and `Catalog` type continue to work but are marked as deprecated. Users are encouraged to migrate to the new `pricingModel` naming.

- Updated dependencies [e4cc2c6]
  - @flowglad/shared@0.16.4

## 0.16.3

### Patch Changes

- f6ae438: ### Resource Management Support

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

- Updated dependencies [f6ae438]
  - @flowglad/shared@0.16.3

## 0.16.2

### Patch Changes

- 6c71a71: ### Client-Side Usage Event Creation

  - [acb9c0e4](https://github.com/flowglad/javascript/commit/acb9c0e4): Add server handler and client hook for createUsageEvent (#1134)

    - New `createUsageEvent` handler in server that validates POST method and auto-resolves subscriptionId from current subscription
    - Defaults `amount` to 1 if not provided
    - Auto-generates `transactionId` using nanoid if not provided
    - Returns 400 if no subscription can be resolved
    - Added `createUsageEvent` to React's `useBilling()` hook
    - POSTs to `/api/flowglad/usage-events/create`
    - Returns `{ usageEvent: { id } }` on success or `{ error: { code, json } }` on failure
    - Supports dev mode with mock implementation
    - Exported `ClientCreateUsageEventParams` type from shared package
    - Added nanoid ^3.3.11 dependency to server for CJS compatibility

  - [23f4c6bd](https://github.com/flowglad/javascript/commit/23f4c6bd): Add clientCreateUsageEvent schema and action key (#1133)
    - Introduced `FlowgladActionKey.CreateUsageEvent` and `clientCreateUsageEventSchema`
    - Schema requires exactly one identifier (priceId | priceSlug | usageMeterId | usageMeterSlug)
    - Auto-resolves subscriptionId, amount (default 1), and transactionId on the server
    - Enables client-side usage event creation with sensible defaults

  ### Bulk Usage Events Support

  - [7e0091e0](https://github.com/flowglad/javascript/commit/7e0091e0): Add bulk usage events to SDK (#1093)
    - New `bulkCreateUsageEvents(params)` method in server SDK
    - Validates all subscriptionIds belong to the authenticated customer's current subscriptions
    - Normalizes properties and usageDate to undefined when absent
    - Calls POST `/api/v1/usage-events/bulk` endpoint
    - New `bulkCreateUsageEvents(params)` method in admin SDK
    - Added `bulkCreateUsageEventsSchema` and `BulkCreateUsageEventsParams` to shared package
    - Allows multiple usage events to be created in one request to reduce API calls
    - Includes ownership checks on the customer-scoped path for safety

  ## Updated Dependencies

  - `@flowglad/server`: Added nanoid ^3.3.11 for transaction ID generation

  ## Breaking Changes

  ⚠️ **None** - All changes are additive. Existing functionality remains unchanged.

- Updated dependencies [6c71a71]
  - @flowglad/shared@0.16.2

## 0.16.1

### Patch Changes

- 23d20a5: ### SDK Helper Functions

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

- Updated dependencies [23d20a5]
  - @flowglad/shared@0.16.1

## 0.16.0

### Minor Changes

- d6898f4: ### Better Auth Plugin Support

  - [27e64bb6](https://github.com/flowglad/flowglad/commit/27e64bb6): Add Better Auth plugin integration for FlowgladServer and Next.js
    - New `flowgladBetterAuthPlugin` available in `@flowglad/server/better-auth` and `@flowglad/nextjs/better-auth`
    - Supports both user and organization-based customer types
    - Customizable customer extraction via `getCustomer` function
    - Automatic session management and customer creation
    - Works seamlessly with Better Auth's plugin system

  ### React Native Compatibility

  - [a0c7f482](https://github.com/flowglad/flowglad/commit/a0c7f482): Improve React Native compatibility in `@flowglad/react`
    - Updated `FlowgladContext` and `FlowgladProvider` for React Native environments
    - Removed browser-specific exports that don't work in React Native
    - Improved cross-platform compatibility

  ### Express Integration Migration

  - [2c212876](https://github.com/flowglad/flowglad/commit/2c212876): Move Express logic from `@flowglad/express` to `@flowglad/server/express`
    - Express functionality now available via `@flowglad/server/express` subpath export
    - New exports: `createExpressRouteHandler` and `createFlowgladExpressRouter`
    - `@flowglad/express` package deprecated (see below)
    - Migration: `import { createFlowgladExpressRouter } from '@flowglad/server/express'`

  ### Create Subscription doNotCharge Support

  - [2fb21a4d](https://github.com/flowglad/flowglad/commit/2fb21a4d): Add `doNotCharge` parameter support for creating subscriptions
    - Allows creating subscriptions without immediately charging the customer
    - Useful for trial periods, free plans, or deferred billing scenarios
    - Added comprehensive test coverage

  ### Express Package Deprecation

  - [731a91eb](https://github.com/flowglad/flowglad/commit/731a91eb): Mark `@flowglad/express` package as deprecated
    - Package continues to work but is no longer actively maintained
    - Users should migrate to `@flowglad/server/express`
    - Deprecation notice added to README and CHANGELOG

  ### Type Resolution Improvements

  - [704ea9e5](https://github.com/flowglad/flowglad/commit/704ea9e5): Add `typesVersions` for Node module resolution compatibility

    - Enables proper TypeScript resolution for subpath exports (express, better-auth)
    - Ensures Node.js module resolution works correctly with TypeScript

  - [e27365b8](https://github.com/flowglad/flowglad/commit/e27365b8): Add express to tsconfig.declarations.json for type generation
    - Ensures TypeScript declaration files are properly generated for Express exports

  ### Documentation Updates

  - [16448962](https://github.com/flowglad/flowglad/commit/16448962): Update Express integration docs for deprecation
    - Updated documentation to reflect Express migration
    - Added migration guide references
    - Updated examples to use new `@flowglad/server/express` import path

  ## Updated Dependencies

  - `@flowglad/server`: Added `better-auth` and `express` as optional peer dependencies
  - All packages remain at version 0.15.1 in their CHANGELOGs

  ## Breaking Changes

  ⚠️ **None** - All changes are additive or deprecation notices. The deprecated `@flowglad/express` package continues to work, but users are encouraged to migrate to `@flowglad/server/express`.

  ## Migration Guide

  ### Express Users

  **Before:**

  ```typescript
  import { createFlowgladExpressRouter } from "@flowglad/express";
  ```

  **After:**

  ```typescript
  import { createFlowgladExpressRouter } from "@flowglad/server/express";
  ```

  ### Better Auth Users

  **New Feature:**

  ```typescript
  import { flowgladBetterAuthPlugin } from "@flowglad/server/better-auth";
  // or for Next.js
  import { flowgladBetterAuthPlugin } from "@flowglad/nextjs/better-auth";
  ```

### Patch Changes

- Updated dependencies [d6898f4]
  - @flowglad/shared@0.16.0

## 0.15.1

### Patch Changes

- bb9b89e: - create product checkout interface cleanup
  - add currentSubscription to useBilling
- Updated dependencies [bb9b89e]
  - @flowglad/shared@0.15.1

## 0.15.0

### Minor Changes

- 562490d: - add subscription uncancel
  - bump @flowglad/node dependency to v0.24

### Patch Changes

- Updated dependencies [562490d]
  - @flowglad/shared@0.15.0

## 0.14.1

### Patch Changes

- 8a4fa8d: @flowglad/nextjs: bump peer dependency for next to support ^16.0.0
- Updated dependencies [8a4fa8d]
  - @flowglad/shared@0.14.1

## 0.14.0

### Minor Changes

- de55219: - bump @flowglad/node dependency to v0.23
  - price slug support for create usage events & create subscription
  - activate subscription checkout cleanup
  - add test coverage to @flowglad/shared
  - migrate types from @flowglad/types to @flowglad/shared
  - deprecate @flowglad/types

### Patch Changes

- Updated dependencies [de55219]
  - @flowglad/shared@0.14.0

## 0.13.0

### Minor Changes

- Next.js route handler pattern, customerExternalId pattern with mandatory constructory

### Patch Changes

- Updated dependencies
  - @flowglad/shared@0.13.0

## 0.12.4

### Patch Changes

- flowglad server with external id
- cbf28e2: test
- Updated dependencies
- Updated dependencies [cbf28e2]
  - @flowglad/shared@0.12.4

## 0.12.3

### Patch Changes

- nextjs types
- Updated dependencies
  - @flowglad/shared@0.12.3

## 0.12.2

### Patch Changes

- types
- types
- Updated dependencies
- Updated dependencies
  - @flowglad/shared@0.12.1

## 0.12.1

### Patch Changes

- workspaces fix
- Updated dependencies
  - @flowglad/shared@0.12.1

## 0.12.0

### Minor Changes

- Support priceSlug in createCheckoutSession

### Patch Changes

- Updated dependencies
  - @flowglad/shared@0.12.0

## 0.11.0

### Minor Changes

- bump @flowglad/node dependency to v0.22, cleanup FlowgladServer methods

### Patch Changes

- Updated dependencies
  - @flowglad/shared@0.11.0

## 0.10.18

### Patch Changes

- add devmode support to FlowgladContext
- Updated dependencies
  - @flowglad/shared@0.10.18

## 0.10.17

### Patch Changes

- Remove flowglad-root root theming
- Updated dependencies
  - @flowglad/shared@0.10.17

## 0.10.16

### Patch Changes

- Add getProduct and getPrice to SDK, support activate_subscription checkout sessions
- Updated dependencies
  - @flowglad/shared@0.10.16

## 0.10.15

### Patch Changes

- Add check feature access, and check usage balance
- Updated dependencies
  - @flowglad/shared@0.10.15

## 0.10.14

### Patch Changes

- Fix cancel subscription modal, greatly improve light mode / dark mode styles
- Updated dependencies
  - @flowglad/shared@0.10.14

## 0.10.13

### Patch Changes

- Fix flowglad-root styles
- Updated dependencies
  - @flowglad/shared@0.10.13

## 0.10.12

### Patch Changes

- Fix flowglad-root styling on billing-page
- Updated dependencies
  - @flowglad/shared@0.10.12

## 0.10.11

### Patch Changes

- Fix FlowgladThemeProvider styles
- Updated dependencies
  - @flowglad/shared@0.10.11

## 0.10.10

### Patch Changes

- Export type explicitly for request handler input
- Updated dependencies
  - @flowglad/shared@0.10.10

## 0.10.9

### Patch Changes

- Window undefined check for useThemeDetector
- Updated dependencies
  - @flowglad/shared@0.10.9

## 0.10.8

### Patch Changes

- Add theme overrides to FlowgladTheme and FlowgladProvider
- Updated dependencies
  - @flowglad/shared@0.10.8

## 0.10.7

### Patch Changes

- Loosen targetSubscriptionId on add payment checkout sessions, add Add Payment Method button to embedded billing page
- Updated dependencies
  - @flowglad/shared@0.10.7

## 0.10.6

### Patch Changes

- Current Subscription Card Usage variant
- Updated dependencies
  - @flowglad/shared@0.10.6

## 0.10.5

### Patch Changes

- Rm list subscriptions
- Updated dependencies
  - @flowglad/shared@0.10.5

## 0.10.4

### Patch Changes

- Remove darkmode logging
- Updated dependencies
  - @flowglad/shared@0.10.4

## 0.10.3

### Patch Changes

- Expose a reload billing component
- Updated dependencies
  - @flowglad/shared@0.10.3

## 0.10.2

### Patch Changes

- Fix file path for FlowgladTheme import
- Updated dependencies
  - @flowglad/shared@0.10.2

## 0.10.1

### Patch Changes

- Move FlowgladTheme to billing-page only for now
- Updated dependencies
  - @flowglad/shared@0.10.1

## 0.10.0

### Minor Changes

- Add subscription method, many other improvements

### Patch Changes

- Updated dependencies
  - @flowglad/shared@0.10.0

## 0.9.1

### Patch Changes

- Fix checkout session create
- Updated dependencies
  - @flowglad/shared@0.9.1

## 0.9.0

### Minor Changes

- Add usage events

### Patch Changes

- Updated dependencies
  - @flowglad/shared@0.9.0

## 0.8.13

### Patch Changes

- Add subscription.current, checkoutSession.quantity
- Updated dependencies
  - @flowglad/shared@0.8.13

## 0.8.12

### Patch Changes

- Better docs and type flowthroughs
- Default prices on products
- Updated dependencies
- Updated dependencies
  - @flowglad/shared@0.8.12

## 0.8.11

### Patch Changes

- Improvements to embedded billing component, improved subscription type in types package
- Updated dependencies
  - @flowglad/shared@0.8.11

## 0.8.10

### Patch Changes

- Flow through output metadata
- Updated dependencies
  - @flowglad/shared@0.8.10

## 0.8.9

### Patch Changes

- Relative route check
- Updated dependencies
  - @flowglad/shared@0.8.9

## 0.8.8

### Patch Changes

- Export SubscriptionDetails type
- Updated dependencies
  - @flowglad/shared@0.8.8

## 0.8.7

### Patch Changes

- Add flowgladAdminClient
- Updated dependencies
  - @flowglad/shared@0.8.7

## 0.8.6

### Patch Changes

- Cleaner types and export for FlowgladContext
- Updated dependencies
  - @flowglad/shared@0.8.6

## 0.8.5

### Patch Changes

- Support async flowglad server client construction for express
- Updated dependencies
  - @flowglad/shared@0.8.5

## 0.8.4

### Patch Changes

- Fix customer not found error
- Updated dependencies
  - @flowglad/shared@0.8.4

## 0.8.3

### Patch Changes

- Fix customer not found issue
- Updated dependencies
  - @flowglad/shared@0.8.3

## 0.8.2

### Patch Changes

- Flowglad express initial release
- Updated dependencies
  - @flowglad/shared@0.8.2

## 0.8.1

### Patch Changes

- Version bump
- Updated dependencies
  - @flowglad/shared@0.8.1

## 0.8.0

### Minor Changes

- Bump to @flowglad/node 0.10.0 with customer instead of customer profile

### Patch Changes

- Updated dependencies
  - @flowglad/shared@0.8.0

## 0.7.0

### Minor Changes

- Migrate variants -> prices, migrate purchase sessions -> checkout sessions

### Patch Changes

- Updated dependencies
  - @flowglad/shared@0.7.0

## 0.6.0

### Minor Changes

- Use the new SDK generator for better esm support

### Patch Changes

- Updated dependencies
  - @flowglad/shared@0.6.0

## 0.5.0

### Minor Changes

- Camelcasing all fkeys, refactor invoiceWithLineItems

### Patch Changes

- Updated dependencies
  - @flowglad/shared@0.5.0

## 0.4.22

### Patch Changes

- Improve custom onboarding, deprecate authenticated
- Updated dependencies
  - @flowglad/shared@0.4.22

## 0.4.21

### Patch Changes

- types: more exported discriminated union types
- Updated dependencies
  - @flowglad/shared@0.4.21

## 0.4.20

### Patch Changes

- Product export fix
- Updated dependencies
  - @flowglad/shared@0.4.20

## 0.4.19

### Patch Changes

- types: Currency -> CurrencyCode
- Updated dependencies
  - @flowglad/shared@0.4.19

## 0.4.18

### Patch Changes

- Export types
- Updated dependencies
  - @flowglad/shared@0.4.18

## 0.4.17

### Patch Changes

- Types package
- Updated dependencies
  - @flowglad/shared@0.4.17

## 0.4.16

### Patch Changes

- Try request handler options
- Updated dependencies
  - @flowglad/shared@0.4.16

## 0.4.15

### Patch Changes

- Await params in nextjs route handler
- Updated dependencies
  - @flowglad/shared@0.4.15

## 0.4.14

### Patch Changes

- Fix nested esm issue
- Updated dependencies
  - @flowglad/shared@0.4.14

## 0.4.13

### Patch Changes

- Fix nextjs server types export
- Updated dependencies
  - @flowglad/shared@0.4.13

## 0.4.12

### Patch Changes

- fix the types problem
- Updated dependencies
  - @flowglad/shared@0.4.12

## 0.4.11

### Patch Changes

- fix purchase session error check
- Updated dependencies
  - @flowglad/shared@0.4.11

## 0.4.10

### Patch Changes

- Await client in supabase auth
- Updated dependencies
  - @flowglad/shared@0.4.10

## 0.4.9

### Patch Changes

- Pass through structured error messages to client
- Updated dependencies
  - @flowglad/shared@0.4.9

## 0.4.8

### Patch Changes

- Add getRequestingCustomer as fallback for getSessionFromParams
- Updated dependencies
  - @flowglad/shared@0.4.8

## 0.4.7

### Patch Changes

- rm console.log
- Updated dependencies
  - @flowglad/shared@0.4.7

## 0.4.6

### Patch Changes

- No more find or create customer profile calls on the FlowgladContext, billing now includes a find or create
- Updated dependencies
  - @flowglad/shared@0.4.6

## 0.4.5

### Patch Changes

- Fix circular package reference, and export flowglad/server modules from flowglad/next
- Updated dependencies
  - @flowglad/shared@0.4.5

## 0.4.4

### Patch Changes

- Helpful error messages in FlowgladProvider, core route handler constructor for @flowglad/server"
- Updated dependencies
  - @flowglad/shared@0.4.4

## 0.4.3

### Patch Changes

- rm console logs
- Updated dependencies
  - @flowglad/shared@0.4.3

## 0.4.2

### Patch Changes

- Fix purchase session redirect
- Updated dependencies
  - @flowglad/shared@0.4.2

## 0.4.1

### Patch Changes

- Add url to purchase session
- Updated dependencies
  - @flowglad/shared@0.4.1

## 0.4.0

### Minor Changes

- use 0.1.0-alpha.5

### Patch Changes

- Updated dependencies
  - @flowglad/shared@0.4.0

## 0.3.0

### Minor Changes

- Use retrieve billing

### Patch Changes

- Updated dependencies
  - @flowglad/shared@0.3.0

## 0.2.4

### Patch Changes

- Add baseURL, use billing.retrieve
- Updated dependencies
  - @flowglad/shared@0.2.4

## 0.2.3

### Patch Changes

- remove axios dependency
- Fix missing clerk authentication
- Updated dependencies
- Updated dependencies
  - @flowglad/shared@0.2.3

## 0.2.0

### Minor Changes

- Rename next to nextjs

### Patch Changes

- Updated dependencies
  - @flowglad/shared@0.2.0

## 0.1.0

### Minor Changes

- First release

### Patch Changes

- Updated dependencies
  - @flowglad/shared@0.1.0
