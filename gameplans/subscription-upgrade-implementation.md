# Subscription Upgrade Implementation Plan

## Implementation Status Summary
**Last Updated**: 2025-09-07

### ✅ Completed Components:
- **Database Schema**: New columns added (cancellationReason, replacedBySubscriptionId, isFreePlan)
- **Core Upgrade Logic**: Cancel-and-replace flow implemented in processSetupIntentSucceeded
- **Helper Functions**: cancelFreeSubscriptionForUpgrade and linkUpgradedSubscriptions created
- **Single Free Subscription Validation**: Prevents multiple free subscriptions per customer
- **Test Coverage**: Upgrade flow tests in processSetupIntent.upgrade.test.ts
- **TypeScript Types**: CancellationReason enum added to types.ts
- **Automatic Free Plan Marking**: Subscriptions with unitPrice=0 automatically marked as isFreePlan=true

### ⚠️ Partially Completed:
- **Race Condition Prevention**: Single free subscription validation exists, but not comprehensive

### ❌ Not Implemented:
- **Subscription Selection Logic**: No filtering for upgraded-away subscriptions
- **Database Constraints**: No unique constraint for one active subscription per customer
- **Idempotency**: No check for already-processed setup intents
- **Analytics & Reporting**: No exclusion of upgrades from churn metrics
- **Event Logging**: No upgrade-specific events
- **UI/UX Updates**: No special handling for subscription transitions

## Overview
Modify the subscription lifecycle to support the new model where every customer starts with a free-tier subscription. When a setup intent succeeds, instead of creating a new subscription, we'll cancel the free subscription and create a new paid one atomically.

## Approach
**Cancel-and-Replace Strategy**: When upgrading from free to paid, we atomically:
1. Cancel the existing free subscription with reason `upgraded_to_paid`
2. Create a new paid subscription
3. Link them via `replaced_by_subscription_id`

This approach is simpler and less risky than in-place upgrades, avoiding complex proration calculations and billing cycle adjustments.

## Implementation PRs

### PR 1: Database Schema & Model Updates ✅ COMPLETED
**Add tracking fields for subscription upgrades**

#### Tasks:
1. **Add migration for new columns** ✅:
   ```sql
   ALTER TABLE subscriptions 
   ADD COLUMN cancellation_reason TEXT,
   ADD COLUMN replaced_by_subscription_id UUID REFERENCES subscriptions(id),
   ADD COLUMN is_free_plan BOOLEAN DEFAULT FALSE;
   
   CREATE INDEX idx_replaced_by ON subscriptions(replaced_by_subscription_id);
   ```

2. **Update Drizzle schema** (`/src/db/schema/subscriptions.ts`) ✅:
   ```typescript
   cancellationReason: text('cancellation_reason'),
   replacedBySubscriptionId: uuid('replaced_by_subscription_id'),
   isFreePlan: boolean('is_free_plan').default(false),
   ```

3. **Update TypeScript types** in `/src/types.ts` ✅:
   ```typescript
   enum CancellationReason {
     UpgradedToPaid = 'upgraded_to_paid',
     CustomerRequest = 'customer_request',
     NonPayment = 'non_payment',
     Other = 'other'
   }
   ```

4. **Update `createCustomerBookkeeping`** to mark free subscriptions ✅ (automatically handled in createSubscriptionWorkflow):
   ```typescript
   const subscriptionResult = await createSubscriptionWorkflow({
     // ... existing params ...
     metadata: {
       ...metadata,
       is_free_plan: defaultPrice.unitPrice === 0
     }
   }, transaction)
   
   // Mark in database
   if (defaultPrice.unitPrice === 0) {
     await updateSubscription({
       id: subscriptionResult.subscription.id,
       isFreePlan: true
     }, transaction)
   }
   ```

#### Test Coverage:
- Migration rollback/forward test
- Verify `isFreePlan` set correctly on customer creation
- Test foreign key constraint on `replacedBySubscriptionId`
- Ensure existing subscriptions handle null values

---

### PR 2: Core Upgrade Logic in Setup Intent ✅ COMPLETED
**Implement cancel-and-replace on setup intent success**

#### Tasks:
1. **Create helper function** `cancelFreeSubscriptionForUpgrade` ✅:
   ```typescript
   // New file: src/subscriptions/cancelFreeSubscriptionForUpgrade.ts
   export const cancelFreeSubscriptionForUpgrade = async (
     customerId: string,
     transaction: DbTransaction
   ): Promise<Subscription.Record | null> => {
     const activeSubscriptions = await selectSubscriptions({
       customerId,
       status: SubscriptionStatus.Active
     }, transaction)
     
     const freeSubscription = activeSubscriptions.find(
       sub => sub.isFreePlan === true
     )
     
     if (!freeSubscription) {
       return null
     }
     
     return await updateSubscription({
       id: freeSubscription.id,
       status: SubscriptionStatus.Canceled,
       canceledAt: new Date(),
       cancellationReason: CancellationReason.UpgradedToPaid
     }, transaction)
   }
   ```

2. **Modify `processSetupIntentSucceeded`** (`/src/utils/bookkeeping/processSetupIntent.ts:592`) ✅:
   ```typescript
   // Before creating subscription, cancel free plan
   const canceledSubscription = await cancelFreeSubscriptionForUpgrade(
     customer.id,
     transaction
   )
   
   // Pass canceled subscription info to creation
   const result = await createSubscriptionFromSetupIntentableCheckoutSession({
     ...existingParams,
     previousSubscriptionId: canceledSubscription?.id,
     metadata: {
       ...checkoutSession.outputMetadata,
       upgraded_from_subscription_id: canceledSubscription?.id,
       upgrade_date: new Date().toISOString()
     }
   }, transaction)
   ```

3. **Update `createSubscriptionFromSetupIntentableCheckoutSession`** to link subscriptions ✅:
   ```typescript
   // After successful creation, update the old subscription
   if (previousSubscriptionId) {
     await updateSubscription({
       id: previousSubscriptionId,
       replacedBySubscriptionId: result.subscription.id
     }, transaction)
   }
   ```

#### Test Coverage:
```typescript
// src/utils/bookkeeping/processSetupIntent.test.ts
describe('Setup Intent Succeeded - Upgrade Flow', () => {
  it('cancels existing free subscription when upgrading')
  it('creates new paid subscription after canceling free')
  it('links old and new subscriptions via replacedBySubscriptionId')
  it('transfers metadata from free to paid subscription')
  it('handles case when no free subscription exists')
  it('handles multiple free subscriptions (edge case)')
  it('rolls back all changes if subscription creation fails')
  it('does not cancel non-free subscriptions')
  it('handles concurrent upgrade attempts (idempotency)')
  it('preserves customer payment method through upgrade')
})
```

---

### PR 3: Subscription Selection Logic Updates ⚠️ PARTIAL
**Ensure only active subscriptions are used throughout the system**

#### Tasks:
1. **Update active subscription queries** (`/src/db/tableMethods/subscriptionMethods.ts`) ❌ NOT IMPLEMENTED:
   ```typescript
   export const selectActiveSubscriptionsForCustomer = async (
     customerId: string,
     transaction: DbTransaction
   ) => {
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

2. **Create `selectCurrentSubscriptionForCustomer` helper** ❌ NOT IMPLEMENTED:
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
     
     // Start with active subscriptions
     const active = allSubscriptions.find(
       s => s.status === SubscriptionStatus.Active &&
            s.cancellationReason !== CancellationReason.UpgradedToPaid
     )
     
     return active || null
   }
   ```

3. **Update billing run selection** to exclude upgraded subscriptions ❌ NOT IMPLEMENTED

4. **Update API endpoints** that list subscriptions ❌ NOT IMPLEMENTED

#### Test Coverage:
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

---

### PR 4: Prevent Double-Upgrade Race Conditions ⚠️ PARTIAL
**Add safeguards against concurrent upgrades**

#### Tasks:
1. **Add database constraint** ❌ NOT IMPLEMENTED:
   ```sql
   -- Only one active non-upgraded subscription per customer
   CREATE UNIQUE INDEX idx_one_active_sub_per_customer 
   ON subscriptions(customer_id) 
   WHERE status NOT IN ('canceled', 'expired') 
   AND (cancellation_reason IS NULL OR cancellation_reason != 'upgraded_to_paid');
   ```

2. **Add validation in `processSetupIntentSucceeded`** ⚠️ PARTIAL (single free subscription validation exists, but not for paid):
   ```typescript
   // Check for existing paid subscriptions
   const activePaidSubscriptions = await selectSubscriptions({
     customerId: customer.id,
     status: SubscriptionStatus.Active,
     isFreePlan: false
   }, transaction)
   
   if (activePaidSubscriptions.length > 0) {
     throw new Error(
       `Customer ${customer.id} already has an active paid subscription`
     )
   }
   ```

3. **Strengthen idempotency** ❌ NOT IMPLEMENTED:
   ```typescript
   // Check if this setup intent was already processed
   const existingSubscription = await selectSubscriptionAndItems({
     stripeSetupIntentId: setupIntent.id
   }, transaction)
   
   if (existingSubscription) {
     return { 
       result: existingSubscription,
       eventsToLog: [] // Already processed
     }
   }
   ```

#### Test Coverage:
```typescript
describe('Upgrade Race Condition Prevention', () => {
  it('prevents creating multiple paid subscriptions')
  it('handles concurrent setup intent processing')
  it('allows retry of failed upgrade attempts')
  it('correctly identifies idempotent requests')
  it('database constraint prevents duplicate active subscriptions')
  it('handles webhook replay scenarios')
})
```

---

### PR 5: Analytics & Reporting Adjustments ❌ NOT IMPLEMENTED
**Update metrics to handle upgrade flow correctly**

#### Tasks:
1. **Update churn calculations** (`/src/utils/billing-dashboard/revenueCalculationHelpers.ts`) ❌:
   ```typescript
   export const calculateChurnedSubscriptions = (
     subscriptions: Subscription.Record[]
   ) => {
     return subscriptions.filter(
       s => s.status === SubscriptionStatus.Canceled && 
            s.cancellationReason !== CancellationReason.UpgradedToPaid
     )
   }
   ```

2. **Add upgrade tracking metrics** ❌:
   ```typescript
   // New file: src/utils/billing-dashboard/upgradeMetrics.ts
   export const getUpgradeMetrics = async (
     organizationId: string,
     startDate: Date,
     endDate: Date,
     transaction: DbTransaction
   ) => {
     const upgrades = await transaction
       .select()
       .from(subscriptions)
       .where(
         and(
           eq(subscriptions.organizationId, organizationId),
           eq(subscriptions.cancellationReason, CancellationReason.UpgradedToPaid),
           between(subscriptions.canceledAt, startDate, endDate)
         )
       )
     
     return {
       totalUpgrades: upgrades.length,
       upgradeRevenue: calculateUpgradeRevenue(upgrades),
       averageTimeToUpgrade: calculateAverageTimeToUpgrade(upgrades)
     }
   }
   ```

3. **Update MRR calculations** to track upgrade transitions correctly ❌

4. **Add event logging** ❌:
   ```typescript
   // Log upgrade event
   eventsToLog.push({
     type: FlowgladEventType.SubscriptionUpgraded,
     occurredAt: timestamp,
     organizationId: subscription.organizationId,
     payload: {
       object: EventNoun.Subscription,
       from_subscription_id: canceledSubscription.id,
       to_subscription_id: newSubscription.id,
       from_price: 0,
       to_price: newPrice.unitPrice
     }
   })
   ```

#### Test Coverage:
```typescript
describe('Analytics with Upgrades', () => {
  it('excludes upgrades from churn metrics')
  it('correctly calculates MRR through upgrade transition')
  it('tracks upgrade conversion rate')
  it('handles upgrade chains in cohort analysis')
  it('generates correct events for upgrade flow')
  it('calculates time from signup to upgrade')
})
```

---

### PR 6: UI/UX Updates (Optional) ❌ NOT IMPLEMENTED
**Handle subscription transitions in customer-facing interfaces**

#### Tasks:
1. **Update subscription display logic** to show only current subscription
2. **Add upgrade history view** (optional)
3. **Update invoice descriptions** to reference upgrades
4. **Handle mid-upgrade UI states**

#### Test Coverage:
```typescript
describe('UI Upgrade Handling', () => {
  it('shows only current subscription in customer portal')
  it('displays upgrade history if requested')
  it('handles mid-upgrade UI state gracefully')
  it('shows correct subscription in invoices')
})
```

---

## Rollout Strategy

### Deployment Order:
1. **PR 1** - Schema changes (safe, backward compatible)
2. **PR 3** - Selection logic updates (prepares queries)
3. **PR 2** - Core upgrade logic (behind feature flag)
4. **PR 4** - Race condition prevention
5. **PR 5** - Analytics updates
6. **PR 6** - UI updates (if needed)

### Feature Flag Strategy:
```typescript
// In processSetupIntentSucceeded
if (process.env.ENABLE_SUBSCRIPTION_UPGRADES === 'true') {
  const canceledSub = await cancelFreeSubscriptionForUpgrade(...)
  // New upgrade flow
} else {
  // Existing flow
}
```

### Monitoring:
- Track upgrade success rate
- Monitor for duplicate subscriptions
- Alert on upgrade failures
- Compare revenue before/after

## Timeline Estimate

- **PR 1**: 1 day (schema/models)
- **PR 2**: 2-3 days (core logic)
- **PR 3**: 1 day (queries)
- **PR 4**: 1 day (safeguards)
- **PR 5**: 1-2 days (analytics)
- **PR 6**: 1 day (UI, if needed)

**Total: 7-10 days** with some parallel work possible

## Risk Mitigation

### Risks:
1. **Double billing** - Mitigated by atomic transaction
2. **Lost subscriptions** - Mitigated by rollback on failure
3. **Analytics disruption** - Mitigated by PR 5
4. **Race conditions** - Mitigated by PR 4

### Rollback Plan:
- Each PR is independently deployable/rollbackable
- Feature flag allows instant disable
- Database changes are additive (no destructive changes)

## Success Criteria

1. Zero duplicate active paid subscriptions
2. All upgrades complete atomically
3. No impact on existing paid subscriptions
4. Churn metrics remain accurate
5. < 0.1% failure rate on upgrades
6. Clear audit trail via `replaced_by_subscription_id`

## Open Questions

1. Should we preserve usage credits from free tier?
2. How to handle pending invoices from free subscription?
3. Should upgrade history be visible to customers?
4. Do we need to notify customers of the upgrade?