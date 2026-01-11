# Gameplan: Add pricingModelId to Tables with livemode

## Current State Analysis

Currently, `pricingModelId` exists on:
- `customers` (nullable, can be set explicitly or derived from default pricing model)
- `products` (not null, required on creation)
- `usageMeters` (not null, required on creation)
- `features` (not null, required on creation)

All other tables with `livemode` columns do not have `pricingModelId`. The goal is to add `pricingModelId` as a read-only derived field to all tables that have `livemode`, following the same pattern where `livemode` is derived from parent records.

**Key Patterns Observed:**
- `livemode` is typically passed down from parent records (e.g., `price.livemode`, `subscription.livemode`)
- `pricingModelId` can be derived through chains: `price -> product -> pricingModelId`, `subscription -> price -> product -> pricingModelId`, `purchase -> price -> product -> pricingModelId`
- Client insert/update schemas exclude `livemode` (it's in `readOnlyColumns` or `createOnlyColumns`)
- Server-side insert methods derive `livemode` from parent records or context

**Tables to Defer (Complex Cross-Sectional Concerns):**
- `apiKeys` - Needs strategy
- `discounts` - Needs strategy  
- `events` - **IMPORTANT**: This table is heavily used throughout the codebase for event tracking. It should NOT be dropped and needs a derivation strategy.
- `files` - **IMPORTANT**: This table is used for file storage and post-purchase assets. It should NOT be dropped and needs a derivation strategy.
- `links` - Drop table (confirmed unused)
- `memberships` - Needs strategy
- `messages` - Drop table (confirmed unused)
- `paymentMethods` - Needs strategy
- `properNouns` - Drop table (confirmed unused)
- `purchaseAccessSessions` - Drop table (confirmed unused)
- `webhooks` - Needs strategy

## Required Changes

### Database Schema Changes

Add `pricingModelId` column to the following tables with appropriate derivation logic:

#### Tier 1: Direct Parent Relationships (Simplest)

**1. `billingPeriods`**
- **File**: `platform/flowglad-next/src/db/schema/billingPeriods.ts`
- **Derivation**: `subscription.pricingModelId` (via `subscriptionId`)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE billing_periods SET pricing_model_id = (SELECT pricing_model_id FROM subscriptions WHERE subscriptions.id = billing_periods.subscription_id)`, then add NOT NULL constraint

**2. `billingRuns`**
- **File**: `platform/flowglad-next/src/db/schema/billingRuns.ts`
- **Derivation**: `subscription.pricingModelId` (via `subscriptionId`)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE billing_runs SET pricing_model_id = (SELECT pricing_model_id FROM subscriptions WHERE subscriptions.id = billing_runs.subscription_id)`, then add NOT NULL constraint

**3. `billingPeriodItems`**
- **File**: `platform/flowglad-next/src/db/schema/billingPeriodItems.ts`
- **Derivation**: `billingPeriod.pricingModelId` (via `billingPeriodId`) -> `subscription.pricingModelId`
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE billing_period_items SET pricing_model_id = (SELECT pricing_model_id FROM billing_periods WHERE billing_periods.id = billing_period_items.billing_period_id)`, then add NOT NULL constraint

**4. `subscriptionItems`**
- **File**: `platform/flowglad-next/src/db/schema/subscriptionItems.ts`
- **Derivation**: `subscription.pricingModelId` (via `subscriptionId`)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE subscription_items SET pricing_model_id = (SELECT pricing_model_id FROM subscriptions WHERE subscriptions.id = subscription_items.subscription_id)`, then add NOT NULL constraint

**5. `subscriptionItemFeatures`**
- **File**: `platform/flowglad-next/src/db/schema/subscriptionItemFeatures.ts`
- **Derivation**: `subscriptionItem.pricingModelId` (via `subscriptionItemId`) -> `subscription.pricingModelId`
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE subscription_item_features SET pricing_model_id = (SELECT pricing_model_id FROM subscription_items WHERE subscription_items.id = subscription_item_features.subscription_item_id)`, then add NOT NULL constraint

**6. `subscriptionMeterPeriodCalculations`**
- **File**: `platform/flowglad-next/src/db/schema/subscriptionMeterPeriodCalculations.ts`
- **Derivation**: `usageMeter.pricingModelId` (via `usageMeterId`)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE subscription_meter_period_calculations SET pricing_model_id = (SELECT pricing_model_id FROM usage_meters WHERE usage_meters.id = subscription_meter_period_calculations.usage_meter_id)`, then add NOT NULL constraint

**7. `usageEvents`**
- **File**: `platform/flowglad-next/src/db/schema/usageEvents.ts`
- **Derivation**: `usageMeter.pricingModelId` (via `usageMeterId`)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE usage_events SET pricing_model_id = (SELECT pricing_model_id FROM usage_meters WHERE usage_meters.id = usage_events.usage_meter_id)`, then add NOT NULL constraint

**8. `usageCredits`**
- **File**: `platform/flowglad-next/src/db/schema/usageCredits.ts`
- **Derivation**: `usageMeter.pricingModelId` (via `usageMeterId`)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE usage_credits SET pricing_model_id = (SELECT pricing_model_id FROM usage_meters WHERE usage_meters.id = usage_credits.usage_meter_id)`, then add NOT NULL constraint

**9. `usageCreditApplications`**
- **File**: `platform/flowglad-next/src/db/schema/usageCreditApplications.ts`
- **Derivation**: `usageCredit.pricingModelId` (via `usageCreditId`) -> `usageMeter.pricingModelId`
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE usage_credit_applications SET pricing_model_id = (SELECT pricing_model_id FROM usage_credits WHERE usage_credits.id = usage_credit_applications.usage_credit_id)`, then add NOT NULL constraint

**10. `usageCreditBalanceAdjustments`**
- **File**: `platform/flowglad-next/src/db/schema/usageCreditBalanceAdjustments.ts`
- **Derivation**: `usageCredit.pricingModelId` (via `adjustedUsageCreditId`) -> `usageMeter.pricingModelId`
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE usage_credit_balance_adjustments SET pricing_model_id = (SELECT pricing_model_id FROM usage_credits WHERE usage_credits.id = usage_credit_balance_adjustments.adjusted_usage_credit_id)`, then add NOT NULL constraint

**11. `ledgerAccounts`**
- **File**: `platform/flowglad-next/src/db/schema/ledgerAccounts.ts`
- **Derivation**: `usageMeter.pricingModelId` (via `usageMeterId`)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE ledger_accounts SET pricing_model_id = (SELECT pricing_model_id FROM usage_meters WHERE usage_meters.id = ledger_accounts.usage_meter_id)`, then add NOT NULL constraint

**12. `ledgerEntries`**
- **File**: `platform/flowglad-next/src/db/schema/ledgerEntries.ts`
- **Derivation**: `subscription.pricingModelId` (via `subscriptionId`) OR `usageMeter.pricingModelId` (via `usageMeterId`) - prefer subscription if present
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable, one of subscriptionId or usageMeterId must be present)
- **Migration**: Add column, backfill via:
```sql
UPDATE ledger_entries 
SET pricing_model_id = COALESCE(
  (SELECT pricing_model_id FROM subscriptions WHERE subscriptions.id = ledger_entries.subscription_id),
  (SELECT pricing_model_id FROM usage_meters WHERE usage_meters.id = ledger_entries.usage_meter_id)
)
```
Then add NOT NULL constraint.

**13. `ledgerTransactions`**
- **File**: `platform/flowglad-next/src/db/schema/ledgerTransactions.ts`
- **Derivation**: `subscription.pricingModelId` (via `subscriptionId`)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE ledger_transactions SET pricing_model_id = (SELECT pricing_model_id FROM subscriptions WHERE subscriptions.id = ledger_transactions.subscription_id)`, then add NOT NULL constraint

**14. `productFeatures`**
- **File**: `platform/flowglad-next/src/db/schema/productFeatures.ts`
- **Derivation**: `product.pricingModelId` (via `productId`)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE product_features SET pricing_model_id = (SELECT pricing_model_id FROM products WHERE products.id = product_features.product_id)`, then add NOT NULL constraint

#### Tier 2: Price-Based Derivation

**15. `prices`**
- **File**: `platform/flowglad-next/src/db/schema/prices.ts`
- **Derivation**: `product.pricingModelId` (via `productId`)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE prices SET pricing_model_id = (SELECT pricing_model_id FROM products WHERE products.id = prices.product_id)`, then add NOT NULL constraint
- **Note**: This is a special case - prices already have `productId`, so derivation is straightforward

**16. `purchases`**
- **File**: `platform/flowglad-next/src/db/schema/purchases.ts`
- **Derivation**: `price.pricingModelId` (via `priceId`) -> `product.pricingModelId`
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE purchases SET pricing_model_id = (SELECT pricing_model_id FROM products WHERE products.id = (SELECT product_id FROM prices WHERE prices.id = purchases.price_id))`, then add NOT NULL constraint

**17. `discountRedemptions`**
- **File**: `platform/flowglad-next/src/db/schema/discountRedemptions.ts`
- **Derivation**: `purchase.pricingModelId` (via `purchaseId`)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE discount_redemptions SET pricing_model_id = (SELECT pricing_model_id FROM purchases WHERE purchases.id = discount_redemptions.purchase_id)`, then add NOT NULL constraint

**18. `subscriptions`**
- **File**: `platform/flowglad-next/src/db/schema/subscriptions.ts`
- **Derivation**: `price.pricingModelId` (via `priceId`) -> `product.pricingModelId` (priceId is always present, no fallback needed)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable, priceId is never NULL)
- **Migration**: Add column, backfill via `UPDATE subscriptions SET pricing_model_id = (SELECT pricing_model_id FROM products WHERE products.id = (SELECT product_id FROM prices WHERE prices.id = subscriptions.price_id))`, then add NOT NULL constraint
- **Note**: Also add NOT NULL constraint to `subscriptions.price_id` column in the same migration since all subscriptions have a priceId

#### Tier 3: Complex Multi-Path Derivation

**19. `checkoutSessions`**
- **File**: `platform/flowglad-next/src/db/schema/checkoutSessions.ts`
- **Derivation**: 
  - If `priceId` is present: `price.pricingModelId` -> `product.pricingModelId`
  - Else if `purchaseId` is present: `purchase.pricingModelId`
  - Else if `invoiceId` is present: `invoice.pricingModelId`
  - Else if `type` = `AddPaymentMethod`: `customer.pricingModelId` (via `customerId`)
  - Else: NULL (should not occur in practice)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via:
```sql
UPDATE checkout_sessions 
SET pricing_model_id = COALESCE(
  (SELECT pricing_model_id FROM products WHERE products.id = (SELECT product_id FROM prices WHERE prices.id = checkout_sessions.price_id)),
  (SELECT pricing_model_id FROM purchases WHERE purchases.id = checkout_sessions.purchase_id),
  (SELECT pricing_model_id FROM invoices WHERE invoices.id = checkout_sessions.invoice_id),
  (SELECT pricing_model_id FROM customers WHERE customers.id = checkout_sessions.customer_id AND checkout_sessions.type = 'add_payment_method')
)
```
Then add NOT NULL constraint.

**20. `feeCalculations`**
- **File**: `platform/flowglad-next/src/db/schema/feeCalculations.ts`
- **Derivation**: 
  - If `billingPeriodId` is present: `billingPeriod.pricingModelId` -> `subscription.pricingModelId` (always derivable)
  - Else if `checkoutSessionId` is present: `checkoutSession.pricingModelId` (always derivable)
  - Note: All fee calculations have either `billingPeriodId` or `checkoutSessionId` (verified via data analysis)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via:
```sql
UPDATE fee_calculations 
SET pricing_model_id = COALESCE(
  (SELECT pricing_model_id FROM billing_periods WHERE billing_periods.id = fee_calculations.billing_period_id),
  (SELECT pricing_model_id FROM checkout_sessions WHERE checkout_sessions.id = fee_calculations.checkout_session_id)
)
```
Then add NOT NULL constraint.

**21. `invoices`**
- **File**: `platform/flowglad-next/src/db/schema/invoices.ts`
- **Derivation**: 
  - If `subscriptionId` is present: `subscription.pricingModelId` (always derivable)
  - Else if `purchaseId` is present: `purchase.pricingModelId` (always derivable)
  - Else: `customer.pricingModelId` (fallback - standalone invoices use customer's pricing model)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via:
```sql
UPDATE invoices 
SET pricing_model_id = COALESCE(
  (SELECT pricing_model_id FROM subscriptions WHERE subscriptions.id = invoices.subscription_id),
  (SELECT pricing_model_id FROM purchases WHERE purchases.id = invoices.purchase_id),
  (SELECT pricing_model_id FROM customers WHERE customers.id = invoices.customer_id)
)
```
Then add NOT NULL constraint.

**22. `invoiceLineItems`**
- **File**: `platform/flowglad-next/src/db/schema/invoiceLineItems.ts`
- **Derivation**: `invoice.pricingModelId` (via `invoiceId`) OR `price.pricingModelId` (via `priceId` if invoice is NULL)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable, invoices always have pricingModelId)
- **Migration**: Add column, backfill via:
```sql
UPDATE invoice_line_items 
SET pricing_model_id = COALESCE(
  (SELECT pricing_model_id FROM invoices WHERE invoices.id = invoice_line_items.invoice_id),
  (SELECT pricing_model_id FROM products WHERE products.id = (SELECT product_id FROM prices WHERE prices.id = invoice_line_items.price_id))
)
```
Then add NOT NULL constraint.

**23. `payments`**
- **File**: `platform/flowglad-next/src/db/schema/payments.ts`
- **Derivation**: 
  - If `subscriptionId` is present: `subscription.pricingModelId` (always derivable)
  - Else if `purchaseId` is present: `purchase.pricingModelId` (always derivable)
  - Else if `invoiceId` is present: `invoice.pricingModelId` (always derivable - invoices always have pricingModelId)
  - Note: All payments have at least one of subscriptionId, purchaseId, or invoiceId (verified via data analysis)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via:
```sql
UPDATE payments 
SET pricing_model_id = COALESCE(
  (SELECT pricing_model_id FROM subscriptions WHERE subscriptions.id = payments.subscription_id),
  (SELECT pricing_model_id FROM purchases WHERE purchases.id = payments.purchase_id),
  (SELECT pricing_model_id FROM invoices WHERE invoices.id = payments.invoice_id)
)
```
Then add NOT NULL constraint.

**24. `refunds`**
- **File**: `platform/flowglad-next/src/db/schema/refunds.ts`
- **Derivation**: `payment.pricingModelId` (via `paymentId`) (always derivable - payments always have pricingModelId)
- **Column**: `notNullStringForeignKey('pricing_model_id', pricingModels)` (NOT NULL - always derivable)
- **Migration**: Add column, backfill via `UPDATE refunds SET pricing_model_id = (SELECT pricing_model_id FROM payments WHERE payments.id = refunds.payment_id)`, then add NOT NULL constraint

### Schema File Updates

For each table above, update the schema file to:
1. Add `pricingModelId` column definition
2. Add `pricingModelId` to `readOnlyColumns` (similar to `livemode`)
3. Update client schemas to exclude `pricingModelId` from inserts/updates
4. Add index on `pricingModelId` for query performance

Example pattern for NOT NULL tables:
```typescript
const columns = {
  ...tableBase('prefix'),
  // ... existing columns ...
  pricingModelId: notNullStringForeignKey(
    'pricing_model_id',
    pricingModels
  ),
}

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
  pricingModelId: true, // Add this
} as const
```

Example pattern for nullable tables:
```typescript
const columns = {
  ...tableBase('prefix'),
  // ... existing columns ...
  pricingModelId: nullableStringForeignKey(
    'pricing_model_id',
    pricingModels
  ),
}

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
  pricingModelId: true, // Add this
} as const
```

### Insert Method Updates

For each table's insert method, derive `pricingModelId` from the parent record:

**Pattern for subscription children:**
```typescript
const subscription = await selectSubscriptionById(subscriptionId, transaction)
const insertData = {
  ...otherFields,
  pricingModelId: subscription.pricingModelId,
  livemode: subscription.livemode,
}
```

**Pattern for price-based inserts:**
```typescript
const price = await selectPriceById(priceId, transaction)
const product = await selectProductById(price.productId, transaction)
const insertData = {
  ...otherFields,
  pricingModelId: product.pricingModelId,
  livemode: price.livemode,
}
```

**Files to update:**
- `platform/flowglad-next/src/db/tableMethods/billingPeriodMethods.ts` - `insertBillingPeriod`
- `platform/flowglad-next/src/db/tableMethods/billingRunMethods.ts` - `safelyInsertBillingRun`
- `platform/flowglad-next/src/db/tableMethods/billingPeriodItemMethods.ts` - `insertBillingPeriodItem`
- `platform/flowglad-next/src/db/tableMethods/subscriptionItemMethods.ts` - `insertSubscriptionItem`, `bulkInsertSubscriptionItems`
- `platform/flowglad-next/src/db/tableMethods/subscriptionItemFeatureMethods.ts` - `insertSubscriptionItemFeature`
- `platform/flowglad-next/src/db/tableMethods/invoiceMethods.ts` - `insertInvoice`
- `platform/flowglad-next/src/db/tableMethods/invoiceLineItemMethods.ts` - `insertInvoiceLineItem`
- `platform/flowglad-next/src/db/tableMethods/paymentMethods.ts` - `insertPayment`
- `platform/flowglad-next/src/db/tableMethods/purchaseMethods.ts` - `insertPurchase`
- `platform/flowglad-next/src/db/tableMethods/checkoutSessionMethods.ts` - `insertCheckoutSession`
- `platform/flowglad-next/src/db/tableMethods/feeCalculationMethods.ts` - `insertFeeCalculation`
- `platform/flowglad-next/src/db/tableMethods/discountRedemptionMethods.ts` - `insertDiscountRedemption`
- `platform/flowglad-next/src/db/tableMethods/refundMethods.ts` - `insertRefund`
- `platform/flowglad-next/src/db/tableMethods/ledgerAccountMethods.ts` - `insertLedgerAccount`
- `platform/flowglad-next/src/db/tableMethods/ledgerEntryMethods.ts` - `insertLedgerEntry`, `bulkInsertLedgerEntries`
- `platform/flowglad-next/src/db/tableMethods/ledgerTransactionMethods.ts` - `insertLedgerTransaction`
- `platform/flowglad-next/src/db/tableMethods/usageEventMethods.ts` - `insertUsageEvent`, `bulkInsertUsageEvents`
- `platform/flowglad-next/src/db/tableMethods/usageCreditMethods.ts` - `insertUsageCredit`
- `platform/flowglad-next/src/db/tableMethods/usageCreditApplicationMethods.ts` - `insertUsageCreditApplication`
- `platform/flowglad-next/src/db/tableMethods/subscriptionMeterPeriodCalculationMethods.ts` - `insertSubscriptionMeterPeriodCalculation`
- `platform/flowglad-next/src/db/tableMethods/subscriptionMethods.ts` - `insertSubscription`
- `platform/flowglad-next/src/db/tableMethods/priceMethods.ts` - `insertPrice`, `bulkInsertPrices`
- `platform/flowglad-next/src/db/tableMethods/productFeatureMethods.ts` - `insertProductFeature`

### Seed Database Updates

Update `platform/flowglad-next/seedDatabase.ts` to include `pricingModelId` in all setup functions:

- `setupBillingPeriod` - derive from subscription
- `setupBillingRun` - derive from subscription
- `setupBillingPeriodItem` - derive from billingPeriod -> subscription
- `setupSubscription` - derive from price -> product OR customer
- `setupSubscriptionItem` - derive from subscription
- `setupPurchase` - derive from price -> product
- `setupInvoice` - derive from subscription/purchase/customer
- `setupPayment` - derive from subscription/purchase/invoice/customer
- `setupCheckoutSession` - derive from price/purchase
- `setupFeeCalculation` - derive from billingPeriod/price/checkoutSession
- `setupDiscountRedemption` - derive from purchase
- `setupRefund` - derive from payment
- `setupLedgerAccount` - derive from usageMeter
- `setupLedgerEntry` - derive from subscription/usageMeter
- `setupLedgerTransaction` - derive from subscription
- `setupUsageEvent` - derive from usageMeter
- `setupUsageCredit` - derive from usageMeter
- `setupUsageCreditApplication` - derive from usageCredit -> usageMeter
- `setupUsageCreditBalanceAdjustment` - derive from usageCredit -> usageMeter
- `setupSubscriptionMeterPeriodCalculation` - derive from usageMeter
- `setupProductFeature` - derive from product

### Migration Strategy

Create a single migration that:
1. Adds `pricingModelId` column to all 24 tables (nullable initially)
2. Backfills `pricingModelId` using the SQL queries specified above
3. Adds indexes on `pricingModelId` for each table
4. Adds NOT NULL constraint for tables where `pricingModelId` is always derivable (24 tables: billingPeriods, billingRuns, billingPeriodItems, subscriptionItems, subscriptionItemFeatures, subscriptionMeterPeriodCalculations, usageEvents, usageCredits, usageCreditApplications, usageCreditBalanceAdjustments, ledgerAccounts, ledgerEntries, ledgerTransactions, productFeatures, prices, purchases, discountRedemptions, subscriptions, checkoutSessions, invoices, invoiceLineItems, payments, refunds, feeCalculations)
5. Adds NOT NULL constraint to `subscriptions.price_id` column (all subscriptions have a priceId)
6. All 24 tables have NOT NULL `pricingModelId` - no nullable tables remain

**Migration file**: `platform/flowglad-next/drizzle-migrations/[timestamp]_add_pricing_model_id_to_tables.sql`

## Acceptance Criteria

- [ ] All 24 tables have `pricingModelId` column added to schema definitions
- [ ] All 24 tables have `pricingModelId` as NOT NULL (always derivable)
- [ ] `subscriptions.price_id` has NOT NULL constraint added
- [ ] All 24 tables have `pricingModelId` in `readOnlyColumns` for client schemas
- [ ] All insert methods derive `pricingModelId` from parent records
- [ ] Migration successfully backfills `pricingModelId` for all existing records
- [ ] NOT NULL constraints are added for all 24 tables after successful backfill
- [ ] All seedDatabase setup functions include `pricingModelId` derivation
- [ ] Indexes are created on `pricingModelId` for query performance
- [ ] TypeScript types are updated and compile without errors
- [ ] All existing tests pass
- [ ] New tests verify `pricingModelId` derivation logic
- [ ] New tests verify NOT NULL constraints prevent invalid inserts

## Open Questions

**None** - All tables have been analyzed and can derive `pricingModelId` deterministically. All 24 tables will have NOT NULL `pricingModelId` constraints.

## Explicit Opinions

1. **Read-only field pattern**: `pricingModelId` should follow the same pattern as `livemode` - it's a read-only field that gets set server-side based on parent relationships. Clients should never be able to set it directly.

2. **Single migration approach**: All 24 tables can be updated in a single migration because:
   - The changes are additive (adding columns, not modifying existing ones)
   - Backfill queries are independent and can run in parallel
   - No breaking changes to existing functionality

3. **Derivation in application code**: We derive `pricingModelId` in insert methods rather than using database triggers because:
   - More explicit and testable
   - Easier to debug and maintain
   - Consistent with how `livemode` is currently handled

4. **NOT NULL where possible**: For tables where `pricingModelId` can always be derived (e.g., `billingPeriods`, `purchases`, `usageEvents`, `subscriptions`), we should add NOT NULL constraints immediately after backfill. This provides stronger data integrity guarantees and prevents orphaned records.

5. **Subscriptions always have priceId**: All subscriptions have a `priceId` (never NULL), so `subscriptions.pricingModelId` can always be derived via `price -> product -> pricingModelId`. This means subscriptions and all their direct children (billingPeriods, billingRuns, subscriptionItems, etc.) can have NOT NULL `pricingModelId`.

6. **CheckoutSessions always have pricingModelId**: All checkout sessions can derive `pricingModelId`:
   - Product/Purchase sessions: via `priceId` or `purchaseId`
   - Invoice sessions: via `invoiceId` -> `invoice.pricingModelId`
   - AddPaymentMethod sessions: via `customerId` -> `customer.pricingModelId`
   This means `checkoutSessions.pricingModelId` can be NOT NULL.

7. **Invoices always have pricingModelId**: All invoices can derive `pricingModelId`:
   - Subscription invoices: via `subscriptionId` -> `subscription.pricingModelId`
   - Purchase invoices: via `purchaseId` -> `purchase.pricingModelId`
   - Standalone invoices: via `customerId` -> `customer.pricingModelId` (standalone invoices are rare and use customer's pricing model)
   This means `invoices.pricingModelId` and `invoiceLineItems.pricingModelId` can be NOT NULL.

8. **Payments always have pricingModelId**: All payments have at least one of `subscriptionId`, `purchaseId`, or `invoiceId` (verified via data analysis). This means `payments.pricingModelId` can be NOT NULL, and therefore `refunds.pricingModelId` can also be NOT NULL since refunds derive from payments.

9. **FeeCalculations always have pricingModelId**: All fee calculations have either `billingPeriodId` or `checkoutSessionId` (verified via data analysis). This means `feeCalculations.pricingModelId` can be NOT NULL.

6. **Nullable only when necessary**: Tables that may legitimately have NULL `pricingModelId` (e.g., standalone invoices with customers that have NULL pricingModelId) should remain nullable. We should identify these cases explicitly and document them.

7. **Priority order for multi-parent tables**: For tables with multiple possible parents, use priority order: `subscriptionId` > `purchaseId` or `priceId` > `customerId`. This matches business logic where subscription-related records are most common. Since subscriptions always have `priceId`, subscription-derived `pricingModelId` is always available.

8. **Index on pricingModelId**: Add indexes on `pricingModelId` for all tables to support efficient queries filtering by pricing model (which will be needed for data isolation in future gameplans).

9. **Defer complex tables**: Tables like `events`, `files`, `apiKeys`, `discounts`, `memberships`, `paymentMethods`, and `webhooks` have complex cross-sectional concerns and should be handled in separate gameplans. This allows us to focus on the core billing/subscription data model first.

## PRs

**Structure:** Each PR corresponds to one wave (layer) from `degrees-analysis.md`. Each wave completes all 8 steps from `table-pricing-model-id-checklist.md` for all tables in that wave before proceeding to the next wave.

**The 8 Steps (from `table-pricing-model-id-checklist.md`):**
1. **Schema File Update** - Add column definition, readOnlyColumns, index
2. **Migration SQL** - Add nullable column, backfill, add NOT NULL constraint
3. **Deriver Function** - Create helper function to derive pricingModelId
4. **Insert Method Updates** - Update insert methods to use deriver
5. **Seed Database Updates** - Update setup functions
6. **Testing** - Update existing tests and add new derivation tests
7. **Index Creation** - (Included in step 1)
8. **Type Verification** - Ensure TypeScript compiles (`bun run check`)

---

### PR 1: Wave 1 (Layer 1) - Direct Dependencies from Base

**Tables:** `prices`, `productFeatures`, `usageEvents`, `usageCredits`, `ledgerAccounts`, `subscriptionMeterPeriodCalculations`

**Dependencies:** Layer 0 (products, usageMeters already have pricingModelId)

**For each table, complete all 8 steps:**

#### Step 1: Schema File Updates
**Files:**
- `platform/flowglad-next/src/db/schema/prices.ts`
- `platform/flowglad-next/src/db/schema/productFeatures.ts`
- `platform/flowglad-next/src/db/schema/usageEvents.ts`
- `platform/flowglad-next/src/db/schema/usageCredits.ts`
- `platform/flowglad-next/src/db/schema/ledgerAccounts.ts`
- `platform/flowglad-next/src/db/schema/subscriptionMeterPeriodCalculations.ts`

**Changes:**
- Add `pricingModelId: notNullStringForeignKey('pricing_model_id', pricingModels)` to columns
- Add `pricingModelId: true` to `readOnlyColumns`
- Add index: `constructIndex(TABLE_NAME, [table.pricingModelId])`
- Verify types compile (`bun run check`)

#### Step 2: Migration SQL
**File:** `platform/flowglad-next/drizzle-migrations/[timestamp]_wave1_add_pricing_model_id.sql`

**For each table:**
```sql
-- Add nullable column
ALTER TABLE [table_name] ADD COLUMN pricing_model_id TEXT REFERENCES pricing_models(id);

-- Create index
CREATE INDEX [table_name]_pricing_model_id_idx ON [table_name](pricing_model_id);

-- Backfill (example for prices)
UPDATE prices SET pricing_model_id = (SELECT pricing_model_id FROM products WHERE products.id = prices.product_id);

-- Add NOT NULL constraint
ALTER TABLE [table_name] ALTER COLUMN pricing_model_id SET NOT NULL;
```

**Backfill queries:**
- `prices`: `UPDATE prices SET pricing_model_id = (SELECT pricing_model_id FROM products WHERE products.id = prices.product_id)`
- `productFeatures`: `UPDATE product_features SET pricing_model_id = (SELECT pricing_model_id FROM products WHERE products.id = product_features.product_id)`
- `usageEvents`: `UPDATE usage_events SET pricing_model_id = (SELECT pricing_model_id FROM usage_meters WHERE usage_meters.id = usage_events.usage_meter_id)`
- `usageCredits`: `UPDATE usage_credits SET pricing_model_id = (SELECT pricing_model_id FROM usage_meters WHERE usage_meters.id = usage_credits.usage_meter_id)`
- `ledgerAccounts`: `UPDATE ledger_accounts SET pricing_model_id = (SELECT pricing_model_id FROM usage_meters WHERE usage_meters.id = ledger_accounts.usage_meter_id)`
- `subscriptionMeterPeriodCalculations`: `UPDATE subscription_meter_period_calculations SET pricing_model_id = (SELECT pricing_model_id FROM usage_meters WHERE usage_meters.id = subscription_meter_period_calculations.usage_meter_id)`

#### Step 3: Deriver Functions
**Files:**
- `platform/flowglad-next/src/db/tableMethods/priceMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/productFeatureMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/usageEventMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/usageCreditMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/ledgerAccountMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/subscriptionMeterPeriodCalculationMethods.ts`

**Create deriver functions:**
- `derivePricingModelIdFromProduct(productId, transaction)` - for prices, productFeatures
- `derivePricingModelIdFromUsageMeter(usageMeterId, transaction)` - for usageEvents, usageCredits, ledgerAccounts, subscriptionMeterPeriodCalculations

#### Step 4: Insert Method Updates
**Files:** Same as Step 3

**Update insert methods:**
- `insertPrice` - use `derivePricingModelIdFromProduct`
- `bulkInsertPrices` - use `derivePricingModelIdFromProduct` for each price
- `insertProductFeature` - use `derivePricingModelIdFromProduct`
- `insertUsageEvent` - use `derivePricingModelIdFromUsageMeter`
- `bulkInsertUsageEvents` - use `derivePricingModelIdFromUsageMeter` for each event
- `insertUsageCredit` - use `derivePricingModelIdFromUsageMeter`
- `insertLedgerAccount` - use `derivePricingModelIdFromUsageMeter`
- `insertSubscriptionMeterPeriodCalculation` - use `derivePricingModelIdFromUsageMeter`

#### Step 5: Seed Database Updates
**File:** `platform/flowglad-next/seedDatabase.ts`

**Update setup functions:**
- `setupPrice` - derive from product
- `setupProductFeature` - derive from product
- `setupUsageEvent` - derive from usageMeter
- `setupUsageCredit` - derive from usageMeter
- `setupLedgerAccount` - derive from usageMeter
- `setupSubscriptionMeterPeriodCalculation` - derive from usageMeter

#### Step 6: Testing
**Files:** Test files for each table method

**Add tests:**
- Verify `pricingModelId` is correctly derived from parent records
- Verify `pricingModelId` appears in select schemas but not insert schemas
- Verify error handling when parent missing `pricingModelId` (should not occur)

---

### PR 2: Wave 2 (Layer 2) - Dependencies from Layer 1

**Tables:** `subscriptions`, `purchases`, `usageCreditApplications`, `usageCreditBalanceAdjustments`

**Dependencies:** Wave 1 complete (Layer 1 complete)

**For each table, complete all 8 steps:**

#### Step 1: Schema File Updates
**Files:**
- `platform/flowglad-next/src/db/schema/subscriptions.ts`
- `platform/flowglad-next/src/db/schema/purchases.ts`
- `platform/flowglad-next/src/db/schema/usageCreditApplications.ts`
- `platform/flowglad-next/src/db/schema/usageCreditBalanceAdjustments.ts`

**Changes:** Same as Wave 1 Step 1

#### Step 2: Migration SQL
**File:** `platform/flowglad-next/drizzle-migrations/[timestamp]_wave2_add_pricing_model_id.sql`

**Backfill queries:**
- `subscriptions`: `UPDATE subscriptions SET pricing_model_id = (SELECT pricing_model_id FROM products WHERE products.id = (SELECT product_id FROM prices WHERE prices.id = subscriptions.price_id))`
- `purchases`: `UPDATE purchases SET pricing_model_id = (SELECT pricing_model_id FROM products WHERE products.id = (SELECT product_id FROM prices WHERE prices.id = purchases.price_id))`
- `usageCreditApplications`: `UPDATE usage_credit_applications SET pricing_model_id = (SELECT pricing_model_id FROM usage_credits WHERE usage_credits.id = usage_credit_applications.usage_credit_id)`
- `usageCreditBalanceAdjustments`: `UPDATE usage_credit_balance_adjustments SET pricing_model_id = (SELECT pricing_model_id FROM usage_credits WHERE usage_credits.id = usage_credit_balance_adjustments.adjusted_usage_credit_id)`

#### Step 3: Deriver Functions
**Files:**
- `platform/flowglad-next/src/db/tableMethods/subscriptionMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/purchaseMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/usageCreditApplicationMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/usageCreditBalanceAdjustmentMethods.ts`

**Create deriver functions:**
- `derivePricingModelIdFromPrice(priceId, transaction)` - for subscriptions, purchases
- `derivePricingModelIdFromUsageCredit(usageCreditId, transaction)` - for usageCreditApplications, usageCreditBalanceAdjustments

#### Step 4: Insert Method Updates
**Files:** Same as Step 3

**Update insert methods:**
- `insertSubscription` - use `derivePricingModelIdFromPrice`
- `insertPurchase` - use `derivePricingModelIdFromPrice`
- `insertUsageCreditApplication` - use `derivePricingModelIdFromUsageCredit`
- `insertUsageCreditBalanceAdjustment` - use `derivePricingModelIdFromUsageCredit`

#### Step 5: Seed Database Updates
**File:** `platform/flowglad-next/seedDatabase.ts`

**Update setup functions:**
- `setupSubscription` - derive from price → product
- `setupPurchase` - derive from price → product
- `setupUsageCreditApplication` - derive from usageCredit → usageMeter
- `setupUsageCreditBalanceAdjustment` - derive from usageCredit → usageMeter

#### Step 6: Testing
**Add tests:** Same pattern as Wave 1 Step 6

---

### PR 3: Wave 3 (Layer 3) - Dependencies from Layer 2

**Tables:** `billingPeriods`, `billingRuns`, `subscriptionItems`, `ledgerTransactions`, `discountRedemptions`, `invoices`, `ledgerEntries`

**Dependencies:** Wave 2 complete (Layer 2 complete)

**For each table, complete all 8 steps:**

#### Step 1: Schema File Updates
**Files:**
- `platform/flowglad-next/src/db/schema/billingPeriods.ts`
- `platform/flowglad-next/src/db/schema/billingRuns.ts`
- `platform/flowglad-next/src/db/schema/subscriptionItems.ts`
- `platform/flowglad-next/src/db/schema/ledgerTransactions.ts`
- `platform/flowglad-next/src/db/schema/discountRedemptions.ts`
- `platform/flowglad-next/src/db/schema/invoices.ts`
- `platform/flowglad-next/src/db/schema/ledgerEntries.ts`

**Changes:** Same as Wave 1 Step 1

#### Step 2: Migration SQL
**File:** `platform/flowglad-next/drizzle-migrations/[timestamp]_wave3_add_pricing_model_id.sql`

**Backfill queries:**
- `billingPeriods`: `UPDATE billing_periods SET pricing_model_id = (SELECT pricing_model_id FROM subscriptions WHERE subscriptions.id = billing_periods.subscription_id)`
- `billingRuns`: `UPDATE billing_runs SET pricing_model_id = (SELECT pricing_model_id FROM subscriptions WHERE subscriptions.id = billing_runs.subscription_id)`
- `subscriptionItems`: `UPDATE subscription_items SET pricing_model_id = (SELECT pricing_model_id FROM subscriptions WHERE subscriptions.id = subscription_items.subscription_id)`
- `ledgerTransactions`: `UPDATE ledger_transactions SET pricing_model_id = (SELECT pricing_model_id FROM subscriptions WHERE subscriptions.id = ledger_transactions.subscription_id)`
- `discountRedemptions`: `UPDATE discount_redemptions SET pricing_model_id = (SELECT pricing_model_id FROM purchases WHERE purchases.id = discount_redemptions.purchase_id)`
- `invoices`: `UPDATE invoices SET pricing_model_id = COALESCE((SELECT pricing_model_id FROM subscriptions WHERE subscriptions.id = invoices.subscription_id), (SELECT pricing_model_id FROM purchases WHERE purchases.id = invoices.purchase_id), (SELECT pricing_model_id FROM customers WHERE customers.id = invoices.customer_id))`
- `ledgerEntries`: `UPDATE ledger_entries SET pricing_model_id = COALESCE((SELECT pricing_model_id FROM subscriptions WHERE subscriptions.id = ledger_entries.subscription_id), (SELECT pricing_model_id FROM usage_meters WHERE usage_meters.id = ledger_entries.usage_meter_id))`

#### Step 3: Deriver Functions
**Files:**
- `platform/flowglad-next/src/db/tableMethods/billingPeriodMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/billingRunMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/subscriptionItemMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/ledgerTransactionMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/discountRedemptionMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/invoiceMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/ledgerEntryMethods.ts`

**Create deriver functions:**
- `derivePricingModelIdFromSubscription(subscriptionId, transaction)` - for billingPeriods, billingRuns, subscriptionItems, ledgerTransactions
- `derivePricingModelIdFromPurchase(purchaseId, transaction)` - for discountRedemptions
- `derivePricingModelIdForInvoice(data: {subscriptionId?, purchaseId?, customerId}, transaction)` - COALESCE logic for invoices
- `derivePricingModelIdForLedgerEntry(data: {subscriptionId?, usageMeterId}, transaction)` - COALESCE logic for ledgerEntries

#### Step 4: Insert Method Updates
**Files:** Same as Step 3

**Update insert methods:**
- `insertBillingPeriod` - use `derivePricingModelIdFromSubscription`
- `safelyInsertBillingRun` - use `derivePricingModelIdFromSubscription`
- `insertSubscriptionItem` - use `derivePricingModelIdFromSubscription`
- `bulkInsertSubscriptionItems` - use `derivePricingModelIdFromSubscription` for each item
- `insertLedgerTransaction` - use `derivePricingModelIdFromSubscription`
- `insertDiscountRedemption` - use `derivePricingModelIdFromPurchase`
- `insertInvoice` - use `derivePricingModelIdForInvoice`
- `insertLedgerEntry` - use `derivePricingModelIdForLedgerEntry`
- `bulkInsertLedgerEntries` - use `derivePricingModelIdForLedgerEntry` for each entry

#### Step 5: Seed Database Updates
**File:** `platform/flowglad-next/seedDatabase.ts`

**Update setup functions:**
- `setupBillingPeriod` - derive from subscription
- `setupBillingRun` - derive from subscription
- `setupSubscriptionItem` - derive from subscription
- `setupLedgerTransaction` - derive from subscription
- `setupDiscountRedemption` - derive from purchase
- `setupInvoice` - derive from subscription/purchase/customer
- `setupLedgerEntry` - derive from subscription/usageMeter

#### Step 6: Testing
**Add tests:** Include tests for multi-path derivation (invoices, ledgerEntries)

---

### PR 4: Wave 4 (Layer 4) - Dependencies from Layer 3

**Tables:** `invoiceLineItems`, `payments`, `billingPeriodItems`, `subscriptionItemFeatures`

**Dependencies:** Wave 3 complete (Layer 3 complete)

**For each table, complete all 8 steps:**

#### Step 1: Schema File Updates
**Files:**
- `platform/flowglad-next/src/db/schema/invoiceLineItems.ts`
- `platform/flowglad-next/src/db/schema/payments.ts`
- `platform/flowglad-next/src/db/schema/billingPeriodItems.ts`
- `platform/flowglad-next/src/db/schema/subscriptionItemFeatures.ts`

**Changes:** Same as Wave 1 Step 1

#### Step 2: Migration SQL
**File:** `platform/flowglad-next/drizzle-migrations/[timestamp]_wave4_add_pricing_model_id.sql`

**Backfill queries:**
- `invoiceLineItems`: `UPDATE invoice_line_items SET pricing_model_id = COALESCE((SELECT pricing_model_id FROM invoices WHERE invoices.id = invoice_line_items.invoice_id), (SELECT pricing_model_id FROM products WHERE products.id = (SELECT product_id FROM prices WHERE prices.id = invoice_line_items.price_id)))`
- `payments`: `UPDATE payments SET pricing_model_id = COALESCE((SELECT pricing_model_id FROM subscriptions WHERE subscriptions.id = payments.subscription_id), (SELECT pricing_model_id FROM purchases WHERE purchases.id = payments.purchase_id), (SELECT pricing_model_id FROM invoices WHERE invoices.id = payments.invoice_id))`
- `billingPeriodItems`: `UPDATE billing_period_items SET pricing_model_id = (SELECT pricing_model_id FROM billing_periods WHERE billing_periods.id = billing_period_items.billing_period_id)`
- `subscriptionItemFeatures`: `UPDATE subscription_item_features SET pricing_model_id = (SELECT pricing_model_id FROM subscription_items WHERE subscription_items.id = subscription_item_features.subscription_item_id)`

#### Step 3: Deriver Functions
**Files:**
- `platform/flowglad-next/src/db/tableMethods/invoiceLineItemMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/paymentMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/billingPeriodItemMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/subscriptionItemFeatureMethods.ts`

**Create deriver functions:**
- `derivePricingModelIdForInvoiceLineItem(data: {invoiceId?, priceId}, transaction)` - COALESCE logic
- `derivePricingModelIdForPayment(data: {subscriptionId?, purchaseId?, invoiceId}, transaction)` - COALESCE logic
- `derivePricingModelIdFromBillingPeriod(billingPeriodId, transaction)` - for billingPeriodItems
- `derivePricingModelIdFromSubscriptionItem(subscriptionItemId, transaction)` - for subscriptionItemFeatures

#### Step 4: Insert Method Updates
**Files:** Same as Step 3

**Update insert methods:**
- `insertInvoiceLineItem` - use `derivePricingModelIdForInvoiceLineItem`
- `insertPayment` - use `derivePricingModelIdForPayment`
- `insertBillingPeriodItem` - use `derivePricingModelIdFromBillingPeriod`
- `insertSubscriptionItemFeature` - use `derivePricingModelIdFromSubscriptionItem`

#### Step 5: Seed Database Updates
**File:** `platform/flowglad-next/seedDatabase.ts`

**Update setup functions:**
- `setupInvoiceLineItem` - derive from invoice/price
- `setupPayment` - derive from subscription/purchase/invoice
- `setupBillingPeriodItem` - derive from billingPeriod → subscription
- `setupSubscriptionItemFeature` - derive from subscriptionItem → subscription

#### Step 6: Testing
**Add tests:** Include tests for multi-path derivation (invoiceLineItems, payments)

---

### PR 5: Wave 5 (Layer 5) - Dependencies from Layer 4

**Tables:** `checkoutSessions`, `refunds`

**Dependencies:** Wave 4 complete (Layer 4 complete)

**For each table, complete all 8 steps:**

#### Step 1: Schema File Updates
**Files:**
- `platform/flowglad-next/src/db/schema/checkoutSessions.ts`
- `platform/flowglad-next/src/db/schema/refunds.ts`

**Changes:** Same as Wave 1 Step 1

#### Step 2: Migration SQL
**File:** `platform/flowglad-next/drizzle-migrations/[timestamp]_wave5_add_pricing_model_id.sql`

**Backfill queries:**
- `checkoutSessions`: `UPDATE checkout_sessions SET pricing_model_id = COALESCE((SELECT pricing_model_id FROM products WHERE products.id = (SELECT product_id FROM prices WHERE prices.id = checkout_sessions.price_id)), (SELECT pricing_model_id FROM purchases WHERE purchases.id = checkout_sessions.purchase_id), (SELECT pricing_model_id FROM invoices WHERE invoices.id = checkout_sessions.invoice_id), (SELECT pricing_model_id FROM customers WHERE customers.id = checkout_sessions.customer_id AND checkout_sessions.type = 'add_payment_method'))`
- `refunds`: `UPDATE refunds SET pricing_model_id = (SELECT pricing_model_id FROM payments WHERE payments.id = refunds.payment_id)`

#### Step 3: Deriver Functions
**Files:**
- `platform/flowglad-next/src/db/tableMethods/checkoutSessionMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/refundMethods.ts`

**Create deriver functions:**
- `derivePricingModelIdForCheckoutSession(data: {priceId?, purchaseId?, invoiceId?, customerId?, type}, transaction)` - Complex COALESCE logic
- `derivePricingModelIdFromPayment(paymentId, transaction)` - for refunds

#### Step 4: Insert Method Updates
**Files:** Same as Step 3

**Update insert methods:**
- `insertCheckoutSession` - use `derivePricingModelIdForCheckoutSession`
- `insertRefund` - use `derivePricingModelIdFromPayment`

#### Step 5: Seed Database Updates
**File:** `platform/flowglad-next/seedDatabase.ts`

**Update setup functions:**
- `setupCheckoutSession` - derive from price/purchase/invoice/customer
- `setupRefund` - derive from payment

#### Step 6: Testing
**Add tests:** Include tests for complex multi-path derivation (checkoutSessions)

---

### PR 6: Wave 6 (Layer 6) - Dependencies from Layer 5

**Tables:** `feeCalculations`

**Dependencies:** Wave 5 complete (Layer 5 complete)

**For each table, complete all 8 steps:**

#### Step 1: Schema File Updates
**Files:**
- `platform/flowglad-next/src/db/schema/feeCalculations.ts`

**Changes:** Same as Wave 1 Step 1

#### Step 2: Migration SQL
**File:** `platform/flowglad-next/drizzle-migrations/[timestamp]_wave6_add_pricing_model_id.sql`

**Backfill query:**
- `feeCalculations`: `UPDATE fee_calculations SET pricing_model_id = COALESCE((SELECT pricing_model_id FROM billing_periods WHERE billing_periods.id = fee_calculations.billing_period_id), (SELECT pricing_model_id FROM checkout_sessions WHERE checkout_sessions.id = fee_calculations.checkout_session_id))`

#### Step 3: Deriver Functions
**Files:**
- `platform/flowglad-next/src/db/tableMethods/feeCalculationMethods.ts`

**Create deriver function:**
- `derivePricingModelIdForFeeCalculation(data: {billingPeriodId?, checkoutSessionId}, transaction)` - COALESCE logic

#### Step 4: Insert Method Updates
**Files:** Same as Step 3

**Update insert method:**
- `insertFeeCalculation` - use `derivePricingModelIdForFeeCalculation`

#### Step 5: Seed Database Updates
**File:** `platform/flowglad-next/seedDatabase.ts`

**Update setup function:**
- `setupFeeCalculation` - derive from billingPeriod/checkoutSession

#### Step 6: Testing
**Add tests:** Include tests for multi-path derivation (feeCalculations)

---

## PR Dependency Graph

```
PR 1 (Wave 1) 
  └─> PR 2 (Wave 2)
      └─> PR 3 (Wave 3)
          └─> PR 4 (Wave 4)
              └─> PR 5 (Wave 5)
                  └─> PR 6 (Wave 6)
```

**Sequential execution:** Each PR must complete before the next can begin. All 8 steps must be completed for all tables in a wave before proceeding to the next wave.

---

## Additional Migration: subscriptions.price_id NOT NULL

**Note:** As part of Wave 2 (PR 2), also add NOT NULL constraint to `subscriptions.price_id` since all subscriptions have a priceId:

```sql
ALTER TABLE subscriptions ALTER COLUMN price_id SET NOT NULL;
```

**Files:**
- `platform/flowglad-next/src/db/schema/billingPeriods.ts`
- `platform/flowglad-next/src/db/schema/billingRuns.ts`
- `platform/flowglad-next/src/db/schema/billingPeriodItems.ts`
- `platform/flowglad-next/src/db/schema/subscriptionItems.ts`
- `platform/flowglad-next/src/db/schema/subscriptionItemFeatures.ts`
- `platform/flowglad-next/src/db/schema/subscriptionMeterPeriodCalculations.ts`
- `platform/flowglad-next/src/db/schema/usageEvents.ts`
- `platform/flowglad-next/src/db/schema/usageCredits.ts`
- `platform/flowglad-next/src/db/schema/usageCreditApplications.ts`
- `platform/flowglad-next/src/db/schema/usageCreditBalanceAdjustments.ts`
- `platform/flowglad-next/src/db/schema/ledgerAccounts.ts`
- `platform/flowglad-next/src/db/schema/ledgerEntries.ts`
- `platform/flowglad-next/src/db/schema/ledgerTransactions.ts`
- `platform/flowglad-next/src/db/schema/productFeatures.ts`

**Changes:**
- Add `pricingModelId` column definition
- Add to `readOnlyColumns`
- Update TypeScript types

**Test Cases:**
```typescript
describe('Schema: pricingModelId in Tier 1 tables', () => {
  it('should include pricingModelId in select schema but not insert schema', async () => {
    // Verify: pricingModelId is in select schema
    // Verify: pricingModelId is NOT in client insert schema
  })
  
  it('should include pricingModelId in readOnlyColumns', async () => {
    // Verify: pricingModelId is in readOnlyColumns
  })
})
```

### PR 3: Insert Method Updates - Tier 1

**Files:**
- `platform/flowglad-next/src/db/tableMethods/billingPeriodMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/billingRunMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/billingPeriodItemMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/subscriptionItemMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/subscriptionItemFeatureMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/ledgerAccountMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/ledgerEntryMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/ledgerTransactionMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/usageEventMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/usageCreditMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/usageCreditApplicationMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/subscriptionMeterPeriodCalculationMethods.ts`
- `platform/flowglad-next/src/db/tableMethods/productFeatureMethods.ts`

**Changes:**
- Update insert methods to derive `pricingModelId` from parent records
- Handle NULL cases gracefully

**Test Cases:**
```typescript
describe('Insert methods: pricingModelId derivation - Tier 1', () => {
  it('should derive pricingModelId for billingPeriod from subscription', async () => {
    // Setup: Create subscription with pricingModelId
    // Action: Insert billingPeriod
    // Expect: billingPeriod.pricingModelId === subscription.pricingModelId
  })
  
  it('should derive pricingModelId for subscriptionItem from subscription', async () => {
    // Setup: Create subscription with pricingModelId
    // Action: Insert subscriptionItem
    // Expect: subscriptionItem.pricingModelId === subscription.pricingModelId
  })
  
  it('should derive pricingModelId for usageEvent from usageMeter', async () => {
    // Setup: Create usageMeter with pricingModelId
    // Action: Insert usageEvent
    // Expect: usageEvent.pricingModelId === usageMeter.pricingModelId
  })
  
  it('should handle NULL pricingModelId gracefully', async () => {
    // Setup: Create record with parent that has NULL pricingModelId
    // Action: Insert child record
    // Expect: Child record has NULL pricingModelId (no error)
  })
})
```

## Summary

**Total PRs: 6** (one per wave/layer)

**Execution:** Sequential - each PR must complete all 8 steps for all tables in its wave before the next PR can begin.

**Reference Documents:**
- **Dependency Graph:** See `degrees-analysis.md` for layer definitions and table dependencies
- **8-Step Checklist:** See `table-pricing-model-id-checklist.md` for detailed instructions on each step

## Impact Assessment

### Files Changed
- **Schema files**: 24 files (one per table)
- **Insert method files**: ~20 files (one per table with insert methods)
- **Seed database**: 1 file (updated incrementally per wave)
- **Migration files**: 6 files (one per wave)
- **Total**: ~51 files

### Complexity by Wave
- **Wave 1**: Low complexity - Direct from base tables
- **Wave 2**: Low complexity - Single parent from Layer 1
- **Wave 3**: Medium complexity - Mix of single parent and multi-path tables
- **Wave 4**: Medium complexity - Mix of single parent and multi-path tables
- **Wave 5**: High complexity - Complex multi-path derivation (checkoutSessions)
- **Wave 6**: Medium complexity - Multi-path but simpler than Wave 5

### Risk
- **Low risk**: Adding nullable columns doesn't break existing functionality
- **Medium risk**: Insert method changes could introduce bugs if derivation logic is incorrect
- **Mitigation**: Comprehensive test coverage for all derivation paths

### Breaking Changes
- **None**: All changes are additive. Existing code continues to work.
- **After migration**: Once NOT NULL constraints are added, inserts without valid parent relationships will fail. This is intentional and ensures data integrity.

## Notes

- This gameplan focuses on adding `pricingModelId` as a read-only derived field. Future gameplans will handle:
  - Adding `pricingModelId` to deferred tables (`events`, `files`, etc.)
  - Enforcing data isolation across pricing models
  - Adding NOT NULL constraints after verifying data integrity
  - Query filtering by pricing model for data isolation

- The derivation logic follows a clear hierarchy:
  1. Direct parent (e.g., subscription -> billingPeriod)
  2. Price -> Product chain (e.g., purchase -> price -> product)
  3. Multi-path with priority (e.g., invoice -> subscription > purchase > customer)

- All derivation happens in application code (insert methods), not database triggers, for consistency with existing `livemode` pattern.

