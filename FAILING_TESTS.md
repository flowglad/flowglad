# Failing Tests Report

**Total Failing Tests: 20**
**Total Passing Tests: 4270**
**Test Files with Failures: 9 out of 220**

Generated: 2026-01-13

---

## Category: Naive (3 tests)
*Simple fixes - update assertions, typos, or minor schema adjustments*

### 1. `src/db/tableMethods/priceMethods.test.ts`
**Test:** `Slug uniqueness policies > allows inserting active price with slug different from existing active prices slugs`
**Error:** `expected 'price_tMruxSP2t9yu077tlSdoM' to match /^prc_/`
**Fix:** Update test assertion to expect `price_` prefix instead of `prc_`. The ID prefix changed but tests weren't updated.
**Line:** 684

---

### 2. `src/server/routers/pricesRouter.test.ts`
**Test:** `createPrice - price type and productId validation > creates usage price with null productId successfully`
**Error:** `expected 'price_iv9THYJEVMx22S8AmmrzN' to match /^prc_/`
**Fix:** Update test assertion to expect `price_` prefix instead of `prc_`. Same issue as above.
**Line:** 1209

---

### 3. `src/components/forms/CreateUsagePriceModal.test.tsx`
**Test:** `Usage price requires usageMeterId > rejects usage price with empty string usageMeterId`
**Error:** `expected true to be false` (schema validation passes when it should fail)
**Fix:** Update `pricesClientInsertSchema` to reject empty string for `usageMeterId`. Add `.min(1)` or transform to fail on empty strings.
**Line:** 137

---

## Category: Can Do (9 tests)
*Require understanding of code patterns but are straightforward to fix*

### 4. `src/utils/bookkeeping/createCheckoutSession.test.ts`
**Test:** `throws error when creating checkout session for usage price (which has null product)`
**Error:** Got `"Cannot read properties of undefined (reading 'price')"` instead of `"Checkout sessions are only supported for product prices..."`
**Root Cause:** The code path throws a different error before reaching the expected validation. The test data setup may be incomplete or the validation order changed.
**Fix:** Add defensive null check before the "usage price" validation, or fix test setup to create proper test data.
**Line:** 496

---

### 5. `src/utils/usage/bulkInsertUsageEventsTransaction.test.ts` (5 tests)
**Tests:**
- `normalization > should default properties and usageDate when not provided`
- `idempotency > should not insert duplicate events with same transactionId`
- `idempotency > should only generate ledger commands for newly inserted events`
- `happy path > should successfully insert multiple usage events`
- `happy path > should successfully bulk insert usage events for multiple customers and subscriptions`

**Error:** `Price price_xxx not found for this customer's pricing model at index 0`
**Root Cause:** The test setup creates a price via `setupPrice()` but the price is not being associated with the customer's subscription's pricing model correctly. The validation in `bulkInsertUsageEventsTransaction.ts:413` checks `pricingModelPriceIds.has(priceId)` and fails.
**Fix:** Update test setup to ensure:
1. The usage meter is linked to the correct pricing model
2. The price is created with `pricingModelId` set correctly
3. The customer's subscription references the same pricing model

**Lines:** 100, 200, 240, 280, 320 (approximate)

---

### 6. `src/server/routers/usageEventsRouter.test.ts` (2 tests)
**Tests:**
- `create procedure with price slug support > should create usage event with priceId`
- `bulkInsert procedure > should successfully bulk insert usage events`

**Error:** `Price price_xxx not found for this customer's pricing model at index 0`
**Root Cause:** Same issue as #5 - test setup doesn't properly link price to the customer's pricing model.
**Fix:** Align the test setup with `setupUsageEventsTestContext()` helper which correctly wires up the pricing model chain.
**Lines:** Various in usageEventsRouter.test.ts

---

## Category: Need Human Direction (8 tests)
*Complex issues requiring architectural decisions or deeper understanding*

### 7. `src/resources/resourceClaimHelpers.test.ts` (6 tests)
**Tests:**
- `claimResourceTransaction > when externalIds are provided, creates multiple named claims, and existing claims are returned idempotently`
- `releaseResourceTransaction > when quantity is provided, releases only anonymous claims (FIFO) and ignores named claims`
- `releaseResourceTransaction > when externalId is provided, releases the specific named claim`
- `releaseResourceTransaction > when claimIds are provided, releases those specific claims regardless of type`
- `validateResourceCapacityForDowngrade > when active claims are less than or equal to new capacity, passes validation without error`
- `getResourceUsage > when no claims exist, returns full capacity as available`

**Errors:**
- `No Resource feature found for resource resource_xxx in subscription sub_xxx`
- `SubscriptionItemFeature sub_feature_xxx not found`
- `SubscriptionItemFeature sub_feature_xxx not found or is not a Resource type`

**Root Cause:** The test setup creates resources and subscriptions, but the linkage between:
- `Resource` -> `SubscriptionItemFeature` -> `Subscription`
is not being established correctly. The `findSubscriptionItemFeatureForResource()` function cannot find the feature.

**Needs Human Input:**
- Is there a missing setup step for resource-based features?
- Has the data model for resource features changed recently?
- Should `setupSubscription()` automatically create corresponding `SubscriptionItemFeature` records for resource products?

**Lines:** 339, 374, 456, 849

---

### 8. `src/utils/pricingModel.test.ts`
**Test:** `createProductTransaction > should create a product with a usage price when there are no featureIds`
**Error:** `new row violates row-level security policy for table "prices"` (PostgresError 42501)
**Root Cause:** The RLS (Row Level Security) policy on the `prices` table is blocking the insert operation in the test context. This could be:
1. The test database user doesn't have the required permissions
2. The RLS policy requires specific context that isn't set in tests
3. A recent schema change added/modified the RLS policy

**Needs Human Input:**
- Should tests run with RLS disabled or use a superuser?
- What is the expected RLS context for price creation?
- Was there a recent migration that added this RLS policy?

**Line:** 312

---

### 9. `src/test/behaviorTest/behaviorTests/checkout.integration.behavior.test.ts` (2 tests)
**Tests:**
- `CountryDep=us, ContractTypeDep=merchantOfRecord, CustomerResidencyDep=us-nyc`
- `CountryDep=us, ContractTypeDep=platform, CustomerResidencyDep=us-nyc`

**Error:** `TypeError: Cannot read properties of undefined (reading 'id')` at `prev.checkoutSessionWithDiscount.id`
**Root Cause:** The behavior test chain has a step that produces `checkoutSessionWithDiscount` but it's undefined when the next step tries to access it. This suggests either:
1. A previous step in the behavior chain failed silently
2. The step order changed and a dependency is missing
3. The `createCheckoutSessionWithDiscount` behavior doesn't return the expected shape

**Needs Human Input:**
- What step should produce `checkoutSessionWithDiscount`?
- Has the checkout session creation API changed recently?
- Should behavior tests have better error handling for undefined context?

**Line:** 429 in `checkoutBehaviors.ts`

---

## Summary Table

| Category | Count | Description |
|----------|-------|-------------|
| Naive | 3 | Simple assertion fixes, schema updates |
| Can Do | 9 | Test setup fixes, data model wiring |
| Need Human Direction | 8 | Architecture/RLS/behavior chain issues |

## Recommended Fix Order

1. **Naive fixes first** - Quick wins, can be fixed immediately
2. **bulkInsertUsageEventsTransaction tests** - Common root cause, fixing test setup will resolve multiple tests
3. **usageEventsRouter tests** - Same root cause as above
4. **createCheckoutSession test** - Standalone fix
5. **Resource claim tests** - Need to understand resource feature setup
6. **RLS policy test** - Need DB permissions context
7. **Behavior tests** - Depend on upstream fixes

## Files to Investigate

- `seedDatabase.ts:929` - `setupPrice()` function and pricing model linkage
- `bulkInsertUsageEventsTransaction.ts:413` - Price validation logic
- `resourceClaimHelpers.ts:339` - Feature finding logic
- `src/db/schema/prices.ts` - RLS policy definitions
- `checkoutBehaviors.ts:429` - Behavior chain step that should produce checkout session
