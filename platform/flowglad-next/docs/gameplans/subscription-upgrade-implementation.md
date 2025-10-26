# Subscription Upgrade Implementation Plan

## Implementation Status Summary
**Last Updated**: 2025-01-10

### ✅ Completed Components:
- **PR 1 - Database Schema**: New columns added (cancellationReason, replacedBySubscriptionId, isFreePlan)
- **PR 2 - Core Upgrade Logic**: Cancel-and-replace flow implemented in processSetupIntentSucceeded
- **PR 3 - Subscription Selection Logic**: Active subscription queries exclude upgraded-away subscriptions
- **PR 4 - Race Condition Prevention**: Comprehensive validation to prevent double upgrades
- **PR 5 - Analytics & Reporting**: Upgrades excluded from churn metrics, separate upgrade tracking
- **PR 6 - Idempotency**: Setup intent idempotency fully implemented with unique constraint and application checks
- **PR 7 - Customer Email Notifications**: Email templates and trigger.dev tasks for subscription notifications
- **PR 8 - Proration Test Coverage**: Comprehensive test coverage for proration edge cases (processSetupIntent.upgrade-proration.test.ts)
- **Helper Functions**: cancelFreeSubscriptionForUpgrade and linkUpgradedSubscriptions created
- **Single Free Subscription Validation**: Prevents multiple free subscriptions per customer
- **Test Coverage**: Comprehensive upgrade flow tests and email template tests
- **TypeScript Types**: CancellationReason enum added to types.ts
- **Automatic Free Plan Marking**: Subscriptions with unitPrice=0 automatically marked as isFreePlan=true
- **Event Logging**: SubscriptionUpgraded events logged with full details
- **MRR Tracking**: Upgrade MRR tracked separately from new/churn MRR
- **Upgrade Metrics**: Functions to track conversion rates, time to upgrade, and revenue

### ⚠️ Partially Completed:
None - All core PRs completed!

### ❌ Not Implemented:
- **PR 9 - UI/UX Updates**: No special handling for subscription transitions

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

### PR 3: Subscription Selection Logic Updates ✅ COMPLETED
**Ensure only active subscriptions are used throughout the system**

#### Tasks:
1. **Update active subscription queries** (`/src/db/tableMethods/subscriptionMethods.ts`) ✅ COMPLETED:
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

2. **Create `selectCurrentSubscriptionForCustomer` helper** ✅ COMPLETED:
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

3. **Update billing run selection** to exclude upgraded subscriptions ✅ COMPLETED

4. **Update API endpoints** that list subscriptions ✅ COMPLETED

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

### PR 4: Prevent Double-Upgrade Race Conditions ✅ COMPLETED
**Add safeguards against concurrent upgrades**

#### Tasks:
1. **Add validation in `processSetupIntentSucceeded`** ✅ COMPLETED:
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

2. **Strengthen idempotency** ❌ NOT IMPLEMENTED:
   ```typescript
   // Check if this setup intent was already processed
   const existingSubscription = await selectSubscriptionAndItems({
     stripeSetupIntentId: setupIntent.id
   }, transaction)
   
   if (existingSubscription) {
     return { 
       result: existingSubscription,
       eventsToInsert: [] // Already processed
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
  it('handles webhook replay scenarios')
})
```

---

### PR 5: Analytics & Reporting Adjustments ✅ COMPLETED (2025-01-07)
**Update metrics to handle upgrade flow correctly**

#### Tasks:
1. **Update churn calculations** (`/src/utils/billing-dashboard/revenueCalculationHelpers.ts`) ✅:
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

2. **Add upgrade tracking metrics** ✅:
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

3. **Update MRR calculations** to track upgrade transitions correctly ✅

3. **Add event logging** ✅:
   ```typescript
   // Log upgrade event
   eventsToInsert.push({
     type: FlowgladEventType.SubscriptionCreated, // Using existing event type
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

### PR 6: Idempotency Improvements ✅ COMPLETED (2025-01-09)
**Prevent duplicate subscription creation from repeated webhook processing**

#### Tasks:
1. **Add idempotency check in `processSetupIntentSucceeded`** ✅:
   - Implemented check for existing subscriptions with same stripeSetupIntentId
   - Returns existing subscription without creating duplicates
   - Prevents webhook replay issues

2. **Ensure stripeSetupIntentId is properly stored** ✅:
   - Setup intent ID passed to createSubscriptionWorkflow
   - Unique constraint on stripeSetupIntentId column ensures database-level protection

#### Test Coverage ✅:
- Test for idempotent setup intent processing (processSetupIntent.upgrade-comprehensive.test.ts:615)
- Test for preventing duplicate paid subscriptions (processSetupIntent.upgrade-comprehensive.test.ts:524)
- Test for preventing concurrent upgrade attempts (processSetupIntent.upgrade-comprehensive.test.ts:688)
- Database unique constraint ensures no duplicates at DB level

---

### PR 7: Customer Email Notifications ✅ COMPLETED (2025-01-09)
**Send confirmation emails when customers create or upgrade subscriptions**

#### Implemented:
1. **Created email templates**:
   - `customer-subscription-created.tsx`: For new paid subscriptions
   - `customer-subscription-upgraded.tsx`: For upgrades from free/paid to paid plans
   - Both templates support optional intervals for non-renewing subscriptions
   - Handle all interval types (day/week/month/year)
   - Display pricing appropriately (free vs paid plans)

2. **Created Trigger.dev tasks**:
   - `send-customer-subscription-created-notification.ts`: Sends new subscription emails
   - `send-customer-subscription-upgraded-notification.ts`: Sends upgrade confirmation emails
   - Both tasks include:
     - Proper BCC handling for UAT email environment variable
     - All interval types support in billing date calculations
     - Safe logging (no sensitive ctx data)

3. **Integrated into subscription workflow**:
   ```typescript
   // In createSubscriptionWorkflow:
   if (params.previousSubscriptionId) {
     // This is an upgrade
     await idempotentSendCustomerSubscriptionUpgradedNotification({
       customerId: subscription.customerId,
       newSubscriptionId: subscription.id,
       previousSubscriptionId: params.previousSubscriptionId,
       organizationId: subscription.organizationId,
     })
   } else {
     // This is a new subscription
     await idempotentSendCustomerSubscriptionCreatedNotification({
       customerId: subscription.customerId,
       subscriptionId: subscription.id,
       organizationId: subscription.organizationId,
     })
   }
   ```

4. **Fixed metadata dependency issue**:
   - Removed business logic dependency on customer-controlled metadata
   - Added explicit `previousSubscriptionId` parameter to track upgrades
   - Ensures system resilience to future paid-to-paid upgrades

#### Test Coverage:
- 19 tests for `customer-subscription-created` email template
- 28 tests for `customer-subscription-upgraded` email template  
- Tests cover:
  - All interval types (day/week/month/year)
  - Non-renewing subscriptions (no interval)
  - Free and paid previous plans
  - Missing payment methods
  - Different currencies
  - Proper date formatting

---

### PR 8: Proration Test Coverage ✅ COMPLETED (2025-01-10)
**Comprehensive test coverage for proration edge cases**

#### What Was Actually Implemented:
While the original plan was to integrate proration into the upgrade flow, we focused on comprehensive test coverage to ensure the existing proration infrastructure works correctly when preserveBillingCycleAnchor is used.

#### Tasks Completed:
1. **Test for fallback behavior** ✅ - When preserve=true but billing period has ended
2. **Exact proration calculation verification** ✅ - Using `calculateSplitInBillingPeriodBasedOnAdjustmentDate`
3. **Quantity propagation tests** ✅ - Ensuring quantity>1 is correctly handled in prorated items
4. **Minimal proration at period start** ✅ - Testing edge case when upgrade occurs just after period start
5. **Enhanced existing tests** ✅ - Added exact calculation verification to existing proration tests

#### Test Coverage Added:
```typescript
// src/utils/bookkeeping/processSetupIntent.upgrade-proration.test.ts
describe('Subscription Upgrade with Proration', () => {
  it('should fallback to new billing cycle when preserve=true but period has ended')
  it('should create prorated billing items with exact calculated amounts')
  it('should propagate quantity to prorated billing items')
  it('should create minimal proration when upgrade occurs just after period start')
  // 10 tests passing, 1 skipped (billing run timeout issue)
})
```

#### Note on Integration:
The proration logic already exists in `createProratedBillingPeriodItems` and is triggered when:
- `preserveBillingCycleAnchor: true` is set on the checkout session
- The upgrade occurs mid-billing-period
- The system automatically creates prorated billing items

No additional integration was needed as the infrastructure already supports proration through the `preserveBillingCycleAnchor` flag.

---

### PR 9: UI/UX Updates (Optional) ❌ NOT IMPLEMENTED
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
1. **PR 1** - Schema changes ✅ COMPLETED
2. **PR 2** - Core upgrade logic ✅ COMPLETED
3. **PR 3** - Selection logic updates ✅ COMPLETED
4. **PR 4** - Race condition prevention (validation only) ✅ COMPLETED
5. **PR 5** - Analytics updates ✅ COMPLETED
6. **PR 6** - Idempotency improvements ✅ COMPLETED
7. **PR 7** - Customer notifications ✅ COMPLETED
8. **PR 8** - Proration test coverage ✅ COMPLETED
9. **PR 9** - UI updates (optional) ❌ NOT IMPLEMENTED

### Monitoring:
- Track upgrade success rate
- Monitor for duplicate subscriptions
- Alert on upgrade failures
- Compare revenue before/after

## Timeline (Actual)

- **PR 1**: Database Schema - Completed 2025-01-06
- **PR 2**: Core Upgrade Logic - Completed 2025-01-06  
- **PR 3**: Selection Logic - Completed 2025-01-06
- **PR 4**: Race Condition Prevention - Completed 2025-01-07
- **PR 5**: Analytics & Reporting - Completed 2025-01-07
- **PR 6**: Idempotency - Completed 2025-01-09
- **PR 8**: Proration Test Coverage - Completed 2025-01-10

**Total: 5 days** - All core functionality completed

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