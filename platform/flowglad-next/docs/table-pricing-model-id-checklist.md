# Checklist: Adding pricingModelId to a Table

This document defines all changes required when adding `pricingModelId` to a table. Each table should complete all items in this checklist.

## Required Changes Per Table

### 1. Schema File Update (`src/db/schema/[table].ts`)

**1.1. Add `pricingModelId` column definition**
- Add `pricingModelId: notNullStringForeignKey('pricing_model_id', pricingModels)` to the `columns` object
- Import `pricingModels` from `'./pricingModels'` if not already imported
- Import `notNullStringForeignKey` from `'@/db/tableUtils'` if not already imported

**Example:**
```typescript
import { pricingModels } from './pricingModels'
import { notNullStringForeignKey } from '@/db/tableUtils'

const columns = {
  ...tableBase('prefix'),
  // ... existing columns ...
  pricingModelId: notNullStringForeignKey(
    'pricing_model_id',
    pricingModels
  ),
}
```

**1.2. Add `pricingModelId` to `readOnlyColumns`**
- Add `pricingModelId: true` to the `readOnlyColumns` object
- This ensures `pricingModelId` is excluded from client insert/update schemas

**Example:**
```typescript
const readOnlyColumns = {
  organizationId: true,
  livemode: true,
  pricingModelId: true, // Add this
} as const
```

**1.3. Add index on `pricingModelId`**
- Add an index on `pricingModelId` in the table's index definitions
- Use `constructIndex(TABLE_NAME, [table.pricingModelId])`

**Example:**
```typescript
export const [tableName] = pgTable(
  TABLE_NAME,
  columns,
  (table) => [
    // ... existing indexes ...
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    // ... rest of indexes ...
  ]
)
```

**1.4. Verify TypeScript types**
- Run `bun run check` to ensure types compile correctly
- The `pricingModelId` field should appear in select schemas but NOT in insert/update schemas

---

### 2. Migration SQL File (`drizzle-migrations/[timestamp]_[name].sql`)

**2.1. Add `pricing_model_id` column (nullable initially)**
```sql
ALTER TABLE [table_name] 
ADD COLUMN pricing_model_id TEXT REFERENCES pricing_models(id);
```

**2.2. Create index on `pricing_model_id`**
```sql
CREATE INDEX [table_name]_pricing_model_id_idx ON [table_name](pricing_model_id);
```

**2.3. Backfill `pricing_model_id` using derivation query**
- Write SQL to derive `pricing_model_id` from parent records
- Use the derivation path specified in `degrees-analysis.md`
- Example for subscription children:
```sql
UPDATE [table_name] 
SET pricing_model_id = (
  SELECT pricing_model_id 
  FROM subscriptions 
  WHERE subscriptions.id = [table_name].subscription_id
);
```

**2.4. Add NOT NULL constraint**
```sql
ALTER TABLE [table_name] 
ALTER COLUMN pricing_model_id SET NOT NULL;
```

**Note:** All 24 tables will have NOT NULL `pricingModelId` - no nullable tables remain.

---

### 3. Deriver Function (`src/db/tableMethods/[table]Methods.ts`)

**3.1. Create or update deriver function**
- Create a helper function to derive `pricingModelId` from parent records
- Function should accept the necessary IDs and a transaction
- Return the `pricingModelId` string

**Example patterns:**

**For subscription children:**
```typescript
const derivePricingModelIdFromSubscription = async (
  subscriptionId: string,
  transaction: Transaction
): Promise<string> => {
  const subscription = await selectSubscriptionById(subscriptionId, transaction)
  if (!subscription.pricingModelId) {
    throw new Error(`Subscription ${subscriptionId} has no pricingModelId`)
  }
  return subscription.pricingModelId
}
```

**For price-based tables:**
```typescript
const derivePricingModelIdFromPrice = async (
  priceId: string,
  transaction: Transaction
): Promise<string> => {
  const price = await selectPriceById(priceId, transaction)
  const product = await selectProductById(price.productId, transaction)
  if (!product.pricingModelId) {
    throw new Error(`Product ${product.id} has no pricingModelId`)
  }
  return product.pricingModelId
}
```

**For multi-path tables (COALESCE):**
```typescript
const derivePricingModelIdForInvoice = async (
  data: {
    subscriptionId?: string | null
    purchaseId?: string | null
    customerId: string
  },
  transaction: Transaction
): Promise<string> => {
  if (data.subscriptionId) {
    const subscription = await selectSubscriptionById(data.subscriptionId, transaction)
    if (subscription.pricingModelId) return subscription.pricingModelId
  }
  if (data.purchaseId) {
    const purchase = await selectPurchaseById(data.purchaseId, transaction)
    if (purchase.pricingModelId) return purchase.pricingModelId
  }
  const customer = await selectCustomerById(data.customerId, transaction)
  if (!customer.pricingModelId) {
    throw new Error(`Customer ${data.customerId} has no pricingModelId`)
  }
  return customer.pricingModelId
}
```

**3.2. Export the deriver function**
- Export the function so it can be used by insert methods and tests
- Consider adding JSDoc comments explaining the derivation logic

---

### 4. Insert Method Updates (`src/db/tableMethods/[table]Methods.ts`)

**4.1. Update insert method(s)**
- Modify `insert[Table]` function to derive `pricingModelId` using the deriver function
- Pass `pricingModelId` in the insert data
- Ensure `transaction` is passed as the last argument (per codebase conventions)

**Example patterns:**

**For single insert:**
```typescript
export const insertBillingPeriod = async (
  data: InsertBillingPeriodData,
  transaction: Transaction
) => {
  const pricingModelId = await derivePricingModelIdFromSubscription(
    data.subscriptionId,
    transaction
  )
  
  const insertData = {
    ...data,
    pricingModelId,
    livemode: subscription.livemode, // also derive livemode if needed
  }
  
  return await db
    .insert(billingPeriods)
    .values(insertData)
    .returning()
    .execute()
}
```

**For bulk inserts:**
```typescript
export const bulkInsertSubscriptionItems = async (
  items: InsertSubscriptionItemData[],
  transaction: Transaction
) => {
  // Derive pricingModelId for all items
  const itemsWithPricingModelId = await Promise.all(
    items.map(async (item) => {
      const pricingModelId = await derivePricingModelIdFromSubscription(
        item.subscriptionId,
        transaction
      )
      return {
        ...item,
        pricingModelId,
      }
    })
  )
  
  return await db
    .insert(subscriptionItems)
    .values(itemsWithPricingModelId)
    .returning()
    .execute()
}
```

**4.2. Update function signatures/types**
- Ensure TypeScript types reflect that `pricingModelId` is not required in input data
- Update any related type definitions

**4.3. Add error handling**
- Handle cases where parent records don't have `pricingModelId` (should not occur after migration)
- Throw descriptive errors if derivation fails

---

### 5. Seed Database Updates (`seedDatabase.ts`)

**5.1. Update `setup[Table]` function**
- Modify the setup function to derive `pricingModelId` from parent records
- Use the same deriver function pattern as insert methods
- Ensure test data has correct `pricingModelId` values

**Example:**
```typescript
export const setupBillingPeriod = async (
  args: {
    subscriptionId: string
    // ... other args
  }
) => {
  const subscription = await selectSubscriptionById(args.subscriptionId)
  if (!subscription.pricingModelId) {
    throw new Error(`Subscription ${args.subscriptionId} has no pricingModelId`)
  }
  
  return await insertBillingPeriod(
    {
      ...args,
      pricingModelId: subscription.pricingModelId,
    },
    db
  )
}
```

---

### 6. Testing

**6.1. Update existing tests**
- Ensure existing tests pass with `pricingModelId` derivation
- Tests should not need to provide `pricingModelId` in test data

**6.2. Add new tests for derivation logic**
- Test that `pricingModelId` is correctly derived from parent records
- Test error cases (parent missing `pricingModelId` - should not occur in practice)
- Test multi-path derivation (for tables with COALESCE logic)

**Example test:**
```typescript
describe('insertBillingPeriod', () => {
  it('should derive pricingModelId from subscription', async () => {
    const subscription = await setupSubscription({ /* ... */ })
    const billingPeriod = await insertBillingPeriod(
      { subscriptionId: subscription.id, /* ... */ },
      db
    )
    expect(billingPeriod.pricingModelId).toBe(subscription.pricingModelId)
  })
})
```

---

## Summary Checklist

For each table, complete all of the following:

- [ ] **Schema File** (`src/db/schema/[table].ts`)
  - [ ] Add `pricingModelId` column definition (NOT NULL)
  - [ ] Add `pricingModelId` to `readOnlyColumns`
  - [ ] Add index on `pricingModelId`
  - [ ] Verify TypeScript types compile (`bun run check`)

- [ ] **Migration SQL** (`drizzle-migrations/[timestamp]_[name].sql`)
  - [ ] Add `pricing_model_id` column (nullable initially)
  - [ ] Create index on `pricing_model_id`
  - [ ] Backfill `pricing_model_id` using derivation query
  - [ ] Add NOT NULL constraint

- [ ] **Deriver Function** (`src/db/tableMethods/[table]Methods.ts`)
  - [ ] Create deriver function for `pricingModelId`
  - [ ] Export the function
  - [ ] Add JSDoc comments

- [ ] **Insert Methods** (`src/db/tableMethods/[table]Methods.ts`)
  - [ ] Update `insert[Table]` to use deriver function
  - [ ] Update `bulkInsert[Table]` if it exists
  - [ ] Update TypeScript types/signatures
  - [ ] Add error handling

- [ ] **Seed Database** (`seedDatabase.ts`)
  - [ ] Update `setup[Table]` to derive `pricingModelId`

- [ ] **Testing**
  - [ ] Update existing tests
  - [ ] Add tests for derivation logic
  - [ ] Verify all tests pass (`bun run test`)

---

## Derivation Patterns Reference

### Pattern 1: Direct from Base Table
- **Tables:** `prices`, `productFeatures`, `usageEvents`, `usageCredits`, `ledgerAccounts`, `subscriptionMeterPeriodCalculations`
- **Derivation:** `product.pricingModelId` or `usageMeter.pricingModelId`

### Pattern 2: Single Parent (Layer 1)
- **Tables:** `subscriptions`, `purchases`, `usageCreditApplications`, `usageCreditBalanceAdjustments`
- **Derivation:** `price.pricingModelId` → `product.pricingModelId` OR `usageCredit.pricingModelId` → `usageMeter.pricingModelId`

### Pattern 3: Single Parent (Layer 2)
- **Tables:** `billingPeriods`, `billingRuns`, `subscriptionItems`, `ledgerTransactions`, `discountRedemptions`
- **Derivation:** `subscription.pricingModelId` OR `purchase.pricingModelId`

### Pattern 4: Multi-Path (COALESCE)
- **Tables:** `invoices`, `ledgerEntries`, `checkoutSessions`, `payments`, `invoiceLineItems`, `feeCalculations`
- **Derivation:** Multiple paths with priority order (see `degrees-analysis.md` for specific paths)

### Pattern 5: Grandchildren
- **Tables:** `billingPeriodItems`, `subscriptionItemFeatures`, `refunds`
- **Derivation:** `billingPeriod.pricingModelId` OR `subscriptionItem.pricingModelId` OR `payment.pricingModelId`

---

## Notes

1. **All tables have NOT NULL `pricingModelId`**: After migration, all 24 tables will have NOT NULL constraints. No nullable `pricingModelId` columns remain.

2. **Read-only field**: `pricingModelId` follows the same pattern as `livemode` - it's a read-only field set server-side. Clients cannot set it directly.

3. **Transaction handling**: Always pass `transaction` as the last argument to database methods (per codebase conventions).

4. **Error handling**: Derivation should never fail in practice after migration, but include error handling for safety.

5. **Index performance**: Indexes on `pricingModelId` are important for query performance and future data isolation features.
















