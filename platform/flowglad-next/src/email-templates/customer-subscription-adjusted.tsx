import { Hr, Section, Text } from '@react-email/components'
import * as React from 'react'
import { type CurrencyCode, IntervalUnit } from '@/types'
import core, { formatDate } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { EmailButton } from './components/EmailButton'
import {
  DetailItem,
  DetailSection,
  EmailLayout,
  Footer,
  Header,
  Paragraph,
  Signature,
} from './components/themed'

interface SubscriptionItem {
  name: string
  unitPrice: number
  quantity: number
}

const getIntervalText = (intervalUnit?: IntervalUnit) => {
  if (!intervalUnit) return null
  switch (intervalUnit) {
    case IntervalUnit.Day:
      return 'day'
    case IntervalUnit.Week:
      return 'week'
    case IntervalUnit.Month:
      return 'month'
    case IntervalUnit.Year:
      return 'year'
    default:
      return null
  }
}

const ItemsList = ({
  items,
  currency,
  interval,
  testIdPrefix,
}: {
  items: SubscriptionItem[]
  currency: CurrencyCode
  interval?: IntervalUnit
  testIdPrefix: string
}) => {
  const intervalText = getIntervalText(interval)

  return (
    <Section data-testid={`${testIdPrefix}-items`}>
      {items.map((item, index) => {
        const formattedPrice =
          stripeCurrencyAmountToHumanReadableCurrencyAmount(
            currency,
            item.unitPrice
          )
        const priceWithInterval = intervalText
          ? `${formattedPrice}/${intervalText}`
          : formattedPrice

        return (
          <Text
            key={index}
            style={{
              margin: '4px 0',
              fontSize: '14px',
              color: '#333',
            }}
            data-testid={`${testIdPrefix}-item-${index}`}
          >
            • {item.name}: {priceWithInterval}
            {item.quantity > 1 ? ` × ${item.quantity}` : ''}
          </Text>
        )
      })}
    </Section>
  )
}

export const CustomerSubscriptionAdjustedEmail = ({
  customerName,
  organizationName,
  organizationLogoUrl,
  organizationId,
  adjustmentType,
  previousItems,
  newItems,
  previousTotalPrice,
  newTotalPrice,
  currency,
  interval,
  prorationAmount,
  effectiveDate,
  nextBillingDate,
}: {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  adjustmentType: 'upgrade' | 'downgrade'
  previousItems: SubscriptionItem[]
  newItems: SubscriptionItem[]
  previousTotalPrice: number
  newTotalPrice: number
  currency: CurrencyCode
  interval?: IntervalUnit
  prorationAmount: number | null
  effectiveDate: Date
  nextBillingDate?: Date
}) => {
  // Keep isUpgrade for proration display logic, but use neutral title for all cases
  // per Apple-inspired patterns in subscription-email-improvements.md
  const isUpgrade = adjustmentType === 'upgrade'
  const title = 'Subscription Updated'
  const previewText = 'Your Subscription has been Updated'

  const intervalText = getIntervalText(interval)

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

  const previousTotalWithInterval = intervalText
    ? `${formattedPreviousTotal}/${intervalText}`
    : formattedPreviousTotal
  const newTotalWithInterval = intervalText
    ? `${formattedNewTotal}/${intervalText}`
    : formattedNewTotal

  const formattedProration =
    prorationAmount !== null
      ? stripeCurrencyAmountToHumanReadableCurrencyAmount(
          currency,
          prorationAmount
        )
      : null

  return (
    <EmailLayout previewText={previewText}>
      <Header
        title={title}
        organizationLogoUrl={organizationLogoUrl}
      />

      <Paragraph>Hi {customerName},</Paragraph>

      <Paragraph>
        Your subscription has been updated. Here are the details:
      </Paragraph>

      <DetailSection>
        <DetailItem dataTestId="effective-date">
          Effective date: {formatDate(effectiveDate)}
        </DetailItem>
      </DetailSection>

      <Section style={{ marginTop: '20px' }}>
        <Text
          style={{
            fontSize: '14px',
            fontWeight: 'bold',
            color: '#333',
            margin: '0 0 8px 0',
          }}
          data-testid="previous-plan-label"
        >
          Previous plan ({previousTotalWithInterval}):
        </Text>
        <ItemsList
          items={previousItems}
          currency={currency}
          interval={interval}
          testIdPrefix="previous"
        />
      </Section>

      <Hr
        style={{
          borderColor: '#e6e6e6',
          borderTop: 'none',
          borderLeft: 'none',
          borderRight: 'none',
          borderBottomWidth: '1px',
          borderBottomStyle: 'dashed',
          margin: '16px 0',
        }}
      />

      <Section>
        <Text
          style={{
            fontSize: '14px',
            fontWeight: 'bold',
            color: '#333',
            margin: '0 0 8px 0',
          }}
          data-testid="new-plan-label"
        >
          New plan ({newTotalWithInterval}):
        </Text>
        <ItemsList
          items={newItems}
          currency={currency}
          interval={interval}
          testIdPrefix="new"
        />
      </Section>

      {isUpgrade && formattedProration !== null ? (
        <DetailSection style={{ marginTop: '20px' }}>
          <DetailItem dataTestId="proration-amount">
            Prorated charge: {formattedProration}
          </DetailItem>
        </DetailSection>
      ) : (
        !isUpgrade && (
          <Text
            style={{
              fontSize: '14px',
              lineHeight: '24px',
              marginTop: '20px',
              color: '#666',
            }}
            data-testid="no-charge-notice"
          >
            No charge for this change.
          </Text>
        )
      )}

      {nextBillingDate && (
        <Text
          style={{
            fontSize: '14px',
            lineHeight: '24px',
            color: '#333',
            margin: '16px 0 20px',
          }}
          data-testid="next-billing"
        >
          Your next billing date is {formatDate(nextBillingDate)}.
        </Text>
      )}

      <Text
        style={{
          fontSize: '14px',
          lineHeight: '24px',
          color: '#666',
          marginTop: '16px',
        }}
        data-testid="auto-renew-notice"
      >
        Your subscription automatically renews until canceled.
      </Text>

      <Paragraph style={{ marginTop: '16px' }}>
        You can manage your subscription and payment methods at any
        time through your billing portal.
      </Paragraph>

      <EmailButton
        href={core.organizationBillingPortalURL({
          organizationId,
        })}
        testId="manage-subscription-button"
      >
        Manage Subscription →
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
        billingPortalUrl={core.organizationBillingPortalURL({
          organizationId,
        })}
      />
    </EmailLayout>
  )
}

export default CustomerSubscriptionAdjustedEmail
