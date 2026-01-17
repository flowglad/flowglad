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

export const CustomerSubscriptionUpgradedEmail = ({
  customerName,
  organizationName,
  organizationLogoUrl,
  organizationId,
  customerExternalId,
  previousPlanName,
  previousPlanPrice,
  previousPlanCurrency,
  previousPlanInterval,
  newPlanName,
  price,
  currency,
  interval,
  nextBillingDate,
  paymentMethodLast4,
  trialing = false,
}: {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerExternalId: string
  previousPlanName: string
  previousPlanPrice: number
  previousPlanCurrency: CurrencyCode
  previousPlanInterval?: IntervalUnit
  newPlanName: string
  price: number
  currency: CurrencyCode
  interval?: IntervalUnit
  nextBillingDate?: Date
  paymentMethodLast4?: string
  trialing?: boolean
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

  const formattedPreviousPrice =
    previousPlanPrice === 0
      ? 'Free'
      : previousPlanInterval
        ? `${stripeCurrencyAmountToHumanReadableCurrencyAmount(previousPlanCurrency, previousPlanPrice)}/${getIntervalText(previousPlanInterval)}`
        : stripeCurrencyAmountToHumanReadableCurrencyAmount(
            previousPlanCurrency,
            previousPlanPrice
          )

  const formattedNewPrice = interval
    ? `${formattedPrice}/${getIntervalText(interval)}`
    : formattedPrice

  // Use "Subscription Confirmed" for Free → Paid upgrades (first-time paid subscription)
  // per Apple-inspired patterns in subscription-email-improvements.md
  return (
    <EmailLayout previewText="Your Subscription is Confirmed">
      <Header
        title="Subscription Confirmed"
        organizationLogoUrl={organizationLogoUrl}
      />

      <Paragraph>Hi {customerName},</Paragraph>

      <Paragraph>You've subscribed to the following:</Paragraph>

      <DetailSection>
        <DetailItem dataTestId="previous-plan">
          Previous plan: {previousPlanName} ({formattedPreviousPrice})
        </DetailItem>
        <DetailItem dataTestId="new-plan">
          New plan: {newPlanName}
        </DetailItem>
        <DetailItem dataTestId="price">
          Price: {formattedNewPrice}
        </DetailItem>
        {nextBillingDate && (
          <DetailItem dataTestId="first-charge-date">
            {trialing ? 'First charge' : 'Next charge'}:{' '}
            {formatDate(nextBillingDate)}
          </DetailItem>
        )}
        {paymentMethodLast4 && (
          <DetailItem dataTestId="payment-method">
            Payment method: •••• {paymentMethodLast4}
          </DetailItem>
        )}
      </DetailSection>

      {trialing && nextBillingDate ? (
        <div data-testid="trial-auto-renew-notice">
          <Paragraph style={{ marginTop: '24px' }}>
            Your subscription automatically renews until canceled. To
            avoid being charged, you must cancel at least a day before{' '}
            {formatDate(nextBillingDate)}.
          </Paragraph>
          <Paragraph style={{ marginTop: '16px' }}>
            The payment method
            {paymentMethodLast4
              ? ` ending in ${paymentMethodLast4}`
              : ''}{' '}
            will be used when your trial ends.
          </Paragraph>
        </div>
      ) : (
        nextBillingDate && (
          <Paragraph style={{ marginTop: '24px' }}>
            Your {trialing ? 'first charge' : 'next charge'} of{' '}
            {formattedPrice} will be processed on{' '}
            {formatDate(nextBillingDate)}.
            {paymentMethodLast4 &&
              ` The payment method ending in ${paymentMethodLast4} will be used.`}
          </Paragraph>
        )
      )}

      <Paragraph
        style={{ marginTop: '16px', color: '#666', fontSize: '14px' }}
      >
        Your subscription automatically renews until canceled.
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

export default CustomerSubscriptionUpgradedEmail
