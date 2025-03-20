# @flowglad/nextjs

## 0.9.0

### Minor Changes

- useBilling always returns, add useCatalog, add requestConfig type

### Patch Changes

- Updated dependencies
  - @flowglad/react@0.9.0
  - @flowglad/server@0.9.0
  - @flowglad/shared@0.9.0

## 0.8.0

### Minor Changes

- Bump to @flowglad/node 0.10.0 with customer instead of customer profile

### Patch Changes

- Updated dependencies
  - @flowglad/server@0.8.0
  - @flowglad/react@0.8.0
  - @flowglad/shared@0.8.0

## 0.7.0

### Minor Changes

- Migrate variants -> prices, migrate purchase sessions -> checkout sessions

### Patch Changes

- Updated dependencies
  - @flowglad/server@0.7.0
  - @flowglad/shared@0.7.0
  - @flowglad/react@0.7.0

## 0.6.0

### Minor Changes

- Use the new SDK generator for better esm support

### Patch Changes

- Updated dependencies
  - @flowglad/server@0.6.0
  - @flowglad/react@0.6.0
  - @flowglad/shared@0.6.0

## 0.5.0

### Minor Changes

- Camelcasing all fkeys, refactor invoiceWithLineItems

### Patch Changes

- Updated dependencies
  - @flowglad/server@0.5.0
  - @flowglad/react@0.5.0
  - @flowglad/shared@0.5.0

## 0.4.22

### Patch Changes

- Improve custom onboarding, deprecate authenticated
- Updated dependencies
  - @flowglad/server@0.4.22
  - @flowglad/react@0.4.22
  - @flowglad/shared@0.4.22

## 0.4.21

### Patch Changes

- types: more exported discriminated union types
- Updated dependencies
  - @flowglad/server@0.4.21
  - @flowglad/shared@0.4.21
  - @flowglad/react@0.4.21

## 0.4.20

### Patch Changes

- Product export fix
- Updated dependencies
  - @flowglad/server@0.4.20
  - @flowglad/shared@0.4.20
  - @flowglad/react@0.4.20

## 0.4.19

### Patch Changes

- types: Currency -> CurrencyCode
- Updated dependencies
  - @flowglad/server@0.4.19
  - @flowglad/shared@0.4.19
  - @flowglad/react@0.4.19

## 0.4.18

### Patch Changes

- Export types
- Updated dependencies
  - @flowglad/server@0.4.18
  - @flowglad/shared@0.4.18
  - @flowglad/react@0.4.18

## 0.4.17

### Patch Changes

- Types package
- Updated dependencies
  - @flowglad/react@0.4.17
  - @flowglad/server@0.4.17
  - @flowglad/shared@0.4.17

## 0.4.16

### Patch Changes

- Try request handler options
- Updated dependencies
  - @flowglad/server@0.4.16
  - @flowglad/shared@0.4.16
  - @flowglad/react@0.4.16

## 0.4.15

### Patch Changes

- Await params in nextjs route handler
- Updated dependencies
  - @flowglad/react@0.4.15
  - @flowglad/server@0.4.15
  - @flowglad/shared@0.4.15

## 0.4.14

### Patch Changes

- Fix nested esm issue
- Updated dependencies
  - @flowglad/shared@0.4.14
  - @flowglad/react@0.4.14
  - @flowglad/server@0.4.14

## 0.4.13

### Patch Changes

- Fix nextjs server types export
- Updated dependencies
  - @flowglad/server@0.4.13
  - @flowglad/shared@0.4.13
  - @flowglad/react@0.4.13

## 0.4.12

### Patch Changes

- fix the types problem
- Updated dependencies
  - @flowglad/server@0.4.12
  - @flowglad/shared@0.4.12
  - @flowglad/react@0.4.12

## 0.4.11

### Patch Changes

- fix purchase session error check
- Updated dependencies
  - @flowglad/server@0.4.11
  - @flowglad/shared@0.4.11
  - @flowglad/react@0.4.11

## 0.4.10

### Patch Changes

- Await client in supabase auth
- Updated dependencies
  - @flowglad/server@0.4.10
  - @flowglad/react@0.4.10
  - @flowglad/shared@0.4.10

## 0.4.9

### Patch Changes

- Pass through structured error messages to client
- Updated dependencies
  - @flowglad/server@0.4.9
  - @flowglad/shared@0.4.9
  - @flowglad/react@0.4.9

## 0.4.8

### Patch Changes

- Add getRequestingCustomer as fallback for getSessionFromParams
- Updated dependencies
  - @flowglad/server@0.4.8
  - @flowglad/react@0.4.8
  - @flowglad/shared@0.4.8

## 0.4.7

### Patch Changes

- rm console.log
- Updated dependencies
  - @flowglad/react@0.4.7
  - @flowglad/server@0.4.7
  - @flowglad/shared@0.4.7

## 0.4.6

### Patch Changes

- No more find or create customer profile calls on the FlowgladContext, billing now includes a find or create
- Updated dependencies
  - @flowglad/server@0.4.6
  - @flowglad/shared@0.4.6
  - @flowglad/react@0.4.6

## 0.4.5

### Patch Changes

- Fix circular package reference, and export flowglad/server modules from flowglad/next
- Updated dependencies
  - @flowglad/server@0.4.5
  - @flowglad/shared@0.4.5
  - @flowglad/react@0.4.5

## 0.4.4

### Patch Changes

- Helpful error messages in FlowgladProvider, core route handler constructor for @flowglad/server"
- Updated dependencies
  - @flowglad/server@0.4.4
  - @flowglad/shared@0.4.4
  - @flowglad/react@0.4.4

## 0.4.3

### Patch Changes

- rm console logs
- Updated dependencies
  - @flowglad/react@0.4.3
  - @flowglad/server@0.4.3
  - @flowglad/shared@0.4.3

## 0.4.2

### Patch Changes

- Fix purchase session redirect
- Updated dependencies
  - @flowglad/react@0.4.2
  - @flowglad/server@0.4.2
  - @flowglad/shared@0.4.2

## 0.4.1

### Patch Changes

- Add url to purchase session
- Updated dependencies
  - @flowglad/server@0.4.1
  - @flowglad/react@0.4.1
  - @flowglad/shared@0.4.1

## 0.4.0

### Minor Changes

- use 0.1.0-alpha.5

### Patch Changes

- Updated dependencies
  - @flowglad/react@0.4.0
  - @flowglad/server@0.4.0
  - @flowglad/shared@0.4.0

## 0.3.0

### Minor Changes

- Use retrieve billing

### Patch Changes

- Updated dependencies
  - @flowglad/server@0.3.0
  - @flowglad/react@0.3.0
  - @flowglad/shared@0.3.0

## 0.2.4

### Patch Changes

- Add baseURL, use billing.retrieve
- Updated dependencies
  - @flowglad/server@0.2.4
  - @flowglad/react@0.2.4
  - @flowglad/shared@0.2.4

## 0.2.3

### Patch Changes

- remove axios dependency
- Fix missing clerk authentication
- Updated dependencies
- Updated dependencies
  - @flowglad/react@0.2.3
  - @flowglad/server@0.2.3
  - @flowglad/shared@0.2.3

## 0.2.0

### Minor Changes

- Rename next to nextjs

### Patch Changes

- Updated dependencies
  - @flowglad/react@0.2.0
  - @flowglad/server@0.2.0
  - @flowglad/shared@0.2.0

## 0.1.0

### Minor Changes

- First release

### Patch Changes

- Updated dependencies
  - @flowglad/react@0.1.0
  - @flowglad/server@0.1.0
  - @flowglad/shared@0.1.0
