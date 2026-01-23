import { Img, Section, Text } from '@react-email/components'
import * as React from 'react'
import type { CurrencyCode } from '@/types'
import { emailBaseUrl } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { EmailButton } from '../components/EmailButton'
import TestModeBanner from '../components/TestBanner'
import {
  DetailItem,
  DetailSection,
  EmailLayout,
  Footer,
  Header,
  Paragraph,
} from '../components/themed'

export interface SubscriptionItem {
  name: string
  unitPrice: number
  quantity: number
}

export interface OrganizationSubscriptionAdjustedEmailProps {
  organizationName: string
  customerName: string
  customerEmail: string | null
  customerId: string
  adjustmentType: 'upgrade' | 'downgrade'
  previousItems: SubscriptionItem[]
  newItems: SubscriptionItem[]
  previousTotalPrice: number
  newTotalPrice: number
  currency: CurrencyCode
  prorationAmount: number | null
  effectiveDate: Date
  livemode: boolean
}

const detailsValue = {
  color: '#141312',
  fontSize: '16px',
  fontWeight: 'bold' as const,
  marginBottom: '16px',
}

const itemRow = {
  color: '#141312',
  fontSize: '14px',
  margin: '4px 0',
}

const formatSubscriptionItems = (
  items: SubscriptionItem[],
  currency: CurrencyCode
): React.ReactNode[] => {
  return items.map((item, index) => {
    const formattedPrice =
      stripeCurrencyAmountToHumanReadableCurrencyAmount(
        currency,
        item.unitPrice
      )
    return (
      <Text key={index} style={itemRow}>
        {item.name} x {item.quantity} @ {formattedPrice}
      </Text>
    )
  })
}

export const OrganizationSubscriptionAdjustedEmail = ({
  organizationName,
  customerName,
  customerEmail,
  customerId,
  adjustmentType,
  previousItems,
  newItems,
  previousTotalPrice,
  newTotalPrice,
  currency,
  prorationAmount,
  effectiveDate,
  livemode,
}: OrganizationSubscriptionAdjustedEmailProps) => {
  // Keep isUpgrade for internal logic (showing revenue direction in body)
  // but use neutral title per Apple-inspired patterns in subscription-email-improvements.md
  const isUpgrade = adjustmentType === 'upgrade'
  const title = 'Subscription Updated'
  const previewText = `Subscription Updated - ${customerName}`

  const formattedPreviousTotal =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      currency,
      previousTotalPrice
    )
  const formattedNewTotal =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      currency,
      newTotalPrice
    )
  const formattedProration =
    prorationAmount !== null
      ? stripeCurrencyAmountToHumanReadableCurrencyAmount(
          currency,
          prorationAmount
        )
      : null

  return (
    <EmailLayout previewText={previewText} variant="organization">
      <TestModeBanner livemode={livemode} />
      <Img
        src={`${emailBaseUrl}/images/email/Flowglad-email-logo.jpg`}
        width="40"
        height="40"
        alt="Flowglad Logo"
        style={{ marginBottom: '32px' }}
      />
      <Header
        title={title}
        variant="organization"
        style={{ fontWeight: 'normal' }}
      />
      <Paragraph
        variant="organization"
        style={{
          color: '#797063',
          margin: 0,
        }}
      >
        {`${customerName} has updated their subscription.`}
      </Paragraph>
      <DetailSection>
        <DetailItem style={{ color: '#797063', marginBottom: '4px' }}>
          Customer Name
        </DetailItem>
        <Text style={detailsValue}>{customerName}</Text>
        {customerEmail && (
          <>
            <DetailItem
              style={{ color: '#797063', marginBottom: '4px' }}
            >
              Customer Email
            </DetailItem>
            <Text style={detailsValue}>{customerEmail}</Text>
          </>
        )}
        <DetailItem style={{ color: '#797063', marginBottom: '4px' }}>
          Previous Plan
        </DetailItem>
        <div style={{ marginBottom: '16px' }}>
          {formatSubscriptionItems(previousItems, currency)}
          <Text style={{ ...itemRow, fontWeight: 'bold' as const }}>
            Total: {formattedPreviousTotal}
          </Text>
        </div>
        <DetailItem style={{ color: '#797063', marginBottom: '4px' }}>
          New Plan
        </DetailItem>
        <div style={{ marginBottom: '16px' }}>
          {formatSubscriptionItems(newItems, currency)}
          <Text style={{ ...itemRow, fontWeight: 'bold' as const }}>
            Total: {formattedNewTotal}
          </Text>
        </div>
        {formattedProration !== null && (
          <>
            <DetailItem
              style={{ color: '#797063', marginBottom: '4px' }}
            >
              Proration Charged
            </DetailItem>
            <Text style={detailsValue}>{formattedProration}</Text>
          </>
        )}
        {prorationAmount === null && (
          <>
            <DetailItem
              style={{ color: '#797063', marginBottom: '4px' }}
            >
              Charge
            </DetailItem>
            <Text style={detailsValue}>No charge (downgrade)</Text>
          </>
        )}
        <DetailItem style={{ color: '#797063', marginBottom: '4px' }}>
          Effective Date
        </DetailItem>
        <Text style={detailsValue}>
          {effectiveDate.toLocaleDateString()}
        </Text>
      </DetailSection>
      <Section
        style={{ textAlign: 'center' as const, marginTop: '32px' }}
      >
        <EmailButton
          href={`https://app.flowglad.com/customers/${customerId}`}
        >
          View Customer Profile
        </EmailButton>
      </Section>
      <Paragraph
        variant="organization"
        style={{
          color: '#797063',
          lineHeight: '20px',
          marginTop: '24px',
        }}
      >
        {`You can manage this customer's subscription and access their information through your dashboard.`}
      </Paragraph>
      <Footer
        organizationName={organizationName}
        variant="organization"
      />
    </EmailLayout>
  )
}
