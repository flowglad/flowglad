# Trigger Background Jobs Documentation

## What the heck is going on with this directory?

This directory contains Flowglad's background job processing system built on **Trigger.dev v4**. It handles all asynchronous operations including scheduled billing runs, payment processing, webhook handling, PDF generation, and email notifications. Think of it as the engine that runs all the time-sensitive and resource-intensive operations outside of the main request-response cycle.

### Why would you use code in this directory?

- **Scheduled Tasks**: Running hourly/daily cron jobs for billing and maintenance
- **Webhook Processing**: Handling Stripe and Supabase webhook events
- **Async Operations**: PDF generation, email sending, batch processing
- **Payment Processing**: Managing payment retries and failure handling
- **State Transitions**: Processing subscription cancellations and billing period transitions

## Directory Structure

```
trigger/
├── daily-cron.ts                    # Daily maintenance tasks
├── hourly-cron.ts                   # Hourly billing orchestration
├── attempt-billing-run.ts           # Individual billing execution
├── attempt-run-all-billings.ts      # Batch billing trigger
├── fail-stale-payments.ts           # Cleanup stuck payments
├── generate-invoice-pdf.ts          # PDF invoice generation
├── generate-receipt-pdf.ts          # PDF receipt generation
├── stripe/                          # Stripe webhook handlers
│   ├── payment-intent-succeeded.ts  # Successful payments
│   ├── payment-intent-failed.ts     # Failed payments
│   └── [other webhooks]            # Account updates, charges, etc.
├── supabase/                        # Database webhook handlers
│   ├── customer-inserted.ts        # New customer processing
│   └── invoice-updated.ts          # Invoice change handling
└── notifications/                   # Email notification tasks
    ├── send-customer-*.ts           # Customer emails
    └── send-organization-*.ts       # Organization emails
```

## How to Use

### 1. Triggering Tasks from Application Code

```typescript
// Import the task you need
import { generateInvoicePdfTask } from '@/trigger/generate-invoice-pdf'

// Trigger the task (returns immediately, runs in background)
await generateInvoicePdfTask.trigger({
  invoiceId: invoice.id,
  organizationId: org.id
})

// With idempotency key to prevent duplicates
await attemptBillingRunTask.trigger(
  { billingRunId },
  { idempotencyKey: `billing-run-${billingRunId}` }
)
```

### 2. Setting Up Scheduled Tasks

```typescript
// In hourly-cron.ts or daily-cron.ts
import { schedules } from '@trigger.dev/sdk'

export const hourlyBilling = schedules.task({
  id: 'hourly-billing-orchestration',
  cron: '0 * * * *',  // Every hour at minute 0
  run: async (payload, { ctx }) => {
    // Find all pending billing runs
    const pendingRuns = await findPendingBillingRuns()
    
    // Trigger individual tasks
    for (const run of pendingRuns) {
      await attemptBillingRunTask.trigger({ 
        billingRunId: run.id 
      })
    }
  }
})
```

### 3. Processing Webhooks

Always process webhook payloads using trigger tasks. That way we can retry and get observability into whether processing succeeds.

```typescript
// Webhook events are routed from processStripeEvents.ts
// In stripe/payment-intent-succeeded.ts
export const stripePaymentIntentSucceededTask = task({
  id: 'stripe-payment-intent-succeeded',
  run: async (event: Stripe.Event, { ctx }) => {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    
    return adminTransaction(async ({ transaction }) => {
      // Update payment status
      await updatePayment({
        stripePaymentIntentId: paymentIntent.id,
        status: 'succeeded'
      }, transaction)
      
      // Trigger follow-up tasks
      await generateReceiptPdfTask.trigger({ 
        paymentId: payment.id 
      })
    })
  }
})
```

### 4. Chaining Tasks

```typescript
// Tasks can trigger other tasks for complex workflows
export const processPaymentTask = task({
  id: 'process-payment',
  run: async (payload, { ctx }) => {
    // Process payment
    const payment = await processPayment(payload)
    
    // Chain to next task based on result
    if (payment.status === 'succeeded') {
      await generateReceiptPdfTask.trigger({ paymentId: payment.id })
      await sendPaymentSuccessNotification.trigger({ paymentId: payment.id })
    } else {
      await sendPaymentFailedNotification.trigger({ paymentId: payment.id })
    }
    
    return { paymentId: payment.id, status: payment.status }
  }
})
```

## How to Modify

### 1. Creating a New Task

1. Create a new file in the appropriate directory:

```typescript
// trigger/my-new-task.ts
import { logger, task } from '@trigger.dev/sdk'
import { z } from 'zod'

// Define payload schema
const payloadSchema = z.object({
  customerId: z.string(),
  amount: z.number()
})

// Export the task
export const myNewTask = task({
  id: 'my-new-task',  // Unique identifier
  run: async (payload: z.infer<typeof payloadSchema>, { ctx }) => {
    // Validate payload
    const validated = payloadSchema.parse(payload)
    
    // Log for debugging
    logger.log('Starting my new task', { payload: validated })
    
    // Perform the task logic
    const result = await adminTransaction(async ({ transaction }) => {
      // Database operations
      return { success: true }
    })
    
    logger.log('Task completed', { result })
    return result
  }
})

// Optional: Export idempotent helper
export async function triggerMyNewTask(
  customerId: string,
  amount: number
) {
  return myNewTask.trigger(
    { customerId, amount },
    { idempotencyKey: `my-task-${customerId}-${Date.now()}` }
  )
}
```

2. Register the task in `trigger.config.ts` if needed (auto-discovered by default)

### 2. Adding a New Scheduled Task

```typescript
// trigger/weekly-report.ts
import { schedules } from '@trigger.dev/sdk'

export const weeklyReport = schedules.task({
  id: 'weekly-report-generation',
  cron: '0 9 * * 1',  // Every Monday at 9 AM
  run: async (payload, { ctx }) => {
    const organizations = await getActiveOrganizations()
    
    for (const org of organizations) {
      // Generate and send reports
      await generateWeeklyReportTask.trigger({ 
        organizationId: org.id 
      })
    }
    
    return { 
      message: `Generated reports for ${organizations.length} orgs` 
    }
  }
})
```

### 3. Modifying Task Configuration

Update `trigger.config.ts` for global settings:

```typescript
export default defineConfig({
  // Increase timeout for long-running tasks
  runOptions: {
    timeout: '120s',  // 2 minutes
    machine: 'large-1x',  // Upgrade machine size
  },
  
  // Adjust retry configuration
  retryOptions: {
    maxAttempts: 3,
    minWait: '2s',
    maxWait: '30s',
    factor: 2
  }
})
```

### 4. Adding Webhook Handlers

1. Create webhook task:

```typescript
// trigger/stripe/subscription-updated.ts
export const stripeSubscriptionUpdatedTask = task({
  id: 'stripe-subscription-updated',
  run: async (event: Stripe.Event, { ctx }) => {
    const subscription = event.data.object as Stripe.Subscription
    
    // Process the webhook
    return adminTransaction(async ({ transaction }) => {
      await updateSubscription({
        stripeSubscriptionId: subscription.id,
        status: subscription.status
      }, transaction)
    })
  }
})
```

2. Add to webhook router:

```typescript
// utils/processStripeEvents.ts
case 'subscription.updated':
  await stripeSubscriptionUpdatedTask.trigger(event)
  break
```

### 5. Error Handling and Retries

```typescript
export const robustTask = task({
  id: 'robust-task',
  retry: {
    maxAttempts: 5,
    minWait: '5s',
    maxWait: '1m',
    factor: 1.5
  },
  run: async (payload, { ctx }) => {
    try {
      // Attempt operation
      const result = await riskyOperation()
      return result
    } catch (error) {
      // Log error with context
      logger.error('Task failed', { 
        error: error.message,
        payload,
        attempt: ctx.attempt 
      })
      
      // Retry for transient errors
      if (isTransientError(error)) {
        throw error  // Will retry
      }
      
      // Don't retry for permanent failures
      return { 
        error: 'Permanent failure', 
        details: error.message 
      }
    }
  }
})
```

## Key Conventions to Follow

### 1. **Task Naming**
- Use kebab-case for task IDs: `'process-billing-run'`
- Use descriptive names that indicate the action
- Prefix with service name for webhooks: `'stripe-payment-succeeded'`

### 2. **Idempotency**
Always use idempotency keys for critical operations:
```typescript
await task.trigger(payload, {
  idempotencyKey: `unique-key-${id}-${timestamp}`
})
```

### 3. **Logging**
Use structured logging with context:
```typescript
logger.log('Processing payment', { 
  paymentId, 
  amount, 
  customerId 
})
```

### 4. **Transaction Usage**
- Use `adminTransaction` for background jobs (no user context)
- Always wrap database operations in transactions
- Return transaction results to maintain atomicity

### 5. **Error Handling**
- Let transient errors bubble up for retries
- Handle permanent failures gracefully
- Log all errors with full context

### 6. **Payload Validation**
Always validate payloads with Zod:
```typescript
const validated = payloadSchema.parse(payload)
```

### 7. **Task Composition**
- Keep tasks focused on a single responsibility
- Chain tasks for complex workflows
- Use helper functions for reusable logic

## Testing Trigger Tasks

```typescript
// Test tasks directly without Trigger.dev
import { myTask } from '@/trigger/my-task'

test('should process task', async () => {
  // Mock the task execution
  const result = await myTask.run(
    { customerId: '123' },
    { ctx: { attempt: 1, taskId: 'test' } }
  )
  
  expect(result.success).toBe(true)
})

// Integration test with test database
test('should update database', async () => {
  await createTestTransaction(async (transaction) => {
    // Run task logic with test transaction
    const result = await processWithTransaction(
      payload,
      transaction
    )
    expect(result).toBeDefined()
  })
})
```

## Common Patterns

### Batch Processing
```typescript
export const batchProcessor = task({
  id: 'batch-processor',
  run: async (payload: { items: string[] }) => {
    const results = []
    
    // Process in batches to avoid timeouts
    const batchSize = 10
    for (let i = 0; i < payload.items.length; i += batchSize) {
      const batch = payload.items.slice(i, i + batchSize)
      const batchResults = await Promise.all(
        batch.map(item => processItem(item))
      )
      results.push(...batchResults)
    }
    
    return { processed: results.length }
  }
})
```

### Conditional Execution
```typescript
export const conditionalTask = task({
  id: 'conditional-task',
  run: async (payload, { ctx }) => {
    // Skip in development
    if (process.env.NODE_ENV === 'development') {
      logger.log('Skipping in development')
      return { skipped: true }
    }
    
    // Check feature flag
    const enabled = await checkFeatureFlag('new-feature')
    if (!enabled) {
      return { skipped: true, reason: 'Feature disabled' }
    }
    
    // Execute task
    return performTask(payload)
  }
})
```

## Monitoring & Debugging

1. **Trigger.dev Dashboard**: View task runs, logs, and errors
2. **Structured Logging**: All logs include context for debugging
3. **Idempotency Keys**: Prevent duplicate executions
4. **Task IDs**: Unique identifiers for tracking

## Common Pitfalls to Avoid

1. **Don't make tasks too large** - Break into smaller, focused tasks
2. **Don't forget idempotency** - Critical for payment and billing tasks
3. **Don't ignore timeouts** - Configure appropriate timeouts
4. **Don't skip validation** - Always validate webhook payloads
5. **Don't forget error handling** - Handle both transient and permanent failures
6. **Don't bypass transactions** - Always use database transactions
7. **Don't hardcode delays** - Use Trigger.dev's built-in scheduling

## Need Help?

- Check existing task patterns in `/trigger/` directory
- Review Trigger.dev v4 documentation
- Look at webhook routing in `/utils/processStripeEvents.ts`
- Check `trigger.config.ts` for global configuration