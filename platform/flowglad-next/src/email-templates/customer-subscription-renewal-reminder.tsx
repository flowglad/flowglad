import * as React from 'react'
import { type CurrencyCode, IntervalUnit } from '@/types'
import core, { formatDate } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { EmailButton } from './components/EmailButton'
import TestModeBanner from './components/TestBanner'
import {
  DetailItem,
  DetailSection,
  EmailLayout,
  Header,
  Paragraph,
  Signature,
} from './components/themed'

export interface CustomerSubscriptionRenewalReminderEmailProps {
  customerName: string
  organizationName: string
  organizationLogoUrl?: string
  organizationId: string
  customerId: string
  planName: string
  renewalDate: Date
  daysUntilRenewal: number
  price: number
  currency: CurrencyCode
  interval?: IntervalUnit
  livemode: boolean
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

export const CustomerSubscriptionRenewalReminderEmail = ({
  customerName,
  organizationName,
  organizationLogoUrl,
  organizationId,
  customerId,
  planName,
  renewalDate,
  daysUntilRenewal,
  price,
  currency,
  interval,
  livemode,
}: CustomerSubscriptionRenewalReminderEmailProps) => {
  const formattedPrice =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(currency, price)

  const formattedPriceWithInterval = interval
    ? `${formattedPrice}/${getIntervalText(interval)}`
    : formattedPrice

  const previewText = 'Your Subscription Renews Soon'

  return (
    <EmailLayout previewText={previewText}>
      <TestModeBanner livemode={livemode} />
      <Header
        title="Subscription Renewal"
        organizationLogoUrl={organizationLogoUrl}
      />

      <Paragraph>Hi {customerName},</Paragraph>

      <Paragraph>
        We hope you're enjoying your subscription, which will renew
        soon.
      </Paragraph>

      <DetailSection>
        <DetailItem dataTestId="plan-name">
          Plan: {planName}
        </DetailItem>
        <DetailItem dataTestId="renewal-date">
          Renewal date: {formatDate(renewalDate)}
        </DetailItem>
        <DetailItem dataTestId="renewal-price">
          Renewal price: {formattedPriceWithInterval}
        </DetailItem>
      </DetailSection>

      <Paragraph style={{ marginTop: '24px' }}>
        Starting {formatDate(renewalDate)}, your subscription
        automatically renews for {formattedPriceWithInterval}.
      </Paragraph>

      <Paragraph style={{ marginTop: '16px' }}>
        To avoid being charged, you must cancel at least a day before
        the renewal date. To keep your subscription, no further action
        is needed.
      </Paragraph>

      <EmailButton
        href={core.customerBillingPortalURL({
          organizationId,
          customerId,
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

export default CustomerSubscriptionRenewalReminderEmail
