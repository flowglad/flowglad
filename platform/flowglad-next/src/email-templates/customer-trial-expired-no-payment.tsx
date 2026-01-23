import * as React from 'react'
import core from '@/utils/core'
import { EmailButton } from './components/EmailButton'
import TestModeBanner from './components/TestBanner'
import {
  EmailLayout,
  Footer,
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
  productName: string
  livemode: boolean
}

export const CustomerTrialExpiredNoPaymentEmail = ({
  customerName,
  organizationName,
  organizationLogoUrl,
  organizationId,
  customerId,
  productName,
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

      <Paragraph>
        Thanks for trying {productName}! Your trial period has ended.
      </Paragraph>

      <Paragraph>
        Please add a payment method to continue using {productName}{' '}
        without interruption.
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

export default CustomerTrialExpiredNoPaymentEmail
