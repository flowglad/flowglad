import * as React from 'react'
import { type CurrencyCode, IntervalUnit } from '@/types'
import core, { formatDate } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { EmailButton } from './components/EmailButton'
import {
  DetailItem,
  DetailSection,
  EmailLayout,
  Header,
  Paragraph,
  Signature,
} from './components/themed'

export const CustomerSubscriptionCreatedEmail = ({
  customerName,
  organizationName,
  organizationLogoUrl,
  organizationId,
  customerExternalId,
  planName,
  price,
  currency,
  interval,
  nextBillingDate,
  paymentMethodLast4,
}: {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerExternalId: string
  planName: string
  price: number
  currency: CurrencyCode
  interval?: IntervalUnit
  nextBillingDate?: Date
  paymentMethodLast4?: string
}) => {
  const formattedPrice =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(currency, price)

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

  const formattedPriceWithInterval = interval
    ? `${formattedPrice}/${getIntervalText(interval)}`
    : formattedPrice

  return (
    <EmailLayout previewText="Payment method confirmed - Subscription active">
      <Header
        title="Payment method confirmed"
        organizationLogoUrl={organizationLogoUrl}
      />

      <Paragraph>Hi {customerName},</Paragraph>

      <Paragraph>Your subscription has been activated.</Paragraph>

      <DetailSection>
        <DetailItem dataTestId="plan-name">
          Plan: {planName}
        </DetailItem>
        <DetailItem dataTestId="price">
          Price: {formattedPriceWithInterval}
        </DetailItem>
        {nextBillingDate && (
          <DetailItem dataTestId="next-billing-date">
            Next billing date: {formatDate(nextBillingDate)}
          </DetailItem>
        )}
        {paymentMethodLast4 && (
          <DetailItem dataTestId="payment-method">
            Payment method: •••• {paymentMethodLast4}
          </DetailItem>
        )}
      </DetailSection>

      <Paragraph style={{ marginTop: '24px' }}>
        The payment method
        {paymentMethodLast4 ? ` ending in ${paymentMethodLast4}` : ''}{' '}
        will be used for future charges.
      </Paragraph>

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
    </EmailLayout>
  )
}

export default CustomerSubscriptionCreatedEmail
