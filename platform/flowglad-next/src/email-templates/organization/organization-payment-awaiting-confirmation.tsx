import { CurrencyCode } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { Img, Section } from '@react-email/components'
import * as React from 'react'
import { EmailButton } from '../components/EmailButton'
import {
  EmailLayout,
  Header,
  Paragraph,
  DetailSection,
  DetailItem,
  DetailValue,
} from '../components/themed'
import { emailBaseUrl } from '@/utils/core'

export interface OrganizationPaymentConfirmationEmailProps {
  organizationName: string
  amount: number
  invoiceNumber?: string
  customerId: string
  currency: CurrencyCode
  customerName: string
}

export const OrganizationPaymentConfirmationEmail = ({
  organizationName,
  amount,
  invoiceNumber,
  customerId,
  currency,
  customerName,
}: OrganizationPaymentConfirmationEmailProps) => {
  const humanReadableAmount =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      currency,
      amount
    )
  return (
    <EmailLayout
      previewText="Awaiting Confirmation for Payment"
      variant="organization"
    >
      <Img
        src={`https://cdn-flowglad.com/flowglad-banner-rounded.png`}
        width="540"
        height="199"
        alt="Flowglad Logo"
        style={{ margin: '0 auto', marginBottom: '32px' }}
      />
      <Header
        title="Payment Pending Confirmation"
        variant="organization"
      />
      <Paragraph variant="organization">
        A payment of {humanReadableAmount} from {customerName} is
        awaiting confirmation. We will notify you once the payment has
        been successfully processed.
      </Paragraph>
      <DetailSection>
        <DetailItem variant="organization">Customer</DetailItem>
        <DetailValue>{customerName}</DetailValue>
        <DetailItem variant="organization">Payment</DetailItem>
        <DetailValue>{humanReadableAmount}</DetailValue>
        <DetailItem variant="organization">Status</DetailItem>
        <DetailValue>Pending Confirmation</DetailValue>
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
        This payment is being processed by Flowglad on behalf of{' '}
        {organizationName}. You will receive another notification once
        the payment is confirmed.
      </Paragraph>
    </EmailLayout>
  )
}
