# Gameplan: result-throw-to-return

## Problem Statement

Business logic functions currently throw errors extracted from `Result.err` values instead of returning `Result.err`. This breaks the Result-based error handling pattern, making errors unpredictable for callers and mixing exception-based and Result-based flows. There are 12 throw sites across 8 functions that need migration.

## Solution Summary

Migrate business logic functions to return `Result<T, Error>` instead of throwing. Callers (Trigger tasks, TRPC routers) will handle the Result at their boundary - either throwing for Trigger retry behavior or using `unwrapOrThrow` for TRPC error propagation. This maintains consistent Result-based error handling throughout business logic while preserving the appropriate error behavior at system boundaries.

## Mergability Strategy

No feature flags needed - this is a refactor that doesn't change observable behavior. Errors will still propagate to the same boundaries with the same behavior, just through Result returns instead of throws.

### Patch Ordering Strategy

- **Patch 1 [INFRA]**: Add return types and convert leaf functions (table methods)
- **Patch 2 [INFRA]**: Convert mid-level business logic functions
- **Patch 3 [BEHAVIOR]**: Update Trigger task callers to handle Results
- **Patch 4 [BEHAVIOR]**: Update router callers to handle Results

## Current State Analysis

These functions throw `result.error` instead of returning `Result.err`:

| Function | File | Line | Context |
|----------|------|------|---------|
| `derivePricingModelIdFromUsageMeter` | usageMeterMethods.ts | 64 | Inside transaction |
| `bulkUpsertPaymentMethodsByExternalId` | paymentMethodMethods.ts | 320 | Inside transaction |
| `upsertPaymentForStripeCharge` | processPaymentIntentStatusUpdated.ts | 293 | Called from payment processing |
| `createSubscriptionFromSetupIntentableCheckoutSession` | processSetupIntent.ts | 753 | Called from setup intent processing |
| `customerBillingCreateAddPaymentMethodSession` | customerBilling.ts | 328 | Called from router |
| `editProductTransaction` | pricingModel.ts | 368 | Called from router |
| `executeBillingRun` | billingRunHelpers.ts | 793, 955, 1017, 1048, 1088 | Called from Trigger tasks, router |
| `processOutcomeForBillingRun` | processBillingRunPaymentIntents.ts | 474 | Called from Trigger tasks, billingRunHelpers |

## Required Changes

### Patch 1: Table Method Functions

**File: `src/db/tableMethods/usageMeterMethods.ts`**

Change `derivePricingModelIdFromUsageMeter` to return Result:

```ts
export const derivePricingModelIdFromUsageMeter = async (
  usageMeterId: string,
  transaction: DbTransaction
): Promise<Result<string, Error>>
```

Current (line ~64):
```ts
if (Result.isError(result)) {
  throw result.error
}
return result.value.pricingModelId
```

After:
```ts
if (Result.isError(result)) {
  return Result.err(result.error)
}
return Result.ok(result.value.pricingModelId)
```

**File: `src/db/tableMethods/paymentMethodMethods.ts`**

Change `bulkUpsertPaymentMethodsByExternalId` (line ~320):

```ts
if (Result.isError(result)) {
  throw new Error(result.error.message)
}
```

After:
```ts
if (Result.isError(result)) {
  return Result.err(new Error(result.error.message))
}
```

Update callers in:
- `src/db/tableMethods/ledgerAccountMethods.ts`
- `src/db/tableMethods/ledgerEntryMethods.ts`
- `src/db/tableMethods/subscriptionMeterPeriodCalculationMethods.ts`
- `src/db/tableMethods/priceMethods.ts`
- `src/db/tableMethods/usageEventMethods.ts`
- `src/db/tableMethods/usageCreditMethods.ts`
- `src/utils/pricingModel.ts`
- `seedDatabase.ts`

### Patch 2: Mid-Level Business Logic Functions

**File: `src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts`**

Change `upsertPaymentForStripeCharge` signature:
```ts
export const upsertPaymentForStripeCharge = async (
  stripeCharge: Stripe.Charge,
  organizationId: string,
  transaction: DbTransaction
): Promise<Result<Payment.Record, Error>>
```

**File: `src/utils/bookkeeping/processSetupIntent.ts`**

Change `createSubscriptionFromSetupIntentableCheckoutSession` to return Result internally (this is a helper called within the same file).

**File: `src/utils/bookkeeping/customerBilling.ts`**

Change `customerBillingCreateAddPaymentMethodSession`:
```ts
export const customerBillingCreateAddPaymentMethodSession = async (
  customer: Customer.Record
): Promise<Result<CheckoutSession.Record, TRPCError>>
```

**File: `src/utils/pricingModel.ts`**

Change `editProductTransaction`:
```ts
export const editProductTransaction = async (
  input: EditProductInput,
  organizationId: string,
  livemode: boolean,
  transaction: DbTransaction
): Promise<Result<EditProductResult, Error>>
```

### Patch 3: Billing Run Functions

**File: `src/subscriptions/billingRunHelpers.ts`**

Change `executeBillingRun`:
```ts
export const executeBillingRun = async (
  billingRunId: string,
  adjustmentParams?: {
    newSubscriptionItems: (SubscriptionItem.Insert | SubscriptionItem.Record)[]
    adjustmentDate: Date | number
  }
): Promise<Result<ExecuteBillingRunResult, Error>>
```

Convert all 5 throw sites (lines 793, 955, 1017, 1048, 1088) to `return Result.err(...)`.

**File: `src/subscriptions/processBillingRunPaymentIntents.ts`**

Change `processOutcomeForBillingRun`:
```ts
export const processOutcomeForBillingRun = async (
  billingRunId: string,
  paymentIntentOutcome: PaymentIntentOutcome
): Promise<Result<ProcessOutcomeResult, Error>>
```

### Patch 4: Update Trigger Task Callers

**Files to update:**
- `src/trigger/attempt-billing-run.ts`
- `src/trigger/attempt-billing-period-transition.ts`
- `src/trigger/stripe/payment-intent-succeeded.ts`
- `src/trigger/stripe/payment-intent-canceled.ts`
- `src/trigger/stripe/payment-intent-payment-failed.ts`
- `src/trigger/stripe/payment-intent-requires-action.ts`

Pattern:
```ts
// Before
await executeBillingRun(billingRunId)

// After
const result = await executeBillingRun(billingRunId)
if (Result.isError(result)) {
  throw result.error  // Trigger will retry
}
```

### Patch 5: Update Router Callers

**Files to update:**
- `src/server/routers/subscriptionsRouter.ts` (calls `executeBillingRun`)
- `src/server/routers/customerBillingPortalRouter.ts` (calls `customerBillingCreateAddPaymentMethodSession`)
- `src/server/routers/productsRouter.ts` (calls `editProductTransaction`)

Pattern:
```ts
// Before
const result = await someFunction(...)

// After
const result = unwrapOrThrow(await someFunction(...))
```

## Acceptance Criteria

- [ ] All 12 throw sites converted to `return Result.err(...)`
- [ ] All 8 functions have explicit `Promise<Result<T, Error>>` return types
- [ ] All callers updated to handle Result appropriately
- [ ] `bun run check` passes
- [ ] `bun run test:backend` passes
- [ ] No behavioral changes - errors still propagate to same boundaries

## Open Questions

None - the pattern is established in the codebase.

## Explicit Opinions

1. **Trigger tasks throw to enable retry** - At the Trigger task boundary, we throw errors so Trigger.dev can handle retries. This is the correct behavior for background jobs.

2. **Routers use `unwrapOrThrow`** - At TRPC boundaries, we use `unwrapOrThrow` to convert Result errors to thrown errors, preserving TRPCError types.

3. **No test changes needed** - This refactor doesn't change observable behavior, only the mechanism of error propagation. Existing tests should pass without modification.

## Patches

### Patch 1 [INFRA]: Convert table method functions

**Files:**
- `src/db/tableMethods/usageMeterMethods.ts` - Change `derivePricingModelIdFromUsageMeter` return type and convert throw to Result.err
- `src/db/tableMethods/paymentMethodMethods.ts` - Change `bulkUpsertPaymentMethodsByExternalId` return type and convert throw to Result.err

**Callers to update (yield* Result.await pattern):**
- `src/db/tableMethods/ledgerAccountMethods.ts`
- `src/db/tableMethods/ledgerEntryMethods.ts`
- `src/db/tableMethods/subscriptionMeterPeriodCalculationMethods.ts`
- `src/db/tableMethods/priceMethods.ts`
- `src/db/tableMethods/usageEventMethods.ts`
- `src/db/tableMethods/usageCreditMethods.ts`
- `src/utils/pricingModel.ts`
- `seedDatabase.ts`

### Patch 2 [INFRA]: Convert mid-level business logic functions

**Files:**
- `src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts` - Convert `upsertPaymentForStripeCharge`
- `src/utils/bookkeeping/processSetupIntent.ts` - Convert `createSubscriptionFromSetupIntentableCheckoutSession`
- `src/utils/bookkeeping/customerBilling.ts` - Convert `customerBillingCreateAddPaymentMethodSession`
- `src/utils/pricingModel.ts` - Convert `editProductTransaction`

### Patch 3 [INFRA]: Convert billing run functions

**Files:**
- `src/subscriptions/billingRunHelpers.ts` - Convert `executeBillingRun` (5 throw sites)
- `src/subscriptions/processBillingRunPaymentIntents.ts` - Convert `processOutcomeForBillingRun`

### Patch 4 [BEHAVIOR]: Update Trigger task callers

**Files:**
- `src/trigger/attempt-billing-run.ts`
- `src/trigger/attempt-billing-period-transition.ts`
- `src/trigger/stripe/payment-intent-succeeded.ts`
- `src/trigger/stripe/payment-intent-canceled.ts`
- `src/trigger/stripe/payment-intent-payment-failed.ts`
- `src/trigger/stripe/payment-intent-requires-action.ts`

### Patch 5 [BEHAVIOR]: Update router callers

**Files:**
- `src/server/routers/subscriptionsRouter.ts`
- `src/server/routers/customerBillingPortalRouter.ts`
- `src/server/routers/productsRouter.ts`

## Dependency Graph

```
- Patch 1 [INFRA] -> []
- Patch 2 [INFRA] -> [1]
- Patch 3 [INFRA] -> [2]
- Patch 4 [BEHAVIOR] -> [3]
- Patch 5 [BEHAVIOR] -> [2]
```

**Mergability Insight**: 3 of 5 patches are `[INFRA]` and can ship without changing observable behavior. The `[BEHAVIOR]` patches (4, 5) only change how errors propagate at system boundaries.

## Mergability Checklist

- [x] Feature flag strategy documented (not needed - pure refactor)
- [x] Early patches contain only non-functional changes (`[INFRA]`)
- [x] `[BEHAVIOR]` patches are as small as possible
- [x] Dependency graph shows `[INFRA]` patches early, `[BEHAVIOR]` patches late
- [x] Each `[BEHAVIOR]` patch is clearly justified (boundary handling)
