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

export interface CustomerSubscriptionCanceledEmailProps {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerId: string
  subscriptionName: string
  cancellationDate: Date
  livemode: boolean
}

export const CustomerSubscriptionCanceledEmail = ({
  customerName,
  organizationName,
  organizationLogoUrl,
  organizationId,
  customerId,
  subscriptionName,
  cancellationDate,
  livemode,
}: CustomerSubscriptionCanceledEmailProps) => {
  return (
    <EmailLayout previewText="Your subscription has been canceled">
      <TestModeBanner livemode={livemode} />
      <Header
        title="Subscription Canceled"
        organizationLogoUrl={organizationLogoUrl}
      />

      <Paragraph>Hi {customerName},</Paragraph>

      <Paragraph>
        Your subscription has been canceled and is no longer active.
      </Paragraph>

      <DetailSection>
        <DetailItem dataTestId="subscription-name">
          Subscription: {subscriptionName}
        </DetailItem>
        <DetailItem dataTestId="cancellation-date">
          Cancellation date: {formatDate(cancellationDate)}
        </DetailItem>
      </DetailSection>

      <Paragraph style={{ marginTop: '24px' }}>
        There will be no further charges on your account for this
        subscription.
      </Paragraph>

      <Paragraph style={{ marginTop: '16px' }}>
        You can view your billing history at any time through your
        billing portal.
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

export default CustomerSubscriptionCanceledEmail
