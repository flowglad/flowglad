import { Img, Section } from '@react-email/components'
import * as React from 'react'
import type { CurrencyCode } from '@/types'
import { emailBaseUrl } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { EmailButton } from '../components/EmailButton'
import TestModeBanner from '../components/TestBanner'
import {
  DetailItem,
  DetailSection,
  DetailValue,
  EmailLayout,
  Footer,
  Header,
  Paragraph,
} from '../components/themed'

export interface OrganizationPaymentNotificationEmailProps {
  organizationName: string
  amount: number
  invoiceNumber?: string
  currency: CurrencyCode
  customerId: string
  customerName: string
  customerEmail: string
  livemode: boolean
}

export const OrganizationPaymentNotificationEmail = ({
  organizationName,
  amount,
  invoiceNumber,
  currency,
  customerId,
  customerName,
  customerEmail,
  livemode,
}: OrganizationPaymentNotificationEmailProps) => {
  const humanReadableAmount =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      currency,
      amount
    )
  return (
    <EmailLayout
      previewText={`Congratulations, ${organizationName}!`}
      variant="organization"
    >
      <TestModeBanner livemode={livemode} />
      <Img
        src={`${emailBaseUrl}/images/email/Flowglad-email-logo.jpg`}
        width="40"
        height="40"
        alt="Flowglad Logo"
        style={{ marginBottom: '32px' }}
      />
      <Header title="Congratulations!" variant="organization" />
      <Paragraph variant="organization">
        You just received a payment of {humanReadableAmount} from{' '}
        {customerName}!
      </Paragraph>
      <DetailSection>
        <DetailItem variant="organization">Customer</DetailItem>
        <DetailValue>
          {customerName} - ({customerEmail})
        </DetailValue>
        <DetailItem variant="organization">Payment</DetailItem>
        <DetailValue>{humanReadableAmount}</DetailValue>
        <DetailItem variant="organization">Status</DetailItem>
        <DetailValue>Paid</DetailValue>
        {invoiceNumber && (
          <>
            <DetailItem variant="organization">Invoice #</DetailItem>
            <DetailValue>{invoiceNumber}</DetailValue>
          </>
        )}
      </DetailSection>
      <Section
        style={{ textAlign: 'center' as const, marginTop: '32px' }}
      >
        <EmailButton href={`${emailBaseUrl}/customers/${customerId}`}>
          View in Dashboard
        </EmailButton>
      </Section>
      <Paragraph variant="organization" style={{ marginTop: '24px' }}>
        This payment was processed by Flowglad on behalf of{' '}
        {organizationName}.
      </Paragraph>
      <Footer
        organizationName={organizationName}
        variant="organization"
      />
    </EmailLayout>
  )
}
