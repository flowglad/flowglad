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

export interface OrganizationPaymentFailedNotificationEmailProps {
  organizationName: string
  amount: number
  invoiceNumber?: string
  currency: CurrencyCode
  customerId: string
  customerName: string
  failureReason?: string
  livemode: boolean
}

export const OrganizationPaymentFailedNotificationEmail = ({
  organizationName,
  amount,
  invoiceNumber,
  currency,
  customerId,
  customerName,
  failureReason,
  livemode,
}: OrganizationPaymentFailedNotificationEmailProps) => {
  const humanReadableAmount =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      currency,
      amount
    )
  return (
    <EmailLayout
      previewText="Payment Failed - Action Required"
      variant="organization"
    >
      <TestModeBanner livemode={livemode} />
      <Img
        src={`https://cdn-flowglad.com/flowglad-banner-rounded.png`}
        width="540"
        height="199"
        alt="Flowglad Logo"
        style={{ margin: '0 auto', marginBottom: '32px' }}
      />
      <Header title="Payment Failed" variant="organization" />
      <Paragraph variant="organization">
        A payment of {humanReadableAmount} from {customerName} has
        failed to process.
        {failureReason && (
          <>
            <br />
            <strong>Reason:</strong> {failureReason}
          </>
        )}
      </Paragraph>
      <DetailSection>
        <DetailItem variant="organization">Customer</DetailItem>
        <DetailValue>{customerName}</DetailValue>
        <DetailItem variant="organization">Payment</DetailItem>
        <DetailValue>{humanReadableAmount}</DetailValue>
        <DetailItem variant="organization">Status</DetailItem>
        <DetailValue>Failed</DetailValue>
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
        This payment was attempted to be processed by Flowglad on
        behalf of {organizationName}. Please update your payment
        information to ensure future transactions are successful.
      </Paragraph>
      <Footer
        organizationName={organizationName}
        variant="organization"
      />
    </EmailLayout>
  )
}
