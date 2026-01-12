# @flowglad/shared

## 0.17.0

### Minor Changes

- Better Auth Plugin Rework (GP-51): Supporting types and validators for Better Auth route integration

  ## Breaking Changes

  ⚠️ **None** - All changes are additive.

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

## 0.15.1

### Patch Changes

- bb9b89e: - create product checkout interface cleanup
  - add currentSubscription to useBilling

## 0.15.0

### Minor Changes

- 562490d: - add subscription uncancel
  - bump @flowglad/node dependency to v0.24

## 0.14.1

### Patch Changes

- 8a4fa8d: @flowglad/nextjs: bump peer dependency for next to support ^16.0.0

## 0.14.0

### Minor Changes

- de55219: - bump @flowglad/node dependency to v0.23
  - price slug support for create usage events & create subscription
  - activate subscription checkout cleanup
  - add test coverage to @flowglad/shared
  - migrate types from @flowglad/types to @flowglad/shared
  - deprecate @flowglad/types

## 0.13.0

### Minor Changes

- Next.js route handler pattern, customerExternalId pattern with mandatory constructory

### Patch Changes

- Updated dependencies
  - @flowglad/types@0.13.0

## 0.12.4

### Patch Changes

- flowglad server with external id
- cbf28e2: test
- Updated dependencies
- Updated dependencies [cbf28e2]
  - @flowglad/types@0.12.4

## 0.12.3

### Patch Changes

- nextjs types
- Updated dependencies
  - @flowglad/types@0.12.3

## 0.12.2

### Patch Changes

- types
- types
- Updated dependencies
- Updated dependencies
  - @flowglad/types@0.12.2

## 0.12.1

### Patch Changes

- workspaces fix

## 0.12.0

### Minor Changes

- Support priceSlug in createCheckoutSession

### Patch Changes

- Updated dependencies
  - @flowglad/types@0.12.0

## 0.11.0

### Minor Changes

- bump @flowglad/node dependency to v0.22, cleanup FlowgladServer methods

### Patch Changes

- Updated dependencies
  - @flowglad/types@0.11.0

## 0.10.18

### Patch Changes

- add devmode support to FlowgladContext

## 0.10.17

### Patch Changes

- Remove flowglad-root root theming

## 0.10.16

### Patch Changes

- Add getProduct and getPrice to SDK, support activate_subscription checkout sessions

## 0.10.15

### Patch Changes

- Add check feature access, and check usage balance

## 0.10.14

### Patch Changes

- Fix cancel subscription modal, greatly improve light mode / dark mode styles

## 0.10.13

### Patch Changes

- Fix flowglad-root styles

## 0.10.12

### Patch Changes

- Fix flowglad-root styling on billing-page

## 0.10.11

### Patch Changes

- Fix FlowgladThemeProvider styles

## 0.10.10

### Patch Changes

- Export type explicitly for request handler input

## 0.10.9

### Patch Changes

- Window undefined check for useThemeDetector

## 0.10.8

### Patch Changes

- Add theme overrides to FlowgladTheme and FlowgladProvider

## 0.10.7

### Patch Changes

- Loosen targetSubscriptionId on add payment checkout sessions, add Add Payment Method button to embedded billing page

## 0.10.6

### Patch Changes

- Current Subscription Card Usage variant

## 0.10.5

### Patch Changes

- Rm list subscriptions

## 0.10.4

### Patch Changes

- Remove darkmode logging

## 0.10.3

### Patch Changes

- Expose a reload billing component

## 0.10.2

### Patch Changes

- Fix file path for FlowgladTheme import

## 0.10.1

### Patch Changes

- Move FlowgladTheme to billing-page only for now

## 0.10.0

### Minor Changes

- Add subscription method, many other improvements

## 0.9.1

### Patch Changes

- Fix checkout session create

## 0.9.0

### Minor Changes

- Add usage events

## 0.8.13

### Patch Changes

- Add subscription.current, checkoutSession.quantity

## 0.8.12

### Patch Changes

- Better docs and type flowthroughs
- Default prices on products

## 0.8.11

### Patch Changes

- Improvements to embedded billing component, improved subscription type in types package

## 0.8.10

### Patch Changes

- Flow through output metadata

## 0.8.9

### Patch Changes

- Relative route check

## 0.8.8

### Patch Changes

- Export SubscriptionDetails type

## 0.8.7

### Patch Changes

- Add flowgladAdminClient

## 0.8.6

### Patch Changes

- Cleaner types and export for FlowgladContext

## 0.8.5

### Patch Changes

- Support async flowglad server client construction for express

## 0.8.4

### Patch Changes

- Fix customer not found error

## 0.8.3

### Patch Changes

- Fix customer not found issue

## 0.8.2

### Patch Changes

- Flowglad express initial release

## 0.8.1

### Patch Changes

- Version bump

## 0.8.0

### Minor Changes

- Bump to @flowglad/node 0.10.0 with customer instead of customer profile

## 0.7.0

### Minor Changes

- Migrate variants -> prices, migrate purchase sessions -> checkout sessions

## 0.6.0

### Minor Changes

- Use the new SDK generator for better esm support

## 0.5.0

### Minor Changes

- Camelcasing all fkeys, refactor invoiceWithLineItems

## 0.4.22

### Patch Changes

- Improve custom onboarding, deprecate authenticated

## 0.4.21

### Patch Changes

- types: more exported discriminated union types

## 0.4.20

### Patch Changes

- Product export fix

## 0.4.19

### Patch Changes

- types: Currency -> CurrencyCode

## 0.4.18

### Patch Changes

- Export types

## 0.4.17

### Patch Changes

- Types package

## 0.4.16

### Patch Changes

- Try request handler options

## 0.4.15

### Patch Changes

- Await params in nextjs route handler

## 0.4.14

### Patch Changes

- Fix nested esm issue

## 0.4.13

### Patch Changes

- Fix nextjs server types export

## 0.4.12

### Patch Changes

- fix the types problem

## 0.4.11

### Patch Changes

- fix purchase session error check

## 0.4.10

### Patch Changes

- Await client in supabase auth

## 0.4.9

### Patch Changes

- Pass through structured error messages to client

## 0.4.8

### Patch Changes

- Add getRequestingCustomer as fallback for getSessionFromParams

## 0.4.7

### Patch Changes

- rm console.log

## 0.4.6

### Patch Changes

- No more find or create customer calls on the FlowgladContext, billing now includes a find or create

## 0.4.5

### Patch Changes

- Fix circular package reference, and export flowglad/server modules from flowglad/next

## 0.4.4

### Patch Changes

- Helpful error messages in FlowgladProvider, core route handler constructor for @flowglad/server"

## 0.4.3

### Patch Changes

- rm console logs

## 0.4.2

### Patch Changes

- Fix purchase session redirect

## 0.4.1

### Patch Changes

- Add url to purchase session

## 0.4.0

### Minor Changes

- use 0.1.0-alpha.5

## 0.3.0

### Minor Changes

- Use retrieve billing

## 0.2.4

### Patch Changes

- Add baseURL, use billing.retrieve

## 0.2.3

### Patch Changes

- remove axios dependency
- Fix missing clerk authentication

## 0.2.0

### Minor Changes

- Rename next to nextjs

## 0.1.0

### Minor Changes

- First release
