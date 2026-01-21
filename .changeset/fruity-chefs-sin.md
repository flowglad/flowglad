---
"@flowglad/nextjs": minor
"@flowglad/server": minor
"@flowglad/shared": minor
"@flowglad/react": minor
---

### React SDK Hook Architecture

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
