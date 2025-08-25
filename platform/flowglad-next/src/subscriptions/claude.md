# Subscriptions System Documentation

## What the heck is going on with this directory?

This directory contains Flowglad's core subscription billing engine - a comprehensive, production-ready system for managing SaaS subscriptions with support for usage-based billing, trials, proration, and complex billing cycles. It handles everything from subscription creation to cancellation, including payment processing, invoice generation, and state management. This is the financial heart of the application.

### Why would you use code in this directory?

- **Subscription Lifecycle**: Creating, modifying, or canceling subscriptions
- **Billing Operations**: Processing payments, generating invoices, calculating fees
- **Usage Tracking**: Managing usage-based billing and credit systems
- **Trial Management**: Handling credit trials and time-based trials
- **Billing Cycles**: Managing monthly/yearly billing periods and transitions
- **Proration**: Calculating prorated charges for mid-cycle changes

## Directory Structure

```
subscriptions/
├── README.md                           # System documentation
├── schemas.ts                          # Zod validation schemas
├── adjustSubscription.ts               # Subscription modifications
├── cancelSubscription.ts               # Cancellation workflows
├── setupState.ts                       # State management utilities
├── billingIntervalHelpers.ts           # Billing cycle calculations
├── billingPeriodHelpers.ts             # Period management
├── billingRunHelpers.ts                # Payment execution
├── processBillingRunPaymentIntents.ts  # Payment intent processing
├── subscriptionItemFeatureHelpers.ts   # Feature management
├── createSubscription/                 # Creation workflow
│   ├── createSubscription.ts           # Main creation logic
│   ├── createInitialBillingPeriod.ts   # First period setup
│   └── helpers.ts                      # Creation utilities
└── ledger/                             # Usage credit system
    ├── grantCredits.ts                 # Credit allocation
    └── processUsage.ts                 # Usage tracking
```

## How to Use

### 1. Creating a Subscription

```typescript
import { createSubscription } from '@/subscriptions/createSubscription'

// Standard subscription with payment method
const subscription = await createSubscription({
  customerId,
  organizationId,
  items: [
    {
      priceId: 'price_123',     // Stripe price ID
      quantity: 1
    }
  ],
  defaultPaymentMethodId: 'pm_123',
  anchorBillingCycleOn: 1,  // Bill on 1st of each month
  collectionMethod: 'charge_automatically'
})

// Credit trial subscription (no payment method required)
const trialSubscription = await createSubscription({
  customerId,
  organizationId,
  items: [{ priceId: 'price_trial', quantity: 1 }],
  trialEnd: addDays(new Date(), 14),  // 14-day trial
  isCreditTrial: true,  // Uses credits instead of payment
  collectionMethod: 'send_invoice'
})
```

### 2. Adjusting Subscriptions

```typescript
import { adjustSubscription } from '@/subscriptions/adjustSubscription'

// Add/remove items with proration
const adjusted = await adjustSubscription({
  subscriptionId,
  adjustments: [
    {
      type: 'add_item',
      priceId: 'price_addon',
      quantity: 1
    },
    {
      type: 'remove_item',
      subscriptionItemId: 'si_123'
    },
    {
      type: 'update_quantity',
      subscriptionItemId: 'si_456',
      quantity: 5
    }
  ],
  effectiveTiming: 'immediately',  // or 'end_of_billing_period'
  prorate: true
})
```

### 3. Canceling Subscriptions

```typescript
import { cancelSubscription } from '@/subscriptions/cancelSubscription'

// Cancel at end of current period
await cancelSubscription({
  subscriptionId,
  cancellationTiming: 'end_of_billing_period',
  reason: 'customer_request'
})

// Immediate cancellation
await cancelSubscription({
  subscriptionId,
  cancellationTiming: 'immediately',
  reason: 'non_payment',
  refund: false
})
```

### 4. Processing Billing Runs

```typescript
import { attemptBillingRun } from '@/subscriptions/billingRunHelpers'

// Process a scheduled billing run
const result = await attemptBillingRun(billingRunId)

// Handle the result
if (result.status === 'succeeded') {
  // Payment successful
} else if (result.status === 'failed') {
  // Schedule retry
  await scheduleBillingRunRetry(billingRunId, retryDate)
}
```

### 5. Managing Usage-Based Billing

```typescript
import { recordUsageEvent } from '@/subscriptions/ledger/processUsage'
import { grantCredits } from '@/subscriptions/ledger/grantCredits'

// Record usage
await recordUsageEvent({
  customerId,
  meterId: 'api_calls',
  quantity: 1000,
  timestamp: new Date()
})

// Grant credits
await grantCredits({
  customerId,
  subscriptionId,
  amount: 10000,  // $100 in cents
  description: 'Promotional credits'
})
```

## How to Modify

### 1. Adding New Subscription Features

To add a new subscription feature or capability:

```typescript
// 1. Update schemas in schemas.ts
export const newFeatureSchema = z.object({
  featureName: z.string(),
  enabled: z.boolean(),
  configuration: z.record(z.unknown()).optional()
})

// 2. Add to subscription creation logic
// In createSubscription/createSubscription.ts
export async function createSubscription(params) {
  // ... existing logic
  
  // Add your feature logic
  if (params.newFeature) {
    await enableNewFeature(subscription.id, params.newFeature)
  }
  
  return subscription
}

// 3. Create feature-specific helper
export async function enableNewFeature(
  subscriptionId: string,
  config: NewFeatureConfig
) {
  return adminTransaction(async ({ transaction }) => {
    // Implementation
  })
}
```

### 2. Modifying Billing Calculations

To change how fees are calculated:

```typescript
// In billingRunHelpers.ts
export async function calculateBillingRunFees(
  billingRun: BillingRun,
  transaction: DbTransaction
) {
  // Get base subscription fees
  const baseFees = await calculateBaseFees(billingRun, transaction)
  
  // Add your custom fee logic
  const customFees = await calculateCustomFees(billingRun, transaction)
  
  // Calculate usage-based charges
  const usageFees = await calculateUsageFees(billingRun, transaction)
  
  // Apply discounts
  const discount = await calculateDiscounts(billingRun, transaction)
  
  return {
    subtotal: baseFees + customFees + usageFees,
    discount,
    total: baseFees + customFees + usageFees - discount
  }
}
```

### 3. Adding New Billing Intervals

To support new billing intervals (e.g., quarterly):

```typescript
// 1. Update interval helpers in billingIntervalHelpers.ts
export function getNextBillingDate(
  currentDate: Date,
  interval: 'month' | 'year' | 'quarter',
  intervalCount: number
) {
  switch (interval) {
    case 'quarter':
      return addMonths(currentDate, intervalCount * 3)
    // ... existing cases
  }
}

// 2. Update schema validation
const billingIntervalSchema = z.enum(['month', 'year', 'quarter'])

// 3. Handle in billing period creation
export function createBillingPeriod(subscription, interval) {
  const duration = interval === 'quarter' ? 90 : getDuration(interval)
  // ... create period with appropriate duration
}
```

### 4. Implementing Custom Trial Logic

```typescript
// Create a new trial type
export async function createCustomTrial(
  subscription: Subscription,
  config: CustomTrialConfig
) {
  return adminTransaction(async ({ transaction }) => {
    // 1. Create trial period
    const trialPeriod = await createBillingPeriod({
      subscriptionId: subscription.id,
      startsAt: new Date(),
      endsAt: config.trialEnd,
      status: 'trial',
      customTrialType: config.type
    }, transaction)
    
    // 2. Set up trial-specific features
    if (config.includedFeatures) {
      await enableTrialFeatures(
        subscription.id, 
        config.includedFeatures,
        transaction
      )
    }
    
    // 3. Schedule trial end processing
    await scheduleTrialEndProcessing(
      subscription.id,
      config.trialEnd
    )
    
    return trialPeriod
  })
}
```

### 5. Adding Payment Retry Logic

```typescript
// Customize retry strategy in billingRunHelpers.ts
export function getRetryStrategy(attempt: number): RetryConfig {
  // Custom retry intervals
  const retryIntervals = [
    { days: 1, attempt: 1 },   // First retry after 1 day
    { days: 3, attempt: 2 },   // Second after 3 days
    { days: 7, attempt: 3 },   // Third after 7 days
    { days: 14, attempt: 4 },  // Fourth after 14 days
  ]
  
  const config = retryIntervals[attempt - 1]
  if (!config) {
    return { shouldRetry: false }
  }
  
  return {
    shouldRetry: true,
    retryDate: addDays(new Date(), config.days),
    finalAttempt: attempt >= 4
  }
}
```

## Key Concepts

### Billing Period State Machine

```
ACTIVE → PAST_DUE → CANCELED
   ↓        ↓
COMPLETED  FAILED
```

- **ACTIVE**: Current billing period
- **PAST_DUE**: Payment failed, retrying
- **COMPLETED**: Successfully billed
- **FAILED**: All retries exhausted
- **CANCELED**: Subscription canceled

### Terminal States

Certain states cannot be changed once set:
- Subscriptions: `canceled`, `expired`
- Billing Periods: `completed`, `failed`, `canceled`
- Billing Runs: `succeeded`, `failed`, `canceled`

### Proration Calculation

```typescript
// Proration formula
const daysInPeriod = differenceInDays(periodEnd, periodStart)
const daysRemaining = differenceInDays(periodEnd, changeDate)
const prorationFactor = daysRemaining / daysInPeriod
const proratedAmount = fullAmount * prorationFactor
```

### Usage-Based Billing Flow

1. **Usage Recording** → Events logged with meter ID
2. **Aggregation** → Usage summed per billing period
3. **Ledger Debit** → Credits deducted or balance increased
4. **Invoice Generation** → Usage charges added to invoice
5. **Payment Collection** → Outstanding balance collected

## Key Conventions to Follow

### 1. **Always Use Transactions**
All operations must be wrapped in transactions:
```typescript
return adminTransaction(async ({ transaction }) => {
  // All database operations here
})
```

### 2. **State Validation**
Always check for terminal states:
```typescript
if (isTerminalSubscriptionStatus(subscription.status)) {
  throw new Error('Cannot modify terminated subscription')
}
```

### 3. **Idempotency**
Use idempotency keys for critical operations:
```typescript
await processPayment(paymentData, {
  idempotencyKey: `payment-${billingRunId}-${timestamp}`
})
```

### 4. **Event Logging**
Log all significant events:
```typescript
return {
  result: subscription,
  eventsToLog: [{
    type: 'subscription.created',
    data: { subscriptionId: subscription.id }
  }]
}
```

### 5. **Date Handling**
Use billing helpers for date calculations:
```typescript
// Don't use raw date manipulation
// Use billing interval helpers instead
const nextBillingDate = getNextBillingDate(
  currentDate,
  interval,
  intervalCount,
  anchorDay
)
```

### 6. **Error Handling**
Handle specific error cases:
```typescript
try {
  await processPayment()
} catch (error) {
  if (error.code === 'insufficient_funds') {
    await scheduleRetry()
  } else if (error.code === 'card_declined') {
    await notifyCustomer()
  }
  throw error
}
```

## Testing Subscription Logic

```typescript
// Test complex billing scenarios
test('should prorate subscription upgrade', async () => {
  await createTestTransaction(async (transaction) => {
    // Create subscription
    const subscription = await createSubscription(params, transaction)
    
    // Advance time to mid-period
    const midPeriod = addDays(subscription.currentPeriodStart, 15)
    
    // Adjust subscription
    const adjustment = await adjustSubscription({
      subscriptionId: subscription.id,
      adjustments: [{ type: 'upgrade', priceId: 'higher_price' }],
      effectiveDate: midPeriod
    }, transaction)
    
    // Verify proration
    expect(adjustment.proratedAmount).toBe(expectedAmount)
  })
})
```

## Common Patterns

### Handling Subscription Upgrades/Downgrades
```typescript
export async function handlePlanChange(
  subscriptionId: string,
  newPriceId: string,
  timing: 'immediately' | 'next_period'
) {
  return comprehensiveAuthenticatedTransaction(async (params) => {
    const { transaction } = params
    
    // Get current subscription
    const subscription = await getSubscription(subscriptionId, transaction)
    
    // Calculate proration if immediate
    let proratedCredit = 0
    if (timing === 'immediately') {
      proratedCredit = calculateProration(subscription, newPriceId)
    }
    
    // Apply the change
    const updated = await adjustSubscription({
      subscriptionId,
      newPriceId,
      effectiveTiming: timing,
      proratedCredit
    }, transaction)
    
    return {
      result: updated,
      eventsToLog: [{
        type: 'subscription.plan_changed',
        data: { from: subscription.priceId, to: newPriceId }
      }]
    }
  })
}
```

### Processing End-of-Period Transitions
```typescript
export async function transitionBillingPeriod(
  subscriptionId: string
) {
  return adminTransaction(async ({ transaction }) => {
    // Close current period
    const currentPeriod = await getCurrentBillingPeriod(
      subscriptionId, 
      transaction
    )
    await completeBillingPeriod(currentPeriod.id, transaction)
    
    // Create next period
    const nextPeriod = await createNextBillingPeriod(
      subscriptionId,
      currentPeriod,
      transaction
    )
    
    // Schedule billing run
    await scheduleBillingRun(nextPeriod.id, transaction)
    
    return nextPeriod
  })
}
```

## Common Pitfalls to Avoid

1. **Don't modify terminal states** - Check state before operations
2. **Don't skip proration** - Always calculate for mid-cycle changes
3. **Don't ignore timezone** - Use UTC for all billing dates
4. **Don't bypass validation** - Use Zod schemas for all inputs
5. **Don't forget idempotency** - Critical for payment operations
6. **Don't mix trial types** - Credit trials vs time trials are different
7. **Don't hardcode retry logic** - Use configurable retry strategies
8. **Don't ignore usage tracking** - Update ledger for all usage events

## Need Help?

- Review `README.md` in this directory for detailed concepts
- Check test files for complex scenario examples
- Look at `schemas.ts` for all validation rules
- Consult `billingIntervalHelpers.ts` for date calculations
- Review state machine diagrams in documentation