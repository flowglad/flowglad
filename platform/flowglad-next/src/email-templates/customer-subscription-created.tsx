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

export interface TrialInfo {
  trialEndDate: Date
  trialDurationDays: number
}

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
  trial,
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
  trial?: TrialInfo
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

  // Determine header title and preview text based on whether this is a trial
  const headerTitle = trial
    ? 'Subscription Confirmed'
    : 'Payment method confirmed'
  const previewText = trial
    ? 'Your Subscription is Confirmed'
    : 'Payment method confirmed - Subscription active'

  return (
    <EmailLayout previewText={previewText}>
      <Header
        title={headerTitle}
        organizationLogoUrl={organizationLogoUrl}
      />

      <Paragraph>Hi {customerName},</Paragraph>

      {trial ? (
        <Paragraph>
          Your subscription has been confirmed. Your free trial has
          started!
        </Paragraph>
      ) : (
        <Paragraph>Your subscription has been activated.</Paragraph>
      )}

      <DetailSection>
        <DetailItem dataTestId="plan-name">
          Plan: {planName}
        </DetailItem>
        {trial ? (
          <>
            <DetailItem dataTestId="trial-info">
              Trial: Free for {trial.trialDurationDays} days
            </DetailItem>
            <DetailItem dataTestId="first-charge-date">
              First charge: {formatDate(trial.trialEndDate)} for{' '}
              {formattedPriceWithInterval}
            </DetailItem>
          </>
        ) : (
          <DetailItem dataTestId="price">
            Price: {formattedPriceWithInterval}
          </DetailItem>
        )}
        {!trial && nextBillingDate && (
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

      {trial ? (
        <>
          <div data-testid="trial-auto-renew-notice">
            <Paragraph style={{ marginTop: '24px' }}>
              Your subscription automatically renews until canceled.
              To avoid being charged, you must cancel at least a day
              before {formatDate(trial.trialEndDate)}.
            </Paragraph>
          </div>
          <Paragraph style={{ marginTop: '16px' }}>
            The payment method
            {paymentMethodLast4
              ? ` ending in ${paymentMethodLast4}`
              : ''}{' '}
            will be used when your trial ends.
          </Paragraph>
        </>
      ) : (
        <>
          <Paragraph style={{ marginTop: '24px' }}>
            The payment method
            {paymentMethodLast4
              ? ` ending in ${paymentMethodLast4}`
              : ''}{' '}
            will be used for future charges.
          </Paragraph>
        </>
      )}

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
