import * as React from 'react'
import core from '@/utils/core'
import { EmailButton } from './components/EmailButton'
import TestModeBanner from './components/TestBanner'
import {
  DetailItem,
  DetailSection,
  EmailLayout,
  Header,
  Paragraph,
  Signature,
} from './components/themed'

export interface CustomerTrialExpiredNoPaymentEmailProps {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerId: string
  planName: string
  livemode: boolean
}

export const CustomerTrialExpiredNoPaymentEmail = ({
  customerName,
  organizationName,
  organizationLogoUrl,
  organizationId,
  customerId,
  planName,
  livemode,
}: CustomerTrialExpiredNoPaymentEmailProps) => {
  return (
    <EmailLayout previewText="Action Required: Update Your Payment Method">
      <TestModeBanner livemode={livemode} />
      <Header
        title="Update Your Payment Method"
        organizationLogoUrl={organizationLogoUrl}
      />

      <Paragraph>Hi {customerName},</Paragraph>

      <Paragraph>Your free trial for {planName} has ended.</Paragraph>

      <DetailSection>
        <DetailItem dataTestId="plan-name">
          Plan: {planName}
        </DetailItem>
        <DetailItem dataTestId="status">
          Status: Trial ended - Payment required
        </DetailItem>
      </DetailSection>

      <Paragraph style={{ marginTop: '24px' }}>
        To continue using {planName}, please add a payment method.
      </Paragraph>

      <Paragraph style={{ marginTop: '16px' }}>
        If you don't add a payment method, your subscription will
        remain inactive and you won't have access to the features
        included in your plan.
      </Paragraph>

      <EmailButton
        href={core.customerBillingPortalURL({
          organizationId,
          customerId,
        })}
        testId="add-payment-method-button"
      >
        Add Payment Method →
      </EmailButton>

      <Signature
        greeting="Thanks,"
        name={organizationName}
        greetingDataTestId="signature-thanks"
        nameDataTestId="signature-org-name"
      />
    </EmailLayout>
  )
}

export default CustomerTrialExpiredNoPaymentEmail
