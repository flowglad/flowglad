import { CurrencyCode, IntervalUnit } from '@/types'
import { formatDate } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import * as React from 'react'
import { EmailButton } from './components/EmailButton'
import core from '@/utils/core'
import {
  EmailLayout,
  Header,
  DetailSection,
  DetailItem,
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

  return (
    <EmailLayout previewText="Payment method confirmed - Subscription upgraded">
      <Header
        title="Subscription upgraded"
        organizationLogoUrl={organizationLogoUrl}
      />

      <Paragraph>Hi {customerName},</Paragraph>

      <Paragraph>
        Your subscription has been successfully upgraded.
      </Paragraph>

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
            First charge: {formatDate(nextBillingDate)}
          </DetailItem>
        )}
        {paymentMethodLast4 && (
          <DetailItem dataTestId="payment-method">
            Payment method: •••• {paymentMethodLast4}
          </DetailItem>
        )}
      </DetailSection>

      {nextBillingDate && (
        <Paragraph style={{ marginTop: '24px' }}>
          Your first charge of {formattedPrice} will be processed on{' '}
          {formatDate(nextBillingDate)}.
          {paymentMethodLast4 &&
            ` The payment method ending in ${paymentMethodLast4} will be used.`}
        </Paragraph>
      )}

      <Paragraph style={{ marginTop: '16px' }}>
        You can manage your subscription and payment methods at any
        time through your billing portal.
      </Paragraph>

      <EmailButton
        href={core.billingPortalPageURL({
          organizationId,
          customerExternalId,
          page: 'sign-in',
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
