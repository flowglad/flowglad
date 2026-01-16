import { PaymentFailedEmail } from '@/email-templates/customer-payment-failed'
import { CustomerSubscriptionAdjustedEmail } from '@/email-templates/customer-subscription-adjusted'
import { CustomerSubscriptionCanceledEmail } from '@/email-templates/customer-subscription-canceled'
import { CustomerSubscriptionCancellationScheduledEmail } from '@/email-templates/customer-subscription-cancellation-scheduled'
import { CustomerSubscriptionCreatedEmail } from '@/email-templates/customer-subscription-created'
import { CustomerSubscriptionUpgradedEmail } from '@/email-templates/customer-subscription-upgraded'
import { EmailPreviewWrapper } from './EmailPreviewWrapper'
import {
  commonCustomerProps,
  commonOrganizationProps,
  createSubscriptionItems,
  DEFAULT_CURRENCY,
  DEFAULT_INTERVAL,
  getFutureDate,
  MOCK_PRICES,
  mockCustomer,
  mockPaymentFailedLineItems,
  PREVIEW_REFERENCE_DATE,
} from './mockData'

// ============================================================================
// Subscription Created Preview
// ============================================================================

interface SubscriptionCreatedPreviewProps {
  testMode?: boolean
}

export const SubscriptionCreatedPreview = ({
  testMode = false,
}: SubscriptionCreatedPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="customer-subscription-created"
      scenario="New paid subscription"
      testMode={testMode}
    >
      <CustomerSubscriptionCreatedEmail
        customerName={commonCustomerProps.customerName}
        customerExternalId={commonCustomerProps.customerExternalId}
        {...commonOrganizationProps}
        planName="Pro Plan"
        price={MOCK_PRICES.PRO_PLAN}
        currency={DEFAULT_CURRENCY}
        interval={DEFAULT_INTERVAL}
        nextBillingDate={getFutureDate(30)}
        paymentMethodLast4="4242"
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Subscription Upgraded Preview (Free → Paid)
// ============================================================================

interface SubscriptionUpgradedPreviewProps {
  trialing?: boolean
  testMode?: boolean
}

export const SubscriptionUpgradedPreview = ({
  trialing = false,
  testMode = false,
}: SubscriptionUpgradedPreviewProps) => {
  const scenario = trialing ? 'Free → Paid (Trial)' : 'Free → Paid'

  return (
    <EmailPreviewWrapper
      templateName="customer-subscription-upgraded"
      scenario={scenario}
      testMode={testMode}
    >
      <CustomerSubscriptionUpgradedEmail
        customerName={commonCustomerProps.customerName}
        customerExternalId={commonCustomerProps.customerExternalId}
        {...commonOrganizationProps}
        previousPlanName="Free Plan"
        previousPlanPrice={MOCK_PRICES.FREE}
        previousPlanCurrency={DEFAULT_CURRENCY}
        previousPlanInterval={DEFAULT_INTERVAL}
        newPlanName="Pro Plan"
        price={MOCK_PRICES.PRO_PLAN}
        currency={DEFAULT_CURRENCY}
        interval={DEFAULT_INTERVAL}
        nextBillingDate={getFutureDate(30)}
        paymentMethodLast4="4242"
        trialing={trialing}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Subscription Adjusted Preview (Paid → Paid)
// ============================================================================

interface SubscriptionAdjustedPreviewProps {
  adjustmentType: 'upgrade' | 'downgrade'
  testMode?: boolean
}

export const SubscriptionAdjustedPreview = ({
  adjustmentType,
  testMode = false,
}: SubscriptionAdjustedPreviewProps) => {
  const isUpgrade = adjustmentType === 'upgrade'
  const subscriptionItems = createSubscriptionItems(isUpgrade)

  return (
    <EmailPreviewWrapper
      templateName="customer-subscription-adjusted"
      scenario={`Paid → Paid (${adjustmentType})`}
      testMode={testMode}
    >
      <CustomerSubscriptionAdjustedEmail
        customerName={commonCustomerProps.customerName}
        {...commonOrganizationProps}
        adjustmentType={adjustmentType}
        previousItems={subscriptionItems.previousItems}
        newItems={subscriptionItems.newItems}
        previousTotalPrice={subscriptionItems.previousTotalPrice}
        newTotalPrice={subscriptionItems.newTotalPrice}
        currency={DEFAULT_CURRENCY}
        interval={DEFAULT_INTERVAL}
        prorationAmount={subscriptionItems.prorationAmount}
        effectiveDate={PREVIEW_REFERENCE_DATE}
        nextBillingDate={getFutureDate(30)}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Subscription Canceled Preview
// ============================================================================

interface SubscriptionCanceledPreviewProps {
  testMode?: boolean
}

export const SubscriptionCanceledPreview = ({
  testMode = false,
}: SubscriptionCanceledPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="customer-subscription-canceled"
      scenario="Subscription canceled immediately"
      testMode={testMode}
    >
      <CustomerSubscriptionCanceledEmail
        customerName={commonCustomerProps.customerName}
        customerId={mockCustomer.id}
        {...commonOrganizationProps}
        subscriptionName="Pro Plan"
        cancellationDate={PREVIEW_REFERENCE_DATE}
        livemode={!testMode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Subscription Cancellation Scheduled Preview
// ============================================================================

interface SubscriptionCancellationScheduledPreviewProps {
  testMode?: boolean
}

export const SubscriptionCancellationScheduledPreview = ({
  testMode = false,
}: SubscriptionCancellationScheduledPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="customer-subscription-cancellation-scheduled"
      scenario="Cancellation scheduled for end of period"
      testMode={testMode}
    >
      <CustomerSubscriptionCancellationScheduledEmail
        customerName={commonCustomerProps.customerName}
        customerId={mockCustomer.id}
        {...commonOrganizationProps}
        subscriptionName="Pro Plan"
        scheduledCancellationDate={getFutureDate(30)}
        livemode={!testMode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Payment Failed Preview
// ============================================================================

interface PaymentFailedPreviewProps {
  hasRetryDate?: boolean
  testMode?: boolean
}

export const PaymentFailedPreview = ({
  hasRetryDate = true,
  testMode = false,
}: PaymentFailedPreviewProps) => {
  const scenario = hasRetryDate
    ? 'Payment failed (will retry)'
    : 'Payment failed (no retry)'

  return (
    <EmailPreviewWrapper
      templateName="customer-payment-failed"
      scenario={scenario}
      testMode={testMode}
    >
      <PaymentFailedEmail
        invoiceNumber="INV-2024-002"
        orderDate={PREVIEW_REFERENCE_DATE}
        invoice={{
          subtotal: MOCK_PRICES.PRO_PLAN,
          taxAmount: MOCK_PRICES.TAX_AMOUNT,
          currency: DEFAULT_CURRENCY,
        }}
        lineItems={[...mockPaymentFailedLineItems]}
        organizationName={commonOrganizationProps.organizationName}
        organizationLogoUrl={
          commonOrganizationProps.organizationLogoUrl
        }
        retryDate={hasRetryDate ? getFutureDate(3) : undefined}
        failureReason="Your card was declined"
        customerPortalUrl="https://billing.example.com/portal"
        livemode={!testMode}
      />
    </EmailPreviewWrapper>
  )
}
