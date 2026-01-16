import { CustomerBillingPortalMagicLinkEmail } from '@/email-templates/customer-billing-portal-magic-link'
import { CustomerBillingPortalOTPEmail } from '@/email-templates/customer-billing-portal-otp'
import { PaymentFailedEmail } from '@/email-templates/customer-payment-failed'
import { CustomerSubscriptionAdjustedEmail } from '@/email-templates/customer-subscription-adjusted'
import { CustomerSubscriptionCanceledEmail } from '@/email-templates/customer-subscription-canceled'
import { CustomerSubscriptionCancellationScheduledEmail } from '@/email-templates/customer-subscription-cancellation-scheduled'
import { CustomerSubscriptionCreatedEmail } from '@/email-templates/customer-subscription-created'
import { CustomerSubscriptionUpgradedEmail } from '@/email-templates/customer-subscription-upgraded'
import { ForgotPasswordEmail } from '@/email-templates/forgot-password'
import {
  OrganizationSubscriptionCanceledNotificationEmail,
  OrganizationSubscriptionCancellationScheduledNotificationEmail,
  OrganizationSubscriptionCreatedNotificationEmail,
} from '@/email-templates/organization-subscription-notifications'
import { SendPurchaseAccessSessionTokenEmail } from '@/email-templates/send-purchase-access-session-token'
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
      subject="Payment method confirmed - Subscription active"
      previewText="Payment method confirmed - Subscription active"
      testMode={testMode}
      emailType="subscription-created"
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
      subject="Subscription upgraded"
      previewText="Payment method confirmed - Subscription upgraded"
      testMode={testMode}
      emailType="subscription-upgraded"
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
  const subjectText = isUpgrade
    ? 'Your subscription has been upgraded'
    : 'Your subscription has been updated'

  return (
    <EmailPreviewWrapper
      templateName="customer-subscription-adjusted"
      scenario={`Paid → Paid (${adjustmentType})`}
      subject={subjectText}
      previewText={subjectText}
      testMode={testMode}
      emailType={
        isUpgrade
          ? 'subscription-adjusted-upgrade'
          : 'subscription-adjusted-downgrade'
      }
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
      subject="Subscription Canceled"
      previewText="Your subscription has been canceled"
      testMode={testMode}
      emailType="subscription-canceled"
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
      subject="Cancellation Scheduled"
      previewText="Your subscription cancellation has been scheduled"
      testMode={testMode}
      emailType="subscription-cancellation-scheduled"
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
      subject="Payment Unsuccessful"
      previewText="Payment Failed for Your Order"
      testMode={testMode}
      emailType="payment-failed"
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

// ============================================================================
// Billing Portal OTP Preview
// ============================================================================

interface BillingPortalOTPPreviewProps {
  testMode?: boolean
}

export const BillingPortalOTPPreview = ({
  testMode = false,
}: BillingPortalOTPPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="customer-billing-portal-otp"
      scenario="Billing portal sign-in OTP"
      subject={`Sign in to your billing portal for ${commonOrganizationProps.organizationName}`}
      previewText={`Sign in to your billing portal for ${commonOrganizationProps.organizationName}`}
      testMode={testMode}
      emailType="billing-portal-otp"
    >
      <CustomerBillingPortalOTPEmail
        customerName={commonCustomerProps.customerName}
        email="john.doe@example.com"
        otp="123456"
        organizationName={commonOrganizationProps.organizationName}
        livemode={!testMode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Billing Portal Magic Link Preview
// ============================================================================

interface BillingPortalMagicLinkPreviewProps {
  testMode?: boolean
}

export const BillingPortalMagicLinkPreview = ({
  testMode = false,
}: BillingPortalMagicLinkPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="customer-billing-portal-magic-link"
      scenario="Billing portal magic link sign-in"
      subject={`Sign in to your billing portal for ${commonOrganizationProps.organizationName}`}
      previewText={`Sign in to your billing portal for ${commonOrganizationProps.organizationName}`}
      testMode={testMode}
      emailType="billing-portal-magic-link"
    >
      <CustomerBillingPortalMagicLinkEmail
        customerName={commonCustomerProps.customerName}
        email="john.doe@example.com"
        url="https://billing.example.com/magic-link/abc123"
        organizationName={commonOrganizationProps.organizationName}
        livemode={!testMode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Forgot Password Preview
// ============================================================================

interface ForgotPasswordPreviewProps {
  testMode?: boolean
}

export const ForgotPasswordPreview = ({
  testMode = false,
}: ForgotPasswordPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="forgot-password"
      scenario="Password reset request"
      subject={`Reset your password, ${commonCustomerProps.customerName}`}
      previewText={`Reset your password, ${commonCustomerProps.customerName}`}
      testMode={testMode}
      emailType="forgot-password"
    >
      <ForgotPasswordEmail
        user={commonCustomerProps.customerName}
        url="https://app.example.com/reset-password?token=abc123"
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Organization Subscription Created Notification Preview
// ============================================================================

interface OrgSubscriptionCreatedPreviewProps {
  testMode?: boolean
}

export const OrgSubscriptionCreatedPreview = ({
  testMode = false,
}: OrgSubscriptionCreatedPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="organization-subscription-notifications"
      scenario="Org notification: New subscription"
      subject={`New Subscription: ${commonCustomerProps.customerName} subscribed to Pro Plan`}
      previewText={`New Subscription: ${commonCustomerProps.customerName} subscribed to Pro Plan`}
      testMode={testMode}
      emailType="org-subscription-created"
    >
      <OrganizationSubscriptionCreatedNotificationEmail
        organizationName={commonOrganizationProps.organizationName}
        subscriptionName="Pro Plan"
        customerId={mockCustomer.id}
        customerName={commonCustomerProps.customerName}
        customerEmail="john.doe@example.com"
        livemode={!testMode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Organization Subscription Canceled Notification Preview
// ============================================================================

interface OrgSubscriptionCanceledPreviewProps {
  testMode?: boolean
}

export const OrgSubscriptionCanceledPreview = ({
  testMode = false,
}: OrgSubscriptionCanceledPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="organization-subscription-notifications"
      scenario="Org notification: Subscription canceled"
      subject={`Subscription Cancelled: ${commonCustomerProps.customerName} canceled Pro Plan`}
      previewText={`Subscription Cancelled: ${commonCustomerProps.customerName} canceled Pro Plan`}
      testMode={testMode}
      emailType="org-subscription-canceled"
    >
      <OrganizationSubscriptionCanceledNotificationEmail
        organizationName={commonOrganizationProps.organizationName}
        subscriptionName="Pro Plan"
        customerId={mockCustomer.id}
        customerName={commonCustomerProps.customerName}
        customerEmail="john.doe@example.com"
        cancellationDate={PREVIEW_REFERENCE_DATE}
        livemode={!testMode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Organization Subscription Cancellation Scheduled Notification Preview
// ============================================================================

interface OrgSubscriptionCancellationScheduledPreviewProps {
  testMode?: boolean
}

export const OrgSubscriptionCancellationScheduledPreview = ({
  testMode = false,
}: OrgSubscriptionCancellationScheduledPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="organization-subscription-notifications"
      scenario="Org notification: Cancellation scheduled"
      subject={`Cancellation Scheduled: ${commonCustomerProps.customerName} scheduled cancellation for Pro Plan`}
      previewText={`Cancellation Scheduled: ${commonCustomerProps.customerName} scheduled cancellation for Pro Plan`}
      testMode={testMode}
      emailType="org-subscription-cancellation-scheduled"
    >
      <OrganizationSubscriptionCancellationScheduledNotificationEmail
        organizationName={commonOrganizationProps.organizationName}
        subscriptionName="Pro Plan"
        customerId={mockCustomer.id}
        customerName={commonCustomerProps.customerName}
        customerEmail="john.doe@example.com"
        scheduledCancellationDate={getFutureDate(30)}
        livemode={!testMode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Purchase Access Token Email Preview
// ============================================================================

interface PurchaseAccessTokenPreviewProps {
  testMode?: boolean
}

export const PurchaseAccessTokenPreview = ({
  testMode = false,
}: PurchaseAccessTokenPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="send-purchase-access-session-token"
      scenario="Purchase access magic link"
      subject="Access your order with this magic link"
      previewText="Access your order with this magic link."
      testMode={testMode}
      emailType="purchase-access-token"
    >
      <SendPurchaseAccessSessionTokenEmail
        magicLink="https://app.flowglad.com/access/abc123xyz"
        livemode={!testMode}
      />
    </EmailPreviewWrapper>
  )
}
