# @flowglad/shared

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
