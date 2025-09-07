# PR 7: Customer Subscription Notification Implementation Plan

## Overview
Add customer email notifications when subscriptions are created or upgraded. Currently, only organization members receive subscription notifications - customers receive no confirmation email when their subscription is activated.

## Goals
1. Send confirmation emails to customers when paid subscriptions are created
2. Differentiate between new subscriptions and upgrades in messaging
3. Keep emails minimal and billing-focused (we're infrastructure, not the product)
4. Maintain consistency with existing notification patterns

## Implementation Steps

### Step 1: Create Email Templates

#### Template 1: New Subscription Confirmation
**File**: `/platform/flowglad-next/src/components/emails/customer-subscription-created.tsx`

```typescript
interface CustomerSubscriptionCreatedEmailProps {
  customerName: string
  organizationName: string
  planName: string
  price: number
  interval: 'month' | 'year'
  nextBillingDate: string
  paymentMethodLast4: string
  billingPortalUrl: string
}
```

**Email Content**:
- Subject: "Payment method confirmed - Subscription active"
- Body: Clean confirmation of new subscription details
- Tone: Informational, straightforward billing confirmation

#### Template 2: Subscription Upgrade Confirmation  
**File**: `/platform/flowglad-next/src/components/emails/customer-subscription-upgraded.tsx`

```typescript
interface CustomerSubscriptionUpgradedEmailProps {
  customerName: string
  organizationName: string
  previousPlanName: string
  newPlanName: string
  price: number
  interval: 'month' | 'year'
  nextBillingDate: string
  paymentMethodLast4: string
  billingPortalUrl: string
  upgradeDate: string
}
```

**Email Content**:
- Subject: "Payment method confirmed - Subscription upgraded"
- Body: Shows transition from free to paid plan
- Tone: Acknowledges the upgrade action, confirms new billing terms

### Step 2: Create Trigger.dev Tasks

#### Task 1: New Subscription Notification
**File**: `/platform/flowglad-next/src/trigger/notifications/send-customer-subscription-created-notification.ts`

```typescript
export const sendCustomerSubscriptionCreatedNotification = task({
  id: 'send-customer-subscription-created-notification',
  maxDuration: 60,
  queue: { concurrencyLimit: 10 },
  run: async (payload: {
    customerId: string
    subscriptionId: string
    organizationId: string
  }) => {
    // 1. Fetch customer, subscription, organization, price, payment method
    // 2. Format data for new subscription email template
    // 3. Send email via safeSend() with CustomerSubscriptionCreatedEmail
    // 4. Return success/failure
  }
})
```

#### Task 2: Upgrade Notification
**File**: `/platform/flowglad-next/src/trigger/notifications/send-customer-subscription-upgraded-notification.ts`

```typescript
export const sendCustomerSubscriptionUpgradedNotification = task({
  id: 'send-customer-subscription-upgraded-notification',
  maxDuration: 60,
  queue: { concurrencyLimit: 10 },
  run: async (payload: {
    customerId: string
    newSubscriptionId: string
    previousSubscriptionId: string
    organizationId: string
  }) => {
    // 1. Fetch customer, both subscriptions, organization, price, payment method
    // 2. Format data showing transition from old to new
    // 3. Send email via safeSend() with CustomerSubscriptionUpgradedEmail
    // 4. Return success/failure
  }
})
```

### Step 3: Add Idempotent Trigger Functions

#### For New Subscriptions
**File**: `/platform/flowglad-next/src/trigger/notifications/idempotentSendCustomerSubscriptionCreatedNotification.ts`

```typescript
export const idempotentSendCustomerSubscriptionCreatedNotification = async (
  params: {
    customerId: string
    subscriptionId: string
    organizationId: string
  }
) => {
  const idempotencyKey = generateIdempotencyKey({
    fn: 'send-customer-subscription-created-notification',
    customerId: params.customerId,
    subscriptionId: params.subscriptionId,
  })
  
  return await sendCustomerSubscriptionCreatedNotification.triggerAndWait(
    params,
    { idempotencyKey }
  )
}
```

#### For Upgrades
**File**: `/platform/flowglad-next/src/trigger/notifications/idempotentSendCustomerSubscriptionUpgradedNotification.ts`

```typescript
export const idempotentSendCustomerSubscriptionUpgradedNotification = async (
  params: {
    customerId: string
    newSubscriptionId: string
    previousSubscriptionId: string
    organizationId: string
  }
) => {
  const idempotencyKey = generateIdempotencyKey({
    fn: 'send-customer-subscription-upgraded-notification',
    customerId: params.customerId,
    newSubscriptionId: params.newSubscriptionId,
    previousSubscriptionId: params.previousSubscriptionId,
  })
  
  return await sendCustomerSubscriptionUpgradedNotification.triggerAndWait(
    params,
    { idempotencyKey }
  )
}
```

### Step 4: Integrate into Subscription Creation Workflow
**File**: `/platform/flowglad-next/src/subscriptions/createSubscription/workflow.ts`

Modify the workflow to trigger appropriate customer notification based on context:

```typescript
// Around line 128, after organization notification
if (price.unitPrice !== 0) {
  // Existing organization notification
  await idempotentSendOrganizationSubscriptionCreatedNotification(...)
  
  // NEW: Customer notification - choose based on upgrade status
  if (metadata?.upgraded_from_subscription_id) {
    // This is an upgrade from free to paid
    await idempotentSendCustomerSubscriptionUpgradedNotification({
      customerId: subscription.customerId,
      newSubscriptionId: subscription.id,
      previousSubscriptionId: metadata.upgraded_from_subscription_id,
      organizationId: subscription.organizationId
    })
  } else {
    // This is a new paid subscription
    await idempotentSendCustomerSubscriptionCreatedNotification({
      customerId: subscription.customerId,
      subscriptionId: subscription.id,
      organizationId: subscription.organizationId
    })
  }
}
```

### Step 5: Update ProcessSetupIntent for Upgrade Metadata
**File**: `/platform/flowglad-next/src/utils/bookkeeping/processSetupIntent.ts`

Ensure upgrade metadata is properly passed through:

```typescript
// When creating subscription after canceling free plan
const result = await createSubscriptionFromSetupIntentableCheckoutSession({
  ...existingParams,
  metadata: {
    ...checkoutSession.outputMetadata,
    upgraded_from_subscription_id: canceledSubscription?.id,
    is_upgrade: !!canceledSubscription
  }
}, transaction)
```

## Test Strategy

**📋 Comprehensive test strategy available in: `pr7-test-strategy.md`**

The test strategy covers:
- Email template rendering tests for both templates
- Trigger.dev task unit tests with mocking
- Workflow integration tests
- End-to-end notification flow tests
- Error handling and edge cases
- Performance and load testing considerations

### Test Coverage Goals:
- Email Templates: 100% branch coverage
- Trigger Tasks: 90% branch coverage  
- Integration Points: 85% coverage
- Overall: 90% line coverage

### 1. Email Template Tests

#### New Subscription Template Tests
**File**: `/platform/flowglad-next/src/components/emails/__tests__/customer-subscription-created.test.tsx`

```typescript
describe('CustomerSubscriptionCreatedEmail', () => {
  it('renders subject line correctly')
  it('displays plan name and pricing')
  it('formats monthly pricing correctly')
  it('formats yearly pricing correctly')
  it('includes payment method last 4 digits')
  it('includes billing portal link')
  it('shows next billing date in correct format')
  it('does NOT show any upgrade-related content')
})
```

#### Upgrade Template Tests
**File**: `/platform/flowglad-next/src/components/emails/__tests__/customer-subscription-upgraded.test.tsx`

```typescript
describe('CustomerSubscriptionUpgradedEmail', () => {
  it('renders upgrade-specific subject line')
  it('shows previous plan name clearly')
  it('shows new plan name and pricing')
  it('displays transition arrow or similar visual indicator')
  it('includes upgrade date')
  it('formats pricing for both monthly and yearly')
  it('includes payment method confirmation')
  it('includes billing portal link for management')
})
```

### 2. Trigger Task Tests

#### New Subscription Task Tests
**File**: `/platform/flowglad-next/src/trigger/notifications/__tests__/send-customer-subscription-created-notification.test.ts`

```typescript
describe('sendCustomerSubscriptionCreatedNotification', () => {
  it('sends email for new paid subscription')
  it('uses correct email template (CustomerSubscriptionCreatedEmail)')
  it('handles missing customer email gracefully')
  it('handles missing payment method gracefully')
  it('retrieves correct organization branding')
  it('generates correct billing portal URL')
  it('does not reference any previous subscription')
})
```

#### Upgrade Task Tests  
**File**: `/platform/flowglad-next/src/trigger/notifications/__tests__/send-customer-subscription-upgraded-notification.test.ts`

```typescript
describe('sendCustomerSubscriptionUpgradedNotification', () => {
  it('sends email for upgrade from free to paid')
  it('uses correct email template (CustomerSubscriptionUpgradedEmail)')
  it('fetches both old and new subscription details')
  it('includes previous plan name in email data')
  it('handles missing previous subscription gracefully')
  it('calculates upgrade date correctly')
  it('handles missing customer email gracefully')
  it('retrieves correct organization branding')
})
```

### 3. Workflow Integration Tests
**File**: `/platform/flowglad-next/src/subscriptions/createSubscription/__tests__/workflow.test.ts`

Add new test cases:

```typescript
describe('createSubscriptionWorkflow - Customer Notifications', () => {
  it('sends customer notification for paid subscription')
  it('does not send customer notification for free subscription')
  it('includes upgrade metadata when upgraded_from_subscription_id present')
  it('sends both organization and customer notifications for paid')
  it('handles notification failure without failing subscription creation')
})
```

### 4. End-to-End Upgrade Flow Tests
**File**: `/platform/flowglad-next/src/utils/bookkeeping/__tests__/processSetupIntent.upgrade.test.ts`

Add notification verification:

```typescript
describe('Setup Intent Upgrade - Customer Notifications', () => {
  it('sends upgrade email when canceling free for paid')
  it('includes previous subscription ID in notification payload')
  it('sends new subscription email when no free plan exists')
  it('notification reflects correct upgrade metadata')
  it('handles concurrent notification attempts (idempotency)')
})
```

### 5. Integration Tests with Email Service
**File**: `/platform/flowglad-next/src/utils/__tests__/email.integration.test.ts`

```typescript
describe('Customer Subscription Email Integration', () => {
  it('successfully sends via Resend in production mode')
  it('logs but does not send in test mode')
  it('handles Resend API errors gracefully')
  it('includes all required email fields')
  it('respects email allowlist in test environments')
})
```

## Edge Cases to Handle

1. **Missing customer email**: Log warning, skip notification
2. **Missing payment method**: Use placeholder text "your payment method"
3. **Failed notification**: Log error but don't fail subscription creation
4. **Duplicate notifications**: Idempotency key prevents duplicates
5. **Test environment**: Respect email allowlist, log instead of send
6. **Multiple upgrades**: Each upgrade gets its own notification
7. **Organization settings**: Consider adding toggle for customer notifications (future)

## Rollback Plan

1. **Feature flag**: Add `ENABLE_CUSTOMER_SUBSCRIPTION_NOTIFICATIONS` env var
2. **Gradual rollout**: Start with specific organization IDs
3. **Monitoring**: Track email send success rate
4. **Quick disable**: Can disable via env var without code changes

## Success Metrics

1. **Email delivery rate**: >95% successful sends
2. **No duplicate emails**: Idempotency prevents duplicates
3. **Correct differentiation**: Upgrades vs new tracked accurately
4. **No impact on subscription creation**: Notification failures don't block subscriptions
5. **Customer feedback**: Monitor for confusion or complaints

## Implementation Order

### Phase 1: Core Implementation ✅ COMPLETED
1. Create both email template components ✅
2. Create new subscription Trigger.dev task ✅
3. Create upgrade Trigger.dev task ✅
4. Add idempotent wrappers for both ✅
5. Integrate into workflow with conditional logic ✅
6. Update processSetupIntent metadata ✅

### Phase 2: Testing (Next Steps)
7. Write email template unit tests
8. Write Trigger task tests with mocks
9. Add workflow integration tests
10. Create end-to-end notification tests
11. Manual testing in development

### Phase 3: Deployment
12. Deploy with feature flag disabled
13. Test with internal organization
14. Gradual rollout to customers

## Time Estimate

- Email templates (2 separate): 3-4 hours
- Trigger tasks (2 separate): 3-4 hours  
- Integration: 2 hours
- Testing: 4-5 hours (more test cases with 2 templates)
- QA and refinement: 2 hours

**Total: 2-2.5 days**

*Note: Slightly longer than single template approach, but results in clearer intent and better user experience*

## Dependencies

- Existing email infrastructure (Resend)
- Existing Trigger.dev setup
- Customer email addresses in database
- Payment method information available
- Billing portal URL generation

## Questions to Resolve

1. Should we add organization setting to disable customer notifications?
2. Should free → free plan changes trigger notifications?
3. Should we batch notifications for multiple subscriptions?
4. What's the correct reply-to address for these emails?
5. Should we track email opens/clicks?

## Implementation Status

### ✅ Completed:
- Email templates created (both new and upgrade)
- Trigger.dev tasks implemented
- Workflow integration complete
- Upgrade metadata flow established
- Subscription linking via replacedBySubscriptionId

### 📝 Next Steps:
- Implement comprehensive test suite per `pr7-test-strategy.md`
- Add feature flag for gradual rollout
- Consider organization-level notification preferences
- Monitor email delivery rates post-deployment