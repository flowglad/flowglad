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

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : ''

export interface OrganizationPaymentNotificationEmailProps {
  organizationName: string
  amount: number
  invoiceNumber?: string
  currency: CurrencyCode
  customerId: string
  customerName: string
}

export const OrganizationPaymentNotificationEmail = ({
  organizationName,
  amount,
  invoiceNumber,
  currency,
  customerId,
  customerName,
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
      <Img
        src={`https://cdn-flowglad.com/flowglad-banner-rounded.png`}
        width="540"
        height="199"
        alt="Flowglad Logo"
        style={{ margin: '0 auto', marginBottom: '32px' }}
      />
      <Header title="Congratulations!" variant="organization" />
      <Paragraph variant="organization">
        You just received a payment of {humanReadableAmount} from{' '}
        {customerName}!
      </Paragraph>
      <DetailSection>
        <DetailItem variant="organization">Customer</DetailItem>
        <DetailValue>{customerName}</DetailValue>
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
        <EmailButton
          href={`https://app.flowglad.com/customers/${customerId}`}
        >
          View in Dashboard
        </EmailButton>
      </Section>
      <Paragraph variant="organization" style={{ marginTop: '24px' }}>
        This payment was processed by Flowglad on behalf of{' '}
        {organizationName}.
      </Paragraph>
    </EmailLayout>
  )
}
