---
"@flowglad/nextjs": patch
"@flowglad/server": patch
"@flowglad/shared": patch
"@flowglad/react": patch
---

### Client-Side Usage Event Creation

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
