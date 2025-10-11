# Test Coverage Analysis: Customer Creation Events for Anonymous Checkouts

## Overview
This document outlines the test coverage added for customer creation events during anonymous checkouts, the problems encountered, and the current status.

## Test Cases Added

### 1. Test in `checkoutSessions.test.ts`
**File**: `src/utils/bookkeeping/checkoutSessions.test.ts`

**Test Name**: `should create customer creation events when creating a new customer for anonymous checkout`

**Code Added**:
```typescript
it('should create customer creation events when creating a new customer for anonymous checkout', async () => {
  const updatedCheckoutSession = await adminTransaction(
    async ({ transaction }) => {
      return updateCheckoutSession(
        {
          ...checkoutSession,
          customerId: null,
          customerEmail: 'anonymous@example.com',
          customerName: 'Anonymous Customer',
        } as CheckoutSession.Update,
        transaction
      )
    }
  )

  const { result: bookkeepingResult, eventsToInsert } = await comprehensiveAdminTransaction(
    async ({ transaction }) => {
      const result = await processPurchaseBookkeepingForCheckoutSession(
        {
          checkoutSession: updatedCheckoutSession,
          stripeCustomerId: `cus_${core.nanoid()}`,
        },
        transaction
      )
      return {
        result,
        eventsToInsert: result.eventsToInsert,
        ledgerCommand: result.ledgerCommand,
      }
    }
  )

  expect(bookkeepingResult.customer).toBeDefined()
  expect(bookkeepingResult.customer.email).toEqual('anonymous@example.com')
  expect(bookkeepingResult.customer.name).toEqual('Anonymous Customer')

  expect(eventsToInsert).toBeDefined()
  expect(eventsToInsert).toBeTruthy()
  expect(eventsToInsert!.length).toBeGreaterThan(0)

  const customerCreatedEvent = eventsToInsert!.find(
    (event: any) => event.type === 'customer.created'
  )
  expect(customerCreatedEvent).toBeDefined()
  expect(customerCreatedEvent?.payload.object).toEqual('customer')
  expect(customerCreatedEvent?.payload.customer).toBeDefined()
  expect(customerCreatedEvent?.payload.customer.id).toEqual(bookkeepingResult.customer.id)
  expect(customerCreatedEvent?.payload.customer.externalId).toEqual(bookkeepingResult.customer.externalId)
})
```

**Status**: ✅ **PASSING**

### 2. Test in `processPaymentIntentStatusUpdated.test.ts`
**File**: `src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts`

**Test Name**: `should include customer creation events when processing anonymous checkout`

**Code Added**:
```typescript
it('should include customer creation events when processing anonymous checkout', async () => {
  const anonymousCheckoutSession = await adminTransaction(
    async ({ transaction }) => {
      const session = await setupCheckoutSession({
        organizationId: organization.id,
        customerId: customer.id, // Start with a customer, then remove it
        priceId: price.id,
        status: CheckoutSessionStatus.Open,
        type: CheckoutSessionType.Product,
        quantity: 1,
        livemode: true,
      })

      // Update to remove customer ID to make it anonymous
      return updateCheckoutSession(
        {
          ...session,
          customerId: null,
          customerEmail: 'anonymous@example.com',
          customerName: 'Anonymous Customer',
        } as any,
        transaction
      )
    }
  )

  // Create a fee calculation for the anonymous checkout
  await adminTransaction(async ({ transaction }) => {
    await setupFeeCalculation({
      checkoutSessionId: anonymousCheckoutSession.id,
      organizationId: organization.id,
      priceId: price.id,
      livemode: true,
    })
  })

  const mockPaymentIntent = {
    id: `pi_${core.nanoid()}`,
    status: 'succeeded' as const,
    metadata: {
      type: 'checkout_session',
      checkoutSessionId: anonymousCheckoutSession.id,
    },
    latest_charge: `ch_${core.nanoid()}` as any,
  }

  // Mock the Stripe charge
  const mockCharge = createMockStripeCharge({
    id: mockPaymentIntent.latest_charge,
    payment_intent: mockPaymentIntent.id,
    status: 'succeeded',
    amount: 10000,
    currency: 'usd',
    payment_method_details: {
      type: 'card',
      card: {
        brand: 'visa',
        last4: '4242',
      },
    } as any,
  })
  vi.mocked(getStripeCharge).mockResolvedValue(mockCharge)

  const { result, eventsToInsert } = await adminTransaction(
    async ({ transaction }) =>
      processPaymentIntentStatusUpdated(
        mockPaymentIntent,
        transaction
      )
  )

  // Debug: log all events to see what we're getting
  console.log('All events:', eventsToInsert?.map(e => ({ type: e.type, object: e.payload.object })))

  // Should have PaymentSucceeded event
  const paymentSucceededEvent = eventsToInsert?.find(
    (e) => e.type === FlowgladEventType.PaymentSucceeded
  )
  expect(paymentSucceededEvent).toBeDefined()

  // Should have CustomerCreated event from the anonymous checkout
  const customerCreatedEvent = eventsToInsert?.find(
    (e) => e.type === FlowgladEventType.CustomerCreated
  )
  expect(customerCreatedEvent).toBeDefined()
  expect(customerCreatedEvent?.payload.object).toEqual(EventNoun.Customer)
  expect(customerCreatedEvent?.payload.customer).toBeDefined()
})
```

**Status**: ✅ **PASSING**

## Problems Encountered and Solutions

### Problem 1: Type Errors in `checkoutSessions.test.ts`
**Error**: `Property 'eventsToInsert' does not exist on type '{ purchase: ... }'`

**Root Cause**: Incorrect destructuring of the return value from `comprehensiveAdminTransaction`

**Solution**: Changed from:
```typescript
const bookkeepingResult = await comprehensiveAdminTransaction(...)
const eventsToInsert = bookkeepingResult.eventsToInsert
```

To:
```typescript
const { result: bookkeepingResult, eventsToInsert } = await comprehensiveAdminTransaction(...)
```

### Problem 2: Event Type Mismatch
**Error**: Test was looking for `CustomerCreated` but actual event type was `customer.created`

**Root Cause**: Event type constants vs actual event type strings

**Solution**: Updated test to look for `'customer.created'` instead of `FlowgladEventType.CustomerCreated`

### Problem 3: Stripe Metadata Schema Validation
**Error**: `ZodError: Invalid input` for payment intent metadata

**Root Cause**: Mock metadata used `type: 'CheckoutSession'` but schema expected `type: 'checkout_session'`

**Solution**: Updated mock to use snake_case:
```typescript
metadata: {
  type: 'checkout_session',  // was 'CheckoutSession'
  checkoutSessionId: anonymousCheckoutSession.id,
}
```

### Problem 4: Missing Stripe Charge Mock
**Error**: `No charge found for payment intent`

**Root Cause**: `processPaymentIntentStatusUpdated` calls `getStripeCharge()` which wasn't mocked

**Solution**: Added proper Stripe charge mock:
```typescript
const mockCharge = createMockStripeCharge({
  id: mockPaymentIntent.latest_charge,
  payment_intent: mockPaymentIntent.id,
  status: 'succeeded',
  amount: 10000,
  currency: 'usd',
  payment_method_details: {
    type: 'card',
    card: { brand: 'visa', last4: '4242' },
  } as any,
})
vi.mocked(getStripeCharge).mockResolvedValue(mockCharge)
```

### Problem 5: Missing Payment Method Details
**Error**: `No payment method details found for charge`

**Root Cause**: Mock charge was missing `payment_method_details`

**Solution**: Added `payment_method_details` to the mock charge

## Current Problem

### Issue: Customer Creation Events Not Bubbling Up
**Status**: ❌ **FAILING**

**Debug Output**:
```
All events: [
  { type: 'payment.succeeded', object: 'payment' },
  { type: 'purchase.completed', object: 'purchase' }
]
```

**Expected Events**:
- `payment.succeeded` ✅ (present)
- `purchase.completed` ✅ (present)  
- `customer.created` ❌ (missing)

### Hypothesis
The customer creation events are being generated in `processPurchaseBookkeepingForCheckoutSession` but are not being properly passed through the call chain:

1. `processPurchaseBookkeepingForCheckoutSession` → generates `customer.created` event
2. `processStripeChargeForCheckoutSession` → should pass through events
3. `upsertPaymentForStripeCharge` → should capture events in `checkoutSessionEvents`
4. `processPaymentIntentStatusUpdated` → should include events in final return

**Code Flow Analysis**:
- ✅ `processPurchaseBookkeepingForCheckoutSession` returns `eventsToInsert` (line 673 in checkoutSessions.ts)
- ✅ `processStripeChargeForCheckoutSession` returns `eventsToInsert: purchaseBookkeepingResult?.eventsToInsert || []` (line 673)
- ✅ `upsertPaymentForStripeCharge` captures `eventsFromCheckoutSession` (line 155) and assigns to `checkoutSessionEvents` (line 163)
- ✅ `processPaymentIntentStatusUpdated` returns `[...checkoutSessionEvents, ...eventInserts]` (line 587)

### Proposed Solution
The issue might be that the customer creation is not happening in the anonymous checkout flow. Let me investigate:

1. **Verify customer creation is actually happening**: Add debug logging to see if `createCustomerBookkeeping` is being called
2. **Check if anonymous checkout is being processed correctly**: Ensure the checkout session is properly set up as anonymous
3. **Verify event generation**: Add logging to see what events are generated at each step

**Next Steps**:
1. Add debug logging to `createCustomerBookkeeping` to confirm it's being called
2. Add debug logging to `processPurchaseBookkeepingForCheckoutSession` to see what events it generates
3. Add debug logging to `processStripeChargeForCheckoutSession` to see what events it returns
4. Verify the anonymous checkout session setup is correct

## Final Fix Applied

### Problem 6: Event Bubbling Chain Broken
**Root Cause**: The `upsertPaymentForStripeCharge` function was collecting `checkoutSessionEvents` from `processStripeChargeForCheckoutSession` but **not returning** these events - only returning the `Payment.Record`.

**Solution**: Modified `upsertPaymentForStripeCharge` to return both payment and events:

```typescript
// Changed return type
): Promise<{ payment: Payment.Record; eventsToInsert: Event.Insert[] }> => {

// Updated return statement
return { payment: latestPayment, eventsToInsert: checkoutSessionEvents }

// Updated call site
const { payment, eventsToInsert: checkoutSessionEvents } = await upsertPaymentForStripeCharge(...)
```

**Result**: Customer creation events now properly bubble up through the entire call chain! 🎉

## Summary
- ✅ First test (direct `processPurchaseBookkeepingForCheckoutSession`) is working
- ✅ Second test (through `processPaymentIntentStatusUpdated`) is now working
- ✅ Event bubbling chain is fixed
- ✅ Customer creation events are properly generated and returned for anonymous checkouts
