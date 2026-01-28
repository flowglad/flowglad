import { Link } from '@react-email/components'
import * as React from 'react'
import { type CurrencyCode, IntervalUnit } from '@/types'
import core, { formatDate } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import {
  DetailRow,
  DetailTable,
  EmailLayout,
  Footer,
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
  dateConfirmed,
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
  dateConfirmed?: Date
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

  const billingPortalUrl = core.organizationBillingPortalURL({
    organizationId,
  })

  // Use provided date or fall back to now
  const confirmationDate = dateConfirmed ?? new Date()

  // Use "Subscription Confirmed" for Free → Paid upgrades (first-time paid subscription)
  // per Apple-inspired patterns in subscription-email-improvements.md
  return (
    <EmailLayout previewText="Your Subscription is Confirmed">
      <Header
        title="Subscription Confirmed"
        organizationLogoUrl={organizationLogoUrl}
      />

      <Paragraph>Hi {customerName},</Paragraph>

      <Paragraph>
        You've successfully subscribed to the following plan:
      </Paragraph>

      <DetailTable>
        {/* Only show Previous Plan if it was a paid plan (not free) */}
        {previousPlanPrice > 0 && (
          <DetailRow
            label="Previous Plan"
            value={`${previousPlanName} (${formattedPreviousPrice})`}
            dataTestId="previous-plan"
          />
        )}
        <DetailRow
          label={previousPlanPrice > 0 ? 'New Plan' : 'Plan'}
          value={newPlanName}
          dataTestId="new-plan"
        />
        {trialing && nextBillingDate ? (
          // Trial: Show "Renewal Price" with embedded date (Apple-style)
          <DetailRow
            label="Renewal Price"
            value={`${formattedNewPrice}, starting ${formatDate(nextBillingDate)}`}
            dataTestId="renewal-price"
          />
        ) : (
          // Non-trial: Show separate "Price" and "Next Billing Date" rows
          <>
            <DetailRow
              label="Price"
              value={formattedNewPrice}
              dataTestId="price"
            />
            {nextBillingDate && (
              <DetailRow
                label="Next Billing Date"
                value={formatDate(nextBillingDate)}
                dataTestId="next-billing-date"
              />
            )}
          </>
        )}
        <DetailRow
          label="Date Confirmed"
          value={formatDate(confirmationDate)}
          dataTestId="date-confirmed"
        />
        {paymentMethodLast4 && (
          <DetailRow
            label="Payment Method"
            value={`•••• ${paymentMethodLast4}`}
            dataTestId="payment-method"
          />
        )}
      </DetailTable>

      {trialing && nextBillingDate ? (
        <div data-testid="trial-auto-renew-notice">
          <Paragraph>
            Your subscription automatically renews until canceled. To
            avoid being charged, you must cancel at least a day before{' '}
            {formatDate(nextBillingDate)}. To learn more or cancel,{' '}
            <Link
              href={billingPortalUrl}
              style={{
                color: '#2563eb',
                textDecoration: 'underline',
              }}
            >
              manage your subscription
            </Link>
            .
          </Paragraph>
        </div>
      ) : (
        <div data-testid="auto-renew-notice">
          <Paragraph>
            Your subscription automatically renews until canceled. To
            learn more or cancel,{' '}
            <Link
              href={billingPortalUrl}
              style={{
                color: '#2563eb',
                textDecoration: 'underline',
              }}
            >
              manage your subscription
            </Link>
            .
          </Paragraph>
        </div>
      )}

      <Signature
        greeting="Thanks,"
        name={organizationName}
        greetingDataTestId="signature-thanks"
        nameDataTestId="signature-org-name"
      />

      <Footer
        organizationName={organizationName}
        variant="customer"
        billingPortalUrl={billingPortalUrl}
      />
    </EmailLayout>
  )
}

export default CustomerSubscriptionUpgradedEmail
