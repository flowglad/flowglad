import { type CurrencyCode, IntervalUnit } from '@db-core/enums'
import { Link } from '@react-email/components'
import type * as React from 'react'
import core, { formatDate } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { EmailButton } from './components/EmailButton'
import {
  DetailRow,
  DetailTable,
  EmailLayout,
  Footer,
  Header,
  HelpfulLinks,
  Paragraph,
  Signature,
} from './components/themed'

/**
 * Brand color for links - matches globals.css
 */
const LINK_COLOR = '#DA853A'

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
  dateConfirmed,
  isComplimentary,
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
  dateConfirmed?: Date
  /** When true, subscription is complimentary (no charge) - shows "Free" instead of price */
  isComplimentary?: boolean
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

  const billingPortalUrl = core.organizationBillingPortalURL({
    organizationId,
  })

  // Use provided date or fall back to now
  const confirmationDate = dateConfirmed ?? new Date()

  // Both trial and non-trial use unified "Subscription Confirmed" messaging
  // per Apple-inspired patterns
  const headerTitle = 'Subscription Confirmed'
  const previewText = 'Your Subscription is Confirmed'

  return (
    <EmailLayout previewText={previewText}>
      <Header
        title={headerTitle}
        organizationLogoUrl={organizationLogoUrl}
      />

      <Paragraph>Hi {customerName},</Paragraph>

      <Paragraph>
        {isComplimentary
          ? "You've been granted access to the following plan at no charge:"
          : "You've successfully subscribed to the following plan:"}
      </Paragraph>

      <DetailTable>
        <DetailRow
          label="Plan"
          value={planName}
          dataTestId="plan-name"
        />
        {trial ? (
          <>
            <DetailRow
              label="Trial"
              value={`Free for ${trial.trialDurationDays} days, starting ${formatDate(confirmationDate)}`}
              dataTestId="trial-info"
            />
            <DetailRow
              label="Renewal Price"
              value={`${formattedPriceWithInterval}, starting ${formatDate(trial.trialEndDate)}`}
              dataTestId="renewal-price"
            />
          </>
        ) : isComplimentary ? (
          <DetailRow label="Price" value="Free" dataTestId="price" />
        ) : (
          <>
            <DetailRow
              label="Price"
              value={formattedPriceWithInterval}
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

      {trial ? (
        <div data-testid="trial-auto-renew-notice">
          <Paragraph>
            Your subscription automatically renews until canceled. To
            avoid being charged, you must cancel at least a day before{' '}
            {formatDate(trial.trialEndDate)}. To learn more or cancel,{' '}
            <Link
              href={billingPortalUrl}
              style={{
                color: LINK_COLOR,
                textDecoration: 'underline',
              }}
            >
              manage your subscription
            </Link>
            .
          </Paragraph>
        </div>
      ) : isComplimentary ? (
        <div data-testid="complimentary-notice">
          <Paragraph>
            You have full access to this plan with no payment
            required. To learn more,{' '}
            <Link
              href={billingPortalUrl}
              style={{
                color: LINK_COLOR,
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
                color: LINK_COLOR,
                textDecoration: 'underline',
              }}
            >
              manage your subscription
            </Link>
            .
          </Paragraph>
        </div>
      )}

      <EmailButton
        href={billingPortalUrl}
        testId="manage-subscription-cta"
      >
        Manage Subscription →
      </EmailButton>

      <HelpfulLinks billingPortalUrl={billingPortalUrl} />

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

export default CustomerSubscriptionCreatedEmail
