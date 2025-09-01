# Test Plan: Setup Intent Subscription Upgrade Flow

## Test Cases for `processSetupIntentSucceeded` - Upgrade Functionality

### Scenario 1: Customer with Free Subscription Upgrading to Paid
**Setup:**
- Organization with default pricing model and free product/price (unitPrice = 0)
- Customer with active free subscription (isFreePlan = true)
- Checkout session for paid product
- Successful setup intent for the checkout session

**Expectations:**
- Original free subscription should be canceled with status = 'canceled'
- Original free subscription should have cancellationReason = 'upgraded_to_paid'
- New paid subscription should be created and active
- Original subscription's replacedBySubscriptionId should equal new subscription's ID
- New subscription's metadata should contain upgraded_from_subscription_id
- Both operations should happen atomically in the same transaction

### Scenario 2: Customer with No Existing Subscription
**Setup:**
- Organization with pricing model
- Customer without any subscriptions
- Checkout session for paid product
- Successful setup intent

**Expectations:**
- New subscription should be created normally
- No subscriptions should be canceled
- New subscription should not have upgrade-related metadata

### Scenario 3: Customer with Multiple Free Subscriptions (Edge Case)
**Setup:**
- Customer with two active free subscriptions (different products)
- Checkout session for paid product
- Successful setup intent

**Expectations:**
- Only one free subscription should be canceled (most recent or primary)
- Other free subscription should remain active
- New paid subscription should be created
- Canceled subscription should be linked to new one

### Scenario 4: Customer Already Has Paid Subscription
**Setup:**
- Customer with active paid subscription (unitPrice > 0)
- Customer also has active free subscription
- Checkout session for different paid product
- Successful setup intent

**Expectations:**
- Free subscription should be canceled
- New paid subscription should be created
- Existing paid subscription should remain unchanged
- Customer ends up with two paid subscriptions (allowed)

### Scenario 5: Failed Subscription Creation After Cancellation
**Setup:**
- Customer with active free subscription
- Checkout session for paid product with invalid data that will cause creation to fail
- Successful setup intent

**Expectations:**
- Transaction should roll back completely
- Free subscription should remain active (not canceled)
- No new subscription should exist
- Error should be thrown with appropriate message

### Scenario 6: Idempotency - Same Setup Intent Processed Twice
**Setup:**
- Customer with active free subscription
- Checkout session for paid product
- Same setup intent processed twice (webhook replay scenario)

**Expectations:**
- First processing: free subscription canceled, new subscription created
- Second processing: should recognize idempotency and return existing result
- Should not create duplicate subscriptions
- Should not double-cancel the free subscription

### Scenario 7: Non-Subscription Checkout Types Unaffected
**Setup:**
- Customer with active free subscription
- Checkout session of type AddPaymentMethod or ActivateSubscription
- Successful setup intent

**Expectations:**
- Free subscription should remain active (not canceled)
- Payment method or activation should proceed normally
- No new subscription should be created

### Scenario 8: Metadata and Audit Trail
**Setup:**
- Customer with free subscription containing custom metadata
- Checkout session for paid product
- Successful setup intent

**Expectations:**
- New subscription should preserve relevant metadata from free subscription
- New subscription should add upgrade_date and upgraded_from_subscription_id
- Canceled subscription should have clear cancellation timestamp
- Both subscriptions should maintain audit trail for reporting

### Scenario 9: Free Subscription with Active Billing Period
**Setup:**
- Customer with free subscription that somehow has an active billing period
- Checkout session for paid product
- Successful setup intent

**Expectations:**
- Free subscription's billing period should be properly closed
- New subscription should create its own billing period
- No billing period conflicts should occur

### Scenario 10: Customer with Canceled Free Subscription
**Setup:**
- Customer with previously canceled free subscription (status = 'canceled')
- Checkout session for paid product
- Successful setup intent

**Expectations:**
- Canceled free subscription should remain unchanged
- New subscription should be created normally
- No linking between old canceled and new subscription

## Test Cases for Helper Function: `cancelFreeSubscriptionIfExists`

### Scenario 1: Single Active Free Subscription
**Setup:**
- Customer with one active free subscription (isFreePlan = true)

**Expectations:**
- Should return the canceled subscription
- Subscription status should be 'canceled'
- cancellationReason should be 'upgraded_to_paid'
- canceledAt should be set to current time

### Scenario 2: No Free Subscription
**Setup:**
- Customer with only paid subscriptions or no subscriptions

**Expectations:**
- Should return null
- No subscriptions should be modified

### Scenario 3: Already Canceled Free Subscription
**Setup:**
- Customer with canceled free subscription

**Expectations:**
- Should return null
- Canceled subscription should remain unchanged

## Integration Test Cases

### Scenario 1: End-to-End Upgrade Flow
**Setup:**
- Complete flow from customer creation with default free subscription
- Through checkout session creation
- To setup intent success and upgrade

**Expectations:**
- Customer should end with exactly one active subscription (paid)
- Free subscription should be properly canceled and linked
- All events should be logged correctly
- Billing should be set up correctly for paid subscription