# PR 7: Customer Subscription Notification Test Strategy

## Overview
This document outlines the comprehensive test strategy for the customer subscription email notification feature. Tests are organized by component and scenario to ensure complete coverage of all notification paths.

## 1. Email Template Tests

### CustomerSubscriptionCreatedEmail Component
**File**: `src/email-templates/__tests__/customer-subscription-created.test.tsx`

#### Test Cases:
1. **Renders with all required props**
   - Setup: Provide all required props with valid data
   - Expectations: Component renders without errors, all fields displayed

2. **Formats monthly subscription correctly**
   - Setup: Pass interval='month', price=1000 (e.g., $10.00)
   - Expectations: Shows "$10.00/month" in price display

3. **Formats yearly subscription correctly**
   - Setup: Pass interval='year', price=12000
   - Expectations: Shows "$120.00/year" in price display

4. **Handles missing payment method gracefully**
   - Setup: Pass paymentMethodLast4 as undefined
   - Expectations: Shows generic payment text without last 4 digits

5. **Includes organization branding when logo provided**
   - Setup: Pass organizationLogoUrl with valid URL
   - Expectations: Logo img tag present in header

6. **Generates correct billing portal URL**
   - Setup: Pass valid organizationId and customerExternalId
   - Expectations: Button href contains correct portal URL structure

7. **Displays next billing date in readable format**
   - Setup: Pass nextBillingDate as Date object
   - Expectations: Date formatted as human-readable string (e.g., "Jan 15, 2025")

### CustomerSubscriptionUpgradedEmail Component
**File**: `src/email-templates/__tests__/customer-subscription-upgraded.test.tsx`

#### Test Cases:
1. **Renders with all required props**
   - Setup: Provide all props including previousPlanName
   - Expectations: Component renders, shows both old and new plan names

2. **Shows clear transition from free to paid**
   - Setup: previousPlanName="Free Plan", newPlanName="Pro Plan"
   - Expectations: Shows "Previous plan: Free Plan (Free)" and "New plan: Pro Plan"

3. **Displays first charge date prominently**
   - Setup: Pass nextBillingDate for immediate charge
   - Expectations: Shows "First charge: [date]" instead of "Next billing date"

4. **Includes upgrade confirmation in subject/header**
   - Setup: Standard props
   - Expectations: Header shows "Subscription upgraded" clearly

5. **All other standard cases from Created template**
   - Currency formatting, payment method, portal URL, etc.

## 2. Trigger.dev Task Tests

### sendCustomerSubscriptionCreatedNotificationTask
**File**: `src/trigger/notifications/__tests__/send-customer-subscription-created-notification.test.ts`

#### Test Cases:

1. **Successfully sends email for new paid subscription**
   - Setup: Mock valid customer, subscription, price (unitPrice > 0), organization
   - Expectations: safeSend called with correct template and data

2. **Skips notification when customer has no email**
   - Setup: Customer with email = null
   - Expectations: Returns early with warning, no email sent

3. **Handles missing payment method data**
   - Setup: No payment methods returned for customer
   - Expectations: Email sent with undefined paymentMethodLast4

4. **Uses default payment method when available**
   - Setup: Multiple payment methods, one marked as default
   - Expectations: Uses the default payment method's last4

5. **Falls back to first payment method when no default**
   - Setup: Multiple payment methods, none marked as default
   - Expectations: Uses first payment method's last4

6. **Extracts last4 from paymentMethodData JSON**
   - Setup: Payment method with paymentMethodData.last4 = "4242"
   - Expectations: Email receives "4242" as paymentMethodLast4

7. **Calculates monthly billing date correctly**
   - Setup: Subscription created Jan 15, price.intervalUnit = 'month'
   - Expectations: nextBillingDate = Feb 15

8. **Calculates yearly billing date correctly**
   - Setup: Subscription created Jan 15, price.intervalUnit = 'year'
   - Expectations: nextBillingDate = Jan 15 next year

9. **Handles interval count for billing calculations**
   - Setup: intervalUnit='month', intervalCount=3
   - Expectations: nextBillingDate = 3 months from creation

10. **Uses correct from address with organization name**
    - Setup: Organization name = "Acme Corp"
    - Expectations: From = "Acme Corp Billing <acme-corp-notifications@flowglad.com>"

### sendCustomerSubscriptionUpgradedNotificationTask
**File**: `src/trigger/notifications/__tests__/send-customer-subscription-upgraded-notification.test.ts`

#### Test Cases:

1. **Successfully sends upgrade email with both subscriptions**
   - Setup: Valid old and new subscriptions, both with prices
   - Expectations: Email shows transition, uses upgraded template

2. **Handles missing previous subscription gracefully**
   - Setup: previousSubscriptionId points to non-existent subscription
   - Expectations: Throws error with clear message

3. **Handles missing prices for subscriptions**
   - Setup: Subscription.priceId is null
   - Expectations: Uses fallback text for plan names

4. **Uses subscription name over price name**
   - Setup: Both subscription.name and price.name exist
   - Expectations: Prefers subscription.name in email

5. **All standard cases from Created notification task**
   - Customer email, payment method, billing calculations, etc.

### Idempotency Wrapper Tests

1. **Prevents duplicate emails for same subscription**
   - Setup: Call idempotent wrapper twice with same subscriptionId
   - Expectations: Only one trigger.dev task triggered

2. **Generates unique keys for different subscriptions**
   - Setup: Call with different subscriptionIds
   - Expectations: Both tasks trigger successfully

## 3. Workflow Integration Tests

### createSubscriptionWorkflow Integration
**File**: `src/subscriptions/createSubscription/__tests__/workflow.test.ts`

#### Test Cases:

1. **Sends customer notification for new paid subscription**
   - Setup: Create subscription with unitPrice > 0, no upgrade metadata
   - Expectations: idempotentSendCustomerSubscriptionCreatedNotification called

2. **Sends upgrade notification when metadata present**
   - Setup: Create subscription with upgraded_from_subscription_id in metadata
   - Expectations: idempotentSendCustomerSubscriptionUpgradedNotification called

3. **Does NOT send notification for free subscription**
   - Setup: Create subscription with unitPrice = 0
   - Expectations: No customer notification functions called

4. **Sends both org and customer notifications for paid**
   - Setup: Create paid subscription
   - Expectations: Both organization and customer notifications triggered

5. **Notification failure doesn't fail subscription creation**
   - Setup: Mock notification to throw error
   - Expectations: Subscription created successfully, error logged

6. **Passes correct parameters to notification functions**
   - Setup: Create subscription with specific IDs
   - Expectations: Notification receives correct customerId, subscriptionId, organizationId

## 4. ProcessSetupIntent Integration Tests

### Upgrade Flow Tests
**File**: `src/utils/bookkeeping/__tests__/processSetupIntent.upgrade.test.ts`

#### Test Cases:

1. **Includes upgrade metadata when canceling free subscription**
   - Setup: Customer has free subscription, processes setup intent
   - Expectations: metadata.upgraded_from_subscription_id = canceled subscription ID

2. **Links old and new subscriptions via replacedBySubscriptionId**
   - Setup: Process upgrade from free to paid
   - Expectations: Old subscription has replacedBySubscriptionId = new subscription ID

3. **No upgrade metadata when no free subscription exists**
   - Setup: Customer has no existing free subscription
   - Expectations: metadata.upgraded_from_subscription_id is undefined

4. **Upgrade metadata flows to notification system**
   - Setup: Complete upgrade flow
   - Expectations: Notification task receives previousSubscriptionId

## 5. End-to-End Notification Flow Tests

### Complete Notification Journey
**File**: `src/trigger/notifications/__tests__/customer-notification-flow.e2e.test.ts`

#### Test Cases:

1. **New customer creates first paid subscription**
   - Setup: New customer, no prior subscriptions
   - Expectations: 
     - Receives "subscription active" email
     - No reference to previous plans
     - Correct billing details

2. **Customer upgrades from free to paid**
   - Setup: Customer with active free subscription
   - Expectations:
     - Receives "subscription upgraded" email
     - Shows free → paid transition
     - First charge date displayed

3. **Customer with multiple free subscriptions upgrades**
   - Setup: Customer has 2+ free subscriptions
   - Expectations:
     - Only most recent free subscription canceled
     - Upgrade email references correct previous subscription

4. **Notification content matches subscription details**
   - Setup: Create subscription with specific price, interval, payment method
   - Expectations:
     - Email shows exact price
     - Correct interval text
     - Payment method last 4 matches

## 6. Error Handling & Edge Cases

### Resilience Tests

1. **Handles Resend API failures gracefully**
   - Setup: Mock Resend to return error
   - Expectations: Error logged, task returns error status, subscription still created

2. **Handles missing organization gracefully**
   - Setup: organizationId points to non-existent org
   - Expectations: Task throws with clear error message

3. **Handles database transaction failures**
   - Setup: Mock transaction to fail during data fetch
   - Expectations: Task fails cleanly, no partial email send

4. **Handles malformed payment method data**
   - Setup: paymentMethodData is not an object or missing last4
   - Expectations: Email sent with undefined last4, no crash

5. **Test environment safety**
   - Setup: Run in test environment (IS_TEST = true)
   - Expectations: Email logged but not actually sent

## 7. Test Data Factories

### Required Test Helpers
```typescript
// Test data factories needed
createTestCustomer()
createTestSubscription() 
createTestPrice()
createTestOrganization()
createTestPaymentMethod()
createTestCheckoutSession()

// Mock helpers
mockSafeSend()
mockAdminTransaction()
mockTriggerTask()
```

## 8. Performance & Load Tests

### Notification Performance

1. **Handles high volume of concurrent notifications**
   - Setup: Trigger 100 notifications simultaneously
   - Expectations: All complete within reasonable time, no deadlocks

2. **Respects Trigger.dev concurrency limits**
   - Setup: Queue more tasks than concurrency limit
   - Expectations: Tasks process at configured rate

## Test Execution Strategy

### Priority Order:
1. **Critical Path** (Must pass before deployment):
   - Email template rendering
   - Basic notification sending
   - Workflow integration
   - Upgrade metadata flow

2. **Important** (Should pass before deployment):
   - Error handling
   - Edge cases
   - Idempotency

3. **Nice to Have** (Can be added post-deployment):
   - Performance tests
   - Load tests

### Test Coverage Goals:
- Email Templates: 100% branch coverage
- Trigger Tasks: 90% branch coverage
- Integration Points: 85% coverage
- Overall: 90% line coverage

## Mocking Strategy

### What to Mock:
- Resend email service (safeSend)
- Database transactions (for unit tests)
- Trigger.dev task execution
- External API calls

### What NOT to Mock:
- Data transformation logic
- Business logic conditions
- Template rendering logic
- Metadata flow

## Test Maintenance

### When to Update Tests:
- New email fields added
- Notification conditions change
- Upgrade logic modified
- New subscription types added

### Test Documentation:
- Each test file should have clear descriptions
- Complex setup should be commented
- Share test utilities across test files
- Keep test data factories up to date