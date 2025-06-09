import { CurrencyCode } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { Img, Section, Text } from '@react-email/components'
import * as React from 'react'
import { EmailButton } from '../components/EmailButton'
import {
  EmailLayout,
  Header,
  Paragraph,
  DetailSection,
  DetailItem,
} from '../components/themed'

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : ''

export interface OrganizationPaymentFailedNotificationEmailProps {
  organizationName: string
  amount: number
  invoiceNumber?: string
  currency: CurrencyCode
  customerId: string
  customerName: string
}

const detailsValue = {
  color: '#32325d',
  fontSize: '16px',
  fontWeight: 'bold' as const,
  marginBottom: '16px',
}

export const OrganizationPaymentFailedNotificationEmail = ({
  organizationName,
  amount,
  invoiceNumber,
  currency,
  customerId,
  customerName,
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
      <Img
        src={`https://cdn-flowglad.com/flowglad-banner-rounded.png`}
        width="540"
        height="199"
        alt="Flowglad Logo"
        style={{ margin: '0 auto', marginBottom: '32px' }}
      />
      <Header
        title="Payment Failed"
        style={{ textAlign: 'center', fontWeight: 'normal' }}
      />
      <Paragraph
        style={{
          color: '#525f7f',
          textAlign: 'center',
          margin: 0,
        }}
      >
        A payment of {humanReadableAmount} from {customerName} has
        failed to process. Please review your payment details and try
        again.
      </Paragraph>
      <DetailSection>
        <DetailItem style={{ color: '#525f7f', marginBottom: '4px' }}>
          Customer
        </DetailItem>
        <Text style={detailsValue}>{customerName}</Text>
        <DetailItem style={{ color: '#525f7f', marginBottom: '4px' }}>
          Payment
        </DetailItem>
        <Text style={detailsValue}>{humanReadableAmount}</Text>
        <DetailItem style={{ color: '#525f7f', marginBottom: '4px' }}>
          Status
        </DetailItem>
        <Text style={detailsValue}>Failed</Text>
        {invoiceNumber && (
          <>
            <DetailItem
              style={{ color: '#525f7f', marginBottom: '4px' }}
            >
              Invoice #
            </DetailItem>
            <Text style={detailsValue}>{invoiceNumber}</Text>
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
      <Paragraph
        style={{
          color: '#525f7f',
          lineHeight: '20px',
          textAlign: 'center',
          marginTop: '24px',
        }}
      >
        This payment was attempted to be processed by Flowglad on
        behalf of {organizationName}. Please update your payment
        information to ensure future transactions are successful.
      </Paragraph>
    </EmailLayout>
  )
}
