import { CustomerBillingPortalMagicLinkEmail } from '@/email-templates/customer-billing-portal-magic-link'
import { CustomerBillingPortalOTPEmail } from '@/email-templates/customer-billing-portal-otp'
import { PaymentFailedEmail } from '@/email-templates/customer-payment-failed'
import { CustomerSubscriptionAdjustedEmail } from '@/email-templates/customer-subscription-adjusted'
import { CustomerSubscriptionCanceledEmail } from '@/email-templates/customer-subscription-canceled'
import { CustomerSubscriptionCancellationScheduledEmail } from '@/email-templates/customer-subscription-cancellation-scheduled'
import { CustomerSubscriptionCreatedEmail } from '@/email-templates/customer-subscription-created'
import { CustomerSubscriptionRenewalReminderEmail } from '@/email-templates/customer-subscription-renewal-reminder'
import { CustomerSubscriptionUpgradedEmail } from '@/email-templates/customer-subscription-upgraded'
import { CustomerTrialEndingSoonEmail } from '@/email-templates/customer-trial-ending-soon'
import { CustomerTrialExpiredNoPaymentEmail } from '@/email-templates/customer-trial-expired-no-payment'
import { ForgotPasswordEmail } from '@/email-templates/forgot-password'
import { CustomersCsvExportReadyEmail } from '@/email-templates/organization/customers-csv-export-ready'
import { OrganizationInvitationEmail } from '@/email-templates/organization/organization-invitation'
import { OrganizationPaymentConfirmationEmail } from '@/email-templates/organization/organization-payment-awaiting-confirmation'
import { OrganizationPaymentFailedNotificationEmail } from '@/email-templates/organization/organization-payment-failed'
import { OrganizationPaymentNotificationEmail } from '@/email-templates/organization/organization-payment-succeeded'
import { OrganizationPayoutsEnabledNotificationEmail } from '@/email-templates/organization/organization-payouts-enabled'
import { OrganizationSubscriptionAdjustedEmail } from '@/email-templates/organization/organization-subscription-adjusted'
import { OrganizationOnboardingCompletedNotificationEmail } from '@/email-templates/organization/payout-notification'
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
  livemode?: boolean
}

export const SubscriptionCreatedPreview = ({
  livemode = true,
}: SubscriptionCreatedPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="customer-subscription-created"
      scenario="New paid subscription"
      subject="Subscription Confirmed"
      previewText="Your Subscription is Confirmed"
      livemode={livemode}
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
        dateConfirmed={PREVIEW_REFERENCE_DATE}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Subscription Upgraded Preview (Free → Paid)
// ============================================================================

interface SubscriptionUpgradedPreviewProps {
  trialing?: boolean
  livemode?: boolean
}

export const SubscriptionUpgradedPreview = ({
  trialing = false,
  livemode = true,
}: SubscriptionUpgradedPreviewProps) => {
  const scenario = trialing ? 'Free → Paid (Trial)' : 'Free → Paid'

  return (
    <EmailPreviewWrapper
      templateName="customer-subscription-upgraded"
      scenario={scenario}
      subject="Subscription Confirmed"
      previewText="Your Subscription is Confirmed"
      livemode={livemode}
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
        dateConfirmed={PREVIEW_REFERENCE_DATE}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Subscription Adjusted Preview (Paid → Paid)
// ============================================================================

interface SubscriptionAdjustedPreviewProps {
  adjustmentType: 'upgrade' | 'downgrade'
  livemode?: boolean
}

export const SubscriptionAdjustedPreview = ({
  adjustmentType,
  livemode = true,
}: SubscriptionAdjustedPreviewProps) => {
  const isUpgrade = adjustmentType === 'upgrade'
  const subscriptionItems = createSubscriptionItems(isUpgrade)

  return (
    <EmailPreviewWrapper
      templateName="customer-subscription-adjusted"
      scenario={`Paid → Paid (${adjustmentType})`}
      subject="Subscription Updated"
      previewText="Your Subscription has been Updated"
      livemode={livemode}
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
  livemode?: boolean
}

export const SubscriptionCanceledPreview = ({
  livemode = true,
}: SubscriptionCanceledPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="customer-subscription-canceled"
      scenario="Subscription canceled immediately"
      subject="Subscription Canceled"
      previewText="Your subscription has been canceled"
      livemode={livemode}
      emailType="subscription-canceled"
    >
      <CustomerSubscriptionCanceledEmail
        customerName={commonCustomerProps.customerName}
        customerId={mockCustomer.id}
        {...commonOrganizationProps}
        subscriptionName="Pro Plan"
        cancellationDate={PREVIEW_REFERENCE_DATE}
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Subscription Cancellation Scheduled Preview
// ============================================================================

interface SubscriptionCancellationScheduledPreviewProps {
  livemode?: boolean
}

export const SubscriptionCancellationScheduledPreview = ({
  livemode = true,
}: SubscriptionCancellationScheduledPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="customer-subscription-cancellation-scheduled"
      scenario="Cancellation scheduled for end of period"
      subject="Cancellation Scheduled"
      previewText="Your subscription cancellation has been scheduled"
      livemode={livemode}
      emailType="subscription-cancellation-scheduled"
    >
      <CustomerSubscriptionCancellationScheduledEmail
        customerName={commonCustomerProps.customerName}
        customerId={mockCustomer.id}
        {...commonOrganizationProps}
        subscriptionName="Pro Plan"
        scheduledCancellationDate={getFutureDate(30)}
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Payment Failed Preview
// ============================================================================

interface PaymentFailedPreviewProps {
  hasRetryDate?: boolean
  livemode?: boolean
}

export const PaymentFailedPreview = ({
  hasRetryDate = true,
  livemode = true,
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
      livemode={livemode}
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
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Billing Portal OTP Preview
// ============================================================================

interface BillingPortalOTPPreviewProps {
  livemode?: boolean
}

export const BillingPortalOTPPreview = ({
  livemode = true,
}: BillingPortalOTPPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="customer-billing-portal-otp"
      scenario="Billing portal sign-in OTP"
      subject="Sign In to Billing Portal"
      previewText={`Sign in to your billing portal for ${commonOrganizationProps.organizationName}`}
      livemode={livemode}
      emailType="billing-portal-otp"
    >
      <CustomerBillingPortalOTPEmail
        customerName={commonCustomerProps.customerName}
        email="john.doe@example.com"
        otp="123456"
        organizationName={commonOrganizationProps.organizationName}
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Billing Portal Magic Link Preview
// ============================================================================

interface BillingPortalMagicLinkPreviewProps {
  livemode?: boolean
}

export const BillingPortalMagicLinkPreview = ({
  livemode = true,
}: BillingPortalMagicLinkPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="customer-billing-portal-magic-link"
      scenario="Billing portal magic link sign-in"
      subject="Sign In to Billing Portal"
      previewText={`Sign in to your billing portal for ${commonOrganizationProps.organizationName}`}
      livemode={livemode}
      emailType="billing-portal-magic-link"
    >
      <CustomerBillingPortalMagicLinkEmail
        customerName={commonCustomerProps.customerName}
        email="john.doe@example.com"
        url="https://billing.example.com/magic-link/abc123"
        organizationName={commonOrganizationProps.organizationName}
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Forgot Password Preview
// ============================================================================

interface ForgotPasswordPreviewProps {
  livemode?: boolean
}

export const ForgotPasswordPreview = ({
  livemode = true,
}: ForgotPasswordPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="forgot-password"
      scenario="Password reset request"
      subject="Reset Your Password"
      previewText={`Reset your password, ${commonCustomerProps.customerName}`}
      livemode={livemode}
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
  livemode?: boolean
}

export const OrgSubscriptionCreatedPreview = ({
  livemode = true,
}: OrgSubscriptionCreatedPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="organization-subscription-notifications"
      scenario="Org notification: New subscription"
      subject="New Subscription"
      previewText={`New Subscription: ${commonCustomerProps.customerName} subscribed to Pro Plan`}
      livemode={livemode}
      emailType="org-subscription-created"
    >
      <OrganizationSubscriptionCreatedNotificationEmail
        organizationName={commonOrganizationProps.organizationName}
        subscriptionName="Pro Plan"
        customerId={mockCustomer.id}
        customerName={commonCustomerProps.customerName}
        customerEmail="john.doe@example.com"
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Organization Subscription Canceled Notification Preview
// ============================================================================

interface OrgSubscriptionCanceledPreviewProps {
  livemode?: boolean
}

export const OrgSubscriptionCanceledPreview = ({
  livemode = true,
}: OrgSubscriptionCanceledPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="organization-subscription-notifications"
      scenario="Org notification: Subscription canceled"
      subject="Subscription Cancellation Alert"
      previewText={`Subscription Cancelled: ${commonCustomerProps.customerName} canceled Pro Plan`}
      livemode={livemode}
      emailType="org-subscription-canceled"
    >
      <OrganizationSubscriptionCanceledNotificationEmail
        organizationName={commonOrganizationProps.organizationName}
        subscriptionName="Pro Plan"
        customerId={mockCustomer.id}
        customerName={commonCustomerProps.customerName}
        customerEmail="john.doe@example.com"
        cancellationDate={PREVIEW_REFERENCE_DATE}
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Organization Subscription Cancellation Scheduled Notification Preview
// ============================================================================

interface OrgSubscriptionCancellationScheduledPreviewProps {
  livemode?: boolean
}

export const OrgSubscriptionCancellationScheduledPreview = ({
  livemode = true,
}: OrgSubscriptionCancellationScheduledPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="organization-subscription-notifications"
      scenario="Org notification: Cancellation scheduled"
      subject="Subscription Cancellation Scheduled"
      previewText={`Cancellation Scheduled: ${commonCustomerProps.customerName} scheduled cancellation for Pro Plan`}
      livemode={livemode}
      emailType="org-subscription-cancellation-scheduled"
    >
      <OrganizationSubscriptionCancellationScheduledNotificationEmail
        organizationName={commonOrganizationProps.organizationName}
        subscriptionName="Pro Plan"
        customerId={mockCustomer.id}
        customerName={commonCustomerProps.customerName}
        customerEmail="john.doe@example.com"
        scheduledCancellationDate={getFutureDate(30)}
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Purchase Access Token Email Preview
// ============================================================================

interface PurchaseAccessTokenPreviewProps {
  livemode?: boolean
}

export const PurchaseAccessTokenPreview = ({
  livemode = true,
}: PurchaseAccessTokenPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="send-purchase-access-session-token"
      scenario="Purchase access magic link"
      subject="Your Order Link"
      previewText="Access your order with this magic link."
      livemode={livemode}
      emailType="purchase-access-token"
    >
      <SendPurchaseAccessSessionTokenEmail
        magicLink="https://app.flowglad.com/access/abc123xyz"
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Trial Ending Soon Preview
// ============================================================================

interface TrialEndingSoonPreviewProps {
  hasPaymentMethod?: boolean
  daysRemaining?: number
  livemode?: boolean
}

export const TrialEndingSoonPreview = ({
  hasPaymentMethod = true,
  daysRemaining = 3,
  livemode = true,
}: TrialEndingSoonPreviewProps) => {
  const scenario = hasPaymentMethod
    ? `Trial ending in ${daysRemaining} days - payment method on file, will auto-convert to paid subscription`
    : `Trial ending in ${daysRemaining} days - no payment method, prompts customer to add one`

  const previewText =
    daysRemaining === 1
      ? 'Your Trial Ends Tomorrow'
      : `Your Trial Ends in ${daysRemaining} Days`

  return (
    <EmailPreviewWrapper
      templateName="customer-trial-ending-soon"
      scenario={scenario}
      subject="Trial Ending Soon"
      previewText={previewText}
      livemode={livemode}
      emailType="trial-ending-soon"
    >
      <CustomerTrialEndingSoonEmail
        customerName={commonCustomerProps.customerName}
        {...commonOrganizationProps}
        customerId={commonCustomerProps.customerId}
        planName="Pro Plan"
        trialEndDate={getFutureDate(daysRemaining)}
        daysRemaining={daysRemaining}
        price={MOCK_PRICES.PRO_PLAN}
        currency={DEFAULT_CURRENCY}
        interval={DEFAULT_INTERVAL}
        hasPaymentMethod={hasPaymentMethod}
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Trial Expired No Payment Preview
// ============================================================================

interface TrialExpiredNoPaymentPreviewProps {
  livemode?: boolean
}

export const TrialExpiredNoPaymentPreview = ({
  livemode = true,
}: TrialExpiredNoPaymentPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="customer-trial-expired-no-payment"
      scenario="Trial has expired and no payment method was added - subscription is now inactive"
      subject="Update Your Payment Method"
      previewText="Action Required: Update Your Payment Method"
      livemode={livemode}
      emailType="trial-expired-no-payment"
    >
      <CustomerTrialExpiredNoPaymentEmail
        customerName={commonCustomerProps.customerName}
        {...commonOrganizationProps}
        customerId={commonCustomerProps.customerId}
        planName="Pro Plan"
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Subscription Renewal Reminder Preview
// ============================================================================

interface SubscriptionRenewalReminderPreviewProps {
  livemode?: boolean
}

export const SubscriptionRenewalReminderPreview = ({
  livemode = true,
}: SubscriptionRenewalReminderPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="customer-subscription-renewal-reminder"
      scenario="Renewal reminder sent 7 days before subscription renews"
      subject="Subscription Renewal"
      previewText="Your Subscription Renews Soon"
      livemode={livemode}
      emailType="subscription-renewal-reminder"
    >
      <CustomerSubscriptionRenewalReminderEmail
        customerName={commonCustomerProps.customerName}
        {...commonOrganizationProps}
        customerId={commonCustomerProps.customerId}
        planName="Pro Plan"
        renewalDate={getFutureDate(7)}
        daysUntilRenewal={7}
        price={MOCK_PRICES.PRO_PLAN}
        currency={DEFAULT_CURRENCY}
        interval={DEFAULT_INTERVAL}
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Organization Payment Received Preview
// ============================================================================

interface OrgPaymentReceivedPreviewProps {
  livemode?: boolean
}

export const OrgPaymentReceivedPreview = ({
  livemode = true,
}: OrgPaymentReceivedPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="organization/organization-payment-succeeded"
      scenario="Org notification: Payment received from customer"
      subject="Congratulations!"
      previewText={`Congratulations, ${commonOrganizationProps.organizationName}!`}
      livemode={livemode}
      emailType="org-payment-received"
    >
      <OrganizationPaymentNotificationEmail
        organizationName={commonOrganizationProps.organizationName}
        amount={MOCK_PRICES.PRO_PLAN}
        invoiceNumber="INV-2024-001"
        currency={DEFAULT_CURRENCY}
        customerId={mockCustomer.id}
        customerName={commonCustomerProps.customerName}
        customerEmail="john.doe@example.com"
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Organization Payment Failed Preview
// ============================================================================

interface OrgPaymentFailedPreviewProps {
  livemode?: boolean
}

export const OrgPaymentFailedPreview = ({
  livemode = true,
}: OrgPaymentFailedPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="organization/organization-payment-failed"
      scenario="Org notification: Customer payment failed"
      subject="Payment Failed"
      previewText="Payment Failed - Action Required"
      livemode={livemode}
      emailType="org-payment-failed"
    >
      <OrganizationPaymentFailedNotificationEmail
        organizationName={commonOrganizationProps.organizationName}
        amount={MOCK_PRICES.PRO_PLAN}
        invoiceNumber="INV-2024-002"
        currency={DEFAULT_CURRENCY}
        customerId={mockCustomer.id}
        customerName={commonCustomerProps.customerName}
        failureReason="Your card was declined"
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Organization Payment Pending Preview
// ============================================================================

interface OrgPaymentPendingPreviewProps {
  livemode?: boolean
}

export const OrgPaymentPendingPreview = ({
  livemode = true,
}: OrgPaymentPendingPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="organization/organization-payment-awaiting-confirmation"
      scenario="Org notification: Payment awaiting confirmation"
      subject="Payment Pending Confirmation"
      previewText="Awaiting Confirmation for Payment"
      livemode={livemode}
      emailType="org-payment-pending"
    >
      <OrganizationPaymentConfirmationEmail
        organizationName={commonOrganizationProps.organizationName}
        amount={MOCK_PRICES.PRO_PLAN}
        invoiceNumber="INV-2024-003"
        customerId={mockCustomer.id}
        currency={DEFAULT_CURRENCY}
        customerName={commonCustomerProps.customerName}
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Organization Subscription Adjusted Preview
// ============================================================================

interface OrgSubscriptionAdjustedPreviewProps {
  livemode?: boolean
}

export const OrgSubscriptionAdjustedPreview = ({
  livemode = true,
}: OrgSubscriptionAdjustedPreviewProps) => {
  const subscriptionItems = createSubscriptionItems(true)

  return (
    <EmailPreviewWrapper
      templateName="organization/organization-subscription-adjusted"
      scenario="Org notification: Customer updated their subscription"
      subject="Subscription Updated"
      previewText={`Subscription Updated - ${commonCustomerProps.customerName}`}
      livemode={livemode}
      emailType="org-subscription-adjusted"
    >
      <OrganizationSubscriptionAdjustedEmail
        organizationName={commonOrganizationProps.organizationName}
        customerName={commonCustomerProps.customerName}
        customerEmail="john.doe@example.com"
        customerId={mockCustomer.id}
        adjustmentType="upgrade"
        previousItems={subscriptionItems.previousItems}
        newItems={subscriptionItems.newItems}
        previousTotalPrice={subscriptionItems.previousTotalPrice}
        newTotalPrice={subscriptionItems.newTotalPrice}
        currency={DEFAULT_CURRENCY}
        prorationAmount={subscriptionItems.prorationAmount}
        effectiveDate={PREVIEW_REFERENCE_DATE}
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Organization Payouts Enabled Preview
// ============================================================================

interface OrgPayoutsEnabledPreviewProps {
  livemode?: boolean
}

export const OrgPayoutsEnabledPreview = ({
  livemode = true,
}: OrgPayoutsEnabledPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="organization/organization-payouts-enabled"
      scenario="Org notification: Payouts have been enabled"
      subject={`Payouts Enabled for ${commonOrganizationProps.organizationName}`}
      previewText={`Payouts have been enabled for ${commonOrganizationProps.organizationName}`}
      livemode={livemode}
      emailType="org-payouts-enabled"
    >
      <OrganizationPayoutsEnabledNotificationEmail
        organizationName={commonOrganizationProps.organizationName}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Organization Onboarding Completed Preview
// ============================================================================

interface OrgOnboardingCompletedPreviewProps {
  livemode?: boolean
}

export const OrgOnboardingCompletedPreview = ({
  livemode = true,
}: OrgOnboardingCompletedPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="organization/payout-notification"
      scenario="Org notification: Onboarding completed, pending review"
      subject={`Congratulations! ${commonOrganizationProps.organizationName} is fully onboarded`}
      previewText={`Live payments pending review for ${commonOrganizationProps.organizationName}`}
      livemode={livemode}
      emailType="org-onboarding-completed"
    >
      <OrganizationOnboardingCompletedNotificationEmail
        organizationName={commonOrganizationProps.organizationName}
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Organization Team Invitation Preview
// ============================================================================

interface OrgTeamInvitationPreviewProps {
  livemode?: boolean
}

export const OrgTeamInvitationPreview = ({
  livemode = true,
}: OrgTeamInvitationPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="organization/organization-invitation"
      scenario="Team member invitation email"
      subject={`You've been invited to ${commonOrganizationProps.organizationName}`}
      previewText={`You've been invited to join ${commonOrganizationProps.organizationName}`}
      livemode={livemode}
      emailType="org-team-invitation"
    >
      <OrganizationInvitationEmail
        organizationName={commonOrganizationProps.organizationName}
        inviterName="Jane Smith"
      />
    </EmailPreviewWrapper>
  )
}

// ============================================================================
// Organization CSV Export Ready Preview
// ============================================================================

interface OrgCsvExportReadyPreviewProps {
  livemode?: boolean
}

export const OrgCsvExportReadyPreview = ({
  livemode = true,
}: OrgCsvExportReadyPreviewProps) => {
  return (
    <EmailPreviewWrapper
      templateName="organization/customers-csv-export-ready"
      scenario="Org notification: Customer CSV export is ready"
      subject="Your CSV Export is Ready"
      previewText={`Your customers CSV export for ${commonOrganizationProps.organizationName} is ready`}
      livemode={livemode}
      emailType="org-csv-export-ready"
    >
      <CustomersCsvExportReadyEmail
        organizationName={commonOrganizationProps.organizationName}
        livemode={livemode}
      />
    </EmailPreviewWrapper>
  )
}
