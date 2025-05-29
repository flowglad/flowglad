# @flowglad/server

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
