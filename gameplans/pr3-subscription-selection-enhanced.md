# PR 3: Subscription Selection Logic Updates - Enhanced Gameplan

## Overview
Update all subscription queries throughout the system to properly handle upgraded subscriptions by excluding those with `cancellationReason = 'upgraded_to_paid'` from active subscription queries.

## Implementation Status
❌ **Not Started**

## Core Components to Update

### 1. Database Methods Layer (`/src/db/tableMethods/subscriptionMethods.ts`)

#### A. New Helper Function: `selectActiveSubscriptionsForCustomer`
```typescript
export const selectActiveSubscriptionsForCustomer = async (
  customerId: string,
  transaction: DbTransaction
): Promise<Subscription.Record[]> => {
  return await transaction
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.customerId, customerId),
        eq(subscriptions.status, SubscriptionStatus.Active),
        // Exclude subscriptions that were upgraded away
        or(
          isNull(subscriptions.cancellationReason),
          ne(subscriptions.cancellationReason, CancellationReason.UpgradedToPaid)
        )
      )
    )
}
```

#### B. New Helper Function: `selectCurrentSubscriptionForCustomer`
```typescript
export const selectCurrentSubscriptionForCustomer = async (
  customerId: string,
  transaction: DbTransaction
): Promise<Subscription.Record | null> => {
  // Get all subscriptions for customer
  const allSubscriptions = await selectSubscriptions({
    customerId
  }, transaction)
  
  // Find the end of any upgrade chain
  const findCurrent = (sub: Subscription.Record): Subscription.Record => {
    const replacement = allSubscriptions.find(
      s => s.id === sub.replacedBySubscriptionId
    )
    return replacement ? findCurrent(replacement) : sub
  }
  
  // Start with active subscriptions (excluding upgraded ones)
  const active = allSubscriptions.find(
    s => s.status === SubscriptionStatus.Active &&
         s.cancellationReason !== CancellationReason.UpgradedToPaid
  )
  
  return active || null
}
```

#### C. Update `isSubscriptionCurrent` Function
```typescript
export const isSubscriptionCurrent = (
  status: SubscriptionStatus,
  cancellationReason?: string | null
) => {
  // Exclude upgraded subscriptions from being considered current
  if (cancellationReason === CancellationReason.UpgradedToPaid) {
    return false
  }
  
  return [
    SubscriptionStatus.Active,
    SubscriptionStatus.Trial,
    SubscriptionStatus.CreditTrial,
    SubscriptionStatus.PastDue,
  ].includes(status)
}
```

### 2. API Endpoints to Update

#### A. Customer Router (`/src/server/routers/customersRouter.ts`)

**`getBilling` endpoint (line 275):**
- Currently uses `customerBillingTransaction` which filters by `isSubscriptionCurrent`
- Need to update the filter logic in `customerBilling.ts`

#### B. Customer Billing Logic (`/src/utils/bookkeeping/customerBilling.ts`)

**`customerBillingTransaction` function (line 21):**
```typescript
// Update line 60-62
const currentSubscriptions = subscriptions.filter((item) => {
  return isSubscriptionCurrent(item.status, item.cancellationReason)
})
```

#### C. Subscriptions Router (`/src/server/routers/subscriptionsRouter.ts`)

**All endpoints that use `isSubscriptionCurrent`:**
- `adjust` (line 99)
- `cancel` (line 140, 153)
- `list` (line 178)
- `get` (line 202)
- `create` (line 354)

Update all calls to pass cancellation reason:
```typescript
current: isSubscriptionCurrent(subscription.status, subscription.cancellationReason)
```

#### D. Customer Billing Portal Router (`/src/server/routers/customerBillingPortalRouter.ts`)

Update all `isSubscriptionCurrent` calls to include cancellation reason parameter.

### 3. Billing Run Selection Updates

#### A. Billing Period Methods (`/src/db/tableMethods/billingPeriodMethods.ts`)

**Add new query for active billing periods:**
```typescript
export const selectActiveBillingPeriodsForDateRange = async (
  { startDate, endDate, organizationId, livemode }: {
    startDate: Date
    endDate: Date
    organizationId: string
    livemode: boolean
  },
  transaction: DbTransaction
) => {
  return await transaction
    .select({
      billingPeriod: billingPeriods,
      subscription: subscriptions
    })
    .from(billingPeriods)
    .innerJoin(
      subscriptions,
      eq(billingPeriods.subscriptionId, subscriptions.id)
    )
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        eq(billingPeriods.livemode, livemode),
        // Exclude billing periods for upgraded subscriptions
        or(
          isNull(subscriptions.cancellationReason),
          ne(subscriptions.cancellationReason, CancellationReason.UpgradedToPaid)
        ),
        // Date range conditions
        lte(billingPeriods.startDate, endDate),
        gte(billingPeriods.endDate, startDate)
      )
    )
}
```

#### B. Billing Run Helpers (`/src/subscriptions/billingRunHelpers.ts`)

Update billing run selection to exclude upgraded subscriptions when processing billing periods.

### 4. Analytics & Dashboard Updates (Partial - Full implementation in PR 5)

#### A. Subscriber Calculation Helpers (`/src/utils/billing-dashboard/subscriberCalculationHelpers.ts`)

**Update `getActiveSubscriptionsForPeriod` to exclude upgraded subscriptions:**
```typescript
const activeCount = allSubscriptions.filter((subscription) => {
  const wasActive = currentSubscriptionStatuses.includes(subscription.status)
  const notUpgraded = subscription.cancellationReason !== CancellationReason.UpgradedToPaid
  return wasActive && notUpgraded && ...
})
```

### 5. Subscription Item Methods Updates

#### A. Update subscription item queries (`/src/db/tableMethods/subscriptionItemMethods.ts`)

Update `selectRichSubscriptionsAndActiveItems` to exclude upgraded subscriptions.

### 6. Type Updates

#### A. Update function signatures that need cancellation reason:
- `subscriptionWithCurrent` helper
- Any function that determines if a subscription is "current" or "active"

## Testing Requirements

### Unit Tests
```typescript
describe('Subscription Selection with Upgrades', () => {
  it('excludes canceled free subscriptions from active queries')
  it('follows upgrade chain to find current subscription')
  it('billing runs ignore upgraded-away subscriptions')
  it('returns null if entire chain is canceled')
  it('handles circular reference protection')
  it('performantly queries current subscription')
})
```

### Integration Tests
```typescript
describe('API Endpoints with Upgraded Subscriptions', () => {
  describe('customers.getBilling', () => {
    it('returns only current subscription, not upgraded one')
    it('shows correct subscription in currentSubscriptions array')
  })
  
  describe('subscriptions.list', () => {
    it('excludes upgraded subscriptions from active list')
    it('includes upgraded subscriptions when filtering by canceled status')
  })
  
  describe('billing runs', () => {
    it('does not create billing runs for upgraded subscriptions')
    it('does not include upgraded subscriptions in billing calculations')
  })
})
```

## Migration Considerations

### Data Validation Script
Create a script to verify data integrity:
```typescript
// scripts/validateUpgradedSubscriptions.ts
const validateUpgradedSubscriptions = async () => {
  // Find all subscriptions with cancellationReason = 'upgraded_to_paid'
  // Verify they all have a replacedBySubscriptionId
  // Verify the replacement subscription exists
  // Check for any circular references
  // Report any anomalies
}
```

## Performance Considerations

1. **Index Usage**: Ensure queries use existing indexes on:
   - `subscriptions.customerId`
   - `subscriptions.status`
   - `subscriptions.cancellationReason` (may need new index)
   - `subscriptions.replacedBySubscriptionId`

2. **Query Optimization**: The `selectCurrentSubscriptionForCustomer` uses recursive logic. For customers with many subscriptions, consider:
   - Limiting recursion depth
   - Caching results
   - Using a CTE for better performance

## Rollout Strategy

1. **Deploy Behind Feature Flag**:
```typescript
const shouldExcludeUpgradedSubscriptions = () => {
  return process.env.EXCLUDE_UPGRADED_SUBSCRIPTIONS === 'true'
}

// In queries:
if (shouldExcludeUpgradedSubscriptions()) {
  whereConditions.push(
    or(
      isNull(subscriptions.cancellationReason),
      ne(subscriptions.cancellationReason, CancellationReason.UpgradedToPaid)
    )
  )
}
```

2. **Gradual Rollout**:
   - Day 1: Deploy code with feature flag OFF
   - Day 2: Enable for internal testing
   - Day 3: Enable for 10% of queries
   - Day 4: Enable for 50% of queries
   - Day 5: Enable for 100% of queries

## Monitoring & Alerts

Set up monitoring for:
1. Count of active subscriptions before/after change
2. Billing run creation rates
3. API response times for subscription queries
4. Any errors related to subscription selection

## Files to Update Summary

1. **Core Database Methods**:
   - `/src/db/tableMethods/subscriptionMethods.ts` ✅
   - `/src/db/tableMethods/billingPeriodMethods.ts` ✅
   - `/src/db/tableMethods/subscriptionItemMethods.ts` ✅

2. **API Routers**:
   - `/src/server/routers/customersRouter.ts` ✅
   - `/src/server/routers/subscriptionsRouter.ts` ✅
   - `/src/server/routers/customerBillingPortalRouter.ts` ✅

3. **Business Logic**:
   - `/src/utils/bookkeeping/customerBilling.ts` ✅
   - `/src/subscriptions/billingRunHelpers.ts` ✅
   - `/src/utils/billing-dashboard/subscriberCalculationHelpers.ts` ✅

4. **Test Files**:
   - New test file: `/src/db/tableMethods/subscriptionMethods.upgrade.test.ts`
   - Update existing test files for affected methods

## Estimated Timeline
- Implementation: 1 day
- Testing: 0.5 day
- Code Review: 0.5 day
- **Total: 2 days**

## Dependencies
- PR 1 (Database Schema) - ✅ Complete
- PR 2 (Core Upgrade Logic) - ✅ Complete

## Success Criteria
1. All active subscription queries exclude upgraded subscriptions
2. Billing runs do not process upgraded subscriptions
3. Customer billing portal shows only current subscription
4. No performance degradation in subscription queries
5. All existing tests pass
6. New tests for upgrade scenarios pass