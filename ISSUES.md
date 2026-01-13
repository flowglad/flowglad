# Issues Tracker

This document tracks issues found during code review of the "Usage Prices Belong to Usage Meters" migration (PRs 1-7).

---

## PR 1: Schema Changes

### Issue 1.1: Missing Data Migration for `isDefault` Reset

**Severity:** HIGH
**Status:** RESOLVED
**File:** `platform/flowglad-next/drizzle-migrations/0266_dizzy_giant_man.sql`

#### Problem

The gameplan specifies that the following SQL must run **before** creating the new unique index `prices_usage_meter_is_default_unique_idx`:

```sql
UPDATE "prices" SET "is_default" = false WHERE "type" = 'usage';
```

This statement is **not present** in migration `0266_dizzy_giant_man.sql`.

#### Current Migration Order

```sql
-- Line 1-2: Drop old indexes
DROP INDEX IF EXISTS "prices_external_id_product_id_unique_idx";
DROP INDEX IF EXISTS "prices_product_id_is_default_unique_idx";

-- Line 3: Make productId nullable
ALTER TABLE "prices" ALTER COLUMN "product_id" DROP NOT NULL;

-- Line 4-5: Create new indexes (PROBLEM: isDefault not reset yet!)
CREATE UNIQUE INDEX IF NOT EXISTS "prices_external_id_usage_meter_id_unique_idx" ...
CREATE UNIQUE INDEX IF NOT EXISTS "prices_usage_meter_is_default_unique_idx"
  ON "prices" USING btree ("usage_meter_id")
  WHERE "prices"."is_default" AND "prices"."type" = 'usage';
```

#### Risk

If any existing usage meter has two or more prices with `isDefault = true`, the index creation at line 5 will fail with:

```
ERROR: could not create unique index "prices_usage_meter_is_default_unique_idx"
DETAIL: Key (usage_meter_id)=(meter_xxx) is duplicated.
```

#### Required Fix

Add the following statement **after line 3** (after making productId nullable, before creating indexes):

```sql
-- Reset isDefault for usage prices to avoid unique constraint conflicts
UPDATE "prices" SET "is_default" = false WHERE "type" = 'usage';
```

#### Reference

- Gameplan: `GAMEPLAN_DATA_MODEL_PRICES-2-1.md` lines 119-126, 388-392
- Review Guide: `REVIEW_GUIDE_DATA_MODEL_PRICES.md` Section 1 "Data Migration Ordering"

#### Verification Query

Before deploying, verify no conflicts exist:

```sql
-- Should return 0 rows if safe to proceed without the UPDATE
SELECT usage_meter_id, COUNT(*) as default_count
FROM prices
WHERE type = 'usage' AND is_default = true
GROUP BY usage_meter_id
HAVING COUNT(*) > 1;
```

---

## PR 2: Database Query Updates

### Issue 2.1: Type Annotation Mismatch in UsagePricesGridSection

**Severity:** LOW
**Status:** RESOLVED
**File:** `platform/flowglad-next/src/components/UsagePricesGridSection/UsagePricesGridSection.tsx`
**Lines:** 81-88

#### Problem

The type annotation for `usePaginatedTableState` does not match the actual schema. The `product` field should be nullable since usage prices have `productId: null`.

#### Current Code

```typescript
usePaginatedTableState<
  {
    price: Price.ClientRecord
    product: {
      id: string
      name: string
    }
  },
  PricesGetTableRowsFilters
>
```

#### Expected Code

```typescript
usePaginatedTableState<
  {
    price: Price.ClientRecord
    product: {
      id: string
      name: string
    } | null
  },
  PricesGetTableRowsFilters
>
```

#### Impact

**None at runtime.** The component only accesses `row.price` (line 179) and never accesses `row.product`. TypeScript inference from the API response handles this correctly. However, this creates a type mismatch with `pricesTableRowDataSchema` which correctly defines `product` as nullable at `src/db/schema/prices.ts:756-764`.

#### Recommendation

Update the type annotation to `| null` for consistency with the schema definition.

---

## PR 3: Type Guards in Business Logic

### Issue 3.1: Implicit Type Narrowing in processPaymentIntentStatusUpdated.ts

**Severity:** MEDIUM
**Status:** RESOLVED (explicit type guard added)
**File:** `platform/flowglad-next/src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts`
**Lines:** 397-403

#### Problem

The `ledgerCommandForPaymentSucceeded` function accesses `price.productId` without using the explicit `Price.hasProductId()` type guard. Instead, it relies on an implicit type check:

```typescript
// Lines 397-399: Implicit type narrowing
if (price.type !== PriceType.SinglePayment) {
  return undefined
}
// Lines 400-403: Accesses productId without explicit type guard
const { features } = await selectProductPriceAndFeaturesByProductId(
  price.productId,  // Accessed without type guard
  transaction
)
```

While this is **functionally correct** (SinglePayment prices always have `productId`), it doesn't use the canonical `Price.hasProductId()` type guard that's used throughout the rest of the codebase.

#### Risk

- Inconsistency with the established pattern used elsewhere
- TypeScript doesn't narrow the type, so `price.productId` is still typed as `string | null`
- Future maintainers might not understand why this pattern differs from other code

#### Recommended Fix

Refactor to use the explicit type guard for consistency:

```typescript
if (!Price.hasProductId(price) || price.type !== PriceType.SinglePayment) {
  return undefined
}
// Now TypeScript knows price.productId is string
const { features } = await selectProductPriceAndFeaturesByProductId(
  price.productId,
  transaction
)
```

#### Reference

- Review Guide: `REVIEW_GUIDE_DATA_MODEL_PRICES.md` Section 3 "Credit Grant Logic"
- Type guard implementation: `src/db/schema/prices.ts:592-596`

---

### Issue 3.2: Inconsistent Type Guard Usage (Low Priority)

**Severity:** LOW
**Status:** RESOLVED (all gameplan locations use type guards; only checkoutSessionContract.ts:54 uses truthy check which is functionally correct)
**Files:** Multiple

#### Problem

Several files use truthy checks or direct comparisons on `productId` instead of the canonical type guard. While functionally correct, this creates inconsistency:

| File | Line | Current Pattern | Recommended |
|------|------|-----------------|-------------|
| `checkoutSessionContract.ts` | 54 | `price.productId &&` | `Price.clientHasProductId(price) &&` |
| `migratePricingModel.ts` | 99 | `if (price?.productId)` | `if (price && Price.hasProductId(price))` |
| `migratePricingModel.ts` | 155 | `if (price.productId)` | `if (Price.hasProductId(price))` |
| `Internal.tsx` | 235 | `item.price.productId === defaultProductId` | Add type guard check |

#### Risk

- Inconsistent codebase patterns
- Truthy checks don't provide TypeScript type narrowing
- Makes code harder to reason about during reviews

#### Recommendation

Consider a follow-up refactoring PR to standardize all `productId` access to use the type guard. This is low priority since all patterns work correctly.

---

## PR 4: API Contract Updates

### Issue 4.1: Zod Coercion Renders API Validation Unreachable for Usage Prices

**Severity:** INFO (Documentation/Awareness)
**Status:** RESOLVED (documentation added in priceValidation.ts)
**Files:**
- `platform/flowglad-next/src/utils/priceValidation.ts:45-55`
- `platform/flowglad-next/src/db/schema/prices.ts:269-276`

#### Problem

The v1 Zod coercion strategy for usage prices transforms `productId` to `null` **before** API validation runs. This means the error message in `validatePriceTypeProductIdConsistency` for "usage prices cannot have a productId" will likely never be displayed during normal API operation.

#### Validation Flow

```
Client Request (productId: "prod_123", type: "usage")
        │
        ▼
┌─────────────────────────────────────────────────────┐
│ Zod Schema (prices.ts:269-276)                      │
│ productId: z.unknown().transform(() => null)        │
│ → productId becomes null                            │
└─────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────┐
│ API Validation (priceValidation.ts:45-55)           │
│ if (productId !== null && productId !== undefined)  │
│ → Condition is FALSE (productId is already null)    │
│ → Error message NEVER shown                         │
└─────────────────────────────────────────────────────┘
```

#### Zod Schema (v1 Coercion)

```typescript
// prices.ts lines 269-276
productId: z
  .unknown()
  .transform(() => null as null)
  .pipe(z.null()),
```

#### API Validation (Unreachable for Usage Prices)

```typescript
// priceValidation.ts lines 45-55
if (
  price.type === PriceType.Usage &&
  productId !== null &&
  productId !== undefined
) {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Usage prices cannot have a productId. They belong to usage meters.',
  })
}
```

#### Impact

- **v1 (Current):** The error message is effectively dead code for the normal API path. Clients that send `productId` for usage prices will have it silently coerced to `null` without an error.
- **v2 (Future):** When switching to strict Zod schema (`productId: z.null()`), Zod will reject non-null values with a schema error. The API validation will then become relevant for cases where raw input bypasses Zod parsing.

#### Assessment

This is **acceptable behavior** for the v1 migration period:
- Silent coercion is intentional for backward compatibility
- Existing clients accidentally sending `productId` for usage prices will continue to work
- The API validation serves as defense-in-depth for edge cases

#### Recommendation

1. **Documentation:** Add a comment in `priceValidation.ts` explaining that this validation is primarily for v2 strict mode or edge cases where raw input bypasses Zod parsing.

2. **v2 Transition:** When deploying v2 strict Zod schema, the API validation will become the primary source of clear error messages (since Zod's schema errors are less user-friendly).

#### Reference

- Gameplan: `GAMEPLAN_DATA_MODEL_PRICES-2-1.md` lines 157-175 (Zod Coercion Strategy v1 → v2)
- Review Guide: `REVIEW_GUIDE_DATA_MODEL_PRICES.md` Section 4 "Zod vs API Validation Layering"

---

## PR 5: setupPricingModel Structure Update

### Issue 5.1: Test Inconsistencies - Contradictory Expectations

**Severity:** HIGH
**Status:** RESOLVED (contradictory tests removed)
**File:** `platform/flowglad-next/src/utils/pricingModels/setupSchemas.test.ts`
**Lines:** 48-64, 234-249, 687-746

#### Problem

There are **mutually contradictory tests** regarding whether usage meters must have at least one price:

**Tests expecting validation failure (lines 48-64 and 234-249):**
```typescript
it('should throw if a usage meter has no associated usage price', () => {
  input.usageMeters = [
    { usageMeter: { slug: 'test-meter', name: 'Test Meter' } }
  ]
  expect(() => validateSetupPricingModelInput(input)).toThrow(
    /Usage meter with slug .+ must have at least one usage price associated with it/
  )
})
```

**Test expecting success with no prices (lines 687-746):**
```typescript
it('should accept all three feature types (Toggle, UsageCreditGrant, Resource) together', () => {
  input.usageMeters = [
    { usageMeter: { slug: 'test-meter', name: 'Test Meter' } }
    // NO PRICES - expects success!
  ]
  expect(() => validateSetupPricingModelInput(input)).not.toThrow()
})
```

**The validation code (`setupSchemas.ts` lines 360-383) does NOT throw the expected error.** The tests at lines 48-64 and 234-249 will fail.

#### Analysis

Per the gameplan (`GAMEPLAN_DATA_MODEL_PRICES-2-1.md` lines 198-201), `prices` is shown as optional:
```typescript
usageMeters?: Array<{
  usageMeter: { ... }
  prices?: Array<{ ... }>  // usage prices for this meter (OPTIONAL)
}>
```

#### Required Fix

**Option A (Recommended per gameplan):** Remove the failing tests at lines 48-64 and 234-249. Meters can exist without prices.

**Option B:** If meters must have prices, add validation to `validateSetupPricingModelInput` and fix the mixed features test.

---

### Issue 5.2: Missing Implicit Default Logic

**Severity:** MEDIUM
**Status:** RESOLVED (implicit default logic added in setupSchemas.ts)
**File:** `platform/flowglad-next/src/utils/pricingModels/setupSchemas.ts`
**Line:** 360

#### Problem

The gameplan (`GAMEPLAN_DATA_MODEL_PRICES-2-1.md` line 207) specifies:

> **Implicit default behavior**: If a usage meter has a single price and `isDefault` is not set, implicitly set it to `true`.

The code has a comment referencing this but **no implementation**:

```typescript
// Line 360: Comment says "implement implicit default logic"
// Validate usage meter prices and implement implicit default logic
parsed.usageMeters.forEach((meterWithPrices) => {
  const prices = meterWithPrices.prices || []

  // Only validates price slugs and max-one-default
  // Does NOT implement implicit default logic
})
```

#### Required Fix

Add implicit default logic after line 374:

```typescript
// Implicit default: single price becomes default automatically
if (prices.length === 1 && prices[0].isDefault !== true) {
  prices[0].isDefault = true
}
```

Also add a test to verify this behavior.

---

### Issue 5.3: No Test for Implicit Default Scenario

**Severity:** LOW
**Status:** RESOLVED (test added in setupSchemas.test.ts)
**File:** `platform/flowglad-next/src/utils/pricingModels/setupSchemas.test.ts`

#### Problem

There is no test verifying that a single price on a meter becomes the default automatically. The gameplan specifies this behavior but tests don't cover it.

#### Required Fix

Add test:

```typescript
it('should implicitly set isDefault=true for single price on meter', () => {
  const input = createMinimalValidInput()
  input.usageMeters = [{
    usageMeter: { slug: 'test-meter', name: 'Test Meter' },
    prices: [{
      type: PriceType.Usage,
      slug: 'usage-price',
      // isDefault NOT set
      unitPrice: 100,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      trialPeriodDays: null,
      usageEventsPerUnit: 1,
      active: true,
    }]
  }]
  const result = validateSetupPricingModelInput(input)
  expect(result.usageMeters[0].prices?.[0].isDefault).toBe(true)
})
```

---

## PR 6: createUsageMeterTransaction Change

### Assessment: APPROVED - No Blocking Issues

**Reviewer:** Section 6 Reviewer
**Date:** 2026-01-13

#### Summary

PR 6 has been correctly implemented. The `createUsageMeterTransaction` function has been updated to:
1. Remove product creation (usage prices now have `productId: null`)
2. Return `{ usageMeter, price }` instead of `{ usageMeter, product, price }`
3. Maintain proper transaction boundaries for atomicity

All callers have been identified and updated. Test coverage is comprehensive.

#### Verified Checklist

| Criteria | Status | Notes |
|----------|--------|-------|
| Product creation removed | PASS | Line 71: `productId: null` |
| All callers updated | PASS | 2 callers: router and tests |
| Transaction boundaries correct | PASS | Single transaction for meter + price |
| Feature flag breaking change documented | PASS | Documented in gameplan |
| Test coverage | PASS | Comprehensive tests in `usage.test.ts` |

#### Key Verifications

1. **Function Signature Change**:
   - **Old:** `Promise<{ usageMeter, product, price }>`
   - **New:** `Promise<{ usageMeter, price }>`
   - Product field removed; price retained for callers that need it

2. **Caller Analysis**:
   | Caller | File | Handling |
   |--------|------|----------|
   | `createUsageMeter` procedure | `usageMetersRouter.ts:48` | Extracts only `{ usageMeter }` |
   | Tests | `usage.test.ts` | Verify `productId: null` |

3. **setupPricingModel Relationship**:
   - Does NOT call `createUsageMeterTransaction`
   - Has own bulk implementation that correctly sets `productId: null` (`setupTransaction.ts:222`)

4. **Feature Flag: SubscriptionWithUsage**:
   - Breaking change documented in gameplan
   - Only 2 orgs affected: HD Research, Plastic Labs
   - Existing subscriptions continue to work

5. **Orphaned Products**:
   - Per gameplan design, orphaned hidden products remain in database
   - No cleanup script implemented (acceptable - they don't cause issues)

---

### Observation 6.1: Unused `userId` Parameter

**Severity:** INFO (Code Quality)
**Status:** CLOSED (non-issue - standard interface pattern, we use subset of fields)
**File:** `platform/flowglad-next/src/utils/usage.ts`
**Lines:** 31-32

#### Description

The `userId` is included in the `AuthenticatedTransactionParams` type but is not destructured or used in the function:

```typescript
}: AuthenticatedTransactionParams  // userId available but not used
```

#### Impact

**None.** This is purely cosmetic. The parameter is passed by callers but ignored by the function.

#### Recommendation

Either:
- Remove `userId` from callers if it's never needed, OR
- Document why it's intentionally passed but unused (e.g., for audit trail consistency)

---

## PR 7: UI Cleanup

### Assessment: APPROVED - No Blocking Issues

**Reviewer:** Section 7
**Status:** Complete

#### Summary

The UI cleanup for PR 7 has been implemented correctly. All review guide checklist items pass:

| Checklist Item | Status |
|----------------|--------|
| Form schema simplified | PASS - Uses `createPriceFormSchema`, not `createProductFormSchema` |
| Mutation uses prices router directly | PASS - `trpc.prices.create.useMutation()` |
| productId: null handled in edit modal | PASS - Line 348 explicitly sets `productId: null` |
| Cache invalidation correct | PASS - Invalidates `prices.getTableRows` |

#### Key Verifications

1. **CreateUsagePriceModal** (`src/components/forms/CreateUsagePriceModal.tsx`):
   - Uses `trpc.prices.create.useMutation()` (line 120)
   - Passes `productId: null` explicitly (line 175)
   - Invalidates `prices.getTableRows` after mutation (line 181)

2. **EditUsagePriceModal** (`src/components/forms/EditUsagePriceModal.tsx`):
   - Uses `trpc.prices.update.useMutation()` for mutable field changes
   - Uses `trpc.prices.replaceUsagePrice.useMutation()` for immutable field changes
   - Passes `productId: null` when creating replacement prices (line 348)

3. **replaceUsagePrice endpoint** (`src/server/routers/pricesRouter.ts:262-327`):
   - Validates old price is a usage price
   - Validates new price belongs to same usage meter
   - Atomically creates new price and archives old

4. **Test Coverage** (`EditUsagePriceModal.test.tsx`, `CreateUsagePriceModal.test.tsx`):
   - Verifies `productId: null` is accepted for usage prices
   - Verifies `productId` coercion from undefined to null works
   - Verifies required fields (`usageMeterId`, `usageEventsPerUnit`)

#### Related Issues

- **Issue 2.1** (already tracked): The type annotation in `UsagePricesGridSection.tsx` lines 81-88 should mark `product` as nullable. This is a cosmetic issue that doesn't affect runtime behavior.

---

## Section 8: Holistic Review of PRs 1-7

### Assessment: APPROVED - No Blocking Issues

**Reviewer:** Section 8 (Holistic Review)
**Status:** Complete

#### Cross-Cutting Verification Summary

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Type guards used consistently where `productId` accessed | PASS | `Price.hasProductId()` and variants used in 5+ files |
| Zod v1 coercion in place, v2 documented | PASS | `z.unknown().transform(() => null)` at `prices.ts:269-276` |
| RLS handles both productId and null cases | PASS | `selectPricesTableRowData` uses type guard to conditionally query products |
| `setupPricingModel` creates correct structure | PASS | `setupTransaction.ts:222` sets `productId: null` |
| UI flows create/edit without hidden product | PASS | Both modals use `trpc.prices.*` directly with `productId: null` |
| Tests validate the full flow | PARTIAL | Unit/integration tests present; E2E integration test recommended |

---

### Issue 8.1: createUsageMeterTransaction Signature Deviation from Gameplan

**Severity:** INFO (Design Improvement)
**Status:** CLOSED (beneficial deviation - implementation exceeds gameplan requirements)
**File:** `platform/flowglad-next/src/utils/usage.ts`

#### Observation

The gameplan (`GAMEPLAN_DATA_MODEL_PRICES-2-1.md` line 254) specifies:

```typescript
// Return type changes from { usageMeter, product, price } to { usageMeter }
export const createUsageMeterTransaction = async (
  payload: { usageMeter: UsageMeter.ClientInsert },
  params: AuthenticatedTransactionParams
): Promise<{ usageMeter: UsageMeter.Record }>
```

**Actual implementation returns:** `Promise<{ usageMeter: UsageMeter.Record; price: Price.Record }>`

#### Assessment

This is a **beneficial deviation**. The actual implementation is superior because:
1. It returns the created price, which callers may need
2. It maintains atomicity by creating both in a single transaction
3. The price return value is simply ignored by callers that don't need it (e.g., `usageMetersRouter.ts:48`)

**No action required** - the implementation exceeds gameplan requirements.

---

### Issue 8.2: INNER JOIN Rationale Could Be Clearer

**Severity:** LOW
**Status:** RESOLVED (clarifying comment added in priceMethods.ts)
**File:** `platform/flowglad-next/src/db/tableMethods/priceMethods.ts`

#### Problem

The `selectPricesTableRowData` function uses the `Price.hasProductId()` type guard to conditionally include product data:

```typescript
// Line 290-295 (approximate)
const product = Price.hasProductId(price)
  ? await selectProductById(price.productId, transaction)
  : null
```

While functionally correct, the **business rationale** for excluding usage prices from product-centric queries could be documented more clearly in the code.

#### Recommendation

Add a brief comment explaining why usage prices (with `productId: null`) are intentionally excluded from product queries:

```typescript
// Usage prices belong to usage meters, not products.
// Only fetch product data for subscription/single_payment prices.
const product = Price.hasProductId(price)
  ? await selectProductById(price.productId, transaction)
  : null
```

---

### Issue 8.3: No Cleanup Strategy for Orphaned Hidden Products

**Severity:** LOW
**Status:** WONT_FIX (acceptable per gameplan - orphaned products don't cause issues)
**Files:** Multiple (systemic)

#### Problem

The gameplan acknowledges that the old workaround created hidden products for usage prices (`isArchived: true`, `displayFeatureOrder: null`). After the migration, these products remain in the database with no active references.

#### Current State

- **Gameplan states:** "Orphaned hidden products remain in database (acceptable - they don't cause issues)"
- **No cleanup script** is included in any PR
- These orphaned records may accumulate over time

#### Assessment

This is **acceptable for launch** per the gameplan. However, for long-term database hygiene, a cleanup script could be provided as a follow-up.

#### Recommendation (Optional Follow-up)

```sql
-- Identify orphaned hidden products from old usage workaround
SELECT id, name, slug, created_at
FROM products
WHERE is_archived = true
  AND display_feature_order IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM prices WHERE prices.product_id = products.id
  );
```

---

### Issue 8.4: Missing Full UI-to-DB Integration Test

**Severity:** LOW
**Status:** WONT_FIX (existing test coverage sufficient for launch)
**Files:** Test coverage gap

#### Problem

While individual PRs have good unit and integration test coverage, there is no single end-to-end test that validates the complete flow:

1. User creates a usage meter via UI
2. Usage price is created with `productId: null`
3. Price appears correctly in the prices table
4. Price can be edited/replaced via EditUsagePriceModal
5. Replacement price maintains `productId: null`

#### Current Coverage

| Layer | Coverage | Test File |
|-------|----------|-----------|
| Schema validation | Good | `prices.test.ts`, `setupSchemas.test.ts` |
| Database methods | Good | `priceMethods.test.ts` |
| API endpoints | Good | Router-level integration tests |
| UI components | Partial | `CreateUsagePriceModal.test.tsx`, `EditUsagePriceModal.test.tsx` |
| Full E2E flow | Missing | - |

#### Recommendation

Add a behavior test or integration test that validates the complete flow across all layers. This would catch any subtle integration issues between the UI, API, and database layers.

---

## Summary

| PR | Issue | Severity | Status |
|----|-------|----------|--------|
| 1  | Missing `isDefault` reset in migration | HIGH | RESOLVED |
| 2  | Type annotation mismatch in UsagePricesGridSection | LOW | RESOLVED |
| 3  | Implicit type narrowing in processPaymentIntentStatusUpdated.ts | MEDIUM | RESOLVED |
| 3  | Inconsistent type guard usage across codebase | LOW | RESOLVED (only checkoutSessionContract.ts:54 uses truthy check instead of type guard) |
| 4  | Zod coercion renders API validation unreachable for usage prices | INFO | RESOLVED (documentation added) |
| 5  | Test inconsistencies - contradictory expectations | HIGH | RESOLVED |
| 5  | Missing implicit default logic | MEDIUM | RESOLVED |
| 5  | No test for implicit default scenario | LOW | RESOLVED |
| 6  | Unused `userId` parameter | INFO | CLOSED (non-issue - standard interface pattern) |
| 6  | No blocking issues found | N/A | Approved |
| 7  | No blocking issues found | N/A | Approved |
| 8  | createUsageMeterTransaction signature deviation (beneficial) | INFO | CLOSED (beneficial deviation) |
| 8  | INNER JOIN rationale could be clearer | LOW | RESOLVED |
| 8  | No cleanup strategy for orphaned hidden products | LOW | WONT_FIX |
| 8  | Missing full UI-to-DB integration test | LOW | WONT_FIX |
