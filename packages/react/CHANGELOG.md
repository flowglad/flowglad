# @flowglad/react

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
