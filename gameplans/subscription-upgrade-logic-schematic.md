# Subscription Upgrade Logic Schematic

## Implementation Status
**Last Updated**: 2025-09-07

### ✅ Implemented (PR 1 & PR 2 Complete):
- Core upgrade flow in `processSetupIntentSucceeded`
- `cancelFreeSubscriptionForUpgrade` helper function
- `linkUpgradedSubscriptions` helper function
- Database columns: `cancellationReason`, `replacedBySubscriptionId`, `isFreePlan`
- Single free subscription validation in `verifyCanCreateSubscription`
- CancellationReason enum in types.ts
- Automatic isFreePlan marking based on unitPrice === 0

### ❌ Not Implemented:
- `selectActiveSubscriptionsForCustomer` filtering
- `selectCurrentSubscriptionForCustomer` helper
- Database constraint for single active subscription
- Idempotency check for setup intents
- Analytics exclusion for upgraded subscriptions

## Current Flow (BEFORE)
```mermaid
graph TD
    A[Setup Intent Succeeded] --> B[Process Checkout Session]
    B --> C{Checkout Type?}
    C -->|Product/Purchase| D[Create New Subscription]
    C -->|AddPaymentMethod| E[Update Payment Method]
    C -->|ActivateSubscription| F[Activate Existing]
    
    D --> G[createSubscriptionWorkflow]
    G --> H[Insert New Subscription]
    H --> I[Create Billing Period]
    I --> J[Return Success]
```

## New Flow (AFTER)
```mermaid
graph TD
    A[Setup Intent Succeeded] --> B[Process Checkout Session]
    B --> C{Checkout Type?}
    C -->|Product/Purchase| D[Check for Free Subscription]
    C -->|AddPaymentMethod| E[Update Payment Method]
    C -->|ActivateSubscription| F[Activate Existing]
    
    D --> G{Free Sub Exists?}
    G -->|Yes| H[Cancel Free Subscription]
    G -->|No| I[Skip Cancellation]
    
    H --> J[Mark as 'upgraded_to_paid']
    I --> K[Create New Subscription]
    J --> K
    
    K --> L[createSubscriptionWorkflow]
    L --> M[Insert New Subscription]
    M --> N[Link Old->New via replaced_by_subscription_id]
    N --> O[Create Billing Period]
    O --> P[Return Success]
```

## Business Rules

### Single Free Subscription Constraint
**REQUIREMENT**: No customer should ever have more than 1 free subscription active at any given time.

This constraint must be enforced at:
1. **Subscription Creation** - Before creating a new free subscription, check for existing active free subscriptions
2. **Subscription Reactivation** - When reactivating a canceled free subscription
3. **Checkout Session Creation** - When creating a checkout for a free product
4. **Stripe Webhook Processing** - When handling subscription creation from Stripe

### Validation Implementation
```typescript
// Before creating any free subscription
async function validateSingleFreeSubscription(
  customerId: string,
  transaction: DbTransaction
): Promise<void> {
  const existingFreeSubscriptions = await selectSubscriptions({
    customerId,
    status: SubscriptionStatus.Active,
    isFreePlan: true
  }, transaction)
  
  if (existingFreeSubscriptions.length > 0) {
    throw new Error(
      `Customer ${customerId} already has an active free subscription. ` +
      `Only one free subscription is allowed per customer.`
    )
  }
}
```

## Core Logic Changes

### 1. Entry Point Modification
**File**: `/src/utils/bookkeeping/processSetupIntent.ts`
**Function**: `processSetupIntentSucceeded`

```typescript
// BEFORE: Directly creates subscription
const result = await createSubscriptionFromSetupIntentableCheckoutSession(
  successProcessedResult,
  transaction
)

// AFTER: Check and cancel free subscription first
const canceledFreeSub = await cancelFreeSubscriptionIfExists(customer.id, transaction)
const result = await createSubscriptionFromSetupIntentableCheckoutSession(
  {
    ...successProcessedResult,
    previousSubscriptionId: canceledFreeSub?.id
  },
  transaction
)
if (canceledFreeSub && result.subscription) {
  await linkSubscriptions(canceledFreeSub.id, result.subscription.id, transaction)
}
```

### 2. New Helper Function
**File**: `/src/subscriptions/cancelFreeSubscriptionForUpgrade.ts` (NEW)

```typescript
export async function cancelFreeSubscriptionIfExists(
  customerId: string,
  transaction: DbTransaction
): Promise<Subscription.Record | null> {
  // Find active free subscription
  const subs = await selectSubscriptions({
    customerId,
    status: SubscriptionStatus.Active,
    isFreePlan: true
  }, transaction)
  
  if (subs.length === 0) return null
  
  // Cancel with special reason
  return await updateSubscription({
    id: subs[0].id,
    status: SubscriptionStatus.Canceled,
    canceledAt: new Date(),
    cancellationReason: 'upgraded_to_paid'
  }, transaction)
}
```

### 3. Subscription Linking (Database Column Approach)
**IMPORTANT**: Never use metadata for business logic as it's customer-controlled.

The upgrade relationship is tracked using the `replacedBySubscriptionId` column:
- This is a proper database column with an index
- Creates a one-way link from old → new subscription  
- Upgrade date is implicitly captured by new subscription's `createdAt`

**NO CHANGES NEEDED** to `createSubscriptionWorkflow` - linking happens after creation.

### 4. Link Subscriptions After Creation
**File**: `/src/utils/bookkeeping/processSetupIntent.ts`

```typescript
async function linkSubscriptions(
  oldSubId: string,
  newSubId: string,
  transaction: DbTransaction
): Promise<void> {
  await updateSubscription({
    id: oldSubId,
    replacedBySubscriptionId: newSubId
  }, transaction)
}
```

## Key Decision Points

### Check 1: Is there a free subscription?
```typescript
const freeSubscription = await db
  .select()
  .from(subscriptions)
  .where(and(
    eq(subscriptions.customerId, customerId),
    eq(subscriptions.status, 'active'),
    eq(subscriptions.isFreePlan, true)
  ))
  .limit(1)
```

### Check 2: Is this an upgrade-eligible checkout?
```typescript
const isUpgradeEligible = 
  checkoutSession.type === CheckoutSessionType.Product ||
  checkoutSession.type === CheckoutSessionType.Purchase
```

### Check 3: Should we prevent the upgrade?
```typescript
// Prevent if customer already has paid subscription
const existingPaidSub = await db
  .select()
  .from(subscriptions)
  .where(and(
    eq(subscriptions.customerId, customerId),
    eq(subscriptions.status, 'active'),
    eq(subscriptions.isFreePlan, false)
  ))

if (existingPaidSub.length > 0) {
  throw new Error('Customer already has active paid subscription')
}
```

## Transaction Flow

```typescript
// All operations in single transaction
await comprehensiveAdminTransaction(async ({ transaction }) => {
  // 1. Cancel free subscription
  const canceled = await cancelFreeSubscription(customerId, transaction)
  
  try {
    // 2. Create new subscription
    const newSub = await createSubscription(params, transaction)
    
    // 3. Link them together
    if (canceled) {
      await linkSubscriptions(canceled.id, newSub.id, transaction)
    }
    
    return newSub
  } catch (error) {
    // Transaction automatically rolls back
    // Free subscription remains active
    throw error
  }
})
```

## State Transitions

### Free Subscription States
```
ACTIVE (free) 
  ↓ [setup intent succeeds]
CANCELED (reason: upgraded_to_paid)
```

### New Subscription States
```
NON-EXISTENT
  ↓ [setup intent succeeds]
ACTIVE (paid) - no metadata tracking needed
```

### Database Record Linkage
```
subscriptions table:
┌─────────────────────────────────────┐
│ Free Subscription                   │
├─────────────────────────────────────┤
│ id: uuid-1                          │
│ status: canceled                    │
│ cancellation_reason: upgraded_to_paid│
│ replaced_by_subscription_id: uuid-2 │◄──┐
│ canceled_at: 2024-01-15T10:30:00Z   │   │
└─────────────────────────────────────┘   │
                                           │
┌─────────────────────────────────────┐   │
│ Paid Subscription                   │   │
├─────────────────────────────────────┤   │
│ id: uuid-2                          │───┘
│ status: active                      │
│ created_at: 2024-01-15T10:30:01Z    │
│ metadata: {...customer_controlled}  │
└─────────────────────────────────────┘
```

**Note**: The upgrade date is captured by comparing `canceled_at` on the old subscription with `created_at` on the new subscription. No metadata tracking needed.

## Error Handling

### Scenario 1: No Free Subscription
- **Action**: Continue with normal creation
- **Result**: New subscription created, no cancellation

### Scenario 2: Multiple Free Subscriptions (edge case)
- **Action**: Cancel the most recent one
- **Result**: Log warning, proceed with upgrade

### Scenario 3: Creation Fails After Cancellation
- **Action**: Transaction rollback
- **Result**: Free subscription remains active

### Scenario 4: Concurrent Upgrade Attempts
- **Action**: Second attempt sees no free subscription
- **Result**: Fails with "already has paid subscription" error

## Validation Points

1. **Pre-Cancellation**: Verify free subscription exists and is active
2. **Pre-Creation**: Verify no existing paid subscriptions
3. **Post-Creation**: Verify linking successful
4. **Post-Transaction**: Verify exactly one active subscription

## Affected Systems

### Direct Changes Required:
- `processSetupIntentSucceeded` - Add cancellation logic
- `createSubscriptionWorkflow` - Accept previous subscription ID
- Database schema - Add new columns

### Indirect Changes (Queries to Update):
- `selectActiveSubscriptionsForCustomer` - Exclude upgraded-away
- Billing run selection - Skip canceled free subscriptions
- Analytics/metrics - Filter out upgrade cancellations
- Customer portal - Show only current subscription

### No Changes Needed:
- Stripe webhook processing
- Invoice generation
- Payment processing
- Email notifications (unless we want upgrade-specific emails)