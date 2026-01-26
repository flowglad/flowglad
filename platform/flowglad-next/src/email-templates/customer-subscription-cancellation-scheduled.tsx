import * as React from 'react'
import core, { formatDate } from '@/utils/core'
import { EmailButton } from './components/EmailButton'
import TestModeBanner from './components/TestBanner'
import {
  DetailItem,
  DetailSection,
  EmailLayout,
  Footer,
  Header,
  Paragraph,
  Signature,
} from './components/themed'

export interface CustomerSubscriptionCancellationScheduledEmailProps {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerId: string
  subscriptionName: string
  scheduledCancellationDate: Date
  livemode: boolean
}

export const CustomerSubscriptionCancellationScheduledEmail = ({
  customerName,
  organizationName,
  organizationLogoUrl,
  organizationId,
  customerId,
  subscriptionName,
  scheduledCancellationDate,
  livemode,
}: CustomerSubscriptionCancellationScheduledEmailProps) => {
  return (
    <EmailLayout previewText="Your subscription cancellation has been scheduled">
      <TestModeBanner livemode={livemode} />
      <Header
        title="Cancellation Scheduled"
        organizationLogoUrl={organizationLogoUrl}
      />

      <Paragraph>Hi {customerName},</Paragraph>

      <Paragraph>
        Your request to cancel your subscription has been received and
        scheduled.
      </Paragraph>

      <DetailSection>
        <DetailItem dataTestId="subscription-name">
          Subscription: {subscriptionName}
        </DetailItem>
        <DetailItem dataTestId="scheduled-cancellation-date">
          Cancellation date: {formatDate(scheduledCancellationDate)}
        </DetailItem>
      </DetailSection>

      <Paragraph style={{ marginTop: '24px' }}>
        Your subscription will remain active until{' '}
        {formatDate(scheduledCancellationDate)}. You will continue to
        have access to all features until that date.
      </Paragraph>

      <Paragraph style={{ marginTop: '16px' }}>
        There will be no further charges after the cancellation date.
        You can view your billing history and manage your subscription
        at any time through your billing portal.
      </Paragraph>

      <EmailButton
        href={core.customerBillingPortalURL({
          organizationId,
          customerId,
        })}
        testId="view-billing-portal-button"
      >
        View Billing Portal →
      </EmailButton>

      <Signature
        greeting="Thanks,"
        name={organizationName}
        greetingDataTestId="signature-thanks"
        nameDataTestId="signature-org-name"
      />

      <Footer
        organizationName={organizationName}
        variant="customer"
        billingPortalUrl={core.customerBillingPortalURL({
          organizationId,
          customerId,
        })}
      />
    </EmailLayout>
  )
}

export default CustomerSubscriptionCancellationScheduledEmail
