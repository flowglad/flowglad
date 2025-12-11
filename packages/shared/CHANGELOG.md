# @flowglad/shared

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
