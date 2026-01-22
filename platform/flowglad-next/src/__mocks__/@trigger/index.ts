import { mock } from 'bun:test'

// Create a base task mock factory
const createTaskMock = (taskName: string) => ({
  trigger: mock(async () => undefined as void),
  taskName,
})

// Export mocked versions of all trigger tasks
export const attemptBillingRunTask = createTaskMock(
  'attempt-billing-run'
)

export const generateInvoicePdfTask = createTaskMock(
  'generate-invoice-pdf'
)
export const generatePaymentReceiptPdfTask = createTaskMock(
  'generate-receipt-pdf'
)
export const sendCustomerInvoice = createTaskMock(
  'send-customer-invoice'
)
export const attemptBillingRunsTask = createTaskMock(
  'attempt-run-all-billings'
)
export const attemptBillingPeriodTransitionTask = createTaskMock(
  'attempt-billing-period-transition'
)
export const attemptTransitionBillingPeriodsTask = createTaskMock(
  'attempt-transition-billing-periods'
)
export const attemptCancelScheduledSubscriptionsTask = createTaskMock(
  'attempt-cancel-scheduled-subscriptions'
)
export const attemptSubscriptionCancellationTask = createTaskMock(
  'attempt-subscription-cancellation'
)
export const crawlWebsiteTask = createTaskMock('crawl-website')
export const upsertProperNounTask = createTaskMock(
  'upsert-proper-noun'
)

// Stripe related tasks
export const stripePaymentIntentProcessingTask = createTaskMock(
  'stripe/payment-intent-processing'
)
export const stripeAccountUpdatedTask = createTaskMock(
  'stripe/account-updated'
)
export const stripePaymentIntentSucceededTask = createTaskMock(
  'stripe/payment-intent-succeeded'
)
export const setupIntentSucceededTask = createTaskMock(
  'stripe/setup-intent-succeeded'
)
export const stripePaymentIntentCanceledTask = createTaskMock(
  'stripe/payment-intent-canceled'
)
export const stripePaymentIntentPaymentFailedTask = createTaskMock(
  'stripe/payment-intent-payment-failed'
)
export const stripePaymentIntentRequiresActionTask = createTaskMock(
  'stripe/payment-intent-requires-action'
)

// Supabase related tasks
export const customerCreatedTask = createTaskMock(
  'supabase/customer-inserted'
)
export const invoiceUpdatedTask = createTaskMock(
  'supabase/invoice-updated'
)

// Cron tasks
export const dailyCron = createTaskMock('daily-cron')
export const hourlyCron = createTaskMock('hourly-cron')
export const verifyApiContractTask = createTaskMock(
  'verify-api-contract'
)

// Example task
export const helloWorldTask = createTaskMock('example')
