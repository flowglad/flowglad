# Gameplan: Usage Prices Belong to Usage Meters (Not Products)

## Current State Analysis

### Data Model Today

**Schema location**: `src/db/schema/prices.ts`

| Field | Type | Constraints |
|-------|------|-------------|
| `productId` | string | NOT NULL FK to products |
| `pricingModelId` | string | NOT NULL FK to pricing_models |
| `usageMeterId` | string | nullable FK to usage_meters |
| `type` | enum | 'subscription' \| 'single_payment' \| 'usage' |
| `isDefault` | boolean | NOT NULL |

**Key constraint (lines ~139-141)**: `(productId, isDefault=true)` unique index - one default price per product.

**Unique index (lines ~135-138)**: `(externalId, productId)` - external ID uniqueness scoped to product.

**Indexes (lines ~132-143)**:
- `productId` - indexed for FK lookups
- `usageMeterId` - indexed for FK lookups
- `pricingModelId` - indexed for FK lookups
- `type` - indexed for filtering

### Relationships Today
```
PricingModel (1) ──┬── (N) Product (1) ── (N) Price (all types)
                   │
                   └── (N) UsageMeter
```

All prices require a `productId`. Usage prices additionally require `usageMeterId`, but the product relationship is redundant.

### UI Already Implemented (With Workaround)

The UI has been updated to present usage prices as belonging to usage meters:

- **`InnerUsageMeterDetailsPage`**: Shows a "Prices" section with `UsagePricesGridSection`
- **`CreateUsagePriceModal`**: Creates usage prices from the usage meter page
- **`EditUsagePriceModal`**: Edits usage prices with the immutable price pattern
- **`UsagePriceCard` / `UsagePricesGridSection`**: Grid display of prices per meter
- **`PriceFormFields`**: Usage price type excluded from product forms (comment at line 459)

**However**, the UI currently works around the data model limitation by creating a **hidden product** for each usage price:

```typescript
// From CreateUsagePriceModal.tsx (lines 31-48):
/**
 * Note: This extends createProductFormSchema because creating a usage price
 * requires creating a product behind the scenes (products and prices are
 * tightly coupled in the data model). The product is an implementation detail
 * hidden from the user, who only sees "usage price" in the UI.
 */
```

This workaround proves the gameplan's thesis: usage prices don't logically need products, but the current schema forces their creation.

### Problem

Usage prices don't logically belong to products:
1. Products bundle a price with features and appear in checkout
2. Usage prices cannot carry features and are not directly purchasable
3. Usage prices meter consumption defined by the usage meter, not per-product feature packages
4. The `productId` on usage prices is just ceremony
5. **The UI already treats usage prices as belonging to meters, but must create hidden products as a workaround**

### Proposed Model
```
PricingModel (1) ──┬── (N) Product (1) ── (N) Price (subscription/single_payment only)
                   │
                   └── (N) UsageMeter (1) ── (N) UsagePrice (productId = null)
```

Usage prices become children of UsageMeters with `productId: null`. Subscription and single_payment prices retain their required `productId` relationship.

---

## Key Design Decisions

### 1. LEFT JOIN Scope: Both Directions

Converting `innerJoin` to `leftJoin` applies to **any query joining prices and products**, regardless of which table is primary:

- Queries starting from `prices` joining to `products` (price → product)
- Queries starting from `products` joining to `prices` (product → price)

```ts
// Both of these would exclude usage prices with null productId:
.innerJoin(products, eq(prices.productId, products.id))
.innerJoin(prices, eq(products.id, prices.productId))
```

Some queries may intentionally want only product prices (e.g., checkout flows) - these can remain `innerJoin` or add explicit `WHERE type != 'usage'`.

### 2. Zod Schema: Use `safeZodNullOrUndefined` (not bare `z.null()`)

**Problem**: `z.null()` requires explicitly passing `null`. If the field is omitted, validation fails.

```ts
// z.null() behavior:
z.null().parse(null)      // ✅ passes
z.null().parse(undefined) // ❌ fails
```

**Solution**: Use `core.safeZodNullOrUndefined` which accepts `null` or omitted, always outputs `null`. This ensures database inserts always have `null` (not `undefined`).

### 3. Data Migration Strategy: Two-Phase Migration

**Decision**: Split the data migration into two phases to minimize risk.

#### Phase 1: `isDefault` Reset (PR 1 deployment)

**When**: During PR 1 deployment, immediately after schema migration.

**Why required**: The new unique index enforces one default price per usage meter. If two existing usage prices on the same meter both have `isDefault = true`, the index creation would fail.

```sql
UPDATE prices SET is_default = false WHERE type = 'usage';
```

**This is safe because**:
- It's not destructive (can be reversed by setting `is_default = true` on the correct price)
- PR 9 backfill will set the correct default later
- No application logic depends on usage prices having `isDefault = true` right now

#### Phase 2: `productId` Nullification (Deferred)

**When**: After all PRs (1-9) are deployed and verified working. Run this when ready to switch from v1 Zod coercion to v2 strict.

**Why we can defer**: The v1 Zod coercion (`z.any().transform(() => null)`) makes the application see `productId: null` even if the database still has a value. All queries, RLS policies, and indexes work regardless of the actual value because they use `type = 'usage'` conditions, not `productId IS NULL`.

**Before running**:
```bash
pg_dump --table=prices $DATABASE_URL > prices_backup_$(date +%Y%m%d_%H%M%S).sql
```

**Data migration**:
```sql
UPDATE prices SET product_id = NULL WHERE type = 'usage';
```

**Rollback strategy** (if something breaks):
```sql
-- Restore productId from the hidden products that were created as a workaround
UPDATE prices p
SET product_id = pr.id
FROM products pr
WHERE p.type = 'usage'
  AND p.usage_meter_id IS NOT NULL
  AND pr.usage_meter_id = p.usage_meter_id;
```

**After verification**: Deploy v2 strict Zod schema which requires `productId: null` for usage prices.

### 4. Zod Coercion Strategy (v1 → v2)

Handle migration gracefully with two phases:

**Phase 1 (v1)**: Coerce productId to null for usage prices in select schemas:
```ts
const usagePriceColumns = {
  productId: z.any().transform(() => null),  // Coerce to null regardless of input
}
```

This allows existing records with `productId` values to parse successfully while migration is in progress.

**Phase 2 (v2)**: After migration verified complete, switch to strict:
```ts
const usagePriceColumns = {
  productId: z.null(),  // Strict: must be null
}
```

### 5. No Database CHECK Constraint (For Now)

Team preference is **no database CHECK constraint** for mutual exclusivity initially. Rely on:
- Zod schema validation at the application layer
- Type guards in TypeScript
- API validation in routers

This keeps flexibility during the migration. **After all PRs land and the database is in a clean state**, we can revisit adding a CHECK constraint as an optional PR 8. See "Optional PR 8" at the end of this document.

### 6. setupPricingModel Structure Update

Add `prices` array to usage meter objects:

```ts
type SetupPricingModelInput = {
  pricingModel: { ... }
  products: Array<{
    product: { ... }
    price: { ... }  // subscription or single_payment price
    features?: [...]
  }>
  usageMeters?: Array<{
    usageMeter: { ... }
    prices?: Array<{ ... }>  // usage prices for this meter
  }>
}
```

This makes the relationship explicit: usage prices belong to usage meters, mirroring how products have their price directly attached.

**Implicit default behavior**: If a usage meter has a single price and `isDefault` is not set, implicitly set it to `true`.

### 7. Long-term Vision: Default Free Prices

Future state (not in this PR scope):
1. Every usage meter should have a default (free) price
2. When a usage event is created with just `usageMeterId` (no `priceId`), it uses the default price
3. This eliminates "priceless" usage events over time

For now: Don't auto-create default prices on meter creation. Handle in follow-up backfill + feature work.

### 8. RLS Policy Updates Required

The following RLS policies reference `productId` and need updates to handle usage prices with `productId = NULL`:

**`enableCustomerReadPolicy` (lines 144-148)**:
```sql
-- CURRENT:
"product_id" in (select "id" from "products") and "active" = true

-- UPDATED: Handle null productId for usage prices
"active" = true AND (
  "product_id" IN (SELECT "id" FROM "products")
  OR ("product_id" IS NULL AND "usage_meter_id" IN (SELECT "id" FROM "usage_meters"))
)
```

**`usageMeterBelongsToSameOrganization` (lines 74-80)**:
```sql
-- CURRENT: Gets org from product, breaks when productId is NULL
-- UPDATED: Use pricingModelId to verify org consistency
"usage_meter_id" IS NULL
OR "usage_meter_id" IN (
  SELECT "id" FROM "usage_meters"
  WHERE "usage_meters"."pricing_model_id" = "prices"."pricing_model_id"
)
```

**`parentForeignKeyIntegrityCheckPolicy` (lines 159-163)**:
```sql
-- CURRENT: Only checks product_id integrity
-- UPDATED: Make conditional based on price type
(
  ("type" != 'usage' AND "product_id" IN (SELECT "id" FROM "products" WHERE ...))
  OR ("type" = 'usage' AND "usage_meter_id" IN (SELECT "id" FROM "usage_meters" WHERE ...))
)
```

### 9. Unique Index on externalId Needs Splitting

The current `[externalId, productId]` unique index will break for usage prices with null `productId`. Split into two conditional indexes:

```ts
// Product prices: external ID unique per product
constructUniqueIndex(TABLE_NAME, [table.externalId, table.productId])
  .where(sql`${table.type} != 'usage'`),

// Usage prices: external ID unique per usage meter
constructUniqueIndex(TABLE_NAME, [table.externalId, table.usageMeterId])
  .where(sql`${table.type} = 'usage'`),
```

---

## Required Changes

### PR 1: Schema Changes

**File: `src/db/schema/prices.ts`**

1. **Change productId column (~line 109)**:
   ```ts
   // FROM:
   productId: notNullStringForeignKey('product_id', products),
   // TO:
   productId: nullableStringForeignKey('product_id', products),
   ```

2. **Update unique indexes (~lines 139-141)**:
   ```ts
   // isDefault constraints - two separate:
   uniqueIndex('prices_product_id_is_default_unique_idx')
     .on(table.productId)
     .where(sql`${table.isDefault} AND ${table.type} != 'usage'`),
   uniqueIndex('prices_usage_meter_is_default_unique_idx')
     .on(table.usageMeterId)
     .where(sql`${table.isDefault} AND ${table.type} = 'usage'`),
   ```

3. **Update externalId unique index (~lines 135-138)**:
   ```ts
   // Split into two conditional indexes:
   constructUniqueIndex(TABLE_NAME, [table.externalId, table.productId])
     .where(sql`${table.type} != 'usage'`),
   constructUniqueIndex(TABLE_NAME, [table.externalId, table.usageMeterId])
     .where(sql`${table.type} = 'usage'`),
   ```

4. **Update RLS policies**:

   **`enableCustomerReadPolicy` (~lines 144-148)**:
   ```ts
   enableCustomerReadPolicy(
     `Enable read for customers (${TABLE_NAME})`,
     {
       using: sql`"active" = true AND (
         "product_id" IN (SELECT "id" FROM "products")
         OR ("product_id" IS NULL AND "usage_meter_id" IN (SELECT "id" FROM "usage_meters"))
       )`,
     }
   ),
   ```

   **`usageMeterBelongsToSameOrganization` (~lines 74-80)**:
   ```ts
   const usageMeterBelongsToSameOrganization = sql`"usage_meter_id" IS NULL
     OR "usage_meter_id" IN (
       SELECT "id" FROM "usage_meters"
       WHERE "usage_meters"."pricing_model_id" = "prices"."pricing_model_id"
     )`
   ```

   **`parentForeignKeyIntegrityCheckPolicy` (~lines 159-163)**:
   ```ts
   // Make conditional - product prices check product FK, usage prices check usage_meter FK
   parentForeignKeyIntegrityCheckPolicy({
     parentTableName: 'products',
     parentIdColumnInCurrentTable: 'product_id',
     currentTableName: TABLE_NAME,
     condition: sql`"type" != 'usage'`,
   }),
   parentForeignKeyIntegrityCheckPolicy({
     parentTableName: 'usage_meters',
     parentIdColumnInCurrentTable: 'usage_meter_id',
     currentTableName: TABLE_NAME,
     condition: sql`"type" = 'usage'`,
   }),
   ```

5. **Update discriminated union Zod schemas (~lines 205-241)**:
   - Subscription prices: `productId: z.string()` (required)
   - Single payment prices: `productId: z.string()` (required)
   - Usage prices (insert): `productId: core.safeZodNullOrUndefined` (accepts null or omitted, outputs null)
   - Usage prices (select, v1): `productId: z.any().transform(() => null)` (coerces existing data to null)

6. **Add type guard in Price namespace (~line 436)**:
   ```ts
   export namespace Price {
     export type ProductPrice = SubscriptionRecord | SinglePaymentRecord
     export type MeterPrice = UsageRecord

     export const hasProductId = (price: Record): price is ProductPrice => {
       return price.type !== PriceType.Usage
     }
   }
   ```

**Database migration** (generate via `bun run migrations:generate`):
```sql
-- Make productId nullable
ALTER TABLE "prices" ALTER COLUMN "product_id" DROP NOT NULL;

-- Update isDefault unique indexes
DROP INDEX IF EXISTS "prices_product_id_is_default_unique_idx";

CREATE UNIQUE INDEX "prices_product_id_is_default_unique_idx"
  ON "prices" ("product_id") WHERE "is_default" = true AND "type" != 'usage';

CREATE UNIQUE INDEX "prices_usage_meter_is_default_unique_idx"
  ON "prices" ("usage_meter_id") WHERE "is_default" = true AND "type" = 'usage';

-- Update externalId unique indexes
DROP INDEX IF EXISTS "prices_external_id_product_id_unique_idx";

CREATE UNIQUE INDEX "prices_external_id_product_id_unique_idx"
  ON "prices" ("external_id", "product_id") WHERE "type" != 'usage';

CREATE UNIQUE INDEX "prices_external_id_usage_meter_id_unique_idx"
  ON "prices" ("external_id", "usage_meter_id") WHERE "type" = 'usage';
```

**Data migration** (run after schema migration, before index creation):
```sql
-- Required: Reset isDefault to avoid unique index conflicts
UPDATE "prices" SET "is_default" = false WHERE "type" = 'usage';
```

**Note**: The `productId` nullification is **deferred** until after all PRs are deployed and verified (see Key Design Decision #3). The v1 Zod coercion handles existing records with productId values in the meantime.

**Note**: The application-level backfill script for default usage prices has been moved to PR 9, which depends on PR 8 (auto-create free price on meter creation).

---

### PR 2: Database Query Updates

**File: `src/db/tableMethods/priceMethods.ts`**

1. **Add helper functions**:
   ```ts
   export const derivePricingModelIdFromUsageMeter = async (
     usageMeterId: string,
     transaction: DbTransaction
   ): Promise<string>

   export const pricingModelIdsForUsageMeters = async (
     usageMeterIds: string[],
     transaction: DbTransaction
   ): Promise<Map<string, string>>
   ```

2. **Update `bulkInsertPrices` (~lines 102-127)**: Separate by price type. Product prices derive `pricingModelId` from product; usage prices derive from usage meter. Set `productId: null` for usage prices.

3. **Update `insertPrice` (~lines 133-150)**: Same logic - derive `pricingModelId` from usage meter for usage prices, set `productId: null`.

4. **Update `selectPricesAndProductsForOrganization` (~line 154)**: Change `innerJoin(products)` to `leftJoin(products)`. Join on `pricingModels` for org filtering. Return `product: Product.Record | null`.

5. **Update `selectPriceProductAndOrganizationByPriceWhere` (~line 365)**: Same `leftJoin` pattern.

6. **Update `priceProductJoinResultToProductAndPrices` (~line 230)**: Filter to only include prices that have products when building `ProductWithPrices`.

**File: `src/db/tableMethods/purchaseMethods.ts`**
- `selectPurchaseWithDetails` (~line 217): `leftJoin(products)`
- `selectPurchasesByOrganization` (~line 359): `leftJoin(products)`

**File: `src/db/tableMethods/subscriptionMethods.ts`**
- Cursor pagination (~line 230): `leftJoin(products)`

**File: `src/db/tableMethods/usageEventMethods.ts`**
- Cursor pagination (~line 180): `leftJoin(products)`

**File: `src/db/tableMethods/productMethods.ts`** (and any others joining products ↔ prices)
- Audit all joins in both directions and convert to `leftJoin` where usage prices should be included

**File: `src/db/schema/prices.ts`**
- Update `pricesTableRowDataSchema` to make `product` nullable:
  ```ts
  // FROM:
  export const pricesTableRowDataSchema = z.object({
    price: pricesClientSelectSchema,
    product: z.object({
      id: z.string(),
      name: z.string(),
    }),
  })

  // TO:
  export const pricesTableRowDataSchema = z.object({
    price: pricesClientSelectSchema,
    product: z.object({
      id: z.string(),
      name: z.string(),
    }).nullable(),
  })
  ```

**File: `src/server/routers/pricesRouter.ts`**
- Deprecate `listUsagePricesForProduct` endpoint:
  - This endpoint filters by `productId`, which will return empty results for usage prices with `productId: null`
  - **Verified unused**: No code currently calls this endpoint (only reference was in stale gameplan doc for non-existent `OveragePriceSelect.tsx`)
  - `UsagePricesGridSection` already uses `prices.getTableRows` with `usageMeterId` filter, which is the correct pattern
  - Remove from router after deprecation period

---

### PR 3: Type Guards in Business Logic

**File: `src/subscriptions/createSubscription/initializers.ts`**
- Update price-product validation (~line 237): Add `Price.hasProductId()` guard before checking `price.productId !== product.id`.

**File: `src/subscriptions/subscriptionItemFeatureHelpers.ts`**
- Update feature lookup (~line 124): Filter to only product prices before building feature map.

**File: `src/utils/checkoutSessionState.ts`**
- Update product validation (~lines 201, 237): Add `Price.hasProductId()` guard.

**File: `src/utils/pricingModel.ts`**
- Update `selectProductById` calls (~lines 145, 151): Add type guards.

**File: `src/utils/bookkeeping/fees/subscription.ts`**
- Update fee calculation (~line 180): Add `Price.hasProductId()` guard.

**File: `src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts`**
- Update credit grant logic (~line 433): Only do feature lookup for product prices.

---

### PR 4: API Contract Updates

**File: `src/api-contract/checkoutSessionContract.ts`**
- Update default product validation (~line 54): Use `Price.hasProductId()` guard.

**File: `src/server/routers/pricesRouter.ts`**
- Add explicit validation error messages in create handler:
  ```ts
  if (input.price.type === PriceType.Usage && input.price.productId !== null) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Usage prices cannot have a productId. They belong to usage meters.',
    })
  }
  if (input.price.type !== PriceType.Usage && !input.price.productId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Subscription and single payment prices require a productId.',
    })
  }
  ```
- Update `updatePrice` procedure: Skip the "default price on default product" validation for usage prices (they don't have products). The logic that fetches the existing price and its product to check if it's a default price on a default product should use `Price.hasProductId()` guard.

---

### PR 5: setupPricingModel Structure Update

**File: `src/utils/pricingModels/setupTransaction.ts`** (and related)
- Update input structure to support `usageMeters[].prices` array (see Key Design Decision #6)
- Implement implicit default logic: single price becomes default automatically

**File: `src/utils/pricingModels/setupSchemas.ts`**
- Update schema to accept nested `usageMeters[].prices` structure
- Update validation to check prices within each meter object

---

### PR 6: createUsageMeterTransaction Change

**File: `src/utils/usage.ts`**
- Update `createUsageMeterTransaction`: Remove product creation from this function
- Usage meters no longer need a companion product since usage prices belong directly to meters
- Callers needing a product should create it separately

---

### PR 7: UI Cleanup (post-migration)

After PR 1 lands, simplify the usage price creation flow to eliminate hidden product creation:

**File: `src/components/forms/CreateUsagePriceModal.tsx`**
- Remove `createProductFormSchema` dependency
- Create new `createUsagePriceFormSchema` that uses `prices.create` directly
- Remove hidden product creation from `onSubmit`:
  ```ts
  // FROM (current workaround):
  await createProduct.mutateAsync({
    product: { ... },  // Hidden product
    price: { ... },
  })

  // TO (after migration):
  await createPrice.mutateAsync({
    price: {
      type: PriceType.Usage,
      usageMeterId: usageMeter.id,
      productId: null,  // Explicitly null, no hidden product
      ...
    },
  })
  ```

**File: `src/components/forms/EditUsagePriceModal.tsx`**
- Verify that `price.productId` (which will be `null` post-migration) is handled correctly
- Line 348 passes `productId: price.productId` which will be `null` - this is correct behavior

---

## Acceptance Criteria

- [ ] Usage prices can be created with `productId: null`
- [ ] Usage prices require `usageMeterId` (already true)
- [ ] Subscription/single_payment prices require `productId` (enforced via Zod)
- [ ] `isDefault` uniqueness enforced per usage meter for usage prices
- [ ] `isDefault` uniqueness enforced per product for subscription/single_payment prices
- [ ] `externalId` uniqueness enforced per product for subscription/single_payment prices
- [ ] `externalId` uniqueness enforced per usage meter for usage prices
- [ ] `pricingModelId` derived from usage meter for usage prices
- [ ] `pricingModelId` derived from product for subscription/single_payment prices
- [ ] All INNER JOINs on productId converted to LEFT JOINs with null handling (both directions)
- [ ] `Price.hasProductId()` type guard used at all `productId` access sites
- [ ] Existing `productId` immutability enforcement continues to work
- [ ] RLS policies updated to handle null `productId` for usage prices
- [ ] `createUsageMeterTransaction` no longer creates products
- [ ] Database migration runs successfully
- [ ] Data migration resets `isDefault = false` for existing usage prices (PR 1)
- [ ] Data migration nulls out existing usage price productIds (deferred, before v2 Zod)
- [ ] All existing tests pass
- [ ] New test coverage for edge cases per PR
- [ ] `setupPricingModel` supports `usageMeters[].prices` array structure
- [ ] `pricesTableRowDataSchema` updated to allow nullable `product`
- [ ] `listUsagePricesForProduct` deprecated and removed
- [ ] `CreateUsagePriceModal` simplified to not create hidden products (post-migration)
- [ ] Auto-create free price on meter creation implemented
- [ ] Backfill script creates $0 default prices for existing meters

---

## Explicit Opinions

1. **Usage prices are children of usage meters**: `isDefault` constraint is per usage meter, not per pricing model. Each meter can have its own default price, mirroring how products have default prices.

2. **Use `Price.hasProductId()` type guard**: Rather than `price.productId!` assertions or `if (price.productId)` checks, use the type guard. It's self-documenting, type-safe, and centralizes the logic.

3. **Keep productId immutability unchanged**: The existing `validatePriceImmutableFields` function works regardless of nullability. No special handling needed.

4. **Derive pricingModelId from parent relationship**: Product prices from `product.pricingModelId`, usage prices from `usageMeter.pricingModelId`.

5. **Active data migration**: Null out existing usage price productIds rather than handling legacy data indefinitely. Clean, consistent data model is worth the migration effort.

6. **v1/v2 Zod coercion strategy**: Deploy v1 with coercion first to handle in-flight data, then v2 strict after migration is verified complete.

7. **No database CHECK constraint (for now)**: Rely on application-layer validation (Zod, type guards, API validation) for mutual exclusivity initially. Revisit adding a CHECK constraint after migration is complete (optional PR 11).

8. **Default usage price = $0 fallback**: The `isDefault` flag on usage prices designates a $0 fallback price per meter ("no charge unless explicitly configured"). Migration creates $0 defaults where missing.

9. **Implicit default for single price**: If a usage meter has exactly one price, it's implicitly the default.

10. **UI already implemented (with workaround)**: The UI presents usage prices as belonging to usage meters. Currently, `CreateUsagePriceModal` creates a hidden product as a workaround. After PR 1 lands, simplify the UI to call `prices.create` directly with `productId: null`. This is tracked in PR 7.

11. **Future: eliminate priceless usage events**: Long-term goal is every usage meter has a default free price, and usage events without explicit priceId use it. Not in this PR scope.

12. **Accept breaking change for `FeatureFlag.SubscriptionWithUsage`**: This feature flag is inherently incompatible with the new data model. After PR 1 lands, feature-flagged orgs will be unable to create NEW subscriptions with usage prices. This is acceptable because:
    - Only 2 orgs have the flag: HD Research and Plastic Labs
    - Plastic Labs is offboarding (has 90 existing usage subscriptions that will continue to work)
    - HD Research has 0 livemode subscriptions using usage prices
    - **Existing subscriptions continue to work** - only NEW creation is blocked
    - The feature flag was always experimental (note the FIXME in `workflow.ts`)

## PRs

### PR 1: Schema Changes

**Files to modify:**
- `src/db/schema/prices.ts`
- `src/db/tableUtils.ts` (if `parentForeignKeyIntegrityCheckPolicy` needs condition parameter)

**Changes:**
1. Change `productId` from `notNullStringForeignKey` to `nullableStringForeignKey`
2. Update `isDefault` unique indexes: one default per product (non-usage), one default per usage meter (usage)
3. Update `externalId` unique indexes: split into two conditional indexes (product prices vs usage prices)
4. Update RLS policies:
   - `enableCustomerReadPolicy`: Handle null `productId` for usage prices
   - `usageMeterBelongsToSameOrganization`: Use `pricingModelId` instead of product subquery
   - `parentForeignKeyIntegrityCheckPolicy`: Make conditional for price type (or add second policy for usage meters)
5. Update Zod discriminated union schemas:
   - Subscription/single_payment: `productId: z.string()` (required)
   - Usage insert: `productId: core.safeZodNullOrUndefined` (accepts null/omitted, outputs null)
   - Usage select (v1): `productId: z.any().transform(() => null)` (coerces to null)
6. Add `Price.hasProductId()` type guard function
7. Export `Price.ProductPrice` and `Price.MeterPrice` type aliases
8. Generate and run database migration (schema + index changes)
9. Run data migration to null out existing usage price productIds

**Test cases:**
```ts
describe('Price schema', () => {
  describe('productId nullability', () => {
    it('should allow null productId for usage prices', async () => {
      // setup: create usage price insert with productId: null, usageMeterId: valid
      // expect: schema validation passes, insert succeeds
    })
    it('should allow omitted productId for usage prices', async () => {
      // setup: create usage price insert without productId field, usageMeterId: valid
      // expect: schema validation passes, insert succeeds with productId: null
    })
    it('should require productId for subscription prices', async () => {
      // setup: create subscription price insert with productId: null
      // expect: schema validation fails
    })
    it('should require productId for single_payment prices', async () => {
      // setup: create single_payment price insert with productId: null
      // expect: schema validation fails
    })
    it('should coerce existing usage price productId to null in select schema (v1)', async () => {
      // setup: parse usage price record with productId: "prod_123"
      // expect: parsed result has productId: null
    })
  })

  describe('isDefault uniqueness', () => {
    it('should allow one default usage price per usage meter', async () => {
      // setup: insert default usage price on meter, try second default on same meter
      // expect: database constraint violation on second insert
    })
    it('should allow default usage prices on different meters in same pricing model', async () => {
      // setup: two meters, insert default usage price on each
      // expect: both succeed
    })
    it('should allow one default subscription price per product', async () => {
      // setup: insert default subscription price on product, try second default
      // expect: database constraint violation on second insert
    })
  })

  describe('Price.hasProductId type guard', () => {
    it('should return true for subscription prices', () => {
      // expect: Price.hasProductId returns true, TypeScript narrows productId to string
    })
    it('should return true for single_payment prices', () => {
      // expect: Price.hasProductId returns true
    })
    it('should return false for usage prices', () => {
      // expect: Price.hasProductId returns false
    })
  })

  describe('RLS policies', () => {
    it('should allow customer read access to active usage prices', async () => {
      // setup: create usage price with productId: null, active: true
      // expect: customer can read the price via RLS
    })
    it('should allow customer read access to active subscription prices', async () => {
      // setup: create subscription price with productId: valid, active: true
      // expect: customer can read the price via RLS
    })
    it('should reject usage meter from different pricing model', async () => {
      // setup: try to create usage price with usageMeterId from different pricingModel
      // expect: RLS policy violation
    })
  })

  describe('externalId uniqueness', () => {
    it('should allow same externalId on different products', async () => {
      // setup: create two subscription prices with same externalId on different products
      // expect: both succeed
    })
    it('should reject duplicate externalId on same product', async () => {
      // setup: create two subscription prices with same externalId on same product
      // expect: unique constraint violation
    })
    it('should allow same externalId on different usage meters', async () => {
      // setup: create two usage prices with same externalId on different meters
      // expect: both succeed
    })
    it('should reject duplicate externalId on same usage meter', async () => {
      // setup: create two usage prices with same externalId on same meter
      // expect: unique constraint violation
    })
  })
})
```

---

### PR 2: Database Query Updates

**Files to modify:**
- `src/db/tableMethods/priceMethods.ts`
- `src/db/tableMethods/purchaseMethods.ts`
- `src/db/tableMethods/subscriptionMethods.ts`
- `src/db/tableMethods/usageEventMethods.ts`
- `src/db/tableMethods/productMethods.ts`
- `src/db/schema/prices.ts` (for `pricesTableRowDataSchema`)
- `src/server/routers/pricesRouter.ts` (for `listUsagePricesForProduct`)
- Any other files with price ↔ product joins

**Changes:**
1. Add `derivePricingModelIdFromUsageMeter` and `pricingModelIdsForUsageMeters` helper functions
2. Update `bulkInsertPrices` to derive pricingModelId from usage meter for usage prices
3. Update `insertPrice` to derive pricingModelId from usage meter for usage prices
4. Convert `innerJoin(products, ...)` to `leftJoin(products, ...)` in all price queries (both directions)
5. Update return types to handle `product: Product.Record | null`
6. Filter out usage prices in `priceProductJoinResultToProductAndPrices`
7. Update `pricesTableRowDataSchema` to make `product` nullable
8. Deprecate and remove `listUsagePricesForProduct` endpoint (verified unused)

**Test cases:**
```ts
describe('priceMethods', () => {
  describe('insertPrice', () => {
    it('should derive pricingModelId from product for subscription prices', async () => {
      // setup: create product, insert subscription price without pricingModelId
      // expect: price.pricingModelId === product.pricingModelId
    })
    it('should derive pricingModelId from usage meter for usage prices', async () => {
      // setup: create usage meter, insert usage price without pricingModelId
      // expect: price.pricingModelId === usageMeter.pricingModelId
    })
    it('should set productId to null for usage prices', async () => {
      // setup: insert usage price
      // expect: price.productId === null
    })
  })

  describe('bulkInsertPrices', () => {
    it('should handle mixed usage and subscription prices', async () => {
      // setup: bulk insert [subscriptionPrice, usagePrice]
      // expect: subscription has productId, usage has productId: null, both have correct pricingModelId
    })
  })

  describe('selectPricesAndProductsForOrganization', () => {
    it('should return null product for usage prices', async () => {
      // setup: org with usage meter and usage price
      // expect: result includes { price: usagePrice, product: null }
    })
    it('should return product for subscription prices', async () => {
      // setup: org with product and subscription price
      // expect: result includes { price: subscriptionPrice, product: productRecord }
    })
  })
})
```

---

### PR 3: Type Guards in Business Logic

**Files to modify:**
- `src/subscriptions/createSubscription/initializers.ts`
- `src/subscriptions/subscriptionItemFeatureHelpers.ts`
- `src/utils/checkoutSessionState.ts`
- `src/utils/pricingModel.ts`
- `src/utils/bookkeeping/fees/subscription.ts`
- `src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts`

**Changes:**
1. Add `Price.hasProductId()` type guards before accessing `productId`
2. Skip product validation for usage prices in subscription creation
3. Filter out usage prices before building feature maps

**Test cases:**
```ts
describe('createSubscription initializers', () => {
  it('should skip product validation for usage prices', async () => {
    // setup: create subscription with usage price (productId: null)
    // expect: no error, subscription created
  })
  it('should validate product association for subscription prices', async () => {
    // setup: create subscription with price.productId !== product.id
    // expect: throws "Price X is not associated with product Y"
  })
})

describe('subscriptionItemFeatureHelpers', () => {
  it('should not include features for usage price items', async () => {
    // setup: subscription with usage price item
    // expect: no features returned for usage item
  })
  it('should include features for subscription price items', async () => {
    // setup: subscription with subscription price, product has features
    // expect: features returned
  })
})

describe('fee calculation', () => {
  it('should calculate fees for usage prices without product lookup', async () => {
    // setup: billing run with usage price
    // expect: fee calculated, no product lookup
  })
})
```

---

### PR 4: API Contract Updates

**Files to modify:**
- `src/api-contract/checkoutSessionContract.ts`
- `src/server/routers/pricesRouter.ts`

**Changes:**
1. Update checkout validation to use `Price.hasProductId()` type guard
2. Add explicit validation error messages for price type vs productId presence

**Test cases:**
```ts
describe('pricesRouter', () => {
  describe('createPrice', () => {
    it('should reject usage price with non-null productId', async () => {
      // setup: POST with type: usage, productId: "prod_123"
      // expect: 400 with message about usage prices not having products
    })
    it('should reject subscription price without productId', async () => {
      // setup: POST with type: subscription, productId: null
      // expect: 400 with message about requiring productId
    })
    it('should create usage price with null productId', async () => {
      // setup: POST with type: usage, usageMeterId: valid, productId: null
      // expect: 201, price.productId === null
    })
    it('should create usage price with omitted productId', async () => {
      // setup: POST with type: usage, usageMeterId: valid, no productId field
      // expect: 201, price.productId === null
    })
  })
})

describe('checkoutSessionContract', () => {
  it('should validate default product for subscription prices only', async () => {
    // setup: subscription price on default product
    // expect: validation rejects
    // setup: usage price (no product)
    // expect: validation passes
  })
})
```

---

### PR 5: setupPricingModel Structure Update

**Files to modify:**
- `src/utils/pricingModels/setupTransaction.ts`
- `src/utils/pricingModels/setupSchemas.ts`

**Changes:**
1. Update `setupPricingModel` to support `usageMeters[].prices` array structure
2. Update `setupSchemas.ts` to validate nested prices within usage meters
3. Implement implicit default logic: single price on meter becomes default automatically

**Test cases:**
```ts
describe('setupPricingModel', () => {
  it('should create usage prices from usageMeters[].prices array', async () => {
    // setup: setupPricingModel with usageMeter that has prices array
    // expect: usage prices created with correct usageMeterId, productId: null
  })
  it('should implicitly set isDefault=true for single price on meter', async () => {
    // setup: setupPricingModel with usageMeter that has one price, isDefault not set
    // expect: price.isDefault === true
  })
  it('should allow multiple prices per meter with explicit isDefault', async () => {
    // setup: setupPricingModel with usageMeter that has multiple prices, one with isDefault: true
    // expect: all prices created, only one is default
  })
})
```

---

### PR 6: createUsageMeterTransaction Change

**Files to modify:**
- `src/utils/usage.ts`

**Changes:**
1. **Update `createUsageMeterTransaction`**: Remove product creation from this function. Usage meters no longer need a companion product since usage prices belong directly to meters. Callers needing a product should create it separately.

**Test cases:**
```ts
describe('createUsageMeterTransaction', () => {
  it('should create usage meter without creating a product', async () => {
    // setup: call createUsageMeterTransaction with valid input
    // expect: usage meter created, no product created
  })
  it('should return only usage meter (not product)', async () => {
    // setup: call createUsageMeterTransaction
    // expect: return type is just UsageMeter, no product in response
  })
})
```

---

### PR 7: UI Cleanup

**Files to modify:**
- `src/components/forms/CreateUsagePriceModal.tsx`
- `src/components/forms/EditUsagePriceModal.tsx` (verification)

**Changes:**
1. **Simplify `CreateUsagePriceModal`**: Remove hidden product creation workaround, call `prices.create` directly with `productId: null`
2. **Verify `EditUsagePriceModal`**: Ensure it handles `price.productId === null` correctly (should work as-is)

**Test cases:**
```ts
describe('CreateUsagePriceModal (post-migration)', () => {
  it('should create usage price directly without hidden product', async () => {
    // setup: fill in CreateUsagePriceModal form, submit
    // expect: prices.create called (not products.create), productId: null
  })
})

describe('EditUsagePriceModal', () => {
  it('should handle price with productId === null', async () => {
    // setup: open EditUsagePriceModal with usage price that has productId: null
    // expect: form loads correctly, can be submitted
  })
})
```

---

## Parallelization

```
PR 1 (Schema Changes + v1 Zod coercion)
    │
    ├──► PR 2 (Database Queries)
    │
    ├──► PR 3 (Type Guards)
    │
    ├──► PR 4 (API Contracts)
    │
    ├──► PR 5 (setupPricingModel)
    │
    ├──► PR 7 (UI Cleanup)
    │
    └──► PR 6 (createUsageMeterTransaction)
              │
              └──► [GAMEPLAN_NO_CHARGE_PRICES.md] Patches 1-5
                        │
                        └──► PR 8 (v2 Strict Zod + productId nullification)
                                    │
                                    └──► Optional PR 9 (CHECK constraint)
```

- **PR 1 must land first** (schema changes are foundational)
- **PRs 2, 3, 4, 5, 6, 7 can be developed in parallel** after PR 1 lands
- **No Charge Prices gameplan** depends on PRs 1-7 (uses nullable productId)
- **PR 8 depends on No Charge Prices gameplan** (requires all feature work complete and verified before cleanup)
- **Optional PR 9 depends on PR 8** (CHECK constraint requires clean data)

**Suggested execution**:
1. Implement and land PR 1
2. Branch from PR 1 for PRs 2-7 in parallel
3. Land PRs 2-7 as ready
4. Execute [GAMEPLAN_NO_CHARGE_PRICES.md](./GAMEPLAN_NO_CHARGE_PRICES.md) patches 1-5
5. Verify all work is functioning correctly in production
6. Land PR 8 (run productId nullification, then deploy v2 strict Zod)
7. (Optional) Add database CHECK constraint once DB is in clean state (PR 9)

---

## No Charge Prices Implementation

**PRs 8 and 9 have been replaced by [GAMEPLAN_NO_CHARGE_PRICES.md](./GAMEPLAN_NO_CHARGE_PRICES.md)**

After PRs 1-7 from this gameplan land, execute all patches from the No Charge Prices gameplan. This implements:
- Reserved `{usagemeterslug}_no_charge` slug pattern for auto-generated fallback prices
- Auto-creation of no_charge prices when usage meters are created
- Default price cascade logic (no_charge becomes default when no other default exists)
- Using the default price when creating usage events by meter identifier
- Reserved slug validation in API and pricing.yaml
- Backfill script for existing usage meters

---

### PR 8: v2 Strict Zod + productId Nullification

**Prerequisite**: PRs 1-7 from this gameplan AND all patches from GAMEPLAN_NO_CHARGE_PRICES.md landed and verified working in production.

This is the "cleanup" PR that finalizes the migration by:
1. Running the deferred `productId` nullification
2. Switching from v1 Zod coercion to v2 strict validation

**Deployment steps**:

1. **Backup the prices table**:
   ```bash
   pg_dump --table=prices $DATABASE_URL > prices_backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Run productId nullification**:
   ```sql
   UPDATE prices SET product_id = NULL WHERE type = 'usage';
   ```

3. **Verify data is clean**:
   ```sql
   -- Should return 0 rows
   SELECT id, type, product_id FROM prices
   WHERE type = 'usage' AND product_id IS NOT NULL;
   ```

4. **Deploy PR 8 code** (v2 strict Zod schema)

**File: `src/db/schema/prices.ts`**

Update the usage price select schema from v1 coercion to v2 strict:

```ts
// FROM (v1 coercion):
const usagePriceColumns = {
  productId: z.any().transform(() => null),
}

// TO (v2 strict):
const usagePriceColumns = {
  productId: z.null(),
}
```

**Rollback strategy** (if something breaks):
```sql
-- Restore productId from the hidden products
UPDATE prices p
SET product_id = pr.id
FROM products pr
WHERE p.type = 'usage'
  AND p.usage_meter_id IS NOT NULL
  AND pr.usage_meter_id = p.usage_meter_id;
```

Then redeploy v1 Zod coercion code.

**Test cases:**
```ts
describe('v2 strict Zod schema', () => {
  it('should reject usage price with non-null productId in select schema', () => {
    // setup: parse usage price record with productId: "prod_123"
    // expect: Zod validation error
  })
  it('should accept usage price with null productId', () => {
    // setup: parse usage price record with productId: null
    // expect: passes validation
  })
})
```

---

### Optional PR 9: Database CHECK Constraint

**Prerequisite**: PR 8 landed (data is clean, v2 strict Zod deployed).

**File: `src/db/schema/prices.ts`**

Add a CHECK constraint to enforce mutual exclusivity at the database level:

```ts
check(
  'prices_product_usage_meter_mutual_exclusivity',
  sql`
    ("type" = 'usage' AND "product_id" IS NULL AND "usage_meter_id" IS NOT NULL)
    OR
    ("type" != 'usage' AND "product_id" IS NOT NULL AND "usage_meter_id" IS NULL)
  `
),
```

**Database migration**:
```sql
ALTER TABLE "prices" ADD CONSTRAINT "prices_product_usage_meter_mutual_exclusivity"
CHECK (
  ("type" = 'usage' AND "product_id" IS NULL AND "usage_meter_id" IS NOT NULL)
  OR
  ("type" != 'usage' AND "product_id" IS NOT NULL AND "usage_meter_id" IS NULL)
);
```

**Pre-flight check** (run before migration to verify data is clean):
```sql
-- Should return 0 rows if data is clean
SELECT id, type, product_id, usage_meter_id
FROM prices
WHERE NOT (
  (type = 'usage' AND product_id IS NULL AND usage_meter_id IS NOT NULL)
  OR
  (type != 'usage' AND product_id IS NOT NULL AND usage_meter_id IS NULL)
);
```

**Why optional**: This is defense-in-depth. The application layer already enforces the invariant via Zod schemas and API validation. The CHECK constraint provides an additional safety net but isn't strictly necessary for correctness.

**Test cases:**
```ts
describe('prices CHECK constraint', () => {
  it('should reject usage price with non-null productId at database level', async () => {
    // setup: attempt raw SQL insert of usage price with productId
    // expect: constraint violation
  })
  it('should reject subscription price with null productId at database level', async () => {
    // setup: attempt raw SQL insert of subscription price without productId
    // expect: constraint violation
  })
  it('should reject subscription price with non-null usageMeterId at database level', async () => {
    // setup: attempt raw SQL insert of subscription price with usageMeterId
    // expect: constraint violation
  })
})
```
