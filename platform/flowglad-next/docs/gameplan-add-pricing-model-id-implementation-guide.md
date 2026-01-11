# Implementation Guide: Adding pricingModelId to Tables

This guide documents the classes of changes required when adding `pricingModelId` to tables as part of the gameplan. Use this as a checklist for each PR in the gameplan.

## Overview

Each PR follows a consistent pattern:
1. **Before Migration**: Schema and code changes that don't require the database column to exist
2. **Migration Generation**: Generate the migration file using `bun run migrations:generate`
3. **Migration Modification**: Update the SQL migration to handle backfilling existing data
4. **After Migration**: Test coverage and verification

---

## Phase 1: Before Generating Migration Files

### 1. Schema File Updates

For each table that needs `pricingModelId`, update the schema file in `src/db/schema/`:

#### 1.1 Add Column Definition
```typescript
import { pricingModels } from './pricingModels'
import { notNullStringForeignKey } from '@/db/tableUtils'

// In the table definition:
pricingModelId: notNullStringForeignKey('pricing_model_id', pricingModels),
```

#### 1.2 Add Index
```typescript
import { constructIndex } from '@/db/tableUtils'

// In the indexes array:
constructIndex(TABLE_NAME, [table.pricingModelId]),
```

#### 1.3 Add to readOnlyColumns
```typescript
// In buildSchemas call:
readOnlyColumns: {
  pricingModelId: true,
  // ... other readOnlyColumns
}
```

#### 1.4 Add insertRefine (CRITICAL)
```typescript
import { z } from 'zod'

// In buildSchemas call:
insertRefine: {
  pricingModelId: z.string().optional(),
  // ... other insertRefine if any
}
```

**Why**: This makes `pricingModelId` optional in the Zod insert schema, allowing application code to derive and inject it before database insertion, even though the database column is NOT NULL.

**Note**: If the schema already has `insertRefine`, merge the `pricingModelId` entry into it.

#### 1.5 Import Fixes
- Ensure `z` is imported from `zod` (not `type { z }`) if using `insertRefine`
- Ensure `pricingModels` table is imported

---

### 2. Deriver Functions

Create helper functions to derive `pricingModelId` from parent records. These functions encapsulate the logic for determining `pricingModelId` based on relationships.

#### 2.1 Determine Parent Relationship

For each table, identify the direct parent:
- **From Product**: `prices`, `productFeatures`
- **From UsageMeter**: `usageEvents`, `usageCredits`, `ledgerAccounts`, `subscriptionMeterPeriodCalculations`
- **From Feature**: (for future PRs)
- **From Subscription**: (for future PRs)

#### 2.2 Create Deriver Function

**For Product-derived tables** (`prices`, `productFeatures`):
```typescript
// In priceMethods.ts (or appropriate file)
/**
 * Derives pricingModelId from a product.
 * Used for prices and productFeatures.
 */
export const derivePricingModelIdFromProduct = async (
  productId: string,
  transaction: DbTransaction
): Promise<string> => {
  const product = await selectProductById(productId, transaction)
  if (!product.pricingModelId) {
    throw new Error(
      `Product ${productId} does not have a pricingModelId`
    )
  }
  return product.pricingModelId
}
```

**For UsageMeter-derived tables** (`usageEvents`, `usageCredits`, `ledgerAccounts`, `subscriptionMeterPeriodCalculations`):
```typescript
// In usageMeterMethods.ts
/**
 * Derives pricingModelId from a usage meter.
 * Used for usageEvents, usageCredits, ledgerAccounts, subscriptionMeterPeriodCalculations.
 */
export const derivePricingModelIdFromUsageMeter = async (
  usageMeterId: string,
  transaction: DbTransaction
): Promise<string> => {
  const usageMeter = await selectUsageMeterById(usageMeterId, transaction)
  if (!usageMeter.pricingModelId) {
    throw new Error(
      `Usage meter ${usageMeterId} does not have a pricingModelId`
    )
  }
  return usageMeter.pricingModelId
}
```

**Note**: If a deriver function already exists (e.g., from a previous PR), reuse it rather than creating duplicates.

---

### 3. Insert Method Updates

Update all insert methods in `src/db/tableMethods/[tableName]Methods.ts` to derive `pricingModelId` automatically.

#### 3.1 Single Insert Methods

**Pattern**:
```typescript
const baseInsert[TableName] = createInsertFunction([tableName], config)

export const insert[TableName] = async (
  insertData: Omit<[TableName].Insert, 'pricingModelId'>,
  transaction: DbTransaction
): Promise<[TableName].Record> => {
  const pricingModelId = await derivePricingModelIdFrom[Parent](
    insertData.[parentIdField],
    transaction
  )
  return baseInsert[TableName](
    {
      ...insertData,
      pricingModelId,
    },
    transaction
  )
}
```

**Example**:
```typescript
const baseInsertPrice = createInsertFunction(prices, config)

export const insertPrice = async (
  priceInsert: Omit<Price.Insert, 'pricingModelId'>,
  transaction: DbTransaction
): Promise<Price.Record> => {
  const pricingModelId = await derivePricingModelIdFromProduct(
    priceInsert.productId,
    transaction
  )
  return baseInsertPrice(
    {
      ...priceInsert,
      pricingModelId,
    },
    transaction
  )
}
```

#### 3.2 Bulk Insert Methods

**Pattern**:
```typescript
const baseBulkInsert[TableName] = createBulkInsertFunction([tableName], config)

export const bulkInsert[TableName] = async (
  inserts: [TableName].Insert[],
  transaction: DbTransaction
): Promise<[TableName].Record[]> => {
  // Derive pricingModelId for each insert
  const insertsWithPricingModelId = await Promise.all(
    inserts.map(async (insert) => {
      const pricingModelId = await derivePricingModelIdFrom[Parent](
        insert.[parentIdField],
        transaction
      )
      return {
        ...insert,
        pricingModelId,
      }
    })
  )
  return baseBulkInsert[TableName](insertsWithPricingModelId, transaction)
}
```

#### 3.3 Upsert Methods

**Pattern**:
```typescript
const baseUpsert[TableName] = createUpsertFunction([tableName], [...], config)

export const upsert[TableName] = async (
  insertData: Omit<[TableName].Insert, 'pricingModelId'>,
  transaction: DbTransaction
): Promise<[TableName].Record> => {
  const pricingModelId = await derivePricingModelIdFrom[Parent](
    insertData.[parentIdField],
    transaction
  )
  const results = await baseUpsert[TableName](
    {
      ...insertData,
      pricingModelId,
    },
    transaction
  )
  return results[0]! // Upsert functions return arrays
}
```

#### 3.4 Methods That Call Other Insert Methods

If a method calls another insert method (e.g., `safelyInsertPrice` calls `dangerouslyInsertPrice`), ensure the signature uses `Omit<Insert, 'pricingModelId'>`:

```typescript
export const safelyInsertPrice = async (
  priceInsert: Omit<Price.Insert, 'isDefault' | 'active' | 'pricingModelId'>,
  transaction: DbTransaction
): Promise<Price.Record> => {
  // ... validation logic ...
  return dangerouslyInsertPrice(priceInsert, transaction)
}
```

#### 3.5 Find-or-Create Methods

For methods like `findOrCreateLedgerAccountsForSubscriptionAndUsageMeters`, ensure the `Insert` arrays passed to bulk insert methods have `pricingModelId` derived:

```typescript
const insertsWithPricingModelId = await Promise.all(
  inserts.map(async (insert) => {
    const pricingModelId = await derivePricingModelIdFrom[Parent](
      insert.[parentIdField],
      transaction
    )
    return {
      ...insert,
      pricingModelId,
    }
  })
)
```

---

### 4. Seed Database Updates

The `seedDatabase.ts` file typically doesn't need direct changes because:
- Setup functions call the insert methods, which now handle `pricingModelId` derivation automatically
- However, verify that setup functions don't manually construct insert objects that bypass the insert methods

**Check**: Ensure all `setup[TableName]` functions use the insert methods from `tableMethods`, not direct database operations.

---

### 5. Type Checking

Run type checking to ensure everything compiles:

```bash
bun run check
```

**Common Issues**:
- Missing `pricingModelId` in test stubs - add it or use `Omit<Record, 'pricingModelId'>`
- Type errors in insert method signatures - ensure `Omit<Insert, 'pricingModelId'>`
- Missing imports for `z` (not type import) when using `insertRefine`

---

## Phase 2: Generate Migration Files

After completing Phase 1, generate the migration:

```bash
bun run migrations:generate
```

This will create a new migration file in `drizzle-migrations/` with a name like `0XXX_[name].sql`.

---

## Phase 3: Modify Migration SQL

The generated migration will add `pricing_model_id` columns as NOT NULL, which will fail on existing data. We need to modify it to:

1. Add columns as nullable
2. Backfill data from parent records
3. Add NOT NULL constraints
4. Create indexes

### 3.1 Migration Structure

Replace the generated migration with this pattern:

```sql
-- Step 1: Add nullable pricing_model_id columns
ALTER TABLE "[table_name]" ADD COLUMN "pricing_model_id" text;
--> statement-breakpoint

-- Step 2: Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "[table_name]" ADD CONSTRAINT "[table_name]_pricing_model_id_pricing_models_id_fk" FOREIGN KEY ("pricing_model_id") REFERENCES "public"."pricing_models"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Step 3: Backfill pricing_model_id from parent records
-- For Product-derived tables:
UPDATE "[table_name]" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "products" WHERE "products"."id" = "[table_name]"."product_id");
--> statement-breakpoint

-- For UsageMeter-derived tables:
UPDATE "[table_name]" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "usage_meters" WHERE "usage_meters"."id" = "[table_name]"."usage_meter_id");
--> statement-breakpoint

-- Step 4: Add NOT NULL constraints after backfill
ALTER TABLE "[table_name]" ALTER COLUMN "pricing_model_id" SET NOT NULL;
--> statement-breakpoint

-- Step 5: Create indexes for query performance
CREATE INDEX IF NOT EXISTS "[table_name]_pricing_model_id_idx" ON "[table_name]" USING btree ("pricing_model_id");
```

### 3.2 Backfill Query Patterns

**From Product** (`prices`, `product_features`):
```sql
UPDATE "prices" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "products" WHERE "products"."id" = "prices"."product_id");
```

**From UsageMeter** (`usage_events`, `usage_credits`, `ledger_accounts`, `subscription_meter_period_calculations`):
```sql
UPDATE "usage_events" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "usage_meters" WHERE "usage_meters"."id" = "usage_events"."usage_meter_id");
```

**From Feature** (for future PRs):
```sql
UPDATE "[table_name]" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "features" WHERE "features"."id" = "[table_name]"."feature_id");
```

**From Subscription** (for future PRs):
```sql
UPDATE "[table_name]" SET "pricing_model_id" = (SELECT "pricing_model_id" FROM "subscriptions" WHERE "subscriptions"."id" = "[table_name]"."subscription_id");
```

### 3.3 Order of Operations

1. Add all nullable columns first
2. Add all foreign key constraints
3. Backfill all tables (order matters if tables reference each other)
4. Add NOT NULL constraints
5. Create all indexes

---

## Phase 4: After Migration - Test Coverage

### 4.1 Test Deriver Functions

Create a test file `src/db/tableMethods/derivePricingModelId.test.ts` (or add to existing):

**Test Cases**:
1. ✅ Successfully derive `pricingModelId` when parent has it
2. ❌ Skip testing null case (database constraint prevents it)
3. ✅ Throw error when parent doesn't exist

**Example**:
```typescript
describe('derivePricingModelIdFromProduct', () => {
  it('should successfully derive pricingModelId when product has pricingModelId', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdFromProduct(product.id, transaction)

      expect(derivedPricingModelId).toBe(product.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })
  })

  // Note: We skip testing the case where product.pricingModelId is null because
  // the database schema enforces NOT NULL constraint on pricing_model_id.
  // This scenario cannot occur in production.

  it('should throw an error when product does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentProductId = `prod_${core.nanoid()}`

      await expect(
        derivePricingModelIdFromProduct(nonExistentProductId, transaction)
      ).rejects.toThrow()
    })
  })
})
```

### 4.2 Update Existing Tests

Add assertions to existing test files to verify `pricingModelId` matches parent:

#### For Product-derived tables:
```typescript
// In priceMethods.test.ts, productFeatureMethods.test.ts
expect(record.pricingModelId).toBe(product.pricingModelId)
```

#### For UsageMeter-derived tables:
```typescript
// In usageEventMethods.test.ts, ledgerAccountMethods.test.ts, etc.
expect(record.pricingModelId).toBe(usageMeter.pricingModelId)
```

**Where to add**:
- After insert operations in test files
- In bulk insert result verification
- In setup function result verification

### 4.3 Fix Test Stubs

Update test stubs and fixtures that create records directly (not through insert methods):

**Files to check**:
- `src/stubs/[tableName]Stubs.ts`
- Test files that create records directly

**Fix**: Either add `pricingModelId` to the stub data, or use `Omit<Record, 'pricingModelId'>` if testing without it.

---

## Checklist for Each PR

### Before Migration
- [ ] Schema file: Add column definition with `notNullStringForeignKey`
- [ ] Schema file: Add index using `constructIndex`
- [ ] Schema file: Add to `readOnlyColumns`
- [ ] Schema file: Add `insertRefine: { pricingModelId: z.string().optional() }`
- [ ] Schema file: Ensure proper imports (`z` from `zod`, not `type { z }`)
- [ ] Create or reuse deriver function(s) for parent relationship(s)
- [ ] Update all single insert methods to derive `pricingModelId`
- [ ] Update all bulk insert methods to derive `pricingModelId`
- [ ] Update all upsert methods to derive `pricingModelId`
- [ ] Update methods that call other insert methods (signature changes)
- [ ] Update find-or-create methods to derive `pricingModelId`
- [ ] Verify seed database functions use insert methods (no direct DB ops)
- [ ] Run `bun run check` and fix all TypeScript errors

### Generate Migration
- [ ] Run `bun run migrations:generate`
- [ ] Locate the new migration file

### Modify Migration
- [ ] Change column additions from `NOT NULL` to nullable
- [ ] Add foreign key constraints (with DO $$ BEGIN ... EXCEPTION blocks)
- [ ] Add backfill UPDATE statements for each table
- [ ] Add `ALTER COLUMN ... SET NOT NULL` after backfill
- [ ] Ensure indexes are created
- [ ] Verify order: columns → FKs → backfill → NOT NULL → indexes

### After Migration
- [ ] Create or update tests for deriver functions
- [ ] Add `pricingModelId` assertions to existing insert tests
- [ ] Add `pricingModelId` assertions to bulk insert tests
- [ ] Fix test stubs that create records directly
- [ ] Run `bun run check` and verify all tests pass
- [ ] Run `bun test` and verify all tests pass

---

## Common Pitfalls

1. **Forgetting `insertRefine`**: This causes TypeScript errors because insert schemas require `pricingModelId` but callers don't provide it
2. **Wrong parent relationship**: Double-check which parent table to derive from
3. **Missing bulk insert updates**: Easy to miss bulk insert methods
4. **Upsert return type**: Upsert functions return arrays, need `results[0]!`
5. **Migration order**: Backfill must happen before NOT NULL constraint
6. **Test stub updates**: Stubs that bypass insert methods need manual `pricingModelId`

---

## Future PRs Reference

- **PR 2 (Wave 2)**: Tables deriving from Layer 1 (`subscriptions`, `purchases`, etc.)
- **PR 3 (Wave 3)**: Tables deriving from Layer 2
- Each PR follows the same pattern but with different parent relationships
















